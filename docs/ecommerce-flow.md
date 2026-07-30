# E-Commerce Integration Guide

End-to-end guide for integrating the **catalog → cart → order (+ GHN shipping) → payment → fulfillment / tracking** flow with this backend.

**Auth (register / login):** do not duplicate here — use:

- [Web Authentication Guide](auth-web.md) — session cookie (`sid`) for SPAs
- [Mobile Authentication Guide](auth-mobile.md) — Bearer tokens for Expo / React Native

See also:

- [GHN Delivery Integration](shipping.md) — address picker, fee quote, webhook, env vars
- [VNPay Payment Integration](payments.md)
- [User Management & RBAC](users.md)
- [Consultation Flow](consultation-flow.md) — expert bookings use **Wallet**, not VNPay

---

## Status legend

| Marker     | Meaning                                       |
| ---------- | --------------------------------------------- |
| ✅ Ready   | Controller + service exist; usable today      |
| ❌ Missing | Not implemented yet (schema/module may exist) |
| 🔶 Extend  | Endpoint exists but needs more work for UX    |

---

## Table of Contents

1. [Flow overview](#1-flow-overview)
2. [Base URL & auth](#2-base-url--auth)
3. [Step-by-step integration](#3-step-by-step-integration)
4. [Endpoint checklist](#4-endpoint-checklist)
5. [Remaining gaps](#5-remaining-gaps)
6. [Cart & order rules](#6-cart--order-rules)
7. [Payment notes](#7-payment-notes)
8. [Delivery model notes](#8-delivery-model-notes)

---

## 1. Flow overview

```
┌──────────┐   ┌──────────┐   ┌──────┐   ┌──────────────────────────┐
│ Discover │──▶│ Register │──▶│ Cart │──▶│ Order + GHN address      │
│ products │   │ / Login  │   │      │   │ (live fee at create)     │
└──────────┘   └──────────┘   └──────┘   └──────────┬───────────────┘
   ✅ Ready      ✅ (auth docs)  ✅ Ready    ✅ Ready
                                                            │
                                                            ▼
┌──────────┐   ┌──────────────────────┐            ┌────────────┐
│ Tracking │◀──│ GHN webhook statuses │◀───────────│  Payment   │
│ (read)   │   │ (carrier)            │            │  (VNPay)   │
└──────────┘   └──────────────────────┘            └────────────┘
  ✅ Ready           ✅ Ready                        ✅ Ready
                                                     (products +
                                                      shipping)
```

**Happy path (catalog purchase):**

1. Browse products / categories (public).
2. Register or log in (web or mobile).
3. Add product variants to cart (`source: CATALOG`).
4. Collect a **GHN structured address** (provinces → districts → wards); optionally preview fee.
5. `POST /orders` **with** `shippingAddress` → server live-quotes GHN fee, creates `PENDING` order + `Delivery`, clears cart.
6. Checkout → redirect to VNPay → poll until payment `PAID` (amount = products − discount + shipping).
7. On IPN success: stock deduct + **GHN order create**; webhook drives delivery/order status; customer reads tracking.

> **Pricing model:** Live GHN fee quote at order creation (and optional `POST /delivery/fee-quote` preview). Fee is snapshotted onto `Order.shippingFeeVnd` / `Delivery`. Free-text addresses are **not** accepted — use GHN `provinceId` / `districtId` / `wardCode` from the master-data endpoints. Full carrier details: [shipping.md](shipping.md).

There is also a **survey / recommendation** path (`source: SURVEY`) that reuses cart → order → payment, with extra validation and optional combo discount. Full survey → protocols → products integration: [Survey Flow Guide](survey-flow.md).

---

## 2. Base URL & auth

| Environment | Path prefix | Example                          |
| ----------- | ----------- | -------------------------------- |
| Development | none        | `http://localhost:3000/products` |
| Production  | `/api`      | `https://host/api/products`      |

**Calling protected routes:**

| Client  | Auth mechanism                                                                   |
| ------- | -------------------------------------------------------------------------------- |
| Web SPA | Session cookie `sid` (`credentials: 'include'`) — see [auth-web.md](auth-web.md) |
| Mobile  | `Authorization: Bearer <accessToken>` — see [auth-mobile.md](auth-mobile.md)     |

Cart, orders, delivery address/fee, and payment checkout require an authenticated **Customer** (session or Bearer). Product catalog list/detail/categories are public.

---

## 3. Step-by-step integration

### 3.1 Discover products ✅ Ready

List categories, browse the catalog, open a product detail. Use a **variant `id`** from the product payload when adding to cart (not the product id).

| Method | Path                   | Auth   | Status   |
| ------ | ---------------------- | ------ | -------- |
| GET    | `/products/categories` | Public | ✅ Ready |
| GET    | `/products`            | Public | ✅ Ready |
| GET    | `/products/:id`        | Public | ✅ Ready |

**List products** — query params (all optional):

| Param            | Description                         |
| ---------------- | ----------------------------------- |
| `categoryId`     | Filter by category UUID             |
| `brandId`        | Filter by brand UUID                |
| `brandName`      | Filter by brand name                |
| `ingredientName` | Products containing this ingredient |
| `page`           | Page number (default `1`)           |
| `limit`          | Page size (default `20`, max `100`) |

```http
GET /products?categoryId=<uuid>&page=1&limit=20
```

```http
GET /products/categories
```

```http
GET /products/<productId>
```

Response shape (detail) includes `product.variants[]` with `id`, `sku`, `volume`, `packaging`, `priceVnd`, `isActive`, `imageUrl`. Store `variants[].id` for the cart step.

> Staff/admin product onboarding (`POST /products`) exists but is **not** part of the customer purchase flow. Optional `imageUrl` may be set on create; update later with `PATCH /products/variants/:variantId`. See [uploads.md](uploads.md).

---

### 3.2 Register / login ✅ Ready

Follow the dedicated guides — do not re-implement auth against Keycloak from the client:

| Platform                    | Guide                            |
| --------------------------- | -------------------------------- |
| Web (cookie session)        | [auth-web.md](auth-web.md)       |
| Mobile (Bearer / deep link) | [auth-mobile.md](auth-mobile.md) |

After auth, optional profile helpers (not required for checkout, but useful for UX):

| Method | Path            | Auth             | Status   |
| ------ | --------------- | ---------------- | -------- |
| GET    | `/users/me`     | Session / Bearer | ✅ Ready |
| GET    | `/customers/me` | Session / Bearer | ✅ Ready |
| PATCH  | `/customers/me` | Session / Bearer | ✅ Ready |

> There is **no saved shipping-address field** on the customer profile today. Collect the GHN address during checkout (before / while calling `POST /orders`).

---

### 3.3 Cart ✅ Ready

All cart routes require **Customer** role.

| Method | Path                     | Auth     | Status   |
| ------ | ------------------------ | -------- | -------- |
| GET    | `/cart`                  | Customer | ✅ Ready |
| POST   | `/cart/items`            | Customer | ✅ Ready |
| DELETE | `/cart/items/:variantId` | Customer | ✅ Ready |
| DELETE | `/cart`                  | Customer | ✅ Ready |

**Add or update an item** (same endpoint upserts quantity for an existing variant):

```http
POST /cart/items
Content-Type: application/json

{
  "productVariantId": "<variant-uuid>",
  "quantity": 1,
  "source": "CATALOG"
}
```

For survey-driven carts:

```json
{
  "productVariantId": "<variant-uuid>",
  "quantity": 1,
  "source": "SURVEY",
  "surveyRecommendationId": "<recommendation-uuid>"
}
```

**Rules (enforced by API):**

- First item sets cart `source`. Later items must use the same `source`.
- `SURVEY` requires `surveyRecommendationId` on the first item; variants must belong to that recommendation.
- Cart is Redis-backed (TTL ~7 days), scoped to the customer.

Example response:

```json
{
  "source": "CATALOG",
  "surveyRecommendationId": null,
  "items": [{ "productVariantId": "...", "quantity": 2 }]
}
```

---

### 3.4 Build GHN shipping address ✅ Ready

Must happen **before** `POST /orders`. GHN needs its own location IDs — free text alone cannot create a valid shipment.

| Method | Path                              | Auth     | Status   |
| ------ | --------------------------------- | -------- | -------- |
| GET    | `/delivery/provinces`             | Customer | ✅ Ready |
| GET    | `/delivery/districts?provinceId=` | Customer | ✅ Ready |
| GET    | `/delivery/wards?districtId=`     | Customer | ✅ Ready |
| POST   | `/delivery/fee-quote`             | Customer | ✅ Ready |

```http
GET /delivery/provinces
GET /delivery/districts?provinceId=202
GET /delivery/wards?districtId=1442
```

**Optional fee preview** (uses current cart weights + address; display only — order create re-quotes server-side):

```http
POST /delivery/fee-quote
Content-Type: application/json

{
  "shippingAddress": {
    "recipientName": "Nguyen Van A",
    "recipientPhone": "0901234567",
    "provinceId": 202,
    "districtId": 1442,
    "wardCode": "21012",
    "streetAddress": "123 Le Loi, Ben Nghe"
  }
}
```

```json
{ "shippingFeeVnd": 32000 }
```

**Address fields (required on order create):**

| Field            | Notes                            |
| ---------------- | -------------------------------- |
| `recipientName`  | Max 1024                         |
| `recipientPhone` | 10-digit VN phone (`/^0\d{9}$/`) |
| `provinceId`     | GHN ProvinceID                   |
| `districtId`     | GHN DistrictID                   |
| `wardCode`       | GHN WardCode (string)            |
| `streetAddress`  | Street / building detail         |

Full carrier env / webhook notes: [shipping.md](shipping.md).

---

### 3.5 Create order (locks GHN fee) ✅ Ready

Creates a `PENDING` order from the current cart **and** a `PENDING` `Delivery` with the quoted fee, then clears the cart.

| Method | Path          | Auth     | Status   |
| ------ | ------------- | -------- | -------- |
| POST   | `/orders`     | Customer | ✅ Ready |
| GET    | `/orders`     | Customer | ✅ Ready |
| GET    | `/orders/:id` | Customer | ✅ Ready |

```http
POST /orders
Content-Type: application/json

{
  "shippingAddress": {
    "recipientName": "Nguyen Van A",
    "recipientPhone": "0901234567",
    "provinceId": 202,
    "districtId": 1442,
    "wardCode": "21012",
    "streetAddress": "123 Le Loi, Ben Nghe"
  }
}
```

`shippingAddress` is **required**. Server:

1. Requires an active seeded `GHN` delivery provider (`npm run seed` if missing).
2. Live-quotes fee from GHN (outside the DB transaction).
3. Sets `shippingFeeVnd` and `totalVnd = max(0, subtotalVnd - discountVnd) + shippingFeeVnd`.
4. Writes `Delivery` (structured address columns + human-readable snapshot). GHN `providerOrderCode` stays **null** until payment succeeds.

Example money fields after create:

```json
{
  "id": "...",
  "status": "PENDING",
  "subtotalVnd": 500000,
  "discountVnd": 0,
  "shippingFeeVnd": 32000,
  "totalVnd": 532000,
  "items": []
}
```

```http
GET /orders?page=1&limit=20
GET /orders?status=PENDING
```

Returns a paginated list of the authenticated customer’s orders (newest first): `{ items, total, page, limit }`. Optional `status` filter; `page` default `1`, `limit` default `20` (max `100`).

```http
GET /orders/<orderId>
```

Returns the same order shape for the authenticated owner only.

**Catalog vs survey:**

| Cart source | Behavior                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| `CATALOG`   | Normal e-commerce order                                                                                         |
| `SURVEY`    | Validates recommended variants; if **every protocol** has ≥1 ranked cart variant, applies survey combo discount |

**Money formula:**

```
totalVnd = max(0, subtotalVnd - discountVnd) + shippingFeeVnd
```

Shipping is added **after** the discount floor, so a 100% product discount still charges shipping.

Admin combo-discount setting (not customer-facing):

| Method | Path                                             | Auth      | Status   |
| ------ | ------------------------------------------------ | --------- | -------- |
| GET    | `/admin/commerce-settings/survey-combo-discount` | App Admin | ✅ Ready |
| PATCH  | `/admin/commerce-settings/survey-combo-discount` | App Admin | ✅ Ready |

> **Removed from this flow:** `GET /delivery/options` fee matrix and `POST /orders/:id/delivery` attach step. Shipping is chosen via GHN address at **order create**.

---

### 3.6 Complete payment ✅ Ready

Full VNPay details: [payments.md](payments.md).

| Method | Path                     | Auth                      | Status   |
| ------ | ------------------------ | ------------------------- | -------- |
| POST   | `/payments/checkout`     | Session / Bearer          | ✅ Ready |
| GET    | `/payments/:id`          | Session / Bearer          | ✅ Ready |
| GET    | `/payments/vnpay/return` | Public (browser redirect) | ✅ Ready |
| GET    | `/payments/vnpay/ipn`    | Public (VNPay → server)   | ✅ Ready |

**Checkout:**

```http
POST /payments/checkout
Content-Type: application/json

{
  "orderId": "<pending-order-uuid>",
  "client": "web"
}
```

| Field     | Notes                                                                |
| --------- | -------------------------------------------------------------------- |
| `orderId` | Must be a `PENDING` order owned by the caller, **with Delivery** row |
| `client`  | Optional: `web` (default) or `mobile` — selects return landing URL   |

Response:

```json
{
  "paymentId": "...",
  "paymentUrl": "https://sandbox.vnpayment.vn/..."
}
```

**Client steps:**

1. Ensure order was created with `shippingAddress` and `totalVnd` includes `shippingFeeVnd`.
2. Redirect / open `paymentUrl`.
3. After return, read `paymentId` from the landing query (hint only).
4. Poll `GET /payments/:id` until status is terminal (`PAID` / `FAILED` / …). Authoritative status comes from the IPN, not the browser return.

On successful IPN the backend:

1. Marks payment + order paid (idempotent).
2. Deducts stock.
3. Creates the GHN shipment (`providerOrderCode`), moves delivery toward `PROCESSING` / order `PROCESSING` when handover succeeds.

Checkout charges `order.totalVnd` (products − discount + shipping). Missing delivery → `400 Order has no shipping selection`.

Customer prepays shipping via VNPay; GHN orders use shop-pay / `cod_amount: 0` (see [shipping.md](shipping.md)).

---

### 3.7 Fulfillment & tracking ✅ Ready

Status after payment is driven by the **GHN webhook** (not a staff PATCH). Customer reads delivery + history:

| Capability              | Path                                 | Auth     | Status   |
| ----------------------- | ------------------------------------ | -------- | -------- |
| Get delivery + tracking | `GET /delivery/order/:orderId`       | Customer | ✅ Ready |
| GHN status webhook      | `POST /delivery/ghn/webhook/:secret` | Public   | ✅ Ready |

```http
GET /delivery/order/<orderId>
```

Example shape (abbreviated):

```json
{
  "id": "...",
  "orderId": "...",
  "status": "IN_TRANSIT",
  "type": "STANDARD",
  "providerOrderCode": "GHN...",
  "shippingFeeVnd": 32000,
  "expectedDeliveryTime": "...",
  "shippedAt": "...",
  "deliveredAt": null,
  "recipientName": "Nguyen Van A",
  "streetAddress": "123 Le Loi, Ben Nghe",
  "statusEvents": [{ "providerStatus": "delivering", "occurredAt": "..." }]
}
```

GHN status → `DeliveryStatus` / `OrderStatus` mapping: [shipping.md](shipping.md#status-mapping).

**Known limitation:** if GHN is down at IPN time, order can stay `PAID` with `providerOrderCode` null and is not auto-retried. See shipping.md.

---

## 4. Endpoint checklist

### Customer purchase path

| Step                    | Method | Path                                                              | Status   |
| ----------------------- | ------ | ----------------------------------------------------------------- | -------- |
| List categories         | GET    | `/products/categories`                                            | ✅ Ready |
| List products           | GET    | `/products`                                                       | ✅ Ready |
| Product detail          | GET    | `/products/:id`                                                   | ✅ Ready |
| Register / login        | —      | See [auth-web.md](auth-web.md) / [auth-mobile.md](auth-mobile.md) | ✅ Ready |
| Get cart                | GET    | `/cart`                                                           | ✅ Ready |
| Add / update cart item  | POST   | `/cart/items`                                                     | ✅ Ready |
| Remove cart item        | DELETE | `/cart/items/:variantId`                                          | ✅ Ready |
| Clear cart              | DELETE | `/cart`                                                           | ✅ Ready |
| List GHN provinces      | GET    | `/delivery/provinces`                                             | ✅ Ready |
| List GHN districts      | GET    | `/delivery/districts?provinceId=`                                 | ✅ Ready |
| List GHN wards          | GET    | `/delivery/wards?districtId=`                                     | ✅ Ready |
| Preview GHN fee         | POST   | `/delivery/fee-quote`                                             | ✅ Ready |
| Create order + lock fee | POST   | `/orders`                                                         | ✅ Ready |
| List my orders          | GET    | `/orders`                                                         | ✅ Ready |
| Get order               | GET    | `/orders/:id`                                                     | ✅ Ready |
| Start VNPay checkout    | POST   | `/payments/checkout`                                              | ✅ Ready |
| Payment status          | GET    | `/payments/:id`                                                   | ✅ Ready |
| Get delivery / tracking | GET    | `/delivery/order/:orderId`                                        | ✅ Ready |

### Supporting (optional)

| Method      | Path                                             | Status   | Notes                                              |
| ----------- | ------------------------------------------------ | -------- | -------------------------------------------------- |
| GET         | `/users/me`                                      | ✅ Ready | Account identity                                   |
| GET / PATCH | `/customers/me`                                  | ✅ Ready | Profile / phone / allergies — **no saved address** |
| POST        | `/products`                                      | ✅ Ready | Admin/Staff onboard (optional `imageUrl`)          |
| PATCH       | `/products/variants/:variantId`                  | ✅ Ready | Admin/Staff set variant `imageUrl`                 |
| POST        | `/uploads/images`                                | ✅ Ready | Multipart → R2 URL; see [uploads.md](uploads.md)   |
| GET / PATCH | `/admin/commerce-settings/survey-combo-discount` | ✅ Ready | Admin only                                         |
| GET         | `/payments/vnpay/return`                         | ✅ Ready | Gateway browser return; not called by app UI       |
| GET         | `/payments/vnpay/ipn`                            | ✅ Ready | Gateway server callback                            |
| POST        | `/delivery/ghn/webhook/:secret`                  | ✅ Ready | GHN callback (portal-registered URL)               |

---

## 5. Remaining gaps

Order + GHN fee + payment + carrier tracking are **done**. Still open:

| #   | Item                         | Purpose                                                                 | Status     |
| --- | ---------------------------- | ----------------------------------------------------------------------- | ---------- |
| 1   | GHN create retry / reconcile | Re-hand off `PAID` orders with null `providerOrderCode` if GHN was down | ❌ Missing |
| 2   | Saved customer addresses     | Reuse GHN address across orders                                         | ❌ Missing |
| 3   | Money refund on return/fail  | Delivery can be `FAILED`/`RETURNED` without auto order refund           | ❌ Missing |

### Happy-path sequence

```
POST /cart/items
GET  /delivery/provinces → districts → wards
POST /delivery/fee-quote           ← optional preview
POST /orders                       ← body.shippingAddress; locks shippingFeeVnd
GET  /orders                       ← history / unpaid PENDING
POST /payments/checkout            ← pays products + shipping
GET  /payments/:id                 ← poll until PAID
GET  /delivery/order/:orderId      ← tracking (webhook updates status)
```

---

## 6. Cart & order rules

```
Empty cart
  └─ POST /cart/items  → sets source (CATALOG | SURVEY)
       └─ more items must keep same source
            └─ (optional) POST /delivery/fee-quote
                 └─ POST /orders { shippingAddress }  → PENDING + Delivery + fee
                      └─ POST /payments/checkout  → paymentUrl (products + shipping)
                           └─ IPN → Payment PAID + stock + GHN create
                                └─ webhook → delivery/order status
                                     └─ GET /delivery/order/:orderId
```

| Rule                | Detail                                                                              |
| ------------------- | ----------------------------------------------------------------------------------- |
| Variant id          | Cart uses `productVariantId`, from `product.variants[].id`                          |
| Empty cart checkout | `POST /orders` fails with `Cart is empty`                                           |
| Order ownership     | `GET /orders`, `GET /orders/:id`, and payment checkout only for the owning customer |
| Mixed sources       | Not allowed in one cart                                                             |
| Survey combo        | Discount when cart covers **every protocol** with ≥1 ranked variant                 |
| Shipping on create  | `shippingAddress` required; checkout rejects orders without a Delivery row          |
| Address format      | GHN IDs only — not free-text province/district                                      |

---

## 7. Payment notes

- One order → one payment; retries create new attempts under the same payment (see [payments.md](payments.md)).
- Browser return URL is **read-only**; only IPN mutates status.
- Checkout amount is `order.totalVnd` (products − discount + shipping). Missing shipping → `400`.
- After successful IPN: stock deduction + GHN handover (each failure-isolated; payment stays confirmed).
- In production, VNPay return/IPN URLs **and** the GHN webhook URL must include the `/api` prefix.
- Local IPN / webhook testing needs a public tunnel (e.g. ngrok) registered in the VNPay / GHN portals.

Minimal poll loop after return:

```http
GET /payments/<paymentId>
```

Wait until `status` is not `PENDING` / `PROCESSING` before showing success / tracking UI.

---

## 8. Delivery model notes

**Ready today**

- Provider: **GHN** (live quote + create order + webhook). See [shipping.md](shipping.md).
- `POST /orders` requires structured `shippingAddress`; fee snapshotted to `Order.shippingFeeVnd` + `Delivery`.
- Tracking: `GET /delivery/order/:orderId` + `DeliveryStatusEvent` audit trail.
- `providerOrderCode` set after payment when GHN create succeeds.
- Parcel defaults live in `src/delivery/ghn.constants.ts` (not env).

**Status progression (entity enums):**

`PENDING` → `PROCESSING` → `SHIPPED` → `IN_TRANSIT` → `DELIVERED` (also `FAILED`, `RETURNED`)

Return/fail delivery states do **not** auto-refund the order (money decision still open).

```
Ready today:     Discover → Auth → Cart → GHN address → Order+fee → Payment → GHN ship → Track
Still open:      GHN create retry, saved addresses, refund on return/fail
```
