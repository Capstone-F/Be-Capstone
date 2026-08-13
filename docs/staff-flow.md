# Staff Integration Guide

End-to-end guide for **Staff** (`staff`) and **App Admin** (`app_admin`):

1. **Stock import forms** — create draft → update → submit → confirm (applies inventory), or cancel / reject
2. **Customer support chat** — shared queue → claim (one staff at a time) → poll/send messages → close
3. **Catalog onboarding** — create products (+ ingredients), set variant images (shared with `app_admin`)
4. **Carrier handover** — confirm a packed order was physically given to GHN (`SHIPPED`)
5. **Order cancellations & returns** — cancel an order → cron refunds to wallet → confirm the physical restock
6. **Clinic withdrawals** (`app_admin` only) — list `REQUESTED` withdrawals → transfer VND manually → `mark-paid` (or `reject`) — see [clinic-manager-flow.md §10](clinic-manager-flow.md#10-admin-payout-workflow)

**Auth (login):** do not duplicate here — use:

- [Web Authentication Guide](auth-web.md) — session cookie (`sid`) for SPAs
- [Mobile Authentication Guide](auth-mobile.md) — Bearer tokens for Expo / React Native

See also:

- [Dashboard Integration Guide](dashboard-flow.md) — Staff work queues and authoritative operational trends
- [Admin Integration Guide](admin-flow.md) — admin-only surface (users/RBAC, clinics, survey bank, commerce settings, wallet)
- [Clinic Manager Flow Guide](clinic-manager-flow.md) — clinic-scoped expert onboarding, fees, availability, **escrow / clinic wallet / withdrawals** (app_admin marks withdrawals paid)
- [User Management & RBAC](users.md) — roles and permissions

---

## Status legend

| Marker   | Meaning                                  |
| -------- | ---------------------------------------- |
| ✅ Ready | Controller + service exist; usable today |

---

## Table of Contents

### A. Stock import forms

1. [Roles & auth (stock)](#1-roles--auth-stock)
2. [Lifecycle](#2-lifecycle)
3. [Create draft](#3-create-draft)
4. [List / filter](#4-list--filter)
5. [Get one](#5-get-one)
6. [Update line fields](#6-update-line-fields)
7. [Submit](#7-submit)
8. [Confirm (apply stock)](#8-confirm-apply-stock)
9. [Cancel](#9-cancel)
10. [Reject](#10-reject)
11. [Stock endpoint checklist](#11-stock-endpoint-checklist)

### B. Customer support chat

12. [Support overview](#12-support-overview)
13. [Support lifecycle](#13-support-lifecycle)
14. [Staff queue (list sessions)](#14-staff-queue-list-sessions)
15. [Get session](#15-get-session)
16. [Claim session](#16-claim-session)
17. [Send message](#17-send-message)
18. [Poll messages](#18-poll-messages)
19. [Mark read](#19-mark-read)
20. [Close session](#20-close-session)
21. [Customer endpoints (for FE pairing)](#21-customer-endpoints-for-fe-pairing)
22. [Support endpoint checklist](#22-support-endpoint-checklist)

### C. Catalog onboarding (shared with admin)

23. [Onboard a product](#23-onboard-a-product)
24. [Update variant image](#24-update-variant-image)
25. [Direct stock batch import](#25-direct-stock-batch-import)
26. [Catalog endpoint checklist](#26-catalog-endpoint-checklist)

### D. Carrier handover

27. [Confirm handover to provider](#27-confirm-handover-to-provider)
28. [Handover endpoint checklist](#28-handover-endpoint-checklist)

### E. Order cancellations & returns

29. [Roles & auth (cancellations)](#29-roles--auth-cancellations)
30. [Cancellation lifecycle](#30-cancellation-lifecycle)
31. [Refund amount rules](#31-refund-amount-rules)
32. [Staff-initiated cancel](#32-staff-initiated-cancel)
33. [List / work queue](#33-list--work-queue)
34. [Get one](#34-get-one)
35. [Confirm return (restock)](#35-confirm-return-restock)
36. [Manual advance / tick (demo)](#36-manual-advance--tick-demo)
37. [Cancellation endpoint checklist](#37-cancellation-endpoint-checklist)

---

# A. Stock import forms

## 1. Roles & auth (stock)

All `/stock/import-forms` endpoints require:

- Authenticated session (cookie or Bearer)
- Role **`staff`** or **`app_admin`**

Same actor may create, submit, and confirm (no separation-of-duties rule).

Direct batch import (`POST /stock/batches` / `POST /stock/batches/:id/adjust`) remains available for immediate stock-in without a form — same roles (`staff`, `app_admin`). See [§25](#25-direct-stock-batch-import) below or [admin-flow.md §7](admin-flow.md#7-flow-d--product-catalog--stock).

---

## 2. Lifecycle

```
DRAFT ──submit──▶ SUBMITTED ──confirm──▶ CONFIRMED (+ stock batch)
  │                   │
  │                   ├──reject──▶ REJECTED
  │                   │
  └──cancel───────────┴──cancel──▶ CANCELLED
```

| Action  | From                  | To          | Stock effect                       |
| ------- | --------------------- | ----------- | ---------------------------------- |
| Create  | —                     | `DRAFT`     | None                               |
| Update  | `DRAFT` / `SUBMITTED` | same        | None                               |
| Submit  | `DRAFT`               | `SUBMITTED` | None                               |
| Confirm | `SUBMITTED`           | `CONFIRMED` | Creates batch + IMPORT + instances |
| Cancel  | `DRAFT` / `SUBMITTED` | `CANCELLED` | None                               |
| Reject  | `SUBMITTED`           | `REJECTED`  | None                               |

`CONFIRMED`, `CANCELLED`, and `REJECTED` are **terminal** (no further updates or transitions).

Invalid transitions return `400` with a message like `Form can only be confirmed from SUBMITTED (current: DRAFT)`.

---

## 3. Create draft ✅ Ready

| Method | Path                  | Roles            | Status   |
| ------ | --------------------- | ---------------- | -------- |
| POST   | `/stock/import-forms` | staff, app_admin | ✅ Ready |

```http
POST /stock/import-forms
Content-Type: application/json

{
  "productVariantId": "<variant-uuid>",
  "quantity": 100,
  "manufacturingDate": "2026-01-15",
  "batchCode": "LOT-2026-001"
}
```

Response includes `status: "DRAFT"` and `createdByUserId`.

Expiration is **not** stored on the form; it is computed from the variant shelf life when the form is **confirmed**.

---

## 4. List / filter ✅ Ready

| Method | Path                  | Roles            | Status   |
| ------ | --------------------- | ---------------- | -------- |
| GET    | `/stock/import-forms` | staff, app_admin | ✅ Ready |

Query params:

| Param              | Type | Notes                   |
| ------------------ | ---- | ----------------------- |
| `status`           | enum | `DRAFT` … `REJECTED`    |
| `productVariantId` | uuid |                         |
| `createdByUserId`  | uuid |                         |
| `page`             | int  | default `1`             |
| `limit`            | int  | default `20`, max `100` |

```http
GET /stock/import-forms?status=SUBMITTED&page=1&limit=20
```

Response shape:

```json
{
  "items": [/* StockImportFormResponseDto */],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

Ordered by `createdAt` descending.

---

## 5. Get one ✅ Ready

| Method | Path                      | Roles            | Status   |
| ------ | ------------------------- | ---------------- | -------- |
| GET    | `/stock/import-forms/:id` | staff, app_admin | ✅ Ready |

```http
GET /stock/import-forms/<form-uuid>
```

---

## 6. Update line fields ✅ Ready

| Method | Path                      | Roles            | Status   |
| ------ | ------------------------- | ---------------- | -------- |
| PATCH  | `/stock/import-forms/:id` | staff, app_admin | ✅ Ready |

Allowed only while **`DRAFT` or `SUBMITTED`**. At least one field required. Status is unchanged.

```http
PATCH /stock/import-forms/<form-uuid>
Content-Type: application/json

{
  "quantity": 120,
  "batchCode": "LOT-2026-002"
}
```

Fields: `productVariantId`, `quantity`, `manufacturingDate`, `batchCode` (all optional; same validation as create).

---

## 7. Submit ✅ Ready

| Method | Path                             | Roles            | Status   |
| ------ | -------------------------------- | ---------------- | -------- |
| POST   | `/stock/import-forms/:id/submit` | staff, app_admin | ✅ Ready |

`DRAFT → SUBMITTED`. No body.

```http
POST /stock/import-forms/<form-uuid>/submit
```

Sets `submittedByUserId` and `submittedAt`.

---

## 8. Confirm (apply stock) ✅ Ready

| Method | Path                              | Roles            | Status   |
| ------ | --------------------------------- | ---------------- | -------- |
| PATCH  | `/stock/import-forms/:id/confirm` | staff, app_admin | ✅ Ready |

`SUBMITTED → CONFIRMED`. No body.

In one DB transaction:

1. Create stock batch (same logic as `POST /stock/batches`)
2. Record `IMPORT` movement
3. Create `ON_RACK` product instances (one per quantity unit)
4. Set form `stockBatchId`, `confirmedByUserId`, `confirmedAt`

```http
PATCH /stock/import-forms/<form-uuid>/confirm
```

Response includes `status: "CONFIRMED"` and `stockBatchId`.

---

## 9. Cancel ✅ Ready

| Method | Path                             | Roles            | Status   |
| ------ | -------------------------------- | ---------------- | -------- |
| POST   | `/stock/import-forms/:id/cancel` | staff, app_admin | ✅ Ready |

`DRAFT` or `SUBMITTED` → `CANCELLED`. No body. No stock applied.

```http
POST /stock/import-forms/<form-uuid>/cancel
```

---

## 10. Reject ✅ Ready

| Method | Path                             | Roles            | Status   |
| ------ | -------------------------------- | ---------------- | -------- |
| POST   | `/stock/import-forms/:id/reject` | staff, app_admin | ✅ Ready |

`SUBMITTED → REJECTED`. Optional reason. No stock applied.

```http
POST /stock/import-forms/<form-uuid>/reject
Content-Type: application/json

{
  "reason": "Incorrect manufacturing date"
}
```

---

## 11. Stock endpoint checklist

| Method | Path                              | Roles            | Status   |
| ------ | --------------------------------- | ---------------- | -------- |
| POST   | `/stock/import-forms`             | staff, app_admin | ✅ Ready |
| GET    | `/stock/import-forms`             | staff, app_admin | ✅ Ready |
| GET    | `/stock/import-forms/:id`         | staff, app_admin | ✅ Ready |
| PATCH  | `/stock/import-forms/:id`         | staff, app_admin | ✅ Ready |
| POST   | `/stock/import-forms/:id/submit`  | staff, app_admin | ✅ Ready |
| PATCH  | `/stock/import-forms/:id/confirm` | staff, app_admin | ✅ Ready |
| POST   | `/stock/import-forms/:id/cancel`  | staff, app_admin | ✅ Ready |
| POST   | `/stock/import-forms/:id/reject`  | staff, app_admin | ✅ Ready |

**Typical Staff sequence:**

```
POST /stock/import-forms
  → (optional) PATCH /stock/import-forms/:id
  → POST /stock/import-forms/:id/submit
  → PATCH /stock/import-forms/:id/confirm
  → verify stockBatchId / product availability
```

---

# B. Customer support chat

1-1 text support between a **customer** and **one staff** at a time. Messages are stored in Postgres; clients **poll** with `afterSeq` (no WebSocket / Zego for this feature).

Staff are system-wide employees (not clinic-scoped). All staff see every session in the shared queue; only the staff who **claims** a session may send staff messages until it is closed.

---

## 12. Support overview ✅ Ready

```
Customer                         Staff / App Admin
────────                         ─────────────────
POST /support/sessions  ──▶  OPEN (queued)
GET  /support/sessions/me

                             GET  /support/sessions          (shared queue)
                             POST /support/sessions/:id/claim
                                      │
                                      ▼
                             ACTIVE (locked to that staff)
POST /…/:id/messages  ◀──▶  POST /…/:id/messages
GET  /…/:id/messages  ◀──▶  GET  /…/:id/messages?afterSeq=
POST /…/:id/read      ◀──▶  POST /…/:id/read
POST /…/:id/close     ◀──▶  POST /…/:id/close  → CLOSED
```

**Rules FE must respect:**

| Rule                          | Behavior                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------- |
| One live session per customer | `POST /support/sessions` is idempotent; returns existing `OPEN` / `ACTIVE` if any |
| One staff per session         | Claim is atomic; `409` if another staff already claimed                           |
| No handoff                    | Assigned staff stays until **close** (no release / reassign)                      |
| Polling                       | Use `GET …/messages?afterSeq=<lastSeq>`; keep `lastSeq` from each response        |
| Closed is terminal            | Sending on `CLOSED` returns `409`                                                 |

---

## 13. Support lifecycle

```
OPEN ──claim──▶ ACTIVE ──close──▶ CLOSED
  │                ▲
  └────close───────┘
```

| Action          | From              | To       | Notes                                               |
| --------------- | ----------------- | -------- | --------------------------------------------------- |
| Customer create | —                 | `OPEN`   | Or return existing live session                     |
| Staff claim     | `OPEN`            | `ACTIVE` | Sets `assignedStaffUserId`                          |
| Close           | `OPEN` / `ACTIVE` | `CLOSED` | Customer, assigned staff, or `app_admin`            |
| Send message    | `OPEN` / `ACTIVE` | same     | Customer anytime while live; staff only after claim |

---

## 14. Staff queue (list sessions) ✅ Ready

| Method | Path                | Roles            | Status   |
| ------ | ------------------- | ---------------- | -------- |
| GET    | `/support/sessions` | staff, app_admin | ✅ Ready |

Query params:

| Param      | Type | Notes                                         |
| ---------- | ---- | --------------------------------------------- |
| `status`   | enum | `OPEN` \| `ACTIVE` \| `CLOSED`                |
| `assigned` | enum | `me` \| `unassigned` \| `any` (default `any`) |
| `page`     | int  | default `1`                                   |
| `limit`    | int  | default `20`, max `100`                       |

```http
GET /support/sessions?status=OPEN&assigned=unassigned&page=1&limit=20
```

Response shape:

```json
{
  "items": [
    /* SupportSessionResponseDto — includes customerName, lastMessagePreview, lastMessageAt */
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

Ordered by `lastMessageAt` descending (`NULLS LAST`), then `createdAt` descending.

Useful filters:

- Unclaimed queue: `?status=OPEN&assigned=unassigned`
- My active chats: `?status=ACTIVE&assigned=me`

---

## 15. Get session ✅ Ready

| Method | Path                    | Roles                      | Status   |
| ------ | ----------------------- | -------------------------- | -------- |
| GET    | `/support/sessions/:id` | customer, staff, app_admin | ✅ Ready |

Staff may view any session (needed for claim / detail). Customers may only view their own.

```http
GET /support/sessions/<session-uuid>
```

---

## 16. Claim session ✅ Ready

| Method | Path                          | Roles            | Status   |
| ------ | ----------------------------- | ---------------- | -------- |
| POST   | `/support/sessions/:id/claim` | staff, app_admin | ✅ Ready |

`OPEN → ACTIVE`. No body. Atomic conditional update — only one staff wins.

```http
POST /support/sessions/<session-uuid>/claim
```

| Outcome       | HTTP  | Meaning                                        |
| ------------- | ----- | ---------------------------------------------- |
| Success       | `200` | You are `assignedStaffUserId`; status `ACTIVE` |
| Already yours | `200` | Idempotent if you already claimed it           |
| Taken         | `409` | Another staff owns the session                 |
| Missing       | `404` | Session id not found                           |

After claim, only **you** (as assigned staff) may send staff messages.

---

## 17. Send message ✅ Ready

| Method | Path                             | Roles                      | Status   |
| ------ | -------------------------------- | -------------------------- | -------- |
| POST   | `/support/sessions/:id/messages` | customer, staff, app_admin | ✅ Ready |

```http
POST /support/sessions/<session-uuid>/messages
Content-Type: application/json

{
  "content": "We can help with that order — could you share the order id?"
}
```

- `content`: required string, 1–4000 chars (trimmed; empty after trim → `400`)
- Staff / app_admin: only the **assigned** staff may send (`403` otherwise)
- Customer: may send while `OPEN` or `ACTIVE`
- `CLOSED` → `409`

Response includes monotonic `seq` (starts at `1` per session) used as the poll cursor.

---

## 18. Poll messages ✅ Ready

| Method | Path                             | Roles                      | Status   |
| ------ | -------------------------------- | -------------------------- | -------- |
| GET    | `/support/sessions/:id/messages` | customer, staff, app_admin | ✅ Ready |

Query params:

| Param      | Type | Notes                       |
| ---------- | ---- | --------------------------- |
| `afterSeq` | int  | default `0`; return `seq >` |
| `limit`    | int  | default `50`, max `100`     |

```http
GET /support/sessions/<session-uuid>/messages?afterSeq=0&limit=50
```

Response:

```json
{
  "items": [
    {
      "id": "uuid",
      "sessionId": "uuid",
      "seq": 1,
      "senderUserId": "uuid",
      "senderRole": "CUSTOMER",
      "content": "Hello, I need help with my order.",
      "createdAt": "2026-08-10T12:00:00.000Z"
    }
  ],
  "lastSeq": 1,
  "hasMore": false
}
```

**Client loop:** store `lastSeq`; next poll uses `afterSeq=<lastSeq>`. If `hasMore` is true, fetch again before waiting.

Suggested poll interval (client-side): 2–5s while the chat UI is open; stop when session is `CLOSED` or the view is left.

---

## 19. Mark read ✅ Ready

| Method | Path                         | Roles                      | Status   |
| ------ | ---------------------------- | -------------------------- | -------- |
| POST   | `/support/sessions/:id/read` | customer, staff, app_admin | ✅ Ready |

Only the **customer** or **assigned staff** (participants). Advances `customerLastReadSeq` / `staffLastReadSeq` forward only (never backwards).

```http
POST /support/sessions/<session-uuid>/read
Content-Type: application/json

{
  "lastReadSeq": 12
}
```

`lastReadSeq` must be `≤ messageCount` or the API returns `400`.

---

## 20. Close session ✅ Ready

| Method | Path                          | Roles                      | Status   |
| ------ | ----------------------------- | -------------------------- | -------- |
| POST   | `/support/sessions/:id/close` | customer, staff, app_admin | ✅ Ready |

`OPEN` / `ACTIVE` → `CLOSED`. Allowed for: session customer, assigned staff, or `app_admin`.

```http
POST /support/sessions/<session-uuid>/close
Content-Type: application/json

{
  "reason": "Issue resolved"
}
```

`reason` is optional (max 500). Closing frees the customer to open a **new** session later.

---

## 21. Customer endpoints (for FE pairing)

Staff UIs usually pair with these customer calls (same auth guides):

| Method | Path                             | Roles    | Notes                                            |
| ------ | -------------------------------- | -------- | ------------------------------------------------ |
| POST   | `/support/sessions`              | customer | Start or return live session; optional `subject` |
| GET    | `/support/sessions/me`           | customer | Live `OPEN`/`ACTIVE` session; `404` if none      |
| POST   | `/support/sessions/:id/messages` | customer | Send while live                                  |
| GET    | `/support/sessions/:id/messages` | customer | Poll                                             |
| POST   | `/support/sessions/:id/read`     | customer | Mark read                                        |
| POST   | `/support/sessions/:id/close`    | customer | Close                                            |

```http
POST /support/sessions
Content-Type: application/json

{
  "subject": "Order delivery issue"
}
```

---

## 22. Support endpoint checklist

| Method | Path                             | Roles                      | Status   |
| ------ | -------------------------------- | -------------------------- | -------- |
| POST   | `/support/sessions`              | customer                   | ✅ Ready |
| GET    | `/support/sessions/me`           | customer                   | ✅ Ready |
| GET    | `/support/sessions`              | staff, app_admin           | ✅ Ready |
| GET    | `/support/sessions/:id`          | customer, staff, app_admin | ✅ Ready |
| POST   | `/support/sessions/:id/claim`    | staff, app_admin           | ✅ Ready |
| POST   | `/support/sessions/:id/messages` | customer, staff, app_admin | ✅ Ready |
| GET    | `/support/sessions/:id/messages` | customer, staff, app_admin | ✅ Ready |
| POST   | `/support/sessions/:id/read`     | customer, staff, app_admin | ✅ Ready |
| POST   | `/support/sessions/:id/close`    | customer, staff, app_admin | ✅ Ready |

**Typical Staff sequence:**

```
GET  /support/sessions?status=OPEN&assigned=unassigned
  → POST /support/sessions/:id/claim
  → GET  /support/sessions/:id/messages?afterSeq=0
  → POST /support/sessions/:id/messages   (reply)
  → (poll) GET …/messages?afterSeq=<lastSeq>
  → POST /support/sessions/:id/read
  → POST /support/sessions/:id/close
```

---

# C. Catalog onboarding (shared with admin)

Staff may onboard new SKUs directly — not gated behind admin. Full field reference and combo/ecommerce context: [admin-flow.md §7](admin-flow.md#7-flow-d--product-catalog--stock).

## 23. Onboard a product ✅ Ready

| Method | Path        | Roles            | Status   |
| ------ | ----------- | ---------------- | -------- |
| POST   | `/products` | app_admin, staff | ✅ Ready |

```http
POST /products
Content-Type: application/json

{
  "name": "La Roche-Posay Effaclar Serum",
  "brand": "La Roche-Posay",
  "categoryCode": "SERUM",
  "categoryName": "Serum",
  "description": "Anti-acne serum for oily skin",
  "sku": "LRP-EFFAC-SERUM-30ML",
  "volume": "30ml",
  "packaging": "Bottle",
  "priceVnd": 650000,
  "imageUrl": "https://placehold.co/400",
  "shelfLifeValue": 365,
  "shelfLifeUnit": "DAY",
  "ingredients": [
    { "name": "Salicylic Acid", "concentrationPct": 1.5, "isKeyIngredient": true }
  ]
}
```

Missing ingredients are **auto-created** inside the onboarding transaction. Response includes `variants[]` — store `variants[0].id` as `productVariantId` for [stock import forms](#3-create-draft) or direct batch import ([§25](#25-direct-stock-batch-import)).

**Helper (public):** `GET /ingredients` lists active ingredients; `GET /products/categories` lists categories for filters / onboarding UX.

---

## 24. Update variant image ✅ Ready

| Method | Path                            | Roles            | Status   |
| ------ | ------------------------------- | ---------------- | -------- |
| PATCH  | `/products/variants/:variantId` | app_admin, staff | ✅ Ready |

```
POST /uploads/images  →  { url }
PATCH /products/variants/<variantId>  { "imageUrl": "<url>" }
```

```http
PATCH /products/variants/<variantId>
Content-Type: application/json

{
  "imageUrl": "https://pub-xxx.r2.dev/images/2026/08/uuid.jpg"
}
```

---

## 25. Direct stock batch import ✅ Ready

Immediate stock-in with no draft/approval step — an alternative to the [import forms workflow](#3-create-draft) above when no review is needed.

| Method | Path                        | Roles            | Status   |
| ------ | --------------------------- | ---------------- | -------- |
| POST   | `/stock/batches`            | app_admin, staff | ✅ Ready |
| POST   | `/stock/batches/:id/adjust` | app_admin, staff | ✅ Ready |

```http
POST /stock/batches
Content-Type: application/json

{
  "productVariantId": "<variant-uuid>",
  "quantity": 100,
  "manufacturingDate": "2026-01-15",
  "batchCode": "LOT-2026-001"
}
```

```http
POST /stock/batches/<batchId>/adjust
Content-Type: application/json

{
  "quantity": 50,
  "note": "Physical inventory count correction"
}
```

Expiration is computed from the variant shelf life; `adjust` sets the **absolute** remaining quantity and records an `ADJUSTMENT` movement.

---

## 26. Catalog endpoint checklist

| Method | Path                            | Roles            | Status   |
| ------ | ------------------------------- | ---------------- | -------- |
| POST   | `/products`                     | app_admin, staff | ✅ Ready |
| PATCH  | `/products/variants/:variantId` | app_admin, staff | ✅ Ready |
| GET    | `/products/categories`          | Public           | ✅ Ready |
| GET    | `/ingredients`                  | Public           | ✅ Ready |
| POST   | `/uploads/images`               | Authenticated    | ✅ Ready |
| POST   | `/stock/batches`                | app_admin, staff | ✅ Ready |
| POST   | `/stock/batches/:id/adjust`     | app_admin, staff | ✅ Ready |

**Typical Staff sequence (new SKU sellable):**

```
POST /products
  → optional POST /uploads/images → PATCH /products/variants/:variantId
  → POST /stock/batches   (or the import-forms workflow above)
```

---

# D. Carrier handover

After payment, the backend creates the GHN shipment (`providerOrderCode`) and leaves the order
in `PROCESSING`. Warehouse staff pack the parcel and confirm it was physically given to the
carrier. That confirmation stamps who handed it over and advances delivery/order to `SHIPPED`
through the same GHN status path as webhooks (`picked`).

Stock is already deducted at payment — handover is a fulfillment fact, not an inventory one.
See [shipping.md](shipping.md) for the full GHN lifecycle.

---

## 27. Confirm handover to provider ✅ Ready

| Method | Path                              | Roles            | Status   |
| ------ | --------------------------------- | ---------------- | -------- |
| POST   | `/admin/orders/:orderId/handover` | staff, app_admin | ✅ Ready |

Requires:

- Authenticated session (cookie or Bearer)
- Role **`staff`** or **`app_admin`**
- Delivery with a non-null `providerOrderCode` (retry via `POST /admin/deliveries/:id/create-ghn-order` if missing)
- Order not `CANCELLED` / `REFUNDED`; delivery not `DELIVERED` / `FAILED` / `RETURNED`
- Not already handed over (`409` on a second call)

```http
POST /admin/orders/<order-uuid>/handover
Content-Type: application/json

{
  "note": "Left at GHN dock A"
}
```

`note` is optional (max 500 chars). Response is the admin delivery DTO including
`handedOverAt`, `handedOverByUserId`, `handoverNote`, `status: "SHIPPED"`, and
`providerStatus: "picked"`.

Work queue for the pack desk:

```http
GET /admin/deliveries?awaitingHandover=true&page=1&limit=20
```

Returns `PROCESSING` deliveries that have a `providerOrderCode` but no `handedOverAt` yet.

---

## 28. Handover endpoint checklist

| Method | Path                                      | Roles            | Status   |
| ------ | ----------------------------------------- | ---------------- | -------- |
| POST   | `/admin/orders/:orderId/handover`         | staff, app_admin | ✅ Ready |
| GET    | `/admin/deliveries?awaitingHandover=true` | staff, app_admin | ✅ Ready |

**Typical Staff sequence (paid order ready to ship):**

```
GET  /admin/deliveries?awaitingHandover=true
  → POST /admin/orders/:orderId/handover   { note? }
  → (sandbox) POST /admin/deliveries/:id/advance   → continue to delivered
```

---

# E. Order cancellations & returns

Customers can self-cancel `PENDING` / `PAID` orders (`POST /orders/:id/cancel`). Staff / App Admin can cancel any order that is not yet `DELIVERED` (or already `CANCELLED` / `REFUNDED`). A background processor then walks the cancellation one stage per tick: refund the customer **wallet**, mark sold units `RETURNED` (in transit), and wait for staff to confirm the physical restock.

`SYSTEM` cancellations also appear in this queue when a delivery reaches `RETURNED` (GHN return webhook or admin `force-status`). `requestedByUserId` is null and `requestedByActor` is `SYSTEM`. Treat them like staff-initiated cancels for confirm-return.

Customer-side cancel is documented in [ecommerce-flow.md](ecommerce-flow.md). This section is the staff desk.

---

## 29. Roles & auth (cancellations)

All `/admin/order-cancellations` endpoints require:

- Authenticated session (cookie or Bearer)
- Role **`staff`** or **`app_admin`**

Same actor may cancel, advance, and confirm-return (no separation-of-duties rule).

---

## 30. Cancellation lifecycle

```
REQUESTED ──tick──▶ REFUNDING ──tick──▶ REFUNDED ──tick──▶ AWAITING_RETURN
  │                                                              │
  │ unpaid, nothing to refund or restock                         │
  └──tick──▶ COMPLETED                                           │
                                                                 │
                    staff confirm-return ──▶ RESTOCKED ──tick──▶ COMPLETED

REFUNDING ──retries exhausted──▶ FAILED
```

| Stage             | Who moves it                      | Side effects                                                                                 |
| ----------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| `REQUESTED`       | Customer, staff, or SYSTEM create | Snapshot refund amount + sold-instance counts. `nextRunAt = now`                             |
| `REFUNDING`       | Cron / `advance`                  | `order.status = CANCELLED`                                                                   |
| `REFUNDED`        | Cron / `advance`                  | Wallet credit (`TransactionType.REFUND`); `order.status = REFUNDED`                          |
| `AWAITING_RETURN` | Cron / `advance`                  | `ProductInstance` `SOLD → RETURNED`. **Does not** change `remainingQuantity`                 |
| `RESTOCKED`       | Staff `confirm-return`            | Good units `ON_RACK` + `remainingQuantity += n` + `RETURN` movement; damaged units `DAMAGED` |
| `COMPLETED`       | Cron / `advance`                  | Terminal                                                                                     |
| `FAILED`          | Processor after 5 failed attempts | Inspect `lastError`; use `advance` after fixing the cause                                    |

Each automatic stage waits `ORDER_CANCELLATION_STEP_DELAY_SEC` (default 60s) so the pipeline looks gradual. `AWAITING_RETURN` does **not** auto-advance — staff `confirm-return` is the only way past that gate.

Invalid transitions return `400` (e.g. `Return can only be confirmed from AWAITING_RETURN (current: REQUESTED)`). Duplicate cancel on the same order returns `409`.

---

## 31. Refund amount rules

Snapshotted onto the cancellation at request time (`refundAmountVnd`). Money always lands in the customer's **wallet**, not back through VNPay/PayOS.

| Order status at request  | Refund amount                                     |
| ------------------------ | ------------------------------------------------- |
| `PENDING`                | `0` (never paid)                                  |
| `PAID`                   | `order.totalVnd` (shipping included; not yet GHN) |
| `PROCESSING` / `SHIPPED` | `subtotalVnd - discountVnd` (shipping withheld)   |
| `DELIVERED`              | Not cancellable                                   |

---

## 32. Staff-initiated cancel ✅ Ready

| Method | Path                         | Roles            | Status   |
| ------ | ---------------------------- | ---------------- | -------- |
| POST   | `/admin/order-cancellations` | staff, app_admin | ✅ Ready |

```http
POST /admin/order-cancellations
Content-Type: application/json

{
  "orderId": "<order-uuid>",
  "reason": "Customer called — wrong address"
}
```

Response includes `status: "REQUESTED"`, `refundAmountVnd`, `requiresStockReturn`, and `items[]` with `expectedQuantity` (actual `SOLD` instance count per order item, not `orderItem.quantity`).

Customers use `POST /orders/:id/cancel` instead (own `PENDING` / `PAID` orders only).

---

## 33. List / work queue ✅ Ready

| Method | Path                         | Roles            | Status   |
| ------ | ---------------------------- | ---------------- | -------- |
| GET    | `/admin/order-cancellations` | staff, app_admin | ✅ Ready |

Query params:

| Param    | Type | Notes                   |
| -------- | ---- | ----------------------- |
| `status` | enum | `REQUESTED` … `FAILED`  |
| `page`   | int  | default `1`             |
| `limit`  | int  | default `20`, max `100` |

```http
GET /admin/order-cancellations?status=AWAITING_RETURN&page=1&limit=20
```

Restock desk: `?status=AWAITING_RETURN`.

---

## 34. Get one ✅ Ready

| Method | Path                             | Roles            | Status   |
| ------ | -------------------------------- | ---------------- | -------- |
| GET    | `/admin/order-cancellations/:id` | staff, app_admin | ✅ Ready |

```http
GET /admin/order-cancellations/<cancellation-uuid>
```

Includes `nextRunAt`, `attempts`, and `lastError` so a parked row is easy to spot.

---

## 35. Confirm return (restock) ✅ Ready

| Method | Path                                            | Roles            | Status   |
| ------ | ----------------------------------------------- | ---------------- | -------- |
| POST   | `/admin/order-cancellations/:id/confirm-return` | staff, app_admin | ✅ Ready |

Allowed only while **`AWAITING_RETURN`**. Every cancellation item must appear exactly once. `goodQuantity + damagedQuantity` must equal that item's `expectedQuantity`.

```http
POST /admin/order-cancellations/<cancellation-uuid>/confirm-return
Content-Type: application/json

{
  "items": [
    { "orderItemId": "<order-item-uuid>", "goodQuantity": 2, "damagedQuantity": 1 }
  ],
  "note": "1 bottle cracked in transit"
}
```

**Stock effects:**

| Instance status after confirm | `remainingQuantity` | Meaning                                   |
| ----------------------------- | ------------------- | ----------------------------------------- |
| `RETURNED` (before confirm)   | unchanged           | Received / quarantine — **not** sellable  |
| `ON_RACK` (good units)        | `+= goodQuantity`   | Resellable; `StockMovement` type `RETURN` |
| `DAMAGED` (damaged units)     | unchanged           | Kept linked to the order item for audit   |

| Outcome                      | HTTP  | Meaning                                                         |
| ---------------------------- | ----- | --------------------------------------------------------------- |
| Success                      | `200` | Status `RESTOCKED`; cron/`advance` will finalize to `COMPLETED` |
| Wrong status                 | `400` | Cancellation is not `AWAITING_RETURN`                           |
| Quantity mismatch            | `400` | `goodQuantity + damagedQuantity !== expectedQuantity`           |
| Missing / extra order item   | `400` | Body must list every cancellation item exactly once             |
| Duplicate cancel (on create) | `409` | Order already has a cancellation                                |
| Missing                      | `404` | Cancellation id not found                                       |

---

## 36. Manual advance / tick (demo) ✅ Ready

Same processor the cron uses. `ignoreDelay` skips `ORDER_CANCELLATION_STEP_DELAY_SEC` so a demo does not wait.

| Method | Path                                     | Roles            | Status   |
| ------ | ---------------------------------------- | ---------------- | -------- |
| POST   | `/admin/order-cancellations/:id/advance` | staff, app_admin | ✅ Ready |
| POST   | `/admin/order-cancellations/tick`        | staff, app_admin | ✅ Ready |

```http
POST /admin/order-cancellations/<cancellation-uuid>/advance
Content-Type: application/json

{
  "steps": 1
}
```

`steps` defaults to `1`. Stops early at `AWAITING_RETURN` or a terminal status, so `"steps": 10` is a safe "run to the restock gate" call.

```http
POST /admin/order-cancellations/tick
Content-Type: application/json

{
  "ignoreDelay": true
}
```

One processor pass over every due row. `ignoreDelay` defaults to `true`.

Set `ORDER_CANCELLATION_CRON_ENABLED=false` to drive the pipeline **only** through these endpoints.

---

## 37. Cancellation endpoint checklist

| Method | Path                                            | Roles            | Status   |
| ------ | ----------------------------------------------- | ---------------- | -------- |
| POST   | `/orders/:id/cancel`                            | customer         | ✅ Ready |
| POST   | `/admin/order-cancellations`                    | staff, app_admin | ✅ Ready |
| GET    | `/admin/order-cancellations`                    | staff, app_admin | ✅ Ready |
| GET    | `/admin/order-cancellations/:id`                | staff, app_admin | ✅ Ready |
| POST   | `/admin/order-cancellations/:id/confirm-return` | staff, app_admin | ✅ Ready |
| POST   | `/admin/order-cancellations/:id/advance`        | staff, app_admin | ✅ Ready |
| POST   | `/admin/order-cancellations/tick`               | staff, app_admin | ✅ Ready |
| GET    | `/admin/clinic-withdrawals`                     | app_admin        | ✅ Ready |
| POST   | `/admin/clinic-withdrawals/:id/mark-paid`       | app_admin        | ✅ Ready |
| POST   | `/admin/clinic-withdrawals/:id/reject`          | app_admin        | ✅ Ready |

**Typical Staff sequence (paid order, restock desk):**

```
POST /admin/order-cancellations          { orderId, reason }
  → POST /admin/order-cancellations/:id/advance   (or wait for cron)  → REFUNDING
  → POST /admin/order-cancellations/:id/advance                       → REFUNDED (wallet credited)
  → POST /admin/order-cancellations/:id/advance                       → AWAITING_RETURN
  → POST /admin/order-cancellations/:id/confirm-return  { items: [{ orderItemId, goodQuantity, damagedQuantity }] }
  → POST /admin/order-cancellations/:id/advance                       → COMPLETED
```
