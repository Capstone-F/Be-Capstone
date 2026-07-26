# Consultation Flow Integration Guide

End-to-end guide for integrating GlowScan’s **expert discovery → booking → wallet payment → confirm / cancel → session → feedback** flow.

Entities: **`ConsultationRequest`** (booking lifecycle) and **`Feedback`** (1:1 rating after `COMPLETED`). Pricing display uses **`Expert.consultationFee`**. Money movement for consultations must use the customer **`Wallet`** + ledger **`Transaction`** (`CONSULTATION_PAYMENT` / `REFUND`) — **not** the ecommerce `Payment` / VNPay stack.

**Auth (register / login):** do not duplicate here — use:

- [Web Authentication Guide](auth-web.md) — session cookie (`sid`) for SPAs
- [Mobile Authentication Guide](auth-mobile.md) — Bearer tokens for Expo / React Native

See also: [User Management & RBAC](users.md) (experts, clinics, booking notes) · [E-Commerce Integration Guide](ecommerce-flow.md) / [VNPay](payments.md) — **product orders only**, not consultations.

---

## Status legend

| Marker     | Meaning                                                   |
| ---------- | --------------------------------------------------------- |
| ✅ Ready   | Controller + service exist; usable today                  |
| ❌ Missing | Not implemented yet (schema stubs may exist)              |
| 🔶 Extend  | Endpoint / entity exists but needs work for the target UX |

---

## Table of Contents

1. [Flow overview](#1-flow-overview)
2. [Base URL & auth](#2-base-url--auth)
3. [Customer flow](#3-customer-flow)
4. [Expert flow](#4-expert-flow)
5. [Wallet payment](#5-wallet-payment-)
6. [Cancel & refund rules](#6-cancel--refund-rules)
7. [Status machine](#7-status-machine)
8. [Endpoint checklist](#8-endpoint-checklist)
9. [Domain model](#9-domain-model)
10. [Remaining gaps & roadmap](#10-remaining-gaps--roadmap)

---

## 1. Flow overview

```
┌─────────────┐   ┌──────────────┐   ┌─────────────┐   ┌──────────────────┐
│ Discover    │──▶│ Pick slot    │──▶│ Create      │──▶│ Pay with Wallet  │
│ clinic /    │   │ GET /bookings│   │ booking     │   │ (debit fee)      │
│ expert      │   │ /:expertId   │   │ PENDING     │   │                  │
└─────────────┘   └──────────────┘   └─────────────┘   └────────┬─────────┘
  ✅ Ready          ✅ Ready           ✅ Ready                   │ ✅ Ready
                                                                  ▼
┌─────────────┐   ┌──────────────┐   ┌─────────────┐   ┌──────────────────┐
│ Feedback    │◀──│ Complete     │◀──│ Start       │◀──│ Expert confirm   │
│ rating 1–5  │   │ COMPLETED    │   │ IN_PROGRESS │   │ CONFIRMED        │
└─────────────┘   └──────────────┘   └─────────────┘   └──────────────────┘
  ✅ Ready          ✅ Ready           ✅ Ready           ✅ Ready

Optional branch (before start):
  PENDING | CONFIRMED ──▶ CANCELLED  (+ wallet refund when paid) ✅ cancel / ✅ refund
```

**Target happy path:**

1. Customer discovers clinics / bookable experts (fee + rating + specialty).
2. Customer loads available slots for an expert and creates a `PENDING` booking.
3. Customer tops up wallet (`POST /wallet/top-up` via `PAYMENT_PROVIDER`) then pays `consultationFee` with `POST /bookings/:id/pay` (ledger `CONSULTATION_PAYMENT`). Follow-up bookings during an ACTIVE paid treatment date window skip the fee (`isFollowUp`).
4. Assigned expert confirms → `CONFIRMED` (requires paid or free follow-up).
5. Optional: customer or expert cancels from `PENDING` / `CONFIRMED` → `CANCELLED`; if `feeChargedVnd > 0`, wallet is refunded (`REFUND`).
6. Expert starts → `IN_PROGRESS`, then completes → `COMPLETED`.
7. Customer submits feedback (`Feedback` 1:1); expert aggregate `rating` is recalculated.
8. After session, expert may create a multi-phase treatment plan — see [treatment-plan-flow.md](treatment-plan-flow.md).

> **Do not use** ecommerce `POST /payments/checkout` for consultations. Top-up uses the same gateway with purpose `WALLET_TOPUP`; consultation/plan debits use **Wallet**.

---

## 2. Base URL & auth

| Environment | Path prefix | Example                          |
| ----------- | ----------- | -------------------------------- |
| Development | none        | `http://localhost:3000/bookings` |
| Production  | `/api`      | `https://host/api/bookings`      |

| Client  | Auth mechanism                                                                   |
| ------- | -------------------------------------------------------------------------------- |
| Web SPA | Session cookie `sid` (`credentials: 'include'`) — see [auth-web.md](auth-web.md) |
| Mobile  | `Authorization: Bearer <accessToken>` — see [auth-mobile.md](auth-mobile.md)     |

| Actor    | Typical roles |
| -------- | ------------- |
| Customer | `customer`    |
| Expert   | `expert`      |

---

## 3. Customer flow

### 3.1 Discover clinics & experts ✅

| Step              | Method | Path                   | Auth          | Notes                                                 |
| ----------------- | ------ | ---------------------- | ------------- | ----------------------------------------------------- |
| List clinics      | `GET`  | `/clinics`             | Authenticated | Active clinics; `page`, `limit`                       |
| Clinic detail     | `GET`  | `/clinics/:id`         | Authenticated | Profile for booking UI                                |
| Experts at clinic | `GET`  | `/clinics/:id/experts` | Authenticated | Same filters as `/experts`                            |
| Search experts    | `GET`  | `/experts`             | Authenticated | Filters below                                         |
| Expert detail     | `GET`  | `/experts/:id`         | Authenticated | Includes `consultationFee`, `rating`, nested `clinic` |

**Useful `GET /experts` query params:**

| Param                    | Purpose                                     |
| ------------------------ | ------------------------------------------- |
| `clinicId`               | Experts bound to one clinic                 |
| `specialization`         | e.g. `DERMATOLOGY`                          |
| `minRating`              | Minimum aggregate rating                    |
| `minFee` / `maxFee`      | Filter by `consultationFee`                 |
| `lat`, `lng`, `radiusKm` | Distance filter when clinic has coordinates |
| `page`, `limit`          | Pagination                                  |

Only **active** experts with a **non-null clinic** that is active are bookable in list/detail used for discovery.

### 3.2 Choose a slot ✅

| Method | Path                  | Auth          | Query                                            |
| ------ | --------------------- | ------------- | ------------------------------------------------ |
| `GET`  | `/bookings/:expertId` | Authenticated | `date` (YYYY-MM-DD), `range` = `week` \| `month` |

Returns hourly-stepped slots spanning `sessionLengthHours`. Slots overlapping **active** bookings (`PENDING` \| `CONFIRMED` \| `IN_PROGRESS`) are `available: false`. **`CANCELLED` / `COMPLETED` do not block slots.**

`scheduledAt` for create must be UTC, top-of-hour, and in the future.

### 3.3 Create booking ✅

| Method | Path        | Auth     | Body                                 |
| ------ | ----------- | -------- | ------------------------------------ |
| `POST` | `/bookings` | Customer | `{ expertId, scheduledAt, reason? }` |

Response: `BookingResponseDto` with `status: PENDING`, nested `clinic`, expert name / specialization.

Creates a **`ConsultationRequest`** row. If the customer has an ACTIVE paid treatment with this expert and today is within `[startDate, endDate]`, the booking is marked `isFollowUp` and fee is waived.

### 3.4 Pay with wallet ✅

| Method | Path                | Auth     | Notes                                                   |
| ------ | ------------------- | -------- | ------------------------------------------------------- |
| GET    | `/wallet/me`        | Customer | Balance                                                 |
| POST   | `/wallet/top-up`    | Customer | Gateway top-up (`PAYMENT_PROVIDER`)                     |
| POST   | `/bookings/:id/pay` | Customer | Debit `consultationFee` (no-op debit when `isFollowUp`) |

Expert `PATCH /bookings/:id/confirm` requires payment completed or follow-up waiver.

Prep context for experts: `GET /customers/:id/consultation-context` (profile + survey history).

Treatment plans after consultation: [treatment-plan-flow.md](treatment-plan-flow.md).

### 3.5 Track bookings ✅

| Method | Path               | Auth                     | Notes                       |
| ------ | ------------------ | ------------------------ | --------------------------- |
| `GET`  | `/bookings/me`     | Customer / Expert        | Tabs / filters below        |
| `GET`  | `/bookings/me/:id` | Owner or assigned expert | Single booking + `feedback` |

**`GET /bookings/me` query:**

| Param           | Description                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tab`           | `upcoming` = PENDING\|CONFIRMED\|IN_PROGRESS + `scheduledAt >= now`; `past` = COMPLETED; `cancelled` = CANCELLED. Mutually exclusive with `status` |
| `status`        | Exact `ConsultationStatus`                                                                                                                         |
| `as`            | `customer` \| `expert` when the user has both roles                                                                                                |
| `page`, `limit` | Pagination                                                                                                                                         |

Response includes `clinic { id, name, address }`, payment fields (`isPaid`, `isFollowUp`, `feeChargedVnd`), `feedback { rating, comment }` when present, cancel metadata when cancelled.

### 3.6 Cancel (optional) ✅ status / ✅ refund

| Method  | Path                   | Auth                                   | Body          |
| ------- | ---------------------- | -------------------------------------- | ------------- |
| `PATCH` | `/bookings/:id/cancel` | Owning customer **or** assigned expert | `{ reason? }` |

Allowed from **`PENDING` or `CONFIRMED` only** (`IN_PROGRESS` → `400`). Sets `CANCELLED`, `cancelledAt`, `cancelReason`, `cancelledBy` (`CUSTOMER` \| `EXPERT`). Slot becomes free again.

When `feeChargedVnd > 0` and a pay transaction exists, wallet is credited with `REFUND`.

### 3.7 Leave rating after complete ✅

| Method | Path                     | Auth            | Body                        |
| ------ | ------------------------ | --------------- | --------------------------- |
| `POST` | `/bookings/:id/feedback` | Owning customer | `{ rating: 1–5, comment? }` |

Only when `status = COMPLETED`. One **`Feedback`** row per consultation (`409` on duplicate). Recalculates `Expert.rating` as the average of all feedback for that expert.

---

## 4. Expert flow

### 4.1 See assigned bookings ✅

| Method | Path                     | Auth            |
| ------ | ------------------------ | --------------- |
| `GET`  | `/bookings/me?as=expert` | Expert          |
| `GET`  | `/bookings/me/:id`       | Assigned expert |

Use `tab=upcoming` for pending confirms / upcoming sessions; `tab=past` for completed (ratings visible when customer left feedback).

### 4.2 Confirm ✅

| Method  | Path                    | Auth            | Transition              |
| ------- | ----------------------- | --------------- | ----------------------- |
| `PATCH` | `/bookings/:id/confirm` | Assigned expert | `PENDING` → `CONFIRMED` |

Requires wallet payment completed **or** free follow-up (`isFollowUp`). Other statuses → `400`. Another expert’s booking → `403`.

### 4.3 Cancel ✅ / refund ✅

Same `PATCH /bookings/:id/cancel` as customer (assigned expert). Refunds wallet when a fee was charged.

### 4.4 Start & complete session ✅

| Method  | Path                     | Auth            | Transition                  | Side effect        |
| ------- | ------------------------ | --------------- | --------------------------- | ------------------ |
| `PATCH` | `/bookings/:id/start`    | Assigned expert | `CONFIRMED` → `IN_PROGRESS` | Sets `startedAt`   |
| `PATCH` | `/bookings/:id/complete` | Assigned expert | `IN_PROGRESS` → `COMPLETED` | Sets `completedAt` |

**Start is required** before complete (`CONFIRMED` → complete returns `400`). Customer then sees the booking under `tab=past` and can submit feedback.

---

## 5. Wallet payment ✅

### Why not VNPay for consultation debit?

| Ecommerce (`Payment`)                                                 | Consultation / plan (Wallet)                      |
| --------------------------------------------------------------------- | ------------------------------------------------- |
| `POST /payments/checkout` + `orderId`                                 | Debit `wallets.balanceVnd`                        |
| External provider redirect / IPN for **orders** and **wallet top-up** | In-app balance after top-up                       |
| `TransactionType.PRODUCT_PURCHASE`                                    | `CONSULTATION_PAYMENT` / `TREATMENT_PLAN_PAYMENT` |

### APIs

| Method | Path                | Auth            | Behavior                                                                             |
| ------ | ------------------- | --------------- | ------------------------------------------------------------------------------------ |
| `GET`  | `/wallet/me`        | Customer        | Balance + active flag                                                                |
| `POST` | `/wallet/top-up`    | Customer        | Gateway payment (`PAYMENT_PROVIDER`), purpose `WALLET_TOPUP`                         |
| `POST` | `/bookings/:id/pay` | Owning customer | Debit `consultationFee`; create `CONSULTATION_PAYMENT`; skip debit when `isFollowUp` |

**Amount source:** `Expert.consultationFee` at pay time (stored as `feeChargedVnd`). Confirm is blocked until paid (or follow-up).

Treatment package payment: see [treatment-plan-flow.md](treatment-plan-flow.md).

---

## 6. Cancel & refund rules

| Booking status | Cancel allowed? | Slot freed? | Wallet                        |
| -------------- | --------------- | ----------- | ----------------------------- |
| `PENDING`      | yes             | yes         | Refund if `feeChargedVnd > 0` |
| `CONFIRMED`    | yes             | yes         | Refund if `feeChargedVnd > 0` |
| `IN_PROGRESS`  | no (`400`)      | —           | —                             |
| `COMPLETED`    | no              | —           | No refund                     |
| `CANCELLED`    | no              | —           | —                             |

On successful cancel of a paid booking, wallet is credited with `TransactionType.REFUND` linked to `consultationId`.

---

## 7. Status machine

```
                 ┌──────────────┐
                 │   PENDING    │◀── POST /bookings
                 └──────┬───────┘
            confirm │   │ cancel
                    ▼   ▼
           ┌────────────┐    ┌───────────┐
           │ CONFIRMED  │───▶│ CANCELLED │
           └──────┬─────┘    └───────────┘
            start │
                  ▼
           ┌─────────────┐
           │ IN_PROGRESS │
           └──────┬──────┘
         complete │
                  ▼
           ┌───────────┐     POST /bookings/:id/feedback
           │ COMPLETED │──────────────────────────────▶ Feedback (1:1)
           └───────────┘
```

`ConsultationStatus`: `PENDING` \| `CONFIRMED` \| `IN_PROGRESS` \| `COMPLETED` \| `CANCELLED`.

---

## 8. Endpoint checklist

### Discovery

| Method | Path                   | Actor | Status |
| ------ | ---------------------- | ----- | ------ |
| `GET`  | `/clinics`             | Auth  | ✅     |
| `GET`  | `/clinics/:id`         | Auth  | ✅     |
| `GET`  | `/clinics/:id/experts` | Auth  | ✅     |
| `GET`  | `/experts`             | Auth  | ✅     |
| `GET`  | `/experts/:id`         | Auth  | ✅     |

### Booking lifecycle

| Method  | Path                     | Actor             | Status   |
| ------- | ------------------------ | ----------------- | -------- |
| `GET`   | `/bookings/:expertId`    | Auth              | ✅ slots |
| `POST`  | `/bookings`              | Customer          | ✅       |
| `GET`   | `/bookings/me`           | Customer / Expert | ✅       |
| `GET`   | `/bookings/me/:id`       | Owner / assignee  | ✅       |
| `PATCH` | `/bookings/:id/confirm`  | Assigned expert   | ✅       |
| `PATCH` | `/bookings/:id/cancel`   | Owner / assignee  | ✅       |
| `PATCH` | `/bookings/:id/start`    | Assigned expert   | ✅       |
| `PATCH` | `/bookings/:id/complete` | Assigned expert   | ✅       |
| `POST`  | `/bookings/:id/feedback` | Owning customer   | ✅       |

### Wallet / ledger

| Method                 | Path                | Actor    | Status |
| ---------------------- | ------------------- | -------- | ------ |
| `GET`                  | `/wallet/me`        | Customer | ✅     |
| `POST`                 | `/wallet/top-up`    | Customer | ✅     |
| `POST`                 | `/bookings/:id/pay` | Customer | ✅     |
| Cancel → wallet refund | —                   | System   | ✅     |

### Explicitly out of scope for consultations

| Method                | Path                 | Why                                                      |
| --------------------- | -------------------- | -------------------------------------------------------- |
| `POST`                | `/payments/checkout` | Product orders only (top-up uses purpose `WALLET_TOPUP`) |
| Video / chat realtime | —                    | Future                                                   |

---

## 9. Domain model

```
Customer ──< ConsultationRequest >── Expert ── Clinic
                     │
                     │ 1:1
                     ▼
                  Feedback
                     │
Wallet (user)     Transaction.consultationId / treatmentId
  balanceVnd  ◀── CONSULTATION_PAYMENT / TREATMENT_PLAN_PAYMENT / WALLET_TOPUP / REFUND
```

| Entity                | Role in this flow                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `ConsultationRequest` | Booking row: status, schedule, cancel meta, `feeChargedVnd`, `isFollowUp`, `treatmentId` |
| `Feedback`            | Customer rating/comment after `COMPLETED`; unique `consultationId`                       |
| `Expert`              | `consultationFee`, aggregate `rating`, `sessionLengthHours`, required `clinicId`         |
| `Wallet`              | Customer balance for top-up, consultation pay, plan pay, refund                          |
| `Transaction`         | Ledger with `consultationId` / `treatmentId`                                             |
| `Payment`             | Ecommerce orders **and** wallet top-up (`purpose`)                                       |
| `Treatment`           | Multi-phase package — see [treatment-plan-flow.md](treatment-plan-flow.md)               |

---

## 10. Remaining gaps & roadmap

1. **Realtime video/chat** during consultation — future.
2. **Notifications** (push/email on confirm / cancel / plan paid).
3. **Routine edit policy after phase activate** — MVP allows edit; stricter locking TBD.
4. Expert payout / escrow release from consultation and plan fees.
