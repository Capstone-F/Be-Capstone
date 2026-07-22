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
5. [Wallet payment (target)](#5-wallet-payment-target)
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
  ✅ Ready          ✅ Ready           ✅ Ready                   │ ❌ Missing
                                                                  ▼
┌─────────────┐   ┌──────────────┐   ┌─────────────┐   ┌──────────────────┐
│ Feedback    │◀──│ Complete     │◀──│ Start       │◀──│ Expert confirm   │
│ rating 1–5  │   │ COMPLETED    │   │ IN_PROGRESS │   │ CONFIRMED        │
└─────────────┘   └──────────────┘   └─────────────┘   └──────────────────┘
  ✅ Ready          ✅ Ready           ✅ Ready           ✅ Ready

Optional branch (before start):
  PENDING | CONFIRMED ──▶ CANCELLED  (+ wallet refund when paid) ✅ cancel / ❌ refund
```

**Target happy path:**

1. Customer discovers clinics / bookable experts (fee + rating + specialty).
2. Customer loads available slots for an expert and creates a `PENDING` booking.
3. Customer pays the expert’s `consultationFee` from **Wallet** (ledger `CONSULTATION_PAYMENT`) — **do not** call `/payments/checkout` (VNPay / order).
4. Assigned expert confirms → `CONFIRMED` (appears in Upcoming for both sides).
5. Optional: customer or expert cancels from `PENDING` / `CONFIRMED` → `CANCELLED`; if already paid, refund wallet (`REFUND`) — cancel status ✅, refund ❌.
6. Expert starts → `IN_PROGRESS`, then completes → `COMPLETED`.
7. Customer submits feedback (`Feedback` 1:1); expert aggregate `rating` is recalculated.

> **Do not use** ecommerce payment for consultations: `POST /payments/checkout` requires an `orderId` and VNPay. Consultation money moves only via **Wallet**.

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

Creates a **`ConsultationRequest`** row. **Does not debit wallet today** (see [§5](#5-wallet-payment-target)).

### 3.4 Pay with wallet ❌ (required for Doc2 money flow)

Not implemented. Target: debit `Wallet.balanceVnd` by `expert.consultationFee` and write a `Transaction` with `type = CONSULTATION_PAYMENT`, `consultationId` set. See [§5](#5-wallet-payment-target).

Until then, clients can still exercise confirm → session → feedback without payment.

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

Response includes `clinic { id, name, address }`, `feedback { rating, comment }` when present, cancel metadata when cancelled.

### 3.6 Cancel (optional) ✅ status / ❌ refund

| Method  | Path                   | Auth                                   | Body          |
| ------- | ---------------------- | -------------------------------------- | ------------- |
| `PATCH` | `/bookings/:id/cancel` | Owning customer **or** assigned expert | `{ reason? }` |

Allowed from **`PENDING` or `CONFIRMED` only** (`IN_PROGRESS` → `400`). Sets `CANCELLED`, `cancelledAt`, `cancelReason`, `cancelledBy` (`CUSTOMER` \| `EXPERT`). Slot becomes free again.

Wallet refund on cancel: **missing** — see [§6](#6-cancel--refund-rules).

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

Other statuses → `400`. Another expert’s booking → `403`.

**Product note:** When wallet pay exists, product may require payment **before** confirm is allowed (or confirm only after `CONSULTATION_PAYMENT` is `COMPLETED`). That gate is **not** in code yet.

### 4.3 Cancel ✅ / refund ❌

Same `PATCH /bookings/:id/cancel` as customer (assigned expert). Same status rules. Refund still missing.

### 4.4 Start & complete session ✅

| Method  | Path                     | Auth            | Transition                  | Side effect        |
| ------- | ------------------------ | --------------- | --------------------------- | ------------------ |
| `PATCH` | `/bookings/:id/start`    | Assigned expert | `CONFIRMED` → `IN_PROGRESS` | Sets `startedAt`   |
| `PATCH` | `/bookings/:id/complete` | Assigned expert | `IN_PROGRESS` → `COMPLETED` | Sets `completedAt` |

**Start is required** before complete (`CONFIRMED` → complete returns `400`). Customer then sees the booking under `tab=past` and can submit feedback.

---

## 5. Wallet payment (target)

### Why not VNPay here?

| Ecommerce (`Payment`)                              | Consultation (Wallet)                  |
| -------------------------------------------------- | -------------------------------------- |
| `POST /payments/checkout` + `orderId`              | Debit `wallets.balanceVnd`             |
| External provider redirect / IPN                   | In-app balance                         |
| `TransactionType.PRODUCT_PURCHASE` (future ledger) | `TransactionType.CONSULTATION_PAYMENT` |

Schema already supports the consultation path:

- `Wallet` (`users/wallet.entity.ts`) — `balanceVnd`, `userId`
- `Transaction` — `consultationId`, types `CONSULTATION_PAYMENT`, `REFUND`, `ESCROW_RELEASE`, …

### Suggested APIs (❌ Missing — for FE / BE alignment)

| Method | Path (proposal)     | Auth            | Behavior                                                                                                                          |
| ------ | ------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/wallets/me`       | Customer        | Balance + active flag                                                                                                             |
| `POST` | `/bookings/:id/pay` | Owning customer | Debit `consultationFee`; create `Transaction` (`CONSULTATION_PAYMENT`, `COMPLETED`); fail if insufficient balance or already paid |
| `POST` | `/wallets/top-up`   | Customer        | Out of scope for v1 — or admin/seed only                                                                                          |

**Amount source:** `Expert.consultationFee` at pay time (snapshot onto `Transaction.amountVnd`). Do not invent a second fee on `ConsultationRequest` unless product requires historical fee lock — if so, add `feeVnd` on create/pay.

**Idempotency:** one successful `CONSULTATION_PAYMENT` per `consultationId` (unique or status check → `409`).

**When to pay:** after `POST /bookings` while `PENDING` (recommended), before expert confirm. Optionally block `confirm` until paid.

---

## 6. Cancel & refund rules

| Booking status | Cancel allowed? | Slot freed? | Wallet                            |
| -------------- | --------------- | ----------- | --------------------------------- |
| `PENDING`      | ✅              | ✅          | Refund if paid ❌ not implemented |
| `CONFIRMED`    | ✅              | ✅          | Refund if paid ❌ not implemented |
| `IN_PROGRESS`  | ❌ `400`        | —           | —                                 |
| `COMPLETED`    | ❌              | —           | No refund                         |
| `CANCELLED`    | ❌              | —           | —                                 |

**Target refund (❌):** on successful cancel of a paid booking, credit wallet and write `Transaction` with `type = REFUND`, link `consultationId`, mark original payment `REFUNDED` if modeled that way.

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

| Method                 | Path                                | Actor    | Status |
| ---------------------- | ----------------------------------- | -------- | ------ |
| `GET`                  | `/wallets/me`                       | Customer | ❌     |
| `POST`                 | `/bookings/:id/pay` (or equivalent) | Customer | ❌     |
| Cancel → wallet refund | —                                   | System   | ❌     |

### Explicitly out of scope for consultations

| Method | Path                 | Why                    |
| ------ | -------------------- | ---------------------- |
| `POST` | `/payments/checkout` | Order / VNPay only     |
| `GET`  | `/payments/vnpay/*`  | Ecommerce IPN / return |

---

## 9. Domain model

```
Customer ──< ConsultationRequest >── Expert ── Clinic
                     │
                     │ 1:1
                     ▼
                  Feedback
                     │
Wallet (user)     Transaction.consultationId
  balanceVnd  ◀── CONSULTATION_PAYMENT / REFUND   (target writes)
```

| Entity                | Role in this flow                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `ConsultationRequest` | Booking row: status, schedule, cancel meta, start/complete timestamps                       |
| `Feedback`            | Customer rating/comment after `COMPLETED`; unique `consultationId`                          |
| `Expert`              | `consultationFee`, aggregate `rating`, `sessionLengthHours`, required `clinicId`            |
| `Wallet`              | Customer balance for consultation pay/refund (**schema ready, APIs missing**)               |
| `Transaction`         | Ledger with `consultationId` + `CONSULTATION_PAYMENT` / `REFUND` (**schema ready, unused**) |
| `Payment`             | **Ecommerce only** — do not attach to consultations                                         |

---

## 10. Remaining gaps & roadmap

1. **Wallet balance APIs** — read balance; seed/top-up strategy for demo.
2. **`POST /bookings/:id/pay`** — debit fee, write `CONSULTATION_PAYMENT`, idempotent.
3. **Optional fee snapshot** on `ConsultationRequest` at pay/create time.
4. **Gate confirm** (or list “awaiting payment”) until paid — product decision.
5. **Cancel refund** — credit wallet + `REFUND` transaction when a paid booking is cancelled from `PENDING` / `CONFIRMED`.
6. **Notifications** (push/email on confirm / cancel) — out of scope for current API.

**Usable today without wallet:** discover → book → confirm → (cancel) → start → complete → feedback. Wire wallet before charging real customers.
