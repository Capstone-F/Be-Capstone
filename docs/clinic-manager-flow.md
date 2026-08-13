# Clinic Manager Integration Guide

End-to-end guide for integrating **Clinic Manager** (`clinic_manager`) features with this backend: auth, expert onboarding, consultation fees, availability, and **clinic finance** (escrow releases, wallet, withdrawals, ledger statement).

A clinic manager is a **single-clinic** operator. Every write is silently scoped to the manager's own `clinicId`; cross-clinic access returns **403**.

**Auth (login):** do not duplicate here — use:

- [Web Authentication Guide](auth-web.md) — session cookie (`sid`) for SPAs
- [Mobile Authentication Guide](auth-mobile.md) — Bearer tokens for Expo / React Native

See also:

- [Admin Integration Guide](admin-flow.md) — global surface; admin owns clinics, roles, catalog, commission setting
- [Admin Flow Guide](admin-flow.md) — **manual clinic withdrawal payouts** (app_admin marks paid / rejects)
- [User Management & RBAC](users.md) — roles, clinic scoping, user model
- [Consultation Flow](consultation-flow.md) — booking pay → escrow → release on complete
- [Treatment Plan Flow](treatment-plan-flow.md) — plan pay → per-phase escrow → release on activate
- [Image Uploads](uploads.md) — R2 upload then attach URL to expert avatars

---

## Status legend

| Marker     | Meaning                                            |
| ---------- | -------------------------------------------------- |
| ✅ Ready   | Controller + service exist; usable today           |
| ❌ Missing | Not implemented yet (schema/module may exist)      |
| 🔶 Extend  | Endpoint exists but needs more work for this actor |

---

## Table of Contents

1. [Money model (escrow → clinic wallet → withdraw)](#1-money-model-escrow--clinic-wallet--withdraw)
2. [Base URL & auth](#2-base-url--auth)
3. [Prerequisites](#3-prerequisites)
4. [Login & clinic binding](#4-login--clinic-binding)
5. [Expert onboarding (condensed)](#5-expert-onboarding-condensed)
6. [Consultation fees & availability](#6-consultation-fees--availability)
7. [Clinic bank account](#7-clinic-bank-account)
8. [Clinic wallet & statement](#8-clinic-wallet--statement)
9. [Withdrawals](#9-withdrawals)
10. [Admin payout workflow](#10-admin-payout-workflow)
11. [Platform commission setting](#11-platform-commission-setting)
12. [Operational oversight (experts, bookings, treatments)](#12-operational-oversight-experts-bookings-treatments)
13. [Scoping rules & error matrix](#13-scoping-rules--error-matrix)
14. [Endpoint checklist](#14-endpoint-checklist)
15. [Remaining gaps](#15-remaining-gaps)

---

## 1. Money model (escrow → clinic wallet → withdraw)

```
Customer pays booking / treatment plan (wallet debit)
        │
        ▼
 Platform escrow hold (HELD)
        │
        ├── cancel before release ──▶ refund customer (REFUNDED)
        │
        └── release trigger ──▶ clinic wallet (net) + platform commission
                                   │
                                   ▼
                          Clinic manager requests withdraw
                                   │
                                   ▼
                          Admin marks PAID after bank transfer
```

| Source              | Hold created at                                 | Release trigger                                 | Refund                                              |
| ------------------- | ----------------------------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| Consultation fee    | `POST /bookings/:id/pay`                        | Booking `COMPLETED`                             | Cancel while `PENDING` / `CONFIRMED`                |
| Treatment phase fee | `POST /treatments/:id/pay` (one hold per phase) | Phase `activate` (phase becomes non-refundable) | Cancel plan → refund only **HELD** (PENDING) phases |

**Rules:**

- Settlement is at **clinic** level (not the expert's personal wallet).
- `clinicId` + commission `%` are **snapshotted at pay time**.
- Commission = `floor(amount * rate / 100)`; remainder stays with the clinic net.
- Every movement writes a `transactions` ledger row with `clinicId` so the clinic statement can show pays, refunds, releases, commissions, and withdrawals.
- Follow-up bookings (`isFollowUp`) and zero fees create **no** hold.
- Invariant: a hold ends in exactly one of `RELEASED` or `REFUNDED`, never both.

Default platform commission: **10%** (`commerce_settings.PLATFORM_COMMISSION_PCT`).

---

## 2. Base URL & auth

| Environment | Base URL                      |
| ----------- | ----------------------------- |
| Local       | `http://localhost:3000`       |
| Production  | includes global `/api` prefix |

All clinic finance routes require an authenticated session (cookie or Bearer) with role `clinic_manager` and a non-null `clinicId`.

---

## 3. Prerequisites

1. `docker compose up -d` → `npm run migration:run` → `npm run seed` → `npm run start:dev`
2. Seeded clinic manager accounts (password `P@ssw0rd`) — see [users.md](users.md)
3. Migration `1786000000000-ClinicEscrowLedger` creates `clinic_wallets`, `escrow_holds`, `clinic_withdrawals`, ledger columns, and seeds commission `10`

---

## 4. Login & clinic binding

```http
GET /users/me
```

Confirm `roles` includes `clinic_manager` and `clinicId` is non-null. Session snapshots `clinicId` at login — re-binding requires re-login.

A manager with `clinicId: null` gets **403** `Clinic manager is not bound to a clinic` on finance writes.

---

## 5. Expert onboarding (condensed)

Clinic managers can create expert users and profiles for **their clinic only**:

| Step                | Method  | Path                                                                               |
| ------------------- | ------- | ---------------------------------------------------------------------------------- |
| Create user         | `POST`  | `/users` `{ role: "expert" }` (clinicId overridden)                                |
| Create profile      | `POST`  | `/experts` `{ userId, clinicId, specialization, consultationFee, … }`              |
| List roster         | `GET`   | `/clinic/experts?specialization=&isActive=` (own clinic, **includes deactivated**) |
| Update / deactivate | `PATCH` | `/experts/:id` (set `isActive: false` to deactivate)                               |
| Availability        | `POST`  | `/experts/:expertId/availability`                                                  |
| Fee                 | `PUT`   | `/experts/:id/consultation-fee`                                                    |

Full RBAC / directory detail: [users.md](users.md). Customer booking path: [consultation-flow.md](consultation-flow.md).

---

## 6. Consultation fees & availability

| Method                  | Path                              | Notes                                           |
| ----------------------- | --------------------------------- | ----------------------------------------------- |
| `PUT`                   | `/experts/:id/consultation-fee`   | Charged at `POST /bookings/:id/pay` into escrow |
| `GET/POST/PATCH/DELETE` | `/experts/:expertId/availability` | Weekly blocks for slot generation               |

Cross-clinic fee/availability writes return **403**.

---

## 7. Clinic bank account

Required before any withdrawal.

```http
PUT /clinic/bank-account
Content-Type: application/json

{
  "bankName": "Vietcombank",
  "bankAccountNumber": "0123456789",
  "bankAccountHolder": "GlowScan District 1 Clinic"
}
```

Returns the wallet summary (including bank fields). Bank details are **snapshotted onto the withdrawal** at request time.

---

## 8. Clinic wallet & statement

### 8.1 Wallet summary ✅ Ready

```http
GET /clinic/wallet
```

```json
{
  "clinicId": "…",
  "balanceVnd": "270000",
  "heldEscrowVnd": "300000",
  "pendingWithdrawalsVnd": "0",
  "isActive": true,
  "bankName": "Vietcombank",
  "bankAccountNumber": "0123456789",
  "bankAccountHolder": "GlowScan District 1 Clinic"
}
```

| Field                   | Meaning                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `balanceVnd`            | Released funds available to withdraw                           |
| `heldEscrowVnd`         | Sum of `HELD` escrow for this clinic (not withdrawable)        |
| `pendingWithdrawalsVnd` | Sum of `REQUESTED` withdrawals (already deducted from balance) |

### 8.2 Ledger statement ✅ Ready

```http
GET /clinic/transactions?type=ESCROW_RELEASE&expertId=&from=&to=&page=1&limit=20
```

Shows **all** transactions with `clinicId = yours`, including:

| Type                     | When it appears                             |
| ------------------------ | ------------------------------------------- |
| `CONSULTATION_PAYMENT`   | Customer paid a booking                     |
| `TREATMENT_PLAN_PAYMENT` | Customer paid a treatment plan              |
| `REFUND`                 | Customer cancelled booking / PENDING phases |
| `ESCROW_RELEASE`         | Net amount credited to clinic wallet        |
| `COMMISSION`             | Platform cut from the same release          |
| `WITHDRAWAL`             | Withdrawal requested (debit clinic wallet)  |
| `WITHDRAWAL_REVERSAL`    | Admin rejected a withdrawal                 |

Ecommerce product orders and customer wallet top-ups are **not** on this statement.

### 8.3 CSV export ✅ Ready

```http
GET /clinic/transactions/export?type=&expertId=&from=&to=
```

Returns `text/csv` (`Content-Disposition: attachment; filename="clinic-transactions.csv"`) with the same filters as §8.2 (pagination is ignored; up to 10,000 rows, oldest-first, UTF-8 BOM for Excel). Columns: `Date, Type, Status, Amount (VND), From, To, Expert ID, Consultation ID, Treatment ID, Treatment Phase ID, Withdrawal ID, External Ref, Note`. Use this to reconcile revenue and compute expert payroll outside the app.

---

## 9. Withdrawals

### 9.1 Request ✅ Ready

```http
POST /clinic/withdrawals
Content-Type: application/json

{ "amountVnd": 270000 }
```

- Debits clinic wallet **immediately** (funds frozen as `REQUESTED`)
- Writes `WITHDRAWAL` ledger row
- **400** if bank account unset, amount ≤ 0, or insufficient balance

### 9.2 List ✅ Ready

```http
GET /clinic/withdrawals?page=1&limit=20
```

Statuses: `REQUESTED` → admin `PAID` or `REJECTED` (see [§10](#10-admin-payout-workflow)).

---

## 10. Admin payout workflow

App Admin moves money **manually** from the platform bank account to the clinic bank account, then confirms in the API.

| Method | Path                                         | Role      |
| ------ | -------------------------------------------- | --------- |
| `GET`  | `/admin/clinic-withdrawals?status=REQUESTED` | app_admin |
| `POST` | `/admin/clinic-withdrawals/:id/mark-paid`    | app_admin |
| `POST` | `/admin/clinic-withdrawals/:id/reject`       | app_admin |

```http
POST /admin/clinic-withdrawals/<id>/mark-paid
{ "transferRef": "FT123456789", "note": "Transferred 13 Aug" }
```

```http
POST /admin/clinic-withdrawals/<id>/reject
{ "note": "Account number mismatch" }
```

Reject **re-credits** the clinic wallet and writes `WITHDRAWAL_REVERSAL`.

---

## 11. Platform commission setting

App Admin only:

| Method  | Path                                                               |
| ------- | ------------------------------------------------------------------ |
| `GET`   | `/admin/commerce-settings/platform-commission`                     |
| `PATCH` | `/admin/commerce-settings/platform-commission` `{ "percent": 10 }` |

Changing the rate affects **new** holds only (existing holds keep their snapshotted rate).

---

## 12. Operational oversight (experts, bookings, treatments)

Read-only visibility for a clinic manager over everything happening in **their** clinic. All endpoints are `@Roles(clinic_manager)`, scoped to the bound `clinicId`, and return **403** if the manager is unbound or the resource belongs to another clinic.

### 12.1 Expert roster ✅ Ready

```http
GET /clinic/experts?specialization=&isActive=&page=1&limit=20
```

Lists experts in the clinic **including deactivated** ones (unlike the public `GET /experts` directory, which is active-only). Sorted active-first, then by name. Omit `isActive` to see both; pass `isActive=false` to audit deactivated experts.

### 12.2 Bookings oversight ✅ Ready

```http
GET /clinic/bookings?expertId=&status=&from=&to=&page=1&limit=20
GET /clinic/bookings/:id
```

All consultation bookings for the clinic's experts (scoped via `booking → expert → clinicId`). Each row is the standard booking shape plus an `escrowStatus` (`HELD` | `RELEASED` | `REFUNDED` | `null`) so a manager can see which sessions still owe money and which have released. `from`/`to` bound `scheduledAt`. Read-only — managers cannot cancel or modify bookings.

### 12.3 Treatment oversight ✅ Ready

```http
GET /clinic/treatments?status=&expertId=&page=1&limit=20
GET /clinic/treatments/:id
```

Submitted treatment plans for the clinic (drafts still being edited are excluded), each with its phases and an `escrow` summary:

```json
{
  "id": "…",
  "status": "ACTIVE",
  "phases": [{ "phaseOrder": 0, "status": "COMPLETED", "priceVnd": "500000" }],
  "escrow": { "heldVnd": "500000", "releasedVnd": "500000", "refundedVnd": "0" }
}
```

`escrow.releasedVnd` is the gross escrow that has flowed to the clinic wallet (the net after commission is reflected in `GET /clinic/wallet`). Read-only.

---

## 13. Scoping rules & error matrix

| Call                                                                          | Scope rule                                                                  | Typical error                            |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------- |
| All `/clinic/*`                                                               | `auth.clinicId` required                                                    | `403` unbound                            |
| Expert fee / availability                                                     | `expert.clinicId === caller.clinicId`                                       | `403` cross-clinic                       |
| Oversight reads (`/clinic/bookings`, `/clinic/treatments`, `/clinic/experts`) | booking→expert→clinic / `treatment.clinicId` / `expert.clinicId` = caller's | `403` cross-clinic, `404` missing        |
| Withdraw without bank                                                         | Bank fields required                                                        | `400` bank account must be set           |
| Withdraw over balance                                                         | `amount ≤ balanceVnd`                                                       | `400` Insufficient clinic wallet balance |
| Double release / refund                                                       | Hold status gate + row lock                                                 | Idempotent return or `400`               |

---

## 14. Endpoint checklist

### Clinic manager finance

| Method | Path                          | Status   |
| ------ | ----------------------------- | -------- |
| `GET`  | `/clinic/wallet`              | ✅ Ready |
| `PUT`  | `/clinic/bank-account`        | ✅ Ready |
| `GET`  | `/clinic/transactions`        | ✅ Ready |
| `GET`  | `/clinic/transactions/export` | ✅ Ready |
| `POST` | `/clinic/withdrawals`         | ✅ Ready |
| `GET`  | `/clinic/withdrawals`         | ✅ Ready |

### Clinic manager oversight

| Method | Path                     | Status   |
| ------ | ------------------------ | -------- |
| `GET`  | `/clinic/experts`        | ✅ Ready |
| `GET`  | `/clinic/bookings`       | ✅ Ready |
| `GET`  | `/clinic/bookings/:id`   | ✅ Ready |
| `GET`  | `/clinic/treatments`     | ✅ Ready |
| `GET`  | `/clinic/treatments/:id` | ✅ Ready |

### Staff / admin finance

| Method  | Path                                           | Status   |
| ------- | ---------------------------------------------- | -------- |
| `GET`   | `/admin/clinic-withdrawals`                    | ✅ Ready |
| `POST`  | `/admin/clinic-withdrawals/:id/mark-paid`      | ✅ Ready |
| `POST`  | `/admin/clinic-withdrawals/:id/reject`         | ✅ Ready |
| `GET`   | `/admin/commerce-settings/platform-commission` | ✅ Ready |
| `PATCH` | `/admin/commerce-settings/platform-commission` | ✅ Ready |

### Experts / fees

| Method            | Path                              | Status   |
| ----------------- | --------------------------------- | -------- |
| `POST`            | `/users`                          | ✅ Ready |
| `POST`            | `/experts`                        | ✅ Ready |
| `PATCH`           | `/experts/:id`                    | ✅ Ready |
| `PUT`             | `/experts/:id/consultation-fee`   | ✅ Ready |
| `*/availability*` | `/experts/:expertId/availability` | ✅ Ready |

---

## 15. Remaining gaps

| Gap                                            | Status | Notes                                                                           |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| Booking stuck `IN_PROGRESS` never completed    | 🔶     | Escrow stays HELD until expert completes or a future staff force-release exists |
| Treatment `COMPLETED` / `PAUSED` never written | 🔶     | Phase activate still releases; plan-level COMPLETED not required for money      |
| Phases added after payment                     | ❌     | No escrow hold for post-pay phases                                              |
| Clawback after clinic withdrew                 | ❌     | No negative clinic balance / clawback workflow                                  |
| Notifications on release / withdraw            | ❌     |                                                                                 |

> ✅ Resolved: clinic-scoped **booking list**, **treatment list**, and **expert roster (incl. inactive)** are now live — see [§12 Operational oversight](#12-operational-oversight-experts-bookings-treatments).

---

## Quick reference — money happy path

```
# Clinic setup
Login (clinic_manager)
→ PUT  /clinic/bank-account { bankName, bankAccountNumber, bankAccountHolder }
→ GET  /clinic/wallet

# After customers pay & sessions/phases release…
→ GET  /clinic/transactions
→ POST /clinic/withdrawals { amountVnd }
→ GET  /clinic/withdrawals

# Staff
Login (staff)
→ GET  /admin/clinic-withdrawals?status=REQUESTED
→ (manual bank transfer)
→ POST /admin/clinic-withdrawals/:id/mark-paid { transferRef }
```
