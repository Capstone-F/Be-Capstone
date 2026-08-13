# Clinic Manager Integration Guide

End-to-end guide for integrating **Clinic Manager** (`clinic_manager`) features with this backend: auth, expert onboarding, consultation fees, availability, and **clinic finance** (escrow releases, wallet, withdrawals, ledger statement).

A clinic manager is a **single-clinic** operator. Every write is silently scoped to the manager's own `clinicId`; cross-clinic access returns **403**.

**Auth (login):** do not duplicate here — use:

- [Web Authentication Guide](auth-web.md) — session cookie (`sid`) for SPAs
- [Mobile Authentication Guide](auth-mobile.md) — Bearer tokens for Expo / React Native

See also:

- [Admin Integration Guide](admin-flow.md) — global surface; admin owns clinics, roles, catalog, commission setting
- [Staff Flow Guide](staff-flow.md) — stock, support chat, and **manual clinic withdrawal payouts**
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
10. [Staff payout workflow](#10-staff-payout-workflow)
11. [Platform commission setting](#11-platform-commission-setting)
12. [Scoping rules & error matrix](#12-scoping-rules--error-matrix)
13. [Endpoint checklist](#13-endpoint-checklist)
14. [Remaining gaps](#14-remaining-gaps)

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
                          Staff marks PAID after bank transfer
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

| Step           | Method | Path                                                                  |
| -------------- | ------ | --------------------------------------------------------------------- |
| Create user    | `POST` | `/users` `{ role: "expert" }` (clinicId overridden)                   |
| Create profile | `POST` | `/experts` `{ userId, clinicId, specialization, consultationFee, … }` |
| Availability   | `POST` | `/experts/:expertId/availability`                                     |
| Fee            | `PUT`  | `/experts/:id/consultation-fee`                                       |

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
| `WITHDRAWAL_REVERSAL`    | Staff rejected a withdrawal                 |

Ecommerce product orders and customer wallet top-ups are **not** on this statement.

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

Statuses: `REQUESTED` → staff `PAID` or `REJECTED`.

---

## 10. Staff payout workflow

Staff / App Admin move money **manually** from the platform bank account to the clinic bank account, then confirm in the API.

| Method | Path                                         | Role             |
| ------ | -------------------------------------------- | ---------------- |
| `GET`  | `/admin/clinic-withdrawals?status=REQUESTED` | staff, app_admin |
| `POST` | `/admin/clinic-withdrawals/:id/mark-paid`    | staff, app_admin |
| `POST` | `/admin/clinic-withdrawals/:id/reject`       | staff, app_admin |

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

## 12. Scoping rules & error matrix

| Call                      | Scope rule                            | Typical error                            |
| ------------------------- | ------------------------------------- | ---------------------------------------- |
| All `/clinic/*`           | `auth.clinicId` required              | `403` unbound                            |
| Expert fee / availability | `expert.clinicId === caller.clinicId` | `403` cross-clinic                       |
| Withdraw without bank     | Bank fields required                  | `400` bank account must be set           |
| Withdraw over balance     | `amount ≤ balanceVnd`                 | `400` Insufficient clinic wallet balance |
| Double release / refund   | Hold status gate + row lock           | Idempotent return or `400`               |

---

## 13. Endpoint checklist

### Clinic manager finance

| Method | Path                   | Status   |
| ------ | ---------------------- | -------- |
| `GET`  | `/clinic/wallet`       | ✅ Ready |
| `PUT`  | `/clinic/bank-account` | ✅ Ready |
| `GET`  | `/clinic/transactions` | ✅ Ready |
| `POST` | `/clinic/withdrawals`  | ✅ Ready |
| `GET`  | `/clinic/withdrawals`  | ✅ Ready |

### Staff / admin finance

| Method  | Path                                           | Status   |
| ------- | ---------------------------------------------- | -------- |
| `GET`   | `/admin/clinic-withdrawals`                    | ✅ Ready |
| `POST`  | `/admin/clinic-withdrawals/:id/mark-paid`      | ✅ Ready |
| `POST`  | `/admin/clinic-withdrawals/:id/reject`         | ✅ Ready |
| `GET`   | `/admin/commerce-settings/platform-commission` | ✅ Ready |
| `PATCH` | `/admin/commerce-settings/platform-commission` | ✅ Ready |

### Experts / fees (unchanged)

| Method            | Path                              | Status   |
| ----------------- | --------------------------------- | -------- |
| `POST`            | `/users`                          | ✅ Ready |
| `POST`            | `/experts`                        | ✅ Ready |
| `PUT`             | `/experts/:id/consultation-fee`   | ✅ Ready |
| `*/availability*` | `/experts/:expertId/availability` | ✅ Ready |

---

## 14. Remaining gaps

| Gap                                            | Status | Notes                                                                           |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| Booking stuck `IN_PROGRESS` never completed    | 🔶     | Escrow stays HELD until expert completes or a future staff force-release exists |
| Treatment `COMPLETED` / `PAUSED` never written | 🔶     | Phase activate still releases; plan-level COMPLETED not required for money      |
| Phases added after payment                     | ❌     | No escrow hold for post-pay phases                                              |
| Clawback after clinic withdrew                 | ❌     | No negative clinic balance / clawback workflow                                  |
| Clinic-scoped booking list                     | ❌     | Still missing for pure clinic_manager (see prior gaps)                          |
| Notifications on release / withdraw            | ❌     |                                                                                 |

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
