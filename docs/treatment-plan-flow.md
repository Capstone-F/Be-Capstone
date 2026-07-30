# Treatment Plan Flow Integration Guide

End-to-end guide for integrating GlowScan’s **expert creates multi-phase plan → submit → customer wallet pay → phase configure / activate → routine tracking → chart (hồ sơ) → optional mid-plan cancel** flow with this backend.

Entities: **`Treatment`** (plan lifecycle), **`TreatmentPhase`** (priced stages), **`TreatmentEvent`** (progress photos / timeline), **`Routine`** (`EXPERT_PRESCRIBED`, linked via `treatmentPhaseId`). Money for the plan uses the customer **`Wallet`** + ledger **`Transaction`** (`TREATMENT_PLAN_PAYMENT` / `REFUND`) — **not** the ecommerce `Payment` / VNPay checkout stack. Catalog products are optional purchases; phase products are prescriptions.

**Auth (register / login):** do not duplicate here — use:

- [Web Authentication Guide](auth-web.md) — session cookie (`sid`) for SPAs
- [Mobile Authentication Guide](auth-mobile.md) — Bearer tokens for Expo / React Native

See also:

- [Consultation Flow](consultation-flow.md) — booking → `COMPLETED` before plan create; free tái khám while plan is ACTIVE
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
5. [Step-by-step integration — expert](#5-step-by-step-integration--expert)
6. [Step-by-step integration — customer](#6-step-by-step-integration--customer)
7. [Treatment chart (hồ sơ bệnh án)](#7-treatment-chart-hồ-sơ-bệnh-án)
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

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐
│ Consultation │──▶│ Create DRAFT │──▶│ Add phases + │──▶│ Submit (notes    │
│ COMPLETED    │   │ POST /treat. │   │ noteByExpert │   │ required)        │
└──────────────┘   └──────────────┘   └──────────────┘   └────────┬─────────┘
  ✅ Ready           ✅ Ready           ✅ Ready                    │ ✅ Ready
                                                                    ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐
│ Chart /      │◀──│ Activate     │◀──│ Ingredients→ │◀──│ Customer pays    │
│ cancel /     │   │ phase        │   │ products→    │   │ wallet → ACTIVE  │
│ follow-ups   │   │              │   │ routine      │   │                  │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────────┘
  ✅ Ready           ✅ Ready           ✅ Ready            ✅ Ready
```

**Happy path:**

1. After a `COMPLETED` consultation, expert creates a `DRAFT` treatment (optionally with `sourceConsultationId`).
2. Expert adds one or more phases with `priceVnd`. `noteByExpert` may be empty while drafting.
3. Expert fills `noteByExpert` on **every** phase, then `POST /treatments/:id/submit` (recomputes `totalPriceVnd`; plan stays `DRAFT` until paid).
4. Customer tops up wallet if needed, then `POST /treatments/:id/pay` → ledger `TREATMENT_PLAN_PAYMENT`, status `ACTIVE`.
5. Expert configures the paid plan: ingredients → product candidates → selected variants → generate/save routine → `activate` phase (one `ACTIVE` at a time).
6. Customer follows the expert routine via [routine tracking](routine-tracking-flow.md). Free tái khám bookings apply while `startDate ≤ today ≤ endDate` — see [consultation flow](consultation-flow.md).
7. Both parties open **chart** (`GET .../chart`) for hồ sơ: photos, products used, sessions, consult results.
8. Optional: mid-plan cancel → refund **PENDING** phase fees only; COMPLETED + ACTIVE fees kept.

> **Do not use** ecommerce `POST /payments/checkout` for plan fees. Top-up uses the gateway with purpose `WALLET_TOPUP`; plan **debit** uses **Wallet** only.

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

| Actor    | Typical roles | Notes                                                                                         |
| -------- | ------------- | --------------------------------------------------------------------------------------------- |
| Customer | `customer`    | List/detail own plans, pay, chart, events, cancel own                                         |
| Expert   | `expert`      | Create/edit DRAFT, submit, configure phases, activate, chart/events/cancel for assigned plans |

All treatment routes require an authenticated session (cookie or Bearer). Role checks use `@Roles` + `RolesGuard`.

When a user has both roles, pass `as=customer` or `as=expert` on `GET /treatments/me`.

---

## 3. Prerequisites & migrations

| Requirement              | How to get it                                       | Status   |
| ------------------------ | --------------------------------------------------- | -------- |
| Running API + DB         | `docker compose up -d` + `npm run start:dev`        | ✅ Ready |
| Migrations               | `npm run migration:run`                             | ✅ Ready |
| Seeded clinics / experts | `npm run seed`                                      | ✅ Ready |
| Customer auth + profile  | Auth guides + customer row                          | ✅ Ready |
| Expert auth              | Keycloak `expert` role + linked Expert row          | ✅ Ready |
| Wallet balance           | Top-up via gateway or admin credit                  | ✅ Ready |
| Completed consultation   | Optional but recommended for `sourceConsultationId` | ✅ Ready |

```bash
npm run migration:run
```

Relevant migrations:

| Migration                                   | Purpose                                              |
| ------------------------------------------- | ---------------------------------------------------- |
| `1784500000000-ConsultationTreatmentWallet` | Plan pricing, wallet pay, follow-up booking fields   |
| `1784600000000-TreatmentTrackingChart`      | `note_by_expert`, cancel/refund columns on treatment |

**Admin shortcut for wallet testing (no gateway):** as `app_admin`, `POST /admin/wallets/:userId/top-up` with `{ "amountVnd": 2000000 }`.

---

## 4. Domain rules (must implement on FE)

1. **Money path:** show wallet balance + top-up before pay. Never call `POST /payments/checkout` for a treatment plan fee.
2. **Draft vs paid:** phase create/edit/delete and pricing only while treatment is unpaid `DRAFT`. After pay, use ingredient/product/routine/activate APIs.
3. **`noteByExpert`:** optional on create/update; **block submit in UI** until every phase has a non-empty justification (server returns `400` otherwise). Distinct from free-form `notes`.
4. **Submit before pay:** customer pay requires submitted totals (`totalPriceVnd` + phases). Expert must call submit after phases are ready.
5. **Dates:** `startDate` / `endDate` on the treatment are required before submit and pay (used for follow-up window).
6. **One ACTIVE phase:** activating a phase auto-completes the previous ACTIVE phase. Save all DRAFT routines before activate.
7. **Products used on chart:** derived from routine **COMPLETED** step completions only — not from prescribed-but-unused products.
8. **Progress photos:** FE hosts the image and sends `photoUrl`; backend does not upload files.
9. **Cancel window:** only `ACTIVE` or `PAUSED`. Hide cancel for `DRAFT` / `COMPLETED` / `CANCELLED`.
10. **Refund UX:** on cancel, refund = sum of **PENDING** phase `priceVnd`. COMPLETED and current ACTIVE fees are **kept** (no prorate). Show breakdown before confirm.
11. **Perspective:** when a user has both roles, pass `as=customer` or `as=expert` on `GET /treatments/me`.
12. **Access:** only the owning customer or assigned expert may view detail/chart/events or cancel.

---

## 5. Step-by-step integration — expert

### 5.1 Create DRAFT plan ✅ Ready

```http
POST /treatments
Content-Type: application/json

{
  "customerId": "<customer-uuid>",
  "title": "Acne 12-week plan",
  "description": "Post-consult regimen",
  "startDate": "2026-08-01",
  "endDate": "2026-11-01",
  "sourceConsultationId": "<completed-booking-uuid>"
}
```

| Field                   | Required | Notes                                                                 |
| ----------------------- | -------- | --------------------------------------------------------------------- |
| `customerId`            | Yes      | Customer profile id (or user id; BE resolves / auto-creates customer) |
| `title`                 | Yes      | 1–200 chars                                                           |
| `description`           | No       | Free text                                                             |
| `startDate` / `endDate` | No\*     | ISO date `YYYY-MM-DD`; **required before submit/pay**                 |
| `sourceConsultationId`  | No       | Must be `COMPLETED` and match expert+customer                         |

Response: `TreatmentResponseDto` with `status: DRAFT`.

### 5.2 Add / edit / delete phases ✅ Ready

```http
POST /treatments/:id/phases
Content-Type: application/json

{
  "phaseType": "ACTIVE_TREATMENT",
  "phaseOrder": 0,
  "title": "Inflammation control",
  "goals": "Reduce papules",
  "notes": "Optional free-form",
  "noteByExpert": "Why this phase exists — can fill later before submit",
  "priceVnd": 500000,
  "startDate": "2026-08-01",
  "endDate": "2026-09-01"
}
```

| Field          | Required | Notes                                                                     |
| -------------- | -------- | ------------------------------------------------------------------------- |
| `phaseType`    | Yes      | `INITIAL_ASSESSMENT` \| `ACTIVE_TREATMENT` \| `MAINTENANCE` \| `RECOVERY` |
| `priceVnd`     | Yes      | Integer ≥ 0 (VND service fee for this phase)                              |
| `noteByExpert` | No       | Optional until submit; clinical “why”                                     |
| `notes`        | No       | Free-form, not the same as `noteByExpert`                                 |
| `phaseOrder`   | No       | Default `0`                                                               |

```http
PATCH /treatments/phases/:phaseId
DELETE /treatments/phases/:phaseId
```

Only while treatment is unpaid `DRAFT`.

### 5.3 Submit for payment ✅ Ready

```http
POST /treatments/:id/submit
```

**Server checks:**

- ≥1 phase
- every phase has non-empty `noteByExpert`
- `totalPriceVnd` = sum(phase `priceVnd`) > 0
- treatment `startDate` and `endDate` set

Treatment remains `DRAFT` until the customer pays. Recomputes and stores `totalPriceVnd` (bigint string).

### 5.4 After pay — configure phase ✅ Ready

Order of operations (all require treatment `ACTIVE` + paid, assigned expert):

| Step | Method | Path                                              |
| ---- | ------ | ------------------------------------------------- |
| 1    | POST   | `/treatments/phases/:phaseId/ingredients`         |
| 2    | GET    | `/treatments/phases/:phaseId/product-candidates`  |
| 3    | POST   | `/treatments/phases/:phaseId/products`            |
| 4    | POST   | `/treatments/phases/:phaseId/routines/generate`   |
| 5    | POST   | `/treatments/routines/:routineId/save`            |
| 6    | PATCH  | `/treatments/routines/:routineId` (optional edit) |
| 7    | POST   | `/treatments/phases/:phaseId/activate`            |

**Ingredients body:**

```json
{ "ingredientIds": ["<uuid>", "<uuid>"] }
```

**Products body:**

```json
{ "productVariantIds": ["<uuid>", "<uuid>"] }
```

**Product candidates:** ranked by overlap with selected ingredients; allergy-aware filtering; includes `matchScore`, `stockQuantity`.

**Activate rules:**

- Only one phase `ACTIVE` at a time (previous ACTIVE → `COMPLETED`).
- If the phase has routines, none may remain `DRAFT` (save first).
- Phase may have **no routine** if it has `startDate`/`endDate` and/or `notes`.

### 5.5 List / detail / chart / events / cancel

Same as customer for shared read/cancel endpoints (see sections 6–9), scoped to treatments where `expertId` matches the logged-in expert.

```http
GET /treatments/me?as=expert
GET /treatments/:id
GET /treatments/:id/chart
```

---

## 6. Step-by-step integration — customer

### 6.1 List & open plan ✅ Ready

```http
GET /treatments/me
GET /treatments/me?as=customer
GET /treatments/:id
```

Show `totalPriceVnd`, phase list, `status`. For payable DRAFT, show pay CTA after expert submitted (`totalPriceVnd` present and phases priced).

### 6.2 Pay with wallet ✅ Ready

```http
GET /wallet/me
POST /wallet/top-up   → gateway checkout, purpose WALLET_TOPUP
POST /treatments/:id/pay
```

Pay requirements:

- Caller is owning customer
- Treatment `DRAFT`, not yet `paidAt`
- Phases present, `totalPriceVnd` > 0
- Treatment `startDate` / `endDate` set

On success: wallet debit `TREATMENT_PLAN_PAYMENT`, `status → ACTIVE`, `paidAt` / `paidTransactionId` set.

### 6.3 Track routine after phase activate ✅ Ready

Use [routine-tracking-flow.md](routine-tracking-flow.md):

```http
GET /routines/me/today?period=MORNING
POST /routines/:routineId/steps/:stepId/complete
POST /routines/:routineId/check-ins
```

Expert-prescribed routines appear alongside AI routines when `ACTIVE`.

### 6.4 Chart, photos, cancel

See [§7](#7-treatment-chart-hồ-sơ-bệnh-án), [§8](#8-progress-photos--events), [§9](#9-mid-plan-cancel--refund).

### 6.5 Free follow-up (tái khám)

While treatment is `ACTIVE` and `startDate ≤ today ≤ endDate`, booking the same expert sets `isFollowUp=true` and waives fee — documented in [consultation-flow.md](consultation-flow.md). Those bookings appear on the treatment chart under in-person sessions (`treatmentId` link).

---

## 7. Treatment chart (hồ sơ bệnh án)

```http
GET /treatments/:id/chart
```

Auth: owning customer or assigned expert. Available for any status (in-progress or historical).

| Chart section          | Source                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Plan + phase summaries | `treatments` + `treatment_phases` (includes `noteByExpert`)                                                                         |
| `progressPhotos`       | `treatment_events` where `type = PROGRESS_PHOTO`, ordered by `occurredAt`                                                           |
| `productsUsed`         | `RoutineStepCompletion` with `status = COMPLETED` on routines where `treatmentPhaseId` ∈ plan phases; grouped by `productVariantId` |
| `inPersonSessions`     | `consultation_requests` with `treatmentId = :id`                                                                                    |
| `consultationResults`  | `sourceConsultation` (+ feedback) and completed linked follow-ups                                                                   |
| `phaseDetails`         | Full phase DTOs (ingredients, products, routines)                                                                                   |

**`productsUsed` item fields:** `productVariantId`, `productName`, `sku`, `completedCount`, `lastUsedAt` (`YYYY-MM-DD`), `phaseIds[]`.

Prescribed products with **zero** COMPLETED completions do **not** appear in `productsUsed` (they remain on phase detail / treatment GET).

**FE screens:** Treatment Chart / Hồ sơ tab → call on focus; pull-to-refresh after photo upload or routine completions.

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

| Field        | Required | Notes                                              |
| ------------ | -------- | -------------------------------------------------- |
| `type`       | Yes      | See enum below                                     |
| `title`      | Yes      | 1–200 chars                                        |
| `note`       | No       | Free text                                          |
| `photoUrl`   | Cond.    | **Required** when `type` is `PROGRESS_PHOTO` (URL) |
| `occurredAt` | No       | ISO datetime; defaults to now                      |

`TreatmentEventType`: `CONSULTATION` \| `PROGRESS_PHOTO` \| `MEDICATION_CHANGE` \| `INGREDIENT_OVERRIDE` \| `MILESTONE` \| `FOLLOW_UP`.

If the actor is the assigned expert, `createdByExpertId` is set.

### 8.2 List events ✅ Ready

```http
GET /treatments/:id/events
GET /treatments/:id/events?type=PROGRESS_PHOTO
```

Ordered by `occurredAt` ascending.

> **No upload API** in MVP — FE uploads elsewhere (or uses a temporary CDN) and stores the resulting URL.

---

## 9. Mid-plan cancel & refund

```http
POST /treatments/:id/cancel
Content-Type: application/json

{ "reason": "Cannot continue due to side effects" }
```

| Actor    | Allowed when        |
| -------- | ------------------- |
| Customer | Owns the treatment  |
| Expert   | Assigned `expertId` |

| Rule              | Behavior                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Allowed statuses  | `ACTIVE`, `PAUSED` only                                                                     |
| Already cancelled | `400`                                                                                       |
| Refund amount     | Sum of phase `priceVnd` where phase `status === PENDING`                                    |
| Kept fees         | `COMPLETED` phases + **full** current `ACTIVE` phase (no calendar prorate)                  |
| Wallet            | If refund > 0 and plan was paid → `TransactionType.REFUND` credit                           |
| Treatment         | `status → CANCELLED`; `cancelledAt`, `cancelReason`, `cancelledBy` (`CUSTOMER` \| `EXPERT`) |
| Refund fields     | `refundTransactionId`, `refundedAmountVnd` (bigint string)                                  |
| Routines          | Linked routines with `status === ACTIVE` → `PAUSED`                                         |
| Phase rows        | Left as-is historically (`PENDING` stay PENDING but plan cannot continue)                   |

**Example:** phases COMPLETED `200k` + ACTIVE `300k` + PENDING `150k` + PENDING `50k` → refund **`200000`** only.

---

## 10. Wallet payment

| Method | Path                  | Notes                                                         |
| ------ | --------------------- | ------------------------------------------------------------- |
| GET    | `/wallet/me`          | Balance                                                       |
| POST   | `/wallet/top-up`      | Gateway checkout (`PAYMENT_PROVIDER`); purpose `WALLET_TOPUP` |
| POST   | `/treatments/:id/pay` | Debit `TREATMENT_PLAN_PAYMENT` for full `totalPriceVnd`       |

Consultation fee and treatment plan debit the wallet after top-up. Plan pay is **one shot** for the whole package (sum of phase fees), not per-phase checkout.

---

## 11. Status machines

### Treatment

```
DRAFT ──(pay)──▶ ACTIVE ──(cancel)──▶ CANCELLED
                  │
                  ├──▶ PAUSED ──(cancel)──▶ CANCELLED
                  └──▶ COMPLETED   (future / manual ops)
```

| Status      | Meaning                                    |
| ----------- | ------------------------------------------ |
| `DRAFT`     | Expert building / submitted, unpaid        |
| `ACTIVE`    | Paid; phases can be configured & activated |
| `PAUSED`    | Paid but paused (cancellable)              |
| `COMPLETED` | Plan finished                              |
| `CANCELLED` | Mid-plan cancel; refund may apply          |

### Phase

```
PENDING ──(activate)──▶ ACTIVE ──(next phase activate)──▶ COMPLETED
```

| Status      | Meaning                               |
| ----------- | ------------------------------------- |
| `PENDING`   | Not started; fee refundable on cancel |
| `ACTIVE`    | Current phase; fee kept on cancel     |
| `COMPLETED` | Finished; fee kept on cancel          |

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
  "paidAt": "2026-07-30T12:00:00.000Z",
  "paidTransactionId": "uuid",
  "sourceConsultationId": "uuid-or-null",
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
  "progressPhotos": [
    {
      "id": "uuid",
      "treatmentId": "uuid",
      "type": "PROGRESS_PHOTO",
      "title": "Week 2",
      "note": "Less redness",
      "photoUrl": "https://cdn.example.com/photos/week2.jpg",
      "occurredAt": "2026-08-15T10:00:00.000Z",
      "createdByExpertId": "uuid-or-null",
      "createdAt": "2026-08-15T10:01:00.000Z"
    }
  ],
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
      "completedAt": "2026-07-20T09:45:00.000Z",
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

| HTTP | When                                                                                                                                                                                                   | FE handling             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| 400  | Missing `noteByExpert` on submit; empty phases; total ≤ 0; missing dates; PROGRESS_PHOTO without `photoUrl`; cancel when not ACTIVE/PAUSED; unpaid DRAFT edits after pay; activate with DRAFT routines | Show validation message |
| 401  | Not authenticated                                                                                                                                                                                      | Re-login                |
| 403  | Not assigned expert / not owning customer; expert profile missing                                                                                                                                      | Hide action / forbidden |
| 404  | Treatment / phase / routine not found; source consultation missing                                                                                                                                     | Refresh list            |
| 409  | (Reserved; wallet insufficient may surface as 400 from wallet layer)                                                                                                                                   | Top-up CTA              |

---

## 14. Endpoint checklist

| Method | Path                                             | Auth              | Status   | Purpose                          |
| ------ | ------------------------------------------------ | ----------------- | -------- | -------------------------------- |
| POST   | `/treatments`                                    | Expert            | ✅ Ready | Create DRAFT                     |
| GET    | `/treatments/me`                                 | Customer / Expert | ✅ Ready | List mine (`?as=`)               |
| GET    | `/treatments/:id`                                | Customer / Expert | ✅ Ready | Detail                           |
| GET    | `/treatments/:id/chart`                          | Customer / Expert | ✅ Ready | Hồ sơ bệnh án                    |
| GET    | `/treatments/:id/events`                         | Customer / Expert | ✅ Ready | Timeline (`?type=`)              |
| POST   | `/treatments/:id/events`                         | Customer / Expert | ✅ Ready | Add photo / milestone            |
| POST   | `/treatments/:id/cancel`                         | Customer / Expert | ✅ Ready | Mid-plan cancel + PENDING refund |
| POST   | `/treatments/:id/phases`                         | Expert            | ✅ Ready | Add phase                        |
| PATCH  | `/treatments/phases/:phaseId`                    | Expert            | ✅ Ready | Update DRAFT phase               |
| DELETE | `/treatments/phases/:phaseId`                    | Expert            | ✅ Ready | Delete DRAFT phase               |
| POST   | `/treatments/:id/submit`                         | Expert            | ✅ Ready | Require notes + recompute total  |
| POST   | `/treatments/:id/pay`                            | Customer          | ✅ Ready | Wallet debit → ACTIVE            |
| POST   | `/treatments/phases/:phaseId/ingredients`        | Expert            | ✅ Ready | Set ingredients                  |
| GET    | `/treatments/phases/:phaseId/product-candidates` | Expert            | ✅ Ready | Ranked candidates                |
| POST   | `/treatments/phases/:phaseId/products`           | Expert            | ✅ Ready | Select variants                  |
| POST   | `/treatments/phases/:phaseId/routines/generate`  | Expert            | ✅ Ready | Protocol DRAFT routine           |
| POST   | `/treatments/routines/:routineId/save`           | Expert            | ✅ Ready | DRAFT → ACTIVE routine entity    |
| PATCH  | `/treatments/routines/:routineId`                | Expert            | ✅ Ready | Edit expert routine              |
| POST   | `/treatments/phases/:phaseId/activate`           | Expert            | ✅ Ready | Activate phase                   |
| GET    | `/wallet/me`                                     | Authenticated     | ✅ Ready | Balance                          |
| POST   | `/wallet/top-up`                                 | Customer          | ✅ Ready | Top-up checkout                  |

---

## 15. Domain model

| Entity / field                    | Role                                                              |
| --------------------------------- | ----------------------------------------------------------------- |
| `Treatment`                       | Plan header: parties, dates, status, pay + cancel/refund metadata |
| `Treatment.sourceConsultationId`  | Originating completed booking                                     |
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
2. Auth as expert + customer (Keycloak); ensure Expert/Customer rows exist.
3. Complete a consultation (or skip `sourceConsultationId`).
4. Expert: create treatment → add ≥1 phase with `noteByExpert` → submit.
5. Admin top-up customer wallet → customer `POST .../pay`.
6. Expert: ingredients → candidates → products → generate/save routine → activate.
7. Customer: complete routine steps → `GET .../chart` shows `productsUsed`.
8. `POST .../events` with `PROGRESS_PHOTO` + `photoUrl` → chart `progressPhotos`.
9. Cancel with PENDING phases → wallet refund = PENDING sum only.

Unit coverage: `src/treatments/treatments.service.spec.ts` (submit note guard, cancel refund, chart products).

---

## 17. Remaining gaps & roadmap

| Topic                                         | Status                                 |
| --------------------------------------------- | -------------------------------------- |
| Object storage / multipart photo upload       | ❌ FE supplies `photoUrl` only         |
| ACTIVE phase fee prorating on cancel          | ❌ Full ACTIVE fee kept                |
| Ecommerce “purchased” vs “used” products      | ❌ Chart uses routine completions only |
| Auto COMPLETED treatment when all phases done | 🔶 Not wired as cron / auto-transition |
| Expert payout / escrow from plan fees         | ❌ Same gap as consultations           |
| Notifications on pay / cancel / activate      | ❌                                     |
| Stricter routine lock after phase activate    | 🔶 MVP still allows `PATCH` routine    |

---

## Quick reference — client sequence

```
# Expert
POST /treatments
POST /treatments/:id/phases          ← repeat; set noteByExpert before submit
POST /treatments/:id/submit
# Customer
GET  /wallet/me  →  POST /wallet/top-up (if needed)
POST /treatments/:id/pay
# Expert configure
POST /treatments/phases/:phaseId/ingredients
GET  /treatments/phases/:phaseId/product-candidates
POST /treatments/phases/:phaseId/products
POST /treatments/phases/:phaseId/routines/generate
POST /treatments/routines/:routineId/save
POST /treatments/phases/:phaseId/activate
# Tracking + chart
GET  /routines/me/today
POST /treatments/:id/events          ← PROGRESS_PHOTO + photoUrl
GET  /treatments/:id/chart
POST /treatments/:id/cancel          ← optional mid-plan
```
