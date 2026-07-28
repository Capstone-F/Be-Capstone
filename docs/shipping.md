# GHN Delivery Integration (Sandbox)

## Overview

Ships paid orders through [GHN (Giao Hàng Nhanh)](https://api.ghn.vn/home/docs). The
`delivery` module owns the whole shipping lifecycle:

- **`GhnClient`** (`src/delivery/ghn.client.ts`) — the only place that talks to GHN. Native
  `fetch`, `Token`/`ShopId` headers, 10s timeout, `BadGatewayException` on failure. No HTTP
  client dependency was added; this mirrors `KeycloakAdminService`.
- **`Delivery`** — one row per order, created at checkout with a structured GHN address
  (`districtId` + `wardCode`), and stamped with `providerOrderCode` once GHN issues one.
- **`DeliveryStatusEvent`** — append-only audit of every webhook, applied or not.
- **`ShippingConfig`** — credentials + warehouse only. Parcel/business defaults (box size,
  service type, `required_note`) are constants in `src/delivery/ghn.constants.ts`, not env:
  they are physical facts, not per-deployment configuration.

Money is `int` VND. `Order.shippingFeeVnd` is quoted at checkout and included in
`Order.totalVnd`, which is exactly what VNPay charges.

## Flow

1. **Address picker** — client calls `GET /delivery/provinces` → `/districts?provinceId=` →
   `/wards?districtId=`. GHN requires its own `district_id`/`ward_code`; free text will not do.
2. **Fee preview (optional)** — `POST /delivery/fee-quote` with the cart + address renders an
   estimate before the customer commits.
3. **Order creation** — `POST /orders` with `shippingAddress`. The server re-quotes the fee
   from GHN (outside the DB transaction), stores it on the order, and writes a `PENDING`
   `Delivery` holding the address. `totalVnd = subtotalVnd - discountVnd + shippingFeeVnd`.
4. **Payment** — `POST /payments/checkout` → VNPay → IPN. See [`payments.md`](payments.md).
5. **GHN handover** — on IPN success (after stock deduction) the backend creates the GHN order,
   stores `providerOrderCode` + `expectedDeliveryTime`, and moves delivery `PROCESSING` /
   order `PAID → PROCESSING`.
6. **Tracking** — GHN posts status callbacks to the webhook, which maps them onto
   `DeliveryStatus` and `OrderStatus`. Customers read `GET /delivery/order/:orderId`.

Because the customer prepays shipping through VNPay, GHN orders are sent with
`payment_type_id: 1` (shop pays GHN) and `cod_amount: 0`.

## Endpoints

| Method | Path                              | Auth           | Purpose                                  |
| ------ | --------------------------------- | -------------- | ---------------------------------------- |
| GET    | `/delivery/provinces`             | Session cookie | GHN provinces for the address picker     |
| GET    | `/delivery/districts?provinceId=` | Session cookie | GHN districts in a province              |
| GET    | `/delivery/wards?districtId=`     | Session cookie | GHN wards in a district                  |
| POST   | `/delivery/fee-quote`             | Session cookie | Preview the fee for the cart + address   |
| POST   | `/delivery/ghn/webhook/:secret`   | Public         | GHN status callback (sole status writer) |
| GET    | `/delivery/order/:orderId`        | Session cookie | Delivery + tracking history for my order |

`POST /orders` now **requires** a `shippingAddress` body — it previously took no body at all.

## Status mapping

GHN's 22 statuses (`src/delivery/ghn.status-map.ts`) collapse onto our enums:

| GHN                                                                            | DeliveryStatus | OrderStatus   |
| ------------------------------------------------------------------------------ | -------------- | ------------- |
| `ready_to_pick`, `picking`, `money_collect_picking`                            | PROCESSING     | PROCESSING    |
| `picked`                                                                       | SHIPPED        | SHIPPED       |
| `storing`, `transporting`, `sorting`, `delivering`, `money_collect_delivering` | IN_TRANSIT     | SHIPPED       |
| `delivered`                                                                    | DELIVERED      | DELIVERED     |
| `delivery_fail`, `waiting_to_return`, `cancel`, `exception`, `damage`, `lost`  | FAILED         | _(unchanged)_ |
| `return`, `return_*`, `returning`, `returned`                                  | RETURNED       | _(unchanged)_ |

Return/cancel/exception states deliberately **do not** move the order. It was paid; deciding
`CANCELLED`/`REFUNDED` is a money decision requiring a refund path that does not exist yet.
The delivery reflects reality and a human decides the rest.

## Webhook trust model

**GHN does not sign its callbacks** — no HMAC, no signature, no auth ([docs](https://api.ghn.vn/home/docs/detail?id=47)).
This is materially weaker than VNPay's IPN, whose `verifyIpnCall` does the work for us. Three
defences stand in for a signature:

1. **Secret path segment** — register `https://<host>/delivery/ghn/webhook/<GHN_WEBHOOK_SECRET>`
   in the GHN portal. Compared with `timingSafeEqual`. Rotate by re-registering the URL.
2. **Known order codes only** — an unrecognised `OrderCode` is ignored.
3. **No trust in the body** — only `Status` is acted on. `CODAmount`/`TotalFee` are stored in
   `rawWebhook` for audit and never written to `Order`/`Payment`.

## Idempotency and ordering

GHN retries a webhook **10 times, 5 seconds apart, on any non-200**. So:

- Return **200** for anything handled _or_ deliberately ignored (unknown order, unmapped
  status, stale event) — otherwise GHN retries pointlessly.
- Let genuine transient failures (DB down) throw → 500 → GHN retries, which is what we want.

GHN gives no ordering guarantee, so each webhook carries its own `Time`. An event at or
before `Delivery.lastStatusAt` is **audited with `applied: false` and ignored**, which stops a
retried `picking` from regressing a delivery that already reached `delivered`. This is why the
guard is timestamp-based rather than a status ranking — `delivery_fail → delivering` retries
are legitimate and a rank would block them.

GHN order creation is guarded on `providerOrderCode IS NULL` and claimed with a conditional
`UPDATE`, so it can only ever happen once per order.

**Known limitation:** the VNPay IPN's own once-only gate means that if GHN is down at the
moment of payment, the order stays `PAID` with `providerOrderCode` null and is **not**
retried. `createGhnOrderForPaidOrder` is safe to re-call — a retry trigger (admin endpoint or
a cron reconcile over `PAID` orders with a null code) is the natural follow-up.

## Environment variables

Only credentials, the gateway, and the warehouse live here. Everything else is a constant in
`src/delivery/ghn.constants.ts`.

| Name                   | Purpose                                | Default (Sandbox)                   |
| ---------------------- | -------------------------------------- | ----------------------------------- |
| `GHN_TOKEN`            | API token (`Token` header)             | —                                   |
| `GHN_SHOP_ID`          | Shop id (`ShopId` header)              | —                                   |
| `GHN_BASE_URL`         | Gateway host                           | `https://dev-online-gateway.ghn.vn` |
| `GHN_FROM_DISTRICT_ID` | Warehouse pickup district              | `0` (unconfigured)                  |
| `GHN_FROM_WARD_CODE`   | Warehouse pickup ward                  | —                                   |
| `GHN_WEBHOOK_SECRET`   | Secret path segment on the webhook URL | —                                   |

Production gateway is `https://online-gateway.ghn.vn`.

## Local testing

```bash
docker compose up -d
npm run seed          # seeds the GHN delivery provider + variant weights
npm run start:dev
ngrok http 3000       # register <ngrok-url>/delivery/ghn/webhook/<GHN_WEBHOOK_SECRET> in the GHN portal
```

Get sandbox credentials from https://khachhang.ghn.vn.

Cheapest credential check — if this returns a non-zero `total`, the token/shop/warehouse are right:

```bash
curl -X POST http://localhost:3000/delivery/fee-quote -b "sid=<cookie>" \
  -H 'Content-Type: application/json' \
  -d '{"shippingAddress":{"recipientName":"Test","recipientPhone":"0901234567","provinceId":202,"districtId":1449,"wardCode":"21211","streetAddress":"1 Le Loi"}}'
```

Exercise the webhook without GHN (no tunnel needed) once a delivery has a `providerOrderCode`:

```bash
curl -X POST "http://localhost:3000/delivery/ghn/webhook/$GHN_WEBHOOK_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"OrderCode":"<code>","Status":"delivered","Time":"2026-07-16T10:00:00Z"}'
```

Worth checking by hand: replay the same body (nothing changes, `delivery_status_events` gains
an `applied: false` row); POST an older `Time` (status must not regress); use a wrong secret
(401, nothing changes).

Product weights are derived from the seed's `volume` (`236ml` → 276g, i.e. 1ml ≈ 1g plus 40g
packaging). Set `weightGram` on a `ProductSeed` to override.

## Production notes

- **The `/api` prefix trap.** Production mounts a global `/api` prefix. The webhook URL
  registered in the GHN portal must include it: `https://<host>/api/delivery/ghn/webhook/<secret>`.
  `docs/payments.md` carries the same warning for the VNPay IPN.
- Use a long random `GHN_WEBHOOK_SECRET`; it is the only thing standing between the public
  internet and your delivery statuses.
- `GHN_FROM_DISTRICT_ID` / `GHN_FROM_WARD_CODE` must match the warehouse registered on the GHN
  shop, or every fee quote will be wrong.
