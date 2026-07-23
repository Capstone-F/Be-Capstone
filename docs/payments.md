# Payment Integration Guide

Order checkout uses a **payment gateway abstraction**. Clients always call the same APIs; the active gateway is selected by `PAYMENT_PROVIDER` (`vnpay` | `mock`). PayOS can be added later behind the same interface without changing client routes.

**Consultations are not paid here.** Expert booking fees use the customer **Wallet** ledger — see [Consultation Flow](consultation-flow.md).

**Client contract (unchanged):**

| Method | Path                 | Auth    | Response                    |
| ------ | -------------------- | ------- | --------------------------- |
| `POST` | `/payments/checkout` | Session | `{ paymentId, paymentUrl }` |
| `GET`  | `/payments/:id`      | Session | Authoritative status        |

---

## Provider selection

| Env                | Values          | Default |
| ------------------ | --------------- | ------- |
| `PAYMENT_PROVIDER` | `vnpay`, `mock` | `vnpay` |

| Provider | Checkout `paymentUrl`                     | Status mutation                                        |
| -------- | ----------------------------------------- | ------------------------------------------------------ |
| `vnpay`  | VNPay hosted page                         | `GET /payments/vnpay/ipn` (return is read-only)        |
| `mock`   | Backend `GET /payments/mock/complete?...` | That complete route finalizes then redirects to client |

Architecture is ready for a future `PayOSPaymentProvider` (same `PaymentGateway` interface + factory case) without changing checkout/status shapes.

---

## Data model

- An `Order` has one `Payment`
- A `Payment` has many `PaymentAttempt`s (one per gateway interaction or retry)
- `PaymentAttempt.vnpTxnRef` stores the opaque provider txn ref (name kept for schema stability)
- Ledger `Transaction` on confirmation is deferred to future wallet/accounting work

On **successful** finalize (any provider): payment → `PAID`, order → `PAID`, stock deducted. Duplicate callbacks are idempotent (no second stock deduct).

---

## VNPay flow (`PAYMENT_PROVIDER=vnpay`)

1. `POST /payments/checkout` with `{ orderId, client? }` (`web` \| `mobile`). Requires shipping on the order.
2. Redirect the browser to `paymentUrl` (VNPay).
3. VNPay → `GET /payments/vnpay/return` → 302 to client `?paymentId=&status=` (**no mutation**).
4. VNPay → `GET /payments/vnpay/ipn` → verify + idempotent status update (sole VNPay mutator).
5. Poll `GET /payments/:id` for authoritative status.

### VNPay endpoints

| Method | Path                   | Auth    | Purpose                       |
| ------ | ---------------------- | ------- | ----------------------------- |
| POST   | /payments/checkout     | Session | Create payment + VNPay URL    |
| GET    | /payments/:id          | Session | Status                        |
| GET    | /payments/vnpay/return | Public  | Verify + redirect (read-only) |
| GET    | /payments/vnpay/ipn    | Public  | Idempotent status update      |

### Idempotency

IPN is keyed by txn ref. Duplicate IPNs return VNPay’s “already confirmed” code and make no further changes. Amount mismatches / bad checksums are rejected.

### VNPay environment variables

| Name                  | Purpose                        | Default (Sandbox)                           |
| --------------------- | ------------------------------ | ------------------------------------------- |
| VNP_TMN_CODE          | Merchant terminal code         | (from VNPay)                                |
| VNP_HASH_SECRET       | Hash secret                    | (from VNPay)                                |
| VNP_URL               | Gateway host                   | https://sandbox.vnpayment.vn                |
| VNP_RETURN_URL        | Backend return URL             | http://localhost:3000/payments/vnpay/return |
| VNP_IPN_URL           | Portal IPN URL (informational) | (none)                                      |
| VNP_CLIENT_RETURN_URL | Web landing after return/mock  | FRONTEND_URL + /vnpay_return                |
| VNP_MOBILE_RETURN_URL | Mobile deep link landing       | glowscan://vnpay-return                     |

---

## Mock flow (`PAYMENT_PROVIDER=mock`)

For local/dev and automated tests — **no real gateway**.

```
POST /payments/checkout
        │
        ▼
paymentUrl = {API}/payments/mock/complete?paymentId=&txnRef=
        │
        ▼  (browser or test client follows URL)
GET /payments/mock/complete
        │  finalize: attempt SUCCESS, payment PAID, order PAID, stock deduct
        ▼
302 → VNP_CLIENT_RETURN_URL (or mobile) ?paymentId=&status=success
        │
        ▼
GET /payments/:id  → PAID
```

`VNP_RETURN_URL` is still used to derive the public API origin (and optional `/api` prefix) for the mock complete URL.

When `PAYMENT_PROVIDER` is not `mock`, `GET /payments/mock/complete` returns **404**.

---

## Local testing

- Start infra with `docker compose up -d`; run the API with `npm run start:dev`.
- **Mock:** set `PAYMENT_PROVIDER=mock`, checkout, open `paymentUrl`, then poll status.
- **VNPay sandbox:** set `PAYMENT_PROVIDER=vnpay`, use a tunnel for IPN, register `/payments/vnpay/ipn` in the merchant portal.

## Production notes

In production the app mounts a global `/api` prefix, so `VNP_RETURN_URL` and the IPN URL registered in the portal must include `/api` (e.g. `https://host/api/payments/vnpay/return`). Prefer `PAYMENT_PROVIDER=vnpay` (or PayOS when implemented) in production — not `mock`.
