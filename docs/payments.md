# Payment Integration Guide

Order checkout uses a **payment gateway abstraction**. Clients always call the same APIs; the active gateway is selected by `PAYMENT_PROVIDER` (`vnpay` | `mock` | `payos`).

**Consultations are not paid here.** Expert booking fees use the customer **Wallet** ledger — see [Consultation Flow](consultation-flow.md).

**Client contract (unchanged):**

| Method | Path                 | Auth    | Response                    |
| ------ | -------------------- | ------- | --------------------------- |
| `POST` | `/payments/checkout` | Session | `{ paymentId, paymentUrl }` |
| `GET`  | `/payments/:id`      | Session | Authoritative status        |

---

## Provider selection

| Env                | Values                   | Default |
| ------------------ | ------------------------ | ------- |
| `PAYMENT_PROVIDER` | `vnpay`, `mock`, `payos` | `vnpay` |

| Provider | Checkout `paymentUrl`                     | Status mutation                                        |
| -------- | ----------------------------------------- | ------------------------------------------------------ |
| `vnpay`  | VNPay hosted page                         | `GET /payments/vnpay/ipn` (return is read-only)        |
| `mock`   | Backend `GET /payments/mock/complete?...` | That complete route finalizes then redirects to client |
| `payos`  | PayOS hosted checkout                     | `POST /payments/payos/webhook` (return is read-only)   |

---

## Data model

- An `Order` has one `Payment`
- A `Payment` has many `PaymentAttempt`s (one per gateway interaction or retry)
- `PaymentAttempt.vnpTxnRef` stores the opaque provider txn ref (name kept for schema stability; for PayOS this is the numeric `orderCode`)
- Ledger `Transaction` on confirmation is deferred to future wallet/accounting work

On **successful** finalize (any provider): payment → `PAID`, order → `PAID`, stock deducted. Duplicate callbacks are idempotent (no second stock deduct).

---

## Shared client landing URLs

Used by every gateway after return / mock complete:

| Name              | Purpose                       | Default (Sandbox)            |
| ----------------- | ----------------------------- | ---------------------------- |
| CLIENT_RETURN_URL | Web landing after return/mock | FRONTEND_URL + /vnpay_return |
| MOBILE_RETURN_URL | Mobile deep link landing      | glowscan://vnpay-return      |

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

| Name            | Purpose                        | Default (Sandbox)                           |
| --------------- | ------------------------------ | ------------------------------------------- |
| VNP_TMN_CODE    | Merchant terminal code         | (from VNPay)                                |
| VNP_HASH_SECRET | Hash secret                    | (from VNPay)                                |
| VNP_URL         | Gateway host                   | https://sandbox.vnpayment.vn                |
| VNP_RETURN_URL  | Backend return URL             | http://localhost:3000/payments/vnpay/return |
| VNP_IPN_URL     | Portal IPN URL (informational) | (none)                                      |

---

## PayOS flow (`PAYMENT_PROVIDER=payos`)

1. `POST /payments/checkout` with `{ orderId, client? }` (`web` \| `mobile`). Requires shipping on the order.
2. Redirect the browser to `paymentUrl` (PayOS checkout).
3. PayOS → `GET /payments/payos/return` → 302 to client `?paymentId=&status=` (**no mutation**).
4. PayOS → `POST /payments/payos/webhook` → verify signature + idempotent status update (sole PayOS mutator).
5. Poll `GET /payments/:id` for authoritative status.

Register `PAYOS_WEBHOOK_URL` (e.g. `https://host/api/payments/payos/webhook`) in the PayOS merchant portal. Respond with HTTP 2xx so PayOS stops retrying.

### PayOS endpoints

| Method | Path                    | Auth    | Purpose                       |
| ------ | ----------------------- | ------- | ----------------------------- |
| POST   | /payments/checkout      | Session | Create payment + PayOS URL    |
| GET    | /payments/:id           | Session | Status                        |
| GET    | /payments/payos/return  | Public  | Verify + redirect (read-only) |
| POST   | /payments/payos/webhook | Public  | Idempotent status update      |

### PayOS environment variables

| Name               | Purpose                            | Default (Sandbox)                           |
| ------------------ | ---------------------------------- | ------------------------------------------- |
| PAYOS_CLIENT_ID    | Merchant Client ID                 | (from PayOS)                                |
| PAYOS_API_KEY      | API key                            | (from PayOS)                                |
| PAYOS_CHECKSUM_KEY | Checksum key for signatures        | (from PayOS)                                |
| PAYOS_RETURN_URL   | Backend return URL                 | http://localhost:3000/payments/payos/return |
| PAYOS_CANCEL_URL   | Backend cancel URL                 | same as PAYOS_RETURN_URL                    |
| PAYOS_WEBHOOK_URL  | Portal webhook URL (informational) | (none)                                      |

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
302 → CLIENT_RETURN_URL (or mobile) ?paymentId=&status=success
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
- **PayOS sandbox:** set `PAYMENT_PROVIDER=payos`, fill `PAYOS_*` credentials, use a tunnel for webhook, register `/payments/payos/webhook` in the PayOS portal.

## Production notes

In production the app mounts a global `/api` prefix, so return/IPN/webhook URLs registered with the gateway must include `/api` (e.g. `https://host/api/payments/vnpay/return`, `https://host/api/payments/payos/webhook`). Prefer `PAYMENT_PROVIDER=vnpay` or `payos` in production — not `mock`.
