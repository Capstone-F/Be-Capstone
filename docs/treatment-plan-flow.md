# Treatment Plan Flow Integration Guide

End-to-end guide for integrating GlowScan’s **live consultation → video/chat intake → expert creates multi-phase plan → customer pays → activate phase → complete consultation → chart / cancel / follow-ups** flow with this backend.

Entities: **`Treatment`** (plan lifecycle), **`TreatmentPhase`** (priced stages), **`TreatmentEvent`** (progress photos / timeline), **`Routine`** (`EXPERT_PRESCRIBED`, linked via `treatmentPhaseId`). Money for the plan uses the customer **`Wallet`** + ledger **`Transaction`** (`TREATMENT_PLAN_PAYMENT` / `REFUND`) — **not** the ecommerce `Payment` / VNPay checkout stack. Catalog products are optional purchases; phase products are prescriptions.

**Auth (register / login):** do not duplicate here — use:

- [Web Authentication Guide](auth-web.md) — session cookie (`sid`) for SPAs
- [Mobile Authentication Guide](auth-mobile.md) — Bearer tokens for Expo / React Native

See also:

- [Consultation Flow](consultation-flow.md) — book → pay fee → confirm → **start** → video/chat; complete after plan handoff; free tái khám while plan is ACTIVE
- [Real-time Communication Flow](realtime-communication-flow.md) — video + ZIM chat tokens during the session
- [Routine Tracking](routine-tracking-flow.md) — daily adherence after phase routine is ACTIVE
- [User Management & RBAC](users.md) — experts, clinics, roles
- [E-Commerce](ecommerce-flow.md) / [VNPay](payments.md) — **product orders + wallet top-up only**, not plan debit

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
3. [Prerequisites & migrations](#3-prerequisites--migrations)
4. [Domain rules (must implement on FE)](#4-domain-rules-must-implement-on-fe)
5. [Step-by-step — live consultation into plan](#5-step-by-step--live-consultation-into-plan)
6. [Step-by-step — after pay (configure & activate)](#6-step-by-step--after-pay-configure--activate)
7. [After consultation completed (chart / cancel / follow-ups)](#7-after-consultation-completed-chart--cancel--follow-ups)
8. [Progress photos & events](#8-progress-photos--events)
9. [Mid-plan cancel & refund](#9-mid-plan-cancel--refund)
10. [Wallet payment](#10-wallet-payment)
11. [Status machines](#11-status-machines)
12. [Response shapes](#12-response-shapes)
13. [Error map](#13-error-map)
14. [Endpoint checklist](#14-endpoint-checklist)
15. [Domain model](#15-domain-model)
16. [Local testing](#16-local-testing)
17. [Remaining gaps & roadmap](#17-remaining-gaps--roadmap)

---

## 1. Flow overview

The treatment plan is created **during** the live consultation (after intake over video/chat), not only after the booking is marked `COMPLETED`.

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌──────────────────┐
│ Start       │──▶│ Join video  │──▶│ Expert      │──▶│ Create DRAFT     │
│ booking     │   │ + chat      │   │ gathers     │   │ treatment +      │
│ IN_PROGRESS │   │ (Zego)      │   │ info        │   │ phases + notes   │
└─────────────┘   └─────────────┘   └─────────────┘   └────────┬─────────┘
  ✅ Ready          ✅ Ready          FE / session      ✅ Ready │
                                                                 ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌──────────────────┐
│ Chart /     │◀──│ Complete    │◀──│ Activate    │◀──│ Customer pays    │
│ cancel /    │   │ consultation│   │ phase       │   │ plan (wallet)    │
│ follow-ups  │   │ COMPLETED   │   │ (+ config)  │   │ → ACTIVE         │
└─────────────┘   └─────────────┘   └─────────────┘   └──────────────────┘
  ✅ Ready          ✅ Ready          ✅ Ready           ✅ Ready
```

**Happy path:**

1. Booking is `CONFIRMED` → expert `PATCH /bookings/:id/start` → `IN_PROGRESS`.
2. Customer and expert join **video** and/or **chat** ([realtime-communication-flow.md](realtime-communication-flow.md)) and gather clinical info.
3. Still during the session, expert creates a `DRAFT` treatment with `sourceConsultationId` = this booking (`IN_PROGRESS` allowed).
4. Expert adds phases (with `noteByExpert` before submit) → `POST /treatments/:id/submit`.
5. Customer pays the plan from wallet → treatment `ACTIVE` (`TREATMENT_PLAN_PAYMENT`).
6. Expert configures the paid phase (ingredients → products → routine) and **activates** the phase (same session or shortly after).
7. Expert `PATCH /bookings/:id/complete` → consultation `COMPLETED` (customer may leave feedback).
8. Ongoing care: **chart** (hồ sơ), routine tracking, mid-plan **cancel**, free **follow-up** bookings while dates apply.

> **Do not use** ecommerce `POST /payments/checkout` for plan fees. Top-up uses the gateway with purpose `WALLET_TOPUP`; plan **debit** uses **Wallet** only.

> Consultation fee (booking pay) and treatment plan fee are **separate** wallet debits.

---

## 2. Base URL & auth

| Environment | Path prefix | Example                            |
| ----------- | ----------- | ---------------------------------- |
| Development | none        | `http://localhost:3000/treatments` |
| Production  | `/api`      | `https://host/api/treatments`      |

**Calling protected routes:**

| Client  | Auth mechanism                                                                   |
| ------- | -------------------------------------------------------------------------------- |
| Web SPA | Session cookie `sid` (`credentials: 'include'`) — see [auth-web.md](auth-web.md) |
| Mobile  | `Authorization: Bearer <accessToken>` — see [auth-mobile.md](auth-mobile.md)     |

| Actor    | Typical roles | Notes                                                                              |
| -------- | ------------- | ---------------------------------------------------------------------------------- |
| Customer | `customer`    | Pay plan, chart, events, cancel; join video/chat on the booking                    |
| Expert   | `expert`      | Start/complete booking; create/submit/configure/activate plan; chart/events/cancel |

All treatment routes require an authenticated session (cookie or Bearer). Role checks use `@Roles` + `RolesGuard`.

When a user has both roles, pass `as=customer` or `as=expert` on `GET /treatments/me`.

---

## 3. Prerequisites & migrations

| Requirement               | How to get it                                               | Status   |
| ------------------------- | ----------------------------------------------------------- | -------- |
| Running API + DB          | `docker compose up -d` + `npm run start:dev`                | ✅ Ready |
| Migrations                | `npm run migration:run`                                     | ✅ Ready |
| Seeded clinics / experts  | `npm run seed`                                              | ✅ Ready |
| Customer + expert auth    | Auth guides + linked profiles                               | ✅ Ready |
| Wallet balance (customer) | Top-up / admin credit (enough for consult fee **and** plan) | ✅ Ready |
| Booking in `IN_PROGRESS`  | Confirm → start; video/chat tokens available                | ✅ Ready |
| ZegoCloud (for intake)    | `ZEGO_APP_ID` + `ZEGO_SERVER_SECRET`                        | ✅ Ready |

```bash
npm run migration:run
```

| Migration                                   | Purpose                                              |
| ------------------------------------------- | ---------------------------------------------------- |
| `1784500000000-ConsultationTreatmentWallet` | Plan pricing, wallet pay, follow-up booking fields   |
| `1784600000000-TreatmentTrackingChart`      | `note_by_expert`, cancel/refund columns on treatment |

**Admin shortcut for wallet testing:** as `app_admin`, `POST /admin/wallets/:userId/top-up` with `{ "amountVnd": 2000000 }`.

---

## 4. Domain rules (must implement on FE)

1. **Session-first:** create the plan while the booking is `IN_PROGRESS` (after video/chat intake). Pass `sourceConsultationId` so chart can show consult results.
2. **`sourceConsultationId` statuses:** `IN_PROGRESS` or `COMPLETED` only. Do not link `PENDING` / `CONFIRMED` / `CANCELLED`.
3. **Money path:** wallet for both consultation fee and plan fee. Never `POST /payments/checkout` for either.
4. **Draft vs paid:** phase create/edit/delete only while unpaid `DRAFT`. After pay → ingredients / products / routine / activate. Pricing (add/remove phase, edit `priceVnd`) is locked once paid.
5. **`noteByExpert`:** optional while drafting; **required on every phase before submit**. Distinct from free-form `notes`.
6. **Submit before plan pay:** customer can pay **only** when `submittedAt` is set (expert called `POST /treatments/:id/submit`). Having phases/dates alone is not enough.
7. **Edit unsubmits:** any unpaid `DRAFT` phase add/update/delete clears `submittedAt` (and `totalPriceVnd`). Expert must submit again before the customer can pay.
8. **Dates:** treatment `startDate` / `endDate` required before submit and pay (follow-up window).
9. **Complete consultation after handoff:** prefer completing the booking once the plan is paid (and ideally first phase activated / customer understands next steps). Completing earlier is allowed by the booking API, but product UX should keep the session open through plan pay when possible.
10. **One ACTIVE phase:** activating auto-completes the previous ACTIVE phase; save DRAFT routines first.
11. **Chart products used:** from routine **COMPLETED** step completions only (not prescribed-unused).
12. **Progress photos:** upload via `POST /uploads/images`, then send returned `url` as `photoUrl` (create or patch event). See [uploads.md](uploads.md).
13. **Cancel:** only treatment `ACTIVE` / `PAUSED`. Refund = sum of **PENDING** phase fees; COMPLETED + ACTIVE fees kept.
14. **Perspective:** `GET /treatments/me?as=customer|expert` when dual-role.

---

## 5. Step-by-step — live consultation into plan

### 5.1 Start session & join call ✅ Ready

Documented in [consultation-flow.md](consultation-flow.md) and [realtime-communication-flow.md](realtime-communication-flow.md):

```http
PATCH /bookings/:bookingId/start
GET   /consultations/:bookingId/video-token
GET   /consultations/:bookingId/chat-token
```

Booking must be `CONFIRMED` before start → becomes `IN_PROGRESS`. Expert gathers history/symptoms over video and chat.

### 5.2 Create DRAFT plan (during `IN_PROGRESS`) ✅ Ready

```http
POST /treatments
Content-Type: application/json

{
  "customerId": "<customer-profile-uuid>",
  "title": "Acne 12-week plan",
  "description": "Based on live consult intake",
  "startDate": "2026-08-01",
  "endDate": "2026-11-01",
  "sourceConsultationId": "<booking-uuid-in-progress>"
}
```

| Field                   | Required    | Notes                                                               |
| ----------------------- | ----------- | ------------------------------------------------------------------- |
| `customerId`            | Yes         | Customer profile id (or user id; BE resolves / auto-creates)        |
| `title`                 | Yes         | 1–200 chars                                                         |
| `description`           | No          | Free text                                                           |
| `startDate` / `endDate` | No\*        | `YYYY-MM-DD`; **required before submit/pay**                        |
| `sourceConsultationId`  | Recommended | Must match expert+customer; status **`IN_PROGRESS` or `COMPLETED`** |

Response: `TreatmentResponseDto` with `status: DRAFT`.

### 5.3 Add / edit / delete phases ✅ Ready

```http
POST /treatments/:id/phases
Content-Type: application/json

{
  "phaseType": "ACTIVE_TREATMENT",
  "phaseOrder": 0,
  "title": "Inflammation control",
  "goals": "Reduce papules",
  "notes": "Optional free-form",
  "noteByExpert": "Why this phase — required before submit",
  "priceVnd": 500000,
  "startDate": "2026-08-01",
  "endDate": "2026-09-01"
}
```

| Field          | Required | Notes                                                                     |
| -------------- | -------- | ------------------------------------------------------------------------- |
| `phaseType`    | Yes      | `INITIAL_ASSESSMENT` \| `ACTIVE_TREATMENT` \| `MAINTENANCE` \| `RECOVERY` |
| `priceVnd`     | Yes      | Integer ≥ 0 (VND service fee for this phase)                              |
| `noteByExpert` | No\*     | Optional until submit; clinical justification for the phase / plan        |
| `notes`        | No       | Free-form (not `noteByExpert`)                                            |
| `phaseOrder`   | No       | Default `0`                                                               |

```http
PATCH /treatments/phases/:phaseId
DELETE /treatments/phases/:phaseId
```

Only while treatment is unpaid `DRAFT`. Any phase mutation clears `submittedAt` / `totalPriceVnd` until the expert submits again.

### 5.4 Submit for payment ✅ Ready

```http
POST /treatments/:id/submit
```

**Server checks:** ≥1 phase; every phase has non-empty `noteByExpert`; sum of `priceVnd` > 0; treatment `startDate` + `endDate` set.

Plan stays `DRAFT` until the customer pays. Sets `submittedAt` and stores `totalPriceVnd` (bigint string). Customer Pay CTA should gate on `submittedAt != null`.

### 5.5 Customer pays plan ✅ Ready

During or right after the live session (booking still often `IN_PROGRESS`):

```http
GET  /wallet/me
POST /wallet/top-up
POST /treatments/:id/pay
```

Requires unpaid `DRAFT` with **`submittedAt` set**. On success: `TREATMENT_PLAN_PAYMENT` debit → treatment `ACTIVE`, `paidAt` set. After pay, expert cannot add/edit/delete phases or change pricing.

Customer list/detail:

```http
GET /treatments/me?as=customer
GET /treatments/:id
```

Expert list (search / date sort / phase count):

```http
GET /treatments/me?as=expert&search=acne&dateOrder=desc&phaseCount=3
```

| Query        | Behavior                                                     |
| ------------ | ------------------------------------------------------------ |
| `as`         | `customer` \| `expert` (required when user has both roles)   |
| `search`     | Expert view: title, description, customer name/email         |
| `dateOrder`  | Expert view: `asc` \| `desc` (default `desc`) on `createdAt` |
| `phaseCount` | Expert view: exact number of phases                          |

---

## 6. Step-by-step — after pay (configure & activate)

All require treatment `ACTIVE` + paid, assigned expert.

| Step | Method | Path                                             |
| ---- | ------ | ------------------------------------------------ |
| 1    | POST   | `/treatments/phases/:phaseId/ingredients`        |
| 2    | GET    | `/treatments/phases/:phaseId/product-candidates` |
| 3    | POST   | `/treatments/phases/:phaseId/products`           |
| 4    | POST   | `/treatments/phases/:phaseId/routines/generate`  |
| 5    | POST   | `/treatments/routines/:routineId/save`           |
| 6    | PATCH  | `/treatments/routines/:routineId` (optional)     |
| 7    | POST   | `/treatments/phases/:phaseId/activate`           |

**Bodies:**

```json
{ "ingredientIds": ["<uuid>", "<uuid>"] }
```

```json
{ "productVariantIds": ["<uuid>", "<uuid>"] }
```

**Activate rules:**

- Only one phase `ACTIVE` at a time (previous ACTIVE → `COMPLETED`).
- If routines exist, none may remain `DRAFT` (save first).
- Phase may have **no routine** if it has dates and/or `notes`.

### 6.1 Complete the consultation ✅ Ready

After plan handoff (pay + preferably activate / explain next steps):

```http
PATCH /bookings/:bookingId/complete
```

`IN_PROGRESS` → `COMPLETED`. Customer may then submit feedback ([consultation-flow.md](consultation-flow.md)).

Customer starts daily routine tracking ([routine-tracking-flow.md](routine-tracking-flow.md)):

```http
GET /routines/me/today?period=MORNING
```

---

## 7. After consultation completed (chart / cancel / follow-ups)

These are the **ongoing treatment** surfaces after the originating consult is done (also usable earlier once the plan exists).

### 7.1 Treatment chart (hồ sơ bệnh án) ✅ Ready

```http
GET /treatments/:id/chart
```

Auth: owning customer, assigned expert, or an expert with a `CONFIRMED`/`IN_PROGRESS` booking for the same customer (read-only; mutations stay assigned-expert / owning-customer only).

| Chart section          | Source                                                                       |
| ---------------------- | ---------------------------------------------------------------------------- |
| Plan + phase summaries | `treatments` + `treatment_phases` (includes `noteByExpert`)                  |
| `progressPhotos`       | `treatment_events` where `type = PROGRESS_PHOTO`                             |
| `productsUsed`         | `RoutineStepCompletion` `COMPLETED` on routines linked by `treatmentPhaseId` |
| `inPersonSessions`     | `consultation_requests` with `treatmentId = :id` (follow-ups)                |
| `consultationResults`  | `sourceConsultation` (+ feedback) and completed linked follow-ups            |
| `phaseDetails`         | Full phase DTOs                                                              |

### 7.2 Free follow-up (tái khám) ✅ Ready

While treatment is `ACTIVE` and `startDate ≤ today ≤ endDate`, booking the same expert sets `isFollowUp=true` and waives the consult fee — see [consultation-flow.md](consultation-flow.md). Those bookings appear on the chart under `inPersonSessions`.

### 7.3 Mid-plan cancel ✅ Ready

See [§9](#9-mid-plan-cancel--refund).

---

## 8. Progress photos & events

### 8.1 Create event ✅ Ready

```http
POST /treatments/:id/events
Content-Type: application/json

{
  "type": "PROGRESS_PHOTO",
  "title": "Week 2",
  "note": "Less redness",
  "photoUrl": "https://cdn.example.com/photos/week2.jpg",
  "occurredAt": "2026-08-15T10:00:00.000Z"
}
```

| Field        | Required | Notes                                                                                        |
| ------------ | -------- | -------------------------------------------------------------------------------------------- |
| `type`       | Yes      | See enum in §15                                                                              |
| `title`      | Yes      | 1–200 chars                                                                                  |
| `note`       | No       | Free text                                                                                    |
| `photoUrl`   | Cond.    | **Required** when `type` is `PROGRESS_PHOTO` (from `POST /uploads/images` or any public URL) |
| `occurredAt` | No       | ISO datetime; defaults to now                                                                |

### 8.2 Update progress photo URL ✅ Ready

```http
PATCH /treatments/:id/events/:eventId
Content-Type: application/json

{
  "photoUrl": "https://placehold.co/400"
}
```

Only allowed when the event `type` is `PROGRESS_PHOTO`.

### 8.3 List events ✅ Ready

```http
GET /treatments/:id/events
GET /treatments/:id/events?type=PROGRESS_PHOTO
```

Ordered by `occurredAt` ascending. Preferred flow: [uploads.md](uploads.md) → create/patch event with `photoUrl`.

---

## 9. Mid-plan cancel & refund

```http
POST /treatments/:id/cancel
Content-Type: application/json

{ "reason": "Cannot continue due to side effects" }
```

| Rule             | Behavior                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Who              | Owning customer or assigned expert                                                       |
| Allowed statuses | Treatment `ACTIVE` or `PAUSED`                                                           |
| Refund amount    | Sum of phase `priceVnd` where phase status is `PENDING`                                  |
| Kept fees        | `COMPLETED` phases + **full** current `ACTIVE` phase (no prorate)                        |
| Wallet           | If refund > 0 and plan was paid → `TransactionType.REFUND`                               |
| Side effects     | Treatment → `CANCELLED`; linked ACTIVE expert routines → `PAUSED`                        |
| Stored fields    | `cancelledAt`, `cancelReason`, `cancelledBy`, `refundTransactionId`, `refundedAmountVnd` |

**Example:** COMPLETED `200k` + ACTIVE `300k` + PENDING `150k` + PENDING `50k` → refund **`200000`**.

---

## 10. Wallet payment

| Method | Path                  | Notes                                                          |
| ------ | --------------------- | -------------------------------------------------------------- |
| GET    | `/wallet/me`          | Balance                                                        |
| POST   | `/wallet/top-up`      | Gateway checkout; purpose `WALLET_TOPUP`                       |
| POST   | `/bookings/:id/pay`   | Consultation fee (`CONSULTATION_PAYMENT`) — before the session |
| POST   | `/treatments/:id/pay` | Full plan fee (`TREATMENT_PLAN_PAYMENT`) — during/after intake |

Plan pay is **one shot** for the whole package (sum of phase fees), not per-phase checkout. Requires expert `submittedAt`; editing the unpaid plan clears that lock until re-submit.

---

## 11. Status machines

### Consultation (originating session)

```
CONFIRMED ──(start)──▶ IN_PROGRESS ──(intake + create plan + pay + activate)──▶ COMPLETED
                              │
                              └── video/chat tokens available
```

### Treatment

```
DRAFT (editing, submittedAt=null)
   │
   ├──(submit)──▶ DRAFT (submittedAt set) ──(pay)──▶ ACTIVE ──(cancel)──▶ CANCELLED
   ▲                      │                              │
   └──(edit phase)────────┘                              ├──▶ PAUSED ──(cancel)──▶ CANCELLED
                                                         └──▶ COMPLETED
```

| Status      | Meaning                                                 |
| ----------- | ------------------------------------------------------- |
| `DRAFT`     | Unpaid; payable only when `submittedAt` is set          |
| `ACTIVE`    | Paid; phases configurable / activatable; pricing locked |
| `PAUSED`    | Paid but paused (cancellable)                           |
| `COMPLETED` | Plan finished                                           |
| `CANCELLED` | Mid-plan cancel; refund may apply                       |

| Field         | Meaning                                                              |
| ------------- | -------------------------------------------------------------------- |
| `submittedAt` | Set by expert submit; cleared on unpaid phase edit; required for pay |

### Phase

```
PENDING ──(activate)──▶ ACTIVE ──(next phase activate)──▶ COMPLETED
```

| Status      | On mid-plan cancel        |
| ----------- | ------------------------- |
| `PENDING`   | Fee **refunded**          |
| `ACTIVE`    | Fee **kept** (no prorate) |
| `COMPLETED` | Fee **kept**              |

---

## 12. Response shapes

### 12.1 Treatment detail

```json
{
  "id": "uuid",
  "customerId": "uuid",
  "expertId": "uuid",
  "clinicId": "uuid-or-null",
  "title": "Acne 12-week plan",
  "description": "...",
  "status": "ACTIVE",
  "startDate": "2026-08-01",
  "endDate": "2026-11-01",
  "totalPriceVnd": "1000000",
  "submittedAt": "2026-07-30T11:55:00.000Z",
  "paidAt": "2026-07-30T12:00:00.000Z",
  "paidTransactionId": "uuid",
  "sourceConsultationId": "uuid",
  "cancelledAt": null,
  "cancelReason": null,
  "cancelledBy": null,
  "refundTransactionId": null,
  "refundedAmountVnd": null,
  "phases": [
    {
      "id": "uuid",
      "treatmentId": "uuid",
      "phaseType": "ACTIVE_TREATMENT",
      "phaseOrder": 0,
      "title": "Inflammation control",
      "goals": "Reduce papules",
      "notes": null,
      "noteByExpert": "Patient needs staged retinoid introduction",
      "priceVnd": "500000",
      "status": "ACTIVE",
      "startDate": "2026-08-01",
      "endDate": "2026-09-01",
      "ingredients": [],
      "products": [],
      "routines": [
        {
          "id": "uuid",
          "title": "Phase 1 routine",
          "status": "ACTIVE",
          "type": "EXPERT_PRESCRIBED"
        }
      ]
    }
  ],
  "createdAt": "2026-07-30T10:00:00.000Z",
  "updatedAt": "2026-07-30T12:00:00.000Z"
}
```

Money fields (`priceVnd`, `totalPriceVnd`, `refundedAmountVnd`) are **bigint strings**.

### 12.2 Chart

```json
{
  "treatmentId": "uuid",
  "title": "Acne 12-week plan",
  "status": "ACTIVE",
  "startDate": "2026-08-01",
  "endDate": "2026-11-01",
  "paidAt": "2026-07-30T12:00:00.000Z",
  "phases": [
    {
      "id": "uuid",
      "phaseType": "ACTIVE_TREATMENT",
      "phaseOrder": 0,
      "title": "Inflammation control",
      "status": "ACTIVE",
      "noteByExpert": "Patient needs staged retinoid introduction",
      "startDate": "2026-08-01",
      "endDate": "2026-09-01"
    }
  ],
  "progressPhotos": [],
  "productsUsed": [
    {
      "productVariantId": "uuid",
      "productName": "Serum A",
      "sku": "SKU-1",
      "completedCount": 2,
      "lastUsedAt": "2026-08-11",
      "phaseIds": ["uuid"]
    }
  ],
  "inPersonSessions": [],
  "consultationResults": {
    "sourceConsultation": {
      "id": "uuid",
      "status": "COMPLETED",
      "isFollowUp": false,
      "scheduledAt": "2026-07-20T09:00:00.000Z",
      "startedAt": "2026-07-20T09:05:00.000Z",
      "completedAt": "2026-07-20T10:15:00.000Z",
      "reason": "Acne flare",
      "feedbackRating": 5,
      "feedbackComment": "Clear advice"
    },
    "followUpSessions": []
  },
  "phaseDetails": []
}
```

### 12.3 Product candidate

```json
{
  "productVariantId": "uuid",
  "productId": "uuid",
  "productName": "Gentle Cleanser",
  "sku": "SKU-1",
  "priceVnd": 189000,
  "matchScore": 2,
  "matchedIngredientIds": ["uuid", "uuid"],
  "stockQuantity": 12
}
```

---

## 13. Error map

| HTTP | When                                                                                                                                                                                                                                                            | FE handling             |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 400  | Source consult not `IN_PROGRESS`/`COMPLETED`; missing `noteByExpert` on submit; empty phases; total ≤ 0; missing dates; pay without `submittedAt`; PROGRESS_PHOTO without `photoUrl`; cancel when not ACTIVE/PAUSED; configure before pay; phase edit after pay | Show validation message |
| 401  | Not authenticated                                                                                                                                                                                                                                               | Re-login                |
| 403  | Not assigned expert / not owning customer                                                                                                                                                                                                                       | Hide action             |
| 404  | Treatment / phase / routine / source consultation not found                                                                                                                                                                                                     | Refresh list            |

---

## 14. Endpoint checklist

| Method | Path                                             | Auth              | Status   | When in flow                                   |
| ------ | ------------------------------------------------ | ----------------- | -------- | ---------------------------------------------- |
| PATCH  | `/bookings/:id/start`                            | Expert            | ✅ Ready | Start live session                             |
| GET    | `/consultations/:id/video-token`                 | Both              | ✅ Ready | Join video                                     |
| GET    | `/consultations/:id/chat-token`                  | Both              | ✅ Ready | Join chat                                      |
| POST   | `/treatments`                                    | Expert            | ✅ Ready | Create DRAFT during `IN_PROGRESS`              |
| POST   | `/treatments/:id/phases`                         | Expert            | ✅ Ready | Add phase + `noteByExpert`                     |
| PATCH  | `/treatments/phases/:phaseId`                    | Expert            | ✅ Ready | Edit DRAFT phase                               |
| DELETE | `/treatments/phases/:phaseId`                    | Expert            | ✅ Ready | Delete DRAFT phase                             |
| POST   | `/treatments/:id/submit`                         | Expert            | ✅ Ready | Set `submittedAt` + `totalPriceVnd`            |
| POST   | `/treatments/:id/pay`                            | Customer          | ✅ Ready | Requires `submittedAt`; wallet → ACTIVE        |
| POST   | `/treatments/phases/:phaseId/ingredients`        | Expert            | ✅ Ready | After pay                                      |
| GET    | `/treatments/phases/:phaseId/product-candidates` | Expert            | ✅ Ready | After pay                                      |
| POST   | `/treatments/phases/:phaseId/products`           | Expert            | ✅ Ready | After pay                                      |
| POST   | `/treatments/phases/:phaseId/routines/generate`  | Expert            | ✅ Ready | After pay                                      |
| POST   | `/treatments/routines/:routineId/save`           | Expert            | ✅ Ready | After pay                                      |
| PATCH  | `/treatments/routines/:routineId`                | Expert            | ✅ Ready | After pay                                      |
| POST   | `/treatments/phases/:phaseId/activate`           | Expert            | ✅ Ready | After pay; before/around consult complete      |
| PATCH  | `/bookings/:id/complete`                         | Expert            | ✅ Ready | End originating consultation                   |
| GET    | `/treatments/me`                                 | Customer / Expert | ✅ Ready | List; expert view: search/dateOrder/phaseCount |
| GET    | `/treatments/:id`                                | Customer / Expert | ✅ Ready | Detail                                         |
| GET    | `/treatments/:id/chart`                          | Customer / Expert | ✅ Ready | Post-session hồ sơ                             |
| GET    | `/treatments/:id/events`                         | Customer / Expert | ✅ Ready | Timeline                                       |
| POST   | `/treatments/:id/events`                         | Customer / Expert | ✅ Ready | Progress photos                                |
| PATCH  | `/treatments/:id/events/:eventId`                | Customer / Expert | ✅ Ready | Update PROGRESS_PHOTO `photoUrl`               |
| POST   | `/uploads/images`                                | Any authenticated | ✅ Ready | Multipart → R2 public URL                      |
| POST   | `/treatments/:id/cancel`                         | Customer / Expert | ✅ Ready | Mid-plan cancel                                |
| GET    | `/wallet/me`                                     | Authenticated     | ✅ Ready | Balance                                        |
| POST   | `/wallet/top-up`                                 | Customer          | ✅ Ready | Top-up                                         |

---

## 15. Domain model

| Entity / field                    | Role                                                              |
| --------------------------------- | ----------------------------------------------------------------- |
| `Treatment`                       | Plan header: parties, dates, status, pay + cancel/refund metadata |
| `Treatment.sourceConsultationId`  | Originating booking (`IN_PROGRESS` at create, later `COMPLETED`)  |
| `TreatmentPhase`                  | Ordered stage with `priceVnd`, `noteByExpert`, status             |
| `TreatmentPhaseIngredient`        | Expert-selected ingredients                                       |
| `TreatmentPhaseProduct`           | Prescribed product variants                                       |
| `TreatmentEvent`                  | Timeline (`PROGRESS_PHOTO` + `photoUrl`, etc.)                    |
| `Routine.treatmentPhaseId`        | Links expert routine to a phase                                   |
| `RoutineStepCompletion`           | Drives chart `productsUsed` when `COMPLETED`                      |
| `ConsultationRequest.treatmentId` | Follow-up / in-person sessions on chart                           |

**Enums:**

| Enum                   | Values                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `TreatmentStatus`      | `DRAFT`, `ACTIVE`, `PAUSED`, `COMPLETED`, `CANCELLED`                                                  |
| `TreatmentPhaseStatus` | `PENDING`, `ACTIVE`, `COMPLETED`                                                                       |
| `TreatmentPhaseType`   | `INITIAL_ASSESSMENT`, `ACTIVE_TREATMENT`, `MAINTENANCE`, `RECOVERY`                                    |
| `TreatmentEventType`   | `CONSULTATION`, `PROGRESS_PHOTO`, `MEDICATION_CHANGE`, `INGREDIENT_OVERRIDE`, `MILESTONE`, `FOLLOW_UP` |
| `TreatmentCancelledBy` | `CUSTOMER`, `EXPERT`                                                                                   |

---

## 16. Local testing

1. `docker compose up -d` → `npm run migration:run` → `npm run seed` → `npm run start:dev`.
2. Auth as expert + customer; ensure wallet has balance for consult fee **and** plan fee.
3. Create booking → pay consult fee → expert confirm → **start** (`IN_PROGRESS`).
4. Fetch video/chat tokens; (optional) exercise Zego clients.
5. Expert: `POST /treatments` with `sourceConsultationId` = booking id → add phases with `noteByExpert` → submit.
6. Customer: `POST /treatments/:id/pay`.
7. Expert: ingredients → products → generate/save routine → activate phase.
8. Expert: `PATCH /bookings/:id/complete`.
9. Customer: routine today + `GET /treatments/:id/chart`; optional events / cancel / follow-up booking.

Unit coverage: `src/treatments/treatments.service.spec.ts`.

---

## 17. Remaining gaps & roadmap

| Topic                                         | Status                                                  |
| --------------------------------------------- | ------------------------------------------------------- |
| Object storage / multipart photo upload       | ✅ `POST /uploads/images` (R2); events store `photoUrl` |
| ACTIVE phase fee prorating on cancel          | ❌ Full ACTIVE fee kept                                 |
| Ecommerce “purchased” vs “used” products      | ❌ Chart uses routine completions only                  |
| Force consult complete only after plan pay    | ❌ Product UX; booking API does not enforce             |
| Auto COMPLETED treatment when all phases done | 🔶 Not wired                                            |
| Expert payout / escrow from plan fees         | ❌                                                      |
| Notifications on pay / cancel / activate      | ❌                                                      |

---

## Quick reference — client sequence

```
# Live consultation
PATCH /bookings/:bookingId/start
GET   /consultations/:bookingId/video-token
GET   /consultations/:bookingId/chat-token

# Expert drafts plan during IN_PROGRESS
POST  /treatments                              ← sourceConsultationId = bookingId
POST  /treatments/:id/phases                   ← noteByExpert before submit
POST  /treatments/:id/submit

# Customer pays plan (session may still be open)
POST  /treatments/:id/pay

# Expert configures & activates
POST  /treatments/phases/:phaseId/ingredients
GET   /treatments/phases/:phaseId/product-candidates
POST  /treatments/phases/:phaseId/products
POST  /treatments/phases/:phaseId/routines/generate
POST  /treatments/routines/:routineId/save
POST  /treatments/phases/:phaseId/activate

# End originating consult
PATCH /bookings/:bookingId/complete

# Ongoing care
GET   /routines/me/today
GET   /treatments/:id/chart
POST  /treatments/:id/events
POST  /treatments/:id/cancel                   ← optional
```
