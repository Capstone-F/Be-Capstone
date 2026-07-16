# E-Commerce Integration Guide

End-to-end guide for integrating the **catalog → cart → order (+ shipping) → payment → fulfillment / tracking** flow with this backend.

**Auth (register / login):** do not duplicate here — use:

- [Web Authentication Guide](auth-web.md) — session cookie (`sid`) for SPAs
- [Mobile Authentication Guide](auth-mobile.md) — Bearer tokens for Expo / React Native

See also: [VNPay Payment Integration](payments.md) · [User Management & RBAC](users.md)

---

## Status legend

| Marker     | Meaning                                                 |
| ---------- | ------------------------------------------------------- |
| ✅ Ready   | Controller + service exist; usable today                |
| ❌ Missing | Not implemented yet (schema/module may exist)           |
| 🔶 Extend  | Endpoint exists but must change to support shipping fee |

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
┌──────────┐   ┌──────────┐   ┌──────┐   ┌─────────────────────┐
│ Discover │──▶│ Register │──▶│ Cart │──▶│ Order + shipping    │
│ products │   │ / Login  │   │      │   │ (fee locked in)     │
└──────────┘   └──────────┘   └──────┘   └──────────┬──────────┘
   ✅ Ready      ✅ (auth docs)  ✅ Ready    ✅ Order + shipping
                                                            │
                                                            ▼
┌──────────┐   ┌──────────────────────┐            ┌────────────┐
│ Tracking │◀──│ Fulfillment updates  │◀───────────│  Payment   │
│ (read)   │   │ (staff / carrier)    │            │  (VNPay)   │
└──────────┘   └──────────────────────┘            └────────────┘
  🔶 GET ready       ❌ Staff PATCH                   ✅ Ready
     (staff PATCH                                   (products +
      missing)                                       shipping)
```

**Target happy path (catalog purchase):**

1. Browse products / categories (public).
2. Register or log in (web or mobile).
3. Add product variants to cart (`source: CATALOG`).
4. Create a `PENDING` order from the cart.
5. **Choose delivery option + shipping address; lock shipping fee into the order** (before payment).
6. Checkout → redirect to VNPay → poll until `PAID` (amount = products − discount + shipping).
7. Staff/system updates delivery status + tracking; customer reads tracking.

> **Pricing model:** Fixed fee matrix by `(providerId, DeliveryType)` in `delivery_fees` (seeded: STANDARD 30_000, EXPRESS 50_000, SAME_DAY 80_000 per provider). Fee is snapshotted onto the order at attach time — no live carrier quotes.

There is also a **survey / recommendation** path (`source: SURVEY`) that reuses cart → order → shipping → payment, with extra validation and optional combo discount.

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

Cart, orders, and payment checkout require an authenticated **Customer** (session or Bearer). Product catalog list/detail/categories are public.

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

Response shape (detail) includes `product.variants[]` with `id`, `sku`, `volume`, `packaging`, `priceVnd`, `isActive`. Store `variants[].id` for the cart step.

> Staff/admin product onboarding (`POST /products`) exists but is **not** part of the customer purchase flow.

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

> There is **no saved shipping-address field** on the customer profile today. Address should be collected when attaching delivery to the order (before payment).

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

### 3.4 Create order ✅ Ready

Creates a `PENDING` order from the current cart, then clears the cart. Shipping is attached in the next step.

| Method | Path                   | Auth     | Status   |
| ------ | ---------------------- | -------- | -------- |
| POST   | `/orders`              | Customer | ✅ Ready |
| GET    | `/orders`              | Customer | ✅ Ready |
| GET    | `/orders/:id`          | Customer | ✅ Ready |
| POST   | `/orders/:id/delivery` | Customer | ✅ Ready |
| GET    | `/orders/:id/delivery` | Customer | ✅ Ready |

```http
POST /orders
```

No body. Response includes `id`, `status` (`PENDING`), money fields (`subtotalVnd`, `discountVnd`, `shippingFeeVnd` = `0`, `totalVnd`), and `items[]`.

```http
GET /orders?page=1&limit=20
GET /orders?status=PENDING
```

Returns a paginated list of the authenticated customer’s orders (newest first): `{ items, total, page, limit }`. Optional `status` filter; `page` default `1`, `limit` default `20` (max `100`).

```http
GET /orders/<orderId>
```

Returns the same order shape for the authenticated owner only (includes `shippingFeeVnd` after attach).

**Catalog vs survey:**

| Cart source | Behavior                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `CATALOG`   | Normal e-commerce order                                                                                          |
| `SURVEY`    | Validates recommended variants; if the cart contains **all** recommended variants, applies survey combo discount |

**Money formula:**

```
totalVnd = max(0, subtotalVnd - discountVnd + shippingFeeVnd)
```

At create time `shippingFeeVnd` is `0`; it is set when delivery is attached.

Admin combo-discount setting (not customer-facing):

| Method | Path                                             | Auth      | Status   |
| ------ | ------------------------------------------------ | --------- | -------- |
| GET    | `/admin/commerce-settings/survey-combo-discount` | App Admin | ✅ Ready |
| PATCH  | `/admin/commerce-settings/survey-combo-discount` | App Admin | ✅ Ready |

---

### 3.5 Choose delivery + lock shipping fee ✅ Ready

Must happen **before** `POST /payments/checkout` so VNPay charges products + shipping.

| Capability                       | Path                        | Auth     | Status   |
| -------------------------------- | --------------------------- | -------- | -------- |
| List priced delivery options     | `GET /delivery/options`     | Customer | ✅ Ready |
| Attach shipping to pending order | `POST /orders/:id/delivery` | Customer | ✅ Ready |
| Read delivery for order          | `GET /orders/:id/delivery`  | Customer | ✅ Ready |

```http
GET /delivery/options
```

Returns active options from the fee matrix, e.g.:

```json
[
  {
    "providerId": "...",
    "providerCode": "GHN",
    "providerName": "Giao Hàng Nhanh",
    "type": "STANDARD",
    "feeVnd": 30000
  }
]
```

```http
POST /orders/<orderId>/delivery
Content-Type: application/json

{
  "providerId": "<uuid>",
  "type": "STANDARD",
  "shippingAddress": "123 Nguyen Hue, Q1, HCMC"
}
```

Order money after attach:

```json
{
  "id": "...",
  "status": "PENDING",
  "subtotalVnd": 500000,
  "discountVnd": 0,
  "shippingFeeVnd": 30000,
  "totalVnd": 530000,
  "items": []
}
```

Rules enforced:

1. Only for `PENDING` orders owned by the caller.
2. Fee is snapshotted from `delivery_fees` onto `order.shippingFeeVnd` and `delivery.feeVnd`.
3. Re-attach is allowed while `PENDING` and **no** in-flight payment (`PENDING`/`PROCESSING`); rejected once checkout has started.
4. Checkout rejects orders that still lack a `Delivery` row.

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

| Field     | Notes                                                                     |
| --------- | ------------------------------------------------------------------------- |
| `orderId` | Must be a `PENDING` order owned by the caller, **with shipping attached** |
| `client`  | Optional: `web` (default) or `mobile` — selects return landing URL        |

Response:

```json
{
  "paymentId": "...",
  "paymentUrl": "https://sandbox.vnpayment.vn/..."
}
```

**Client steps:**

1. Ensure shipping is attached and `totalVnd` includes `shippingFeeVnd`.
2. Redirect / open `paymentUrl`.
3. After return, read `paymentId` from the landing query (hint only).
4. Poll `GET /payments/:id` until status is terminal (`PAID` / `FAILED` / …). Authoritative status comes from the IPN, not the browser return.

On successful IPN, the backend marks the related **order** as `PAID` as well. Checkout charges `order.totalVnd` (products − discount + shipping). Missing delivery → `400 Order has no shipping selection`.

---

### 3.7 Fulfillment & tracking 🔶 Partial

After payment, staff (or a future carrier integration) updates shipment status; the customer can already read delivery via `GET /orders/:id/delivery`.

| Capability                         | Path                       | Auth              | Status     |
| ---------------------------------- | -------------------------- | ----------------- | ---------- |
| Get delivery for order             | `GET /orders/:id/delivery` | Customer          | ✅ Ready   |
| Staff update status / tracking no. | `PATCH /deliveries/:id`    | Staff / App Admin | ❌ Missing |

Until staff PATCH exists, tracking numbers / status progression after `PAID` must be updated in DB or a future API.

---

## 4. Endpoint checklist

### Customer purchase path

| Step                                   | Method | Path                                                              | Status     |
| -------------------------------------- | ------ | ----------------------------------------------------------------- | ---------- |
| List categories                        | GET    | `/products/categories`                                            | ✅ Ready   |
| List products                          | GET    | `/products`                                                       | ✅ Ready   |
| Product detail                         | GET    | `/products/:id`                                                   | ✅ Ready   |
| Register / login                       | —      | See [auth-web.md](auth-web.md) / [auth-mobile.md](auth-mobile.md) | ✅ Ready   |
| Get cart                               | GET    | `/cart`                                                           | ✅ Ready   |
| Add / update cart item                 | POST   | `/cart/items`                                                     | ✅ Ready   |
| Remove cart item                       | DELETE | `/cart/items/:variantId`                                          | ✅ Ready   |
| Clear cart                             | DELETE | `/cart`                                                           | ✅ Ready   |
| Create order from cart                 | POST   | `/orders`                                                         | ✅ Ready   |
| List my orders                         | GET    | `/orders`                                                         | ✅ Ready   |
| Get order                              | GET    | `/orders/:id`                                                     | ✅ Ready   |
| List priced delivery options           | GET    | `/delivery/options`                                               | ✅ Ready   |
| Attach shipping + fee to pending order | POST   | `/orders/:id/delivery`                                            | ✅ Ready   |
| Start VNPay checkout                   | POST   | `/payments/checkout`                                              | ✅ Ready   |
| Payment status                         | GET    | `/payments/:id`                                                   | ✅ Ready   |
| Get delivery / tracking                | GET    | `/orders/:id/delivery`                                            | ✅ Ready   |
| Staff update delivery                  | PATCH  | `/deliveries/:id`                                                 | ❌ Missing |

### Supporting (optional)

| Method      | Path                                             | Status   | Notes                                              |
| ----------- | ------------------------------------------------ | -------- | -------------------------------------------------- |
| GET         | `/users/me`                                      | ✅ Ready | Account identity                                   |
| GET / PATCH | `/customers/me`                                  | ✅ Ready | Profile / phone / allergies — **no saved address** |
| GET / PATCH | `/admin/commerce-settings/survey-combo-discount` | ✅ Ready | Admin only                                         |
| GET         | `/payments/vnpay/return`                         | ✅ Ready | Gateway browser return; not called by app UI       |
| GET         | `/payments/vnpay/ipn`                            | ✅ Ready | Gateway server callback                            |

---

## 5. Remaining gaps

Checkout-with-shipping and order history are **done**. Still missing for full fulfillment UX:

| #   | Method  | Path              | Purpose                                                               | Status     |
| --- | ------- | ----------------- | --------------------------------------------------------------------- | ---------- |
| 1   | `PATCH` | `/deliveries/:id` | Staff updates `status`, `trackingNumber`, `shippedAt` / `deliveredAt` | ❌ Missing |

### Optional later

| Method   | Path                     | Purpose                                   |
| -------- | ------------------------ | ----------------------------------------- |
| CRUD     | saved customer addresses | Reuse shipping address across orders      |
| Admin    | `/admin/delivery-fees`   | Manage fee matrix without redeploy        |
| Webhooks | carrier tracking sync    | Auto-update status instead of staff PATCH |

### Happy-path sequence

```
POST /cart/items
POST /orders
GET  /orders                       ← history / unpaid PENDING
GET  /delivery/options
POST /orders/:id/delivery          ← locks shippingFeeVnd into totalVnd
POST /payments/checkout            ← pays products + shipping
GET  /payments/:id                 ← poll until PAID
GET  /orders/:id/delivery          ← customer tracking
PATCH /deliveries/:id              ← staff (not yet): SHIPPED + trackingNumber → …
```

---

## 6. Cart & order rules

```
Empty cart
  └─ POST /cart/items  → sets source (CATALOG | SURVEY)
       └─ more items must keep same source
            └─ POST /orders  → PENDING order, cart cleared
                 └─ POST /orders/:id/delivery  → lock shippingFeeVnd
                      └─ POST /payments/checkout  → paymentUrl (products + shipping)
                           └─ IPN → Payment PAID + Order PAID
                                └─ GET /orders/:id/delivery  (+ staff PATCH still missing)
```

| Rule                | Detail                                                                              |
| ------------------- | ----------------------------------------------------------------------------------- |
| Variant id          | Cart uses `productVariantId`, from `product.variants[].id`                          |
| Empty cart checkout | `POST /orders` fails with `Cart is empty`                                           |
| Order ownership     | `GET /orders`, `GET /orders/:id`, and payment checkout only for the owning customer |
| Mixed sources       | Not allowed in one cart                                                             |
| Survey combo        | Discount only when cart includes every recommended variant                          |
| Shipping before pay | Checkout rejects PENDING orders without a Delivery row                              |

---

## 7. Payment notes

- One order → one payment; retries create new attempts under the same payment (see [payments.md](payments.md)).
- Browser return URL is **read-only**; only IPN mutates status.
- Checkout amount is `order.totalVnd` (products − discount + shipping). Missing shipping → `400`.
- In production, VNPay return/IPN URLs must include the `/api` prefix.
- Local IPN testing needs a public tunnel (e.g. ngrok) registered in the VNPay portal.

Minimal poll loop after return:

```http
GET /payments/<paymentId>
```

Wait until `status` is not `PENDING` / `PROCESSING` before showing success / tracking UI.

---

## 8. Delivery model notes

**Ready today**

- Tables: `deliveries`, `delivery_providers`, `delivery_fees`
- TypeORM entities + HTTP: `GET /delivery/options`, `POST|GET /orders/:id/delivery`
- Seeded providers: `GHN`, `GHTK`, `VIETTEL_POST`, `JT_EXPRESS`
- Fee matrix: `(providerId, type)` → `feeVnd` (STANDARD 30k / EXPRESS 50k / SAME_DAY 80k)
- `Order.shippingFeeVnd` + `Delivery.feeVnd` (snapshot at attach)
- `Order.delivery` relation (1:1); created **before** payment
- Fields on `Delivery`: `providerId`, `type`, `shippingAddress`, `feeVnd`, `status`, `trackingNumber`, `shippedAt`, `deliveredAt`

**Still missing**

- Staff `PATCH /deliveries/:id` for fulfillment updates
- Admin fee CRUD (change rates via seed/DB for MVP)

**Status progression (entity enums):**

`PENDING` → `PROCESSING` → `SHIPPED` → `IN_TRANSIT` → `DELIVERED` (also `FAILED`, `RETURNED`)

```
Ready today:     Discover → Auth → Cart → Order → Shipping fee → Payment (products + shipping)
Still to build:  Staff delivery status / tracking updates
```
