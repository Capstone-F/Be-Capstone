# Consultation Flow Integration Guide

End-to-end guide for integrating GlowScan’s **expert discovery → slot pick → booking → wallet payment → confirm / cancel → session (video + chat) → feedback** flow with this backend.

Entities: **`ConsultationRequest`** (booking lifecycle) and **`Feedback`** (1:1 rating after `COMPLETED`). Display pricing uses **`Expert.consultationFee`**. Money for consultations uses the customer **`Wallet`** + ledger **`Transaction`** (`CONSULTATION_PAYMENT` / `REFUND`) — **not** the ecommerce `Payment` / VNPay checkout stack.

During an active booking, customer and expert talk via **ZegoCloud** (video room + ZIM in-app chat). This backend only **mints tokens** and resolves the peer — clients join Zego with those credentials. Full client integration: [Real-time Communication Flow](realtime-communication-flow.md).

**Auth (register / login):** do not duplicate here — use:

- [Web Authentication Guide](auth-web.md) — session cookie (`sid`) for SPAs
- [Mobile Authentication Guide](auth-mobile.md) — Bearer tokens for Expo / React Native

See also:

- [Real-time Communication Flow](realtime-communication-flow.md) — video + chat token APIs for FE / Mobile
- [User Management & RBAC](users.md) — experts, clinics, roles
- [Treatment Plan Flow](treatment-plan-flow.md) — multi-phase plan created during live `IN_PROGRESS` session
- [E-Commerce](ecommerce-flow.md) / [VNPay](payments.md) — **product orders + wallet top-up only**, not consultation debit

---

## Status legend

| Marker     | Meaning                                      |
| ---------- | -------------------------------------------- |
| ✅ Ready   | Controller + service exist; usable today     |
| ❌ Missing | Not implemented yet (schema stubs may exist) |
| 🔶 Extend  | Exists but needs work for the target UX      |

---

## Table of Contents

1. [Flow overview](#1-flow-overview)
2. [Base URL & auth](#2-base-url--auth)
3. [Prerequisites & seed data](#3-prerequisites--seed-data)
4. [Domain rules (must implement on FE)](#4-domain-rules-must-implement-on-fe)
5. [Step-by-step integration — customer](#5-step-by-step-integration--customer)
6. [Step-by-step integration — expert](#6-step-by-step-integration--expert)
7. [Real-time communication (video & chat)](#7-real-time-communication-video--chat)
8. [Wallet payment](#8-wallet-payment)
9. [Status machine](#9-status-machine)
10. [Response shapes](#10-response-shapes)
11. [Error map](#11-error-map)
12. [Endpoint checklist](#12-endpoint-checklist)
13. [Domain model](#13-domain-model)
14. [Local testing](#14-local-testing)
15. [Remaining gaps & roadmap](#15-remaining-gaps--roadmap)

---

## 1. Flow overview

```
┌─────────────┐   ┌──────────────┐   ┌─────────────┐   ┌──────────────────┐
│ Discover    │──▶│ Pick slot    │──▶│ Create      │──▶│ Pay with Wallet  │
│ clinic /    │   │ GET /bookings│   │ booking     │   │ POST .../pay     │
│ expert      │   │ /:expertId   │   │ PENDING     │   │                  │
└─────────────┘   └──────────────┘   └─────────────┘   └────────┬─────────┘
  ✅ Ready          ✅ Ready           ✅ Ready                   │ ✅ Ready
                                                                  ▼
┌─────────────┐   ┌──────────────┐   ┌─────────────┐   ┌──────────────────┐
│ Feedback    │◀──│ Complete     │◀──│ Start       │◀──│ Expert confirm   │
│ rating 1–5  │   │ COMPLETED    │   │ IN_PROGRESS │   │ CONFIRMED        │
└─────────────┘   └──────────────┘   │ + video/chat│   └──────────────────┘
  ✅ Ready          ✅ Ready           │ ✅ Ready    │     ✅ Ready
                                       └─────────────┘

During CONFIRMED / IN_PROGRESS (and as product UX allows):
  GET /consultations/:bookingId/video-token  → Zego video room
  GET /consultations/:bookingId/chat-token   → ZIM 1:1 chat with peer
  (details: [realtime-communication-flow.md](realtime-communication-flow.md))

Optional branch (before start):
  PENDING | CONFIRMED ──▶ CANCELLED  (+ wallet refund when feeChargedVnd > 0)
```

**Happy path:**

1. Customer discovers clinics / bookable experts (fee + rating + specialty).
2. Customer loads available slots and creates a `PENDING` booking.
3. Customer tops up wallet if needed (`POST /wallet/top-up`), then pays with `POST /bookings/:id/pay` (ledger `CONSULTATION_PAYMENT`). Follow-up bookings during an ACTIVE paid treatment date window skip the fee (`isFollowUp`).
4. Assigned expert confirms → `CONFIRMED` (requires paid or free follow-up).
5. Optional: customer or expert cancels from `PENDING` / `CONFIRMED` → `CANCELLED`; if `feeChargedVnd > 0`, wallet is refunded (`REFUND`).
6. Customer and expert open **video** and/or **in-app chat** via consultation token APIs (ZegoCloud). Expert starts → `IN_PROGRESS`.
7. During the live session, expert may create a multi-phase **treatment plan**, customer pays the plan, and expert activates the first phase — see [treatment-plan-flow.md](treatment-plan-flow.md).
8. Expert completes → `COMPLETED`; customer submits feedback; expert aggregate `rating` is recalculated.

> **Do not use** ecommerce `POST /payments/checkout` for consultation fees. Top-up uses the same gateway with purpose `WALLET_TOPUP`; consultation / plan **debits** use **Wallet** only.

---

## 2. Base URL & auth

| Environment | Path prefix | Example                          |
| ----------- | ----------- | -------------------------------- |
| Development | none        | `http://localhost:3000/bookings` |
| Production  | `/api`      | `https://host/api/bookings`      |

**Calling protected routes:**

| Client  | Auth mechanism                                                                   |
| ------- | -------------------------------------------------------------------------------- |
| Web SPA | Session cookie `sid` (`credentials: 'include'`) — see [auth-web.md](auth-web.md) |
| Mobile  | `Authorization: Bearer <accessToken>` — see [auth-mobile.md](auth-mobile.md)     |

| Actor    | Typical roles | Notes                                                            |
| -------- | ------------- | ---------------------------------------------------------------- |
| Customer | `customer`    | Create / pay / cancel own / feedback / video+chat tokens         |
| Expert   | `expert`      | Confirm / start / complete / cancel assigned / video+chat tokens |

All booking, clinic, expert-discovery, and wallet routes require an authenticated session (cookie or Bearer). Role checks use `@Roles` + `RolesGuard`.

---

## 3. Prerequisites & seed data

| Requirement              | How to get it                                                                        | Status   |
| ------------------------ | ------------------------------------------------------------------------------------ | -------- |
| Running API + DB         | `docker compose up -d` + `npm run start:dev`                                         | ✅ Ready |
| Migrations               | `npm run migration:run`                                                              | ✅ Ready |
| Seeded clinics / experts | `npm run seed`                                                                       | ✅ Ready |
| Customer auth            | Register / login (auth guides)                                                       | ✅ Ready |
| Expert auth              | Keycloak user with `expert` role + linked Expert row                                 | ✅ Ready |
| Wallet balance           | Top-up via gateway or admin credit                                                   | ✅ Ready |
| ZegoCloud configured     | `ZEGO_APP_ID` + `ZEGO_SERVER_SECRET` in env; In-app Chat enabled on the Zego project | ✅ Ready |

### Seeded clinics & experts

IDs are UUIDs generated at seed time — resolve them after seed with `GET /clinics` / `GET /experts`.

| Clinic                     | Expert email                        | Name               | Specialty              | Fee (VND) | Session hours |
| -------------------------- | ----------------------------------- | ------------------ | ---------------------- | --------- | ------------- |
| GlowScan District 1 Clinic | `derma.d1@glowscan.example.com`     | Dr. Nguyen Van An  | `DERMATOLOGY`          | 400000    | 1             |
|                            | `acne.d1@glowscan.example.com`      | Dr. Tran Thi Bich  | `ACNE_TREATMENT`       | 350000    | 2             |
|                            | `laser.d1@glowscan.example.com`     | Dr. Le Minh Cuong  | `LASER_THERAPY`        | 500000    | 1             |
| GlowScan District 3 Clinic | `cosmetic.d3@glowscan.example.com`  | Dr. Pham Thu Ha    | `COSMETIC_DERMATOLOGY` | 550000    | 2             |
|                            | `antiaging.d3@glowscan.example.com` | Dr. Hoang Quoc Dat | `ANTI_AGING`           | 450000    | 1             |
|                            | `pigment.d3@glowscan.example.com`   | Dr. Vo Thi Kim     | `PIGMENTATION`         | 380000    | 2             |

**Availability (all seeded experts):** Mon–Fri (`dayOfWeek` 1–5), blocks `09–12` and `13–18` (GMT+7 / Asia/Ho_Chi_Minh). Bookable window is **09:00–20:00 GMT+7** only.

**Demo customer (DB only):** email `demo.customer@glowscan.example.com`, `keycloakSub` `seed-customer-demo`. Seed does **not** set Keycloak passwords for experts / demo customer — create or link Keycloak users (matching email / `sub`) and assign roles.

**Admin shortcut for wallet testing (no gateway):** as `app_admin`, `POST /admin/wallets/:userId/top-up` with `{ "amountVnd": 500000 }`.

Relevant migration for consultation money fields: `1784500000000-ConsultationTreatmentWallet`.

---

## 4. Domain rules (must implement on FE)

1. **Money path:** show wallet balance + top-up before pay. Never call `POST /payments/checkout` for a booking fee.
2. **Slot picker:** only offer slots where `available: true`. Send `scheduledAt` exactly as `startAt` from the slots API (GMT+7 / `+07:00`, top of hour).
3. **Pay before confirm:** expert confirm is blocked until `isPaid === true` (wallet paid **or** `isFollowUp`).
4. **Follow-up (tái khám):** if create response has `isFollowUp: true`, treat fee as waived — still call `POST .../pay` (no-op debit) or show “free follow-up” UX; confirm still requires the pay step / paid flag.
5. **Cancel window:** only from `PENDING` or `CONFIRMED`. Hide cancel once `IN_PROGRESS` / `COMPLETED`.
6. **Session order:** expert must `start` before `complete`. Customer feedback only after `COMPLETED`.
7. **One feedback:** one rating per booking; duplicate → `409`.
8. **Perspective:** when a user has both roles, pass `as=customer` or `as=expert` on `GET /bookings/me`.
9. **Expert prep:** use `GET /customers/:id/consultation-context?consultationId=<bookingId>` only when the booking is assigned to the current expert and status is `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, or `CANCELLED`. Response includes `treatmentHistory` summaries (not full charts). Open a past plan via `GET /treatments/:id/chart` (read-only for non-assigned experts).
10. **Realtime:** only the booking’s customer or expert may fetch video/chat tokens. Use `userID` / `peerUserID` from the BE response as Zego user IDs (app `User.id` UUIDs). Do **not** invent room IDs — video uses `roomID` from the video-token response. Chat has no shared room; message only `peerUserID`. See [realtime-communication-flow.md](realtime-communication-flow.md).

---

## 5. Step-by-step integration — customer

### 5.1 Discover clinics & experts ✅ Ready

| Method | Path                     | Auth          | Status   |
| ------ | ------------------------ | ------------- | -------- |
| GET    | `/clinics`               | Authenticated | ✅ Ready |
| GET    | `/clinics/:id`           | Authenticated | ✅ Ready |
| GET    | `/clinics/:id/experts`   | Authenticated | ✅ Ready |
| GET    | `/experts`               | Authenticated | ✅ Ready |
| GET    | `/experts/:id`           | Authenticated | ✅ Ready |
| GET    | `/experts/:id/feedbacks` | Authenticated | ✅ Ready |

**Useful `GET /experts` query params:**

| Param                    | Purpose                                     |
| ------------------------ | ------------------------------------------- |
| `clinicId`               | Experts bound to one clinic                 |
| `specialization`         | e.g. `DERMATOLOGY`                          |
| `minRating`              | Minimum aggregate rating                    |
| `minFee` / `maxFee`      | Filter by `consultationFee`                 |
| `lat`, `lng`, `radiusKm` | Distance filter when clinic has coordinates |
| `page`, `limit`          | Pagination                                  |

```http
GET /clinics?page=1&limit=20
```

```http
GET /experts?specialization=DERMATOLOGY&minFee=300000&maxFee=500000&page=1&limit=20
```

```http
GET /experts/<expertId>
```

```http
GET /experts/<expertId>/feedbacks?page=1&limit=20
```

Returns paginated feedback items (`rating`, `comment`, `customerName`, `createdAt`) plus `averageRating` and `ratingCount` for the expert.

Only **active** experts with a **non-null, active clinic** appear as bookable in discovery.

Store from expert detail: `id`, `consultationFee`, `rating`, nested `clinic`. Session length is **not** on `ExpertResponseDto` — read `sessionLengthHours` from the slots response (next step).

---

### 5.2 Choose a slot ✅ Ready

| Method | Path                  | Auth          | Query                                            |
| ------ | --------------------- | ------------- | ------------------------------------------------ |
| GET    | `/bookings/:expertId` | Authenticated | `date` (YYYY-MM-DD), `range` = `week` \| `month` |

```http
GET /bookings/<expertId>?date=2026-08-04&range=week
```

Example response (abbreviated):

```json
{
  "expertId": "...",
  "sessionLengthHours": 1,
  "range": "week",
  "from": "2026-08-04",
  "to": "2026-08-10",
  "days": [
    {
      "date": "2026-08-04",
      "slots": [
        {
          "startAt": "2026-08-04T09:00:00.000+07:00",
          "endAt": "2026-08-04T10:00:00.000+07:00",
          "available": true
        },
        {
          "startAt": "2026-08-04T10:00:00.000+07:00",
          "endAt": "2026-08-04T11:00:00.000+07:00",
          "available": false
        }
      ]
    }
  ]
}
```

**Rules (enforced by API):**

- All datetimes are Asia/Ho_Chi_Minh (**GMT+7**). Bookable hours are **09:00–20:00** only.
- Slots are hourly steps spanning `sessionLengthHours` inside `ExpertAvailability` blocks (hours in GMT+7).
- Slots overlapping active bookings (`PENDING` \| `CONFIRMED` \| `IN_PROGRESS`) have `available: false`.
- `CANCELLED` / `COMPLETED` do **not** block slots.
- Create booking `scheduledAt` must equal an available `startAt` (future, GMT+7 top-of-hour).

---

### 5.3 Create booking ✅ Ready

| Method | Path        | Auth     | Status   |
| ------ | ----------- | -------- | -------- |
| POST   | `/bookings` | Customer | ✅ Ready |

(`app_admin` / `clinic_manager` may also create.)

```http
POST /bookings
Content-Type: application/json

{
  "expertId": "<expert-uuid>",
  "scheduledAt": "2026-08-04T09:00:00.000+07:00",
  "reason": "Persistent acne on cheeks"
}
```

Response: `BookingResponseDto` with `status: "PENDING"`, nested `clinic`, expert name / specialization, payment flags.

**Follow-up auto-detect:** if the customer has an `ACTIVE` paid treatment with this expert and today is within `[startDate, endDate]`, the booking is created with `isFollowUp: true` and `treatmentId` set (fee waived at pay).

Creates a **`ConsultationRequest`** row. Missing customer profile is auto-created for the authenticated user.

---

### 5.4 Top up wallet (if needed) ✅ Ready

| Method | Path             | Auth     | Status   |
| ------ | ---------------- | -------- | -------- |
| GET    | `/wallet/me`     | Customer | ✅ Ready |
| POST   | `/wallet/top-up` | Customer | ✅ Ready |

```http
GET /wallet/me
```

```json
{
  "id": "...",
  "userId": "...",
  "balanceVnd": "150000",
  "isActive": true
}
```

```http
POST /wallet/top-up
Content-Type: application/json

{
  "amountVnd": 500000,
  "client": "web"
}
```

`amountVnd` minimum **10000**. Response is a gateway checkout (`paymentId` + `paymentUrl`) with purpose `WALLET_TOPUP` — complete like ecommerce payment ([payments.md](payments.md)), then re-check `GET /wallet/me`.

`client`: `web` \| `mobile` (selects return URL).

---

### 5.5 Pay booking with wallet ✅ Ready

| Method | Path                | Auth     | Status   |
| ------ | ------------------- | -------- | -------- |
| POST   | `/bookings/:id/pay` | Customer | ✅ Ready |

```http
POST /bookings/<bookingId>/pay
```

- Debits `Expert.consultationFee` at pay time → stores `feeChargedVnd`, `paidTransactionId`, ledger `CONSULTATION_PAYMENT`.
- Follow-up: sets `feeChargedVnd` to `"0"` **without** debit; `isPaid` becomes true.
- Only while `PENDING`; insufficient balance → `400`.

After success, booking shows `isPaid: true`. Expert can then confirm.

---

### 5.6 Track bookings ✅ Ready

| Method | Path               | Auth                     | Status   |
| ------ | ------------------ | ------------------------ | -------- |
| GET    | `/bookings/me`     | Customer / Expert        | ✅ Ready |
| GET    | `/bookings/me/:id` | Owner or assigned expert | ✅ Ready |

```http
GET /bookings/me?tab=upcoming&page=1&limit=20
```

```http
GET /bookings/me/<bookingId>
```

**Query params:**

| Param           | Description                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tab`           | `upcoming` = PENDING\|CONFIRMED\|IN_PROGRESS + `scheduledAt >= now`; `past` = COMPLETED; `cancelled` = CANCELLED. Mutually exclusive with `status` |
| `status`        | Exact `ConsultationStatus`                                                                                                                         |
| `as`            | `customer` \| `expert` when the user has both roles                                                                                                |
| `page`, `limit` | Pagination                                                                                                                                         |

Response includes `clinic { id, name, address }`, payment fields (`isPaid`, `isFollowUp`, `feeChargedVnd`), `feedback` when present, cancel metadata when cancelled.

---

### 5.7 Cancel (optional) ✅ Ready

| Method | Path                   | Auth                                   | Status   |
| ------ | ---------------------- | -------------------------------------- | -------- |
| PATCH  | `/bookings/:id/cancel` | Owning customer **or** assigned expert | ✅ Ready |

```http
PATCH /bookings/<bookingId>/cancel
Content-Type: application/json

{
  "reason": "Schedule conflict"
}
```

Allowed from **`PENDING` or `CONFIRMED` only** (`IN_PROGRESS` → `400`). Sets `CANCELLED`, `cancelledAt`, `cancelReason`, `cancelledBy` (`CUSTOMER` \| `EXPERT`). Slot becomes free again.

When `feeChargedVnd > 0` and a pay transaction exists, wallet is credited with `REFUND`.

---

### 5.8 Leave rating after complete ✅ Ready

| Method | Path                     | Auth            | Status   |
| ------ | ------------------------ | --------------- | -------- |
| POST   | `/bookings/:id/feedback` | Owning customer | ✅ Ready |

```http
POST /bookings/<bookingId>/feedback
Content-Type: application/json

{
  "rating": 5,
  "comment": "Clear advice and helpful routine tips"
}
```

Only when `status = COMPLETED`. One **`Feedback`** row per consultation (`409` on duplicate). Recalculates `Expert.rating` as the average of all feedback for that expert.

---

### 5.9 Video call & in-app chat ✅ Ready

After the booking is confirmed (and typically while `CONFIRMED` / `IN_PROGRESS`), the customer can open realtime channels with the assigned expert.

| Method | Path                                    | Auth                       | Status   |
| ------ | --------------------------------------- | -------------------------- | -------- |
| GET    | `/consultations/:bookingId/video-token` | Booking customer or expert | ✅ Ready |
| GET    | `/consultations/:bookingId/chat-token`  | Booking customer or expert | ✅ Ready |

```http
GET /consultations/<bookingId>/video-token
```

```http
GET /consultations/<bookingId>/chat-token
```

- **Video:** join Zego Express room using `appID`, `token`, `userID`, `userName`, `roomID` from the response.
- **Chat:** login to ZIM with `appID`, `token`, `userID`, `userName`, then open a conversation with `peerUserID` / `peerUserName` (the expert).

Full SDK wiring, response shapes, and errors: [realtime-communication-flow.md](realtime-communication-flow.md).

---

## 6. Step-by-step integration — expert

### 6.1 See assigned bookings ✅ Ready

```http
GET /bookings/me?as=expert&tab=upcoming
```

```http
GET /bookings/me/<bookingId>
```

Use `tab=upcoming` for pending confirms / upcoming sessions; `tab=past` for completed (ratings visible when customer left feedback).

Own profile:

```http
GET /experts/me
```

---

### 6.2 Prep context (optional) ✅ Ready

| Method | Path                                  | Auth   | Status   |
| ------ | ------------------------------------- | ------ | -------- |
| GET    | `/customers/:id/consultation-context` | Expert | ✅ Ready |

Requires query `consultationId` = booking id. Booking must be assigned to the current expert, match path `customerId`, and be `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, or `CANCELLED`. Returns profile + allergies + survey history + `treatmentHistory` summaries (exclude `DRAFT`). Full chart remains `GET /treatments/:id/chart` (read-only for consulting expert).

```http
GET /customers/<customerId>/consultation-context?consultationId=<bookingId>
```

---

### 6.3 Confirm ✅ Ready

| Method | Path                    | Auth            | Transition              |
| ------ | ----------------------- | --------------- | ----------------------- |
| PATCH  | `/bookings/:id/confirm` | Assigned expert | `PENDING` → `CONFIRMED` |

```http
PATCH /bookings/<bookingId>/confirm
```

Requires wallet payment completed **or** free follow-up (`isFollowUp` / `isPaid`). Other statuses → `400`. Another expert’s booking → `403`.

---

### 6.4 Cancel ✅ Ready

Same `PATCH /bookings/:id/cancel` as customer (assigned expert). Refunds wallet when a fee was charged.

---

### 6.5 Start & complete session ✅ Ready

| Method | Path                     | Auth            | Transition                  | Side effect        |
| ------ | ------------------------ | --------------- | --------------------------- | ------------------ |
| PATCH  | `/bookings/:id/start`    | Assigned expert | `CONFIRMED` → `IN_PROGRESS` | Sets `startedAt`   |
| PATCH  | `/bookings/:id/complete` | Assigned expert | `IN_PROGRESS` → `COMPLETED` | Sets `completedAt` |

```http
PATCH /bookings/<bookingId>/start
```

```http
PATCH /bookings/<bookingId>/complete
```

**Start is required** before complete (`CONFIRMED` → complete returns `400`). Customer then sees the booking under `tab=past` and can submit feedback.

After start (`IN_PROGRESS`), expert gathers intake over video/chat, may create and hand off a treatment plan, then completes the booking — see [treatment-plan-flow.md](treatment-plan-flow.md).

---

### 6.6 Video call & in-app chat ✅ Ready

Same token endpoints as the customer. The expert uses the same booking id; chat `peerUserID` resolves to the **customer**.

| Method | Path                                    | Auth                       | Status   |
| ------ | --------------------------------------- | -------------------------- | -------- |
| GET    | `/consultations/:bookingId/video-token` | Booking customer or expert | ✅ Ready |
| GET    | `/consultations/:bookingId/chat-token`  | Booking customer or expert | ✅ Ready |

```http
GET /consultations/<bookingId>/video-token
```

```http
GET /consultations/<bookingId>/chat-token
```

Recommended UX: fetch tokens once both parties are ready (e.g. around `CONFIRMED` / after `start`), join the video room with `roomID`, and message only `peerUserID`. Details: [realtime-communication-flow.md](realtime-communication-flow.md).

---

## 7. Real-time communication (video & chat)

GlowScan uses **one ZegoCloud project** for both:

| Channel | Zego product         | BE responsibility                                     | Client responsibility                    |
| ------- | -------------------- | ----------------------------------------------------- | ---------------------------------------- |
| Video   | Express / video call | Mint Token04 scoped to `roomID = consult_{bookingId}` | Join that room with returned credentials |
| Chat    | ZIM (In-app Chat)    | Mint Token04 + return `peerUserID` / `peerUserName`   | Login ZIM; message only that peer        |

| Method | Path                                    | Who                         |
| ------ | --------------------------------------- | --------------------------- |
| GET    | `/consultations/:bookingId/video-token` | Assigned customer or expert |
| GET    | `/consultations/:bookingId/chat-token`  | Assigned customer or expert |

**Access control:** only users linked to the booking (`customer.userId` / `expert.userId`) get tokens (`403` otherwise). Chat refuses a null peer with `409` (e.g. no expert assigned). Message history for MVP lives on **ZegoCloud** — no local message sync API.

**Do not put `ZEGO_SERVER_SECRET` in the client.** Clients only need `appID` from the token response (or a public app id if you mirror it in FE config — the BE response is authoritative for the session).

Full FE / Mobile guide (auth headers, sample responses, SDK steps, errors): **[realtime-communication-flow.md](realtime-communication-flow.md)**.

---

## 8. Wallet payment

### Why not VNPay for consultation debit?

| Ecommerce (`Payment`)                                                 | Consultation / plan (Wallet)                      |
| --------------------------------------------------------------------- | ------------------------------------------------- |
| `POST /payments/checkout` + `orderId`                                 | Debit `wallets.balanceVnd`                        |
| External provider redirect / IPN for **orders** and **wallet top-up** | In-app balance after top-up                       |
| `TransactionType.PRODUCT_PURCHASE`                                    | `CONSULTATION_PAYMENT` / `TREATMENT_PLAN_PAYMENT` |

### APIs

| Method | Path                            | Auth      | Behavior                                                                             |
| ------ | ------------------------------- | --------- | ------------------------------------------------------------------------------------ |
| GET    | `/wallet/me`                    | Customer  | Balance + active flag                                                                |
| POST   | `/wallet/top-up`                | Customer  | Gateway payment (`PAYMENT_PROVIDER`), purpose `WALLET_TOPUP`                         |
| POST   | `/admin/wallets/:userId/top-up` | App admin | Direct credit (min 1000 VND), no gateway                                             |
| POST   | `/bookings/:id/pay`             | Customer  | Debit `consultationFee`; create `CONSULTATION_PAYMENT`; skip debit when `isFollowUp` |

**Amount source:** `Expert.consultationFee` at pay time (stored as `feeChargedVnd`). Confirm is blocked until paid (or follow-up).

### Cancel & refund rules

| Booking status | Cancel allowed? | Slot freed? | Wallet                        |
| -------------- | --------------- | ----------- | ----------------------------- |
| `PENDING`      | yes             | yes         | Refund if `feeChargedVnd > 0` |
| `CONFIRMED`    | yes             | yes         | Refund if `feeChargedVnd > 0` |
| `IN_PROGRESS`  | no (`400`)      | —           | —                             |
| `COMPLETED`    | no              | —           | No refund                     |
| `CANCELLED`    | no              | —           | —                             |

On successful cancel of a paid booking, wallet is credited with `TransactionType.REFUND` linked to `consultationId`.

Treatment package payment: see [treatment-plan-flow.md](treatment-plan-flow.md).

---

## 9. Status machine

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

Pay (`POST /bookings/:id/pay`) happens while **`PENDING`** and is required (or follow-up waiver) before confirm.

---

## 10. Response shapes

### Booking (`BookingResponseDto`)

```json
{
  "id": "...",
  "customerId": "...",
  "expertId": "...",
  "expertName": "Dr. Nguyen Van An",
  "expertSpecialization": "DERMATOLOGY",
  "clinic": {
    "id": "...",
    "name": "GlowScan District 1 Clinic",
    "address": "12 Nguyen Hue, District 1, Ho Chi Minh City"
  },
  "customerName": "Jane Doe",
  "reason": "I have persistent acne",
  "status": "PENDING",
  "scheduledAt": "2026-08-04T09:00:00.000+07:00",
  "startedAt": null,
  "completedAt": null,
  "cancelledAt": null,
  "cancelReason": null,
  "cancelledBy": null,
  "treatmentId": null,
  "feeChargedVnd": null,
  "paidTransactionId": null,
  "isFollowUp": false,
  "isPaid": false,
  "feedback": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```

After pay: `feeChargedVnd` is a string (e.g. `"400000"`), `paidTransactionId` set, `isPaid: true`.  
After feedback: `feedback: { "rating": 5, "comment": "..." }`.

### Paginated list

```json
{
  "items": [
    /* BookingResponseDto */
  ],
  "total": 5,
  "page": 1,
  "limit": 20
}
```

---

## 11. Error map

| Situation                                         | HTTP      | Typical message                                           |
| ------------------------------------------------- | --------- | --------------------------------------------------------- |
| Expert missing / inactive                         | 404       | `Expert … not found`                                      |
| Expert has no clinic                              | 400       | `Expert is not linked to a clinic and cannot be booked`   |
| `scheduledAt` not ISO / not future / not top-hour | 400       | `scheduledAt must be…`                                    |
| Slot outside availability                         | 400       | `scheduledAt is outside the expert availability window`   |
| Slot already taken                                | 409       | `The requested slot is already booked`                    |
| Pay not owner                                     | 403       | `Only the owning customer can pay`                        |
| Pay not PENDING / already paid                    | 400       | `Booking can only be paid while PENDING` / `already paid` |
| Insufficient wallet                               | 400       | (from wallet debit)                                       |
| Confirm unpaid                                    | 400       | `Booking must be paid (or free follow-up) before confirm` |
| Confirm / start / complete wrong status           | 400       | `Booking can only be … from …`                            |
| Wrong expert                                      | 403       | Assigned-expert checks                                    |
| Cancel from IN_PROGRESS                           | 400       | `Booking can only be cancelled from PENDING or CONFIRMED` |
| Feedback not COMPLETED / not owner                | 400 / 403 | Feedback ownership / status messages                      |
| Duplicate feedback                                | 409       | `Feedback has already been submitted for this booking`    |
| List as wrong perspective                         | 403       | `Insufficient permissions to list bookings as …`          |
| Video/chat token — not on booking                 | 403       | Only assigned customer/expert may join call / open chat   |
| Chat token — no peer (e.g. no expert)             | 409       | `No expert assigned to this booking yet`                  |
| Zego not configured on server                     | 503       | `ZegoCloud is not configured …`                           |

---

## 12. Endpoint checklist

### Discovery

| Method | Path                     | Actor  | Status |
| ------ | ------------------------ | ------ | ------ |
| GET    | `/clinics`               | Auth   | ✅     |
| GET    | `/clinics/:id`           | Auth   | ✅     |
| GET    | `/clinics/:id/experts`   | Auth   | ✅     |
| GET    | `/experts`               | Auth   | ✅     |
| GET    | `/experts/:id`           | Auth   | ✅     |
| GET    | `/experts/:id/feedbacks` | Auth   | ✅     |
| GET    | `/experts/me`            | Expert | ✅     |

### Booking lifecycle

| Method | Path                     | Actor             | Status   |
| ------ | ------------------------ | ----------------- | -------- |
| GET    | `/bookings/:expertId`    | Auth              | ✅ slots |
| POST   | `/bookings`              | Customer          | ✅       |
| GET    | `/bookings/me`           | Customer / Expert | ✅       |
| GET    | `/bookings/me/:id`       | Owner / assignee  | ✅       |
| POST   | `/bookings/:id/pay`      | Customer          | ✅       |
| PATCH  | `/bookings/:id/confirm`  | Assigned expert   | ✅       |
| PATCH  | `/bookings/:id/cancel`   | Owner / assignee  | ✅       |
| PATCH  | `/bookings/:id/start`    | Assigned expert   | ✅       |
| PATCH  | `/bookings/:id/complete` | Assigned expert   | ✅       |
| POST   | `/bookings/:id/feedback` | Owning customer   | ✅       |

### Wallet / ledger

| Method                 | Path                            | Actor     | Status |
| ---------------------- | ------------------------------- | --------- | ------ |
| GET                    | `/wallet/me`                    | Customer  | ✅     |
| POST                   | `/wallet/top-up`                | Customer  | ✅     |
| POST                   | `/admin/wallets/:userId/top-up` | App admin | ✅     |
| POST                   | `/bookings/:id/pay`             | Customer  | ✅     |
| Cancel → wallet refund | —                               | System    | ✅     |

### Realtime (ZegoCloud)

| Method | Path                                    | Actor                     | Status |
| ------ | --------------------------------------- | ------------------------- | ------ |
| GET    | `/consultations/:bookingId/video-token` | Owner customer / assignee | ✅     |
| GET    | `/consultations/:bookingId/chat-token`  | Owner customer / assignee | ✅     |

See [realtime-communication-flow.md](realtime-communication-flow.md).

### Expert prep / treatments

| Method | Path                                  | Actor  | Status                       |
| ------ | ------------------------------------- | ------ | ---------------------------- |
| GET    | `/customers/:id/consultation-context` | Expert | ✅                           |
| POST   | `/treatments`                         | Expert | ✅ (see treatment-plan-flow) |

### Explicitly out of scope for consultations

| Method | Path                 | Why                                                      |
| ------ | -------------------- | -------------------------------------------------------- |
| POST   | `/payments/checkout` | Product orders only (top-up uses purpose `WALLET_TOPUP`) |

---

## 13. Domain model

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
| `ExpertAvailability`  | Weekly hour blocks used to generate slots                                                |
| `Wallet`              | Customer balance for top-up, consultation pay, plan pay, refund                          |
| `Transaction`         | Ledger with `consultationId` / `treatmentId`                                             |
| `Payment`             | Ecommerce orders **and** wallet top-up (`purpose`)                                       |
| `Treatment`           | Multi-phase package — see [treatment-plan-flow.md](treatment-plan-flow.md)               |
| `ChatHistory`         | Schema stub only — MVP chat history is retained by ZegoCloud ZIM, not this API           |

**Money ↔ treatment link:**

```
Wallet top-up (Payment purpose=WALLET_TOPUP)
        ↓ credits Wallet.balanceVnd
Consultation pay → CONSULTATION_PAYMENT → feeChargedVnd / paidTransactionId
Cancel → REFUND (if fee > 0)
        ↓ after COMPLETED
Expert POST /treatments { sourceConsultationId } → DRAFT plan
Customer POST /treatments/:id/pay → TREATMENT_PLAN_PAYMENT → ACTIVE
        ↓ while ACTIVE + date window
Later bookings with same expert → isFollowUp (fee waived)
```

---

## 14. Local testing

```bash
docker compose up -d
npm run migration:run
npm run seed
npm run start:dev
```

1. Log in as a **customer** (web cookie or mobile Bearer).
2. `GET /experts` → pick a seeded expert id.
3. `GET /bookings/<expertId>?date=<next-weekday>&range=week` → choose an `available: true` `startAt`.
4. `POST /bookings` with that `scheduledAt`.
5. Ensure balance: `GET /wallet/me`; if low, either:
   - `POST /wallet/top-up` with `PAYMENT_PROVIDER=mock` and open `paymentUrl`, or
   - as admin: `POST /admin/wallets/<userId>/top-up`.
6. `POST /bookings/<id>/pay` → confirm `isPaid: true`.
7. Log in as the **assigned expert** → `PATCH .../confirm`.
8. As customer or expert: `GET /consultations/<id>/video-token` and `GET /consultations/<id>/chat-token` — verify `roomID` / `peerUserID` (requires `ZEGO_*` env).
9. Expert: `PATCH .../start` → `.../complete`.
10. As customer: `POST .../feedback` with `{ "rating": 5 }`.
11. Optional: cancel path — create another booking, pay, then `PATCH .../cancel` and verify wallet refund.

Worth checking by hand: double-pay (`400 already paid`); confirm before pay (`400`); complete without start (`400`); duplicate feedback (`409`); book an unavailable slot (`409` / `400`); chat/video token as outsider (`403`).

---

## 15. Remaining gaps & roadmap

1. **Local chat transcript API** — optional sync of ZIM history into `ChatHistory` (not required for MVP launch).
2. **Notifications** (push/email on confirm / cancel / plan paid).
3. **Routine edit policy after phase activate** — MVP allows edit; stricter locking TBD (treatment flow).
4. Expert payout / escrow release from consultation and plan fees.
