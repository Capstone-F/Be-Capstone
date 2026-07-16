# VNPay Payment Integration (Sandbox)

## Overview

The backend integrates the VNPay Sandbox gateway to collect payment for an existing customer order. It uses the `nestjs-vnpay` library (wrapper over `vnpay`).

**Data model:**

- An `Order` (created elsewhere) has one `Payment`
- A `Payment` has many `PaymentAttempt`s (one per gateway interaction or retry)
- Writing a ledger `Transaction` on confirmation is intentionally deferred to future wallet/accounting work

## Flow

1. Frontend calls `POST /payments/checkout` with `{ orderId, client? }` (client is `web` or `mobile`, default `web`). Requires an authenticated session (cookie `sid`).

2. Backend loads the PENDING order, verifies it belongs to the caller, **requires shipping to be attached** (`Delivery` row), creates a `Payment` (plus first `PaymentAttempt` with a unique `vnpTxnRef`) for `order.totalVnd` (products − discount + shipping), and returns `{ paymentId, paymentUrl }`. Checkout returns `400` if the order has no shipping selection.

3. Frontend redirects the browser to `paymentUrl` (VNPay's hosted page).

4. After payment, VNPay redirects the browser to the backend `GET /payments/vnpay/return`. The backend verifies the signature and 302-redirects the user to the client landing URL (web page or mobile deep link) with `?paymentId=...`. This endpoint is READ-ONLY — it does NOT change payment status.

5. Separately, VNPay calls `GET /payments/vnpay/ipn` server-to-server. This endpoint verifies the signature, checks the amount, updates the `PaymentAttempt` + `Payment` status idempotently, and responds with VNPay's required RspCode JSON. This is the ONLY place status is updated.

6. The frontend polls `GET /payments/:id` for the authoritative, IPN-confirmed status (the return redirect params are only a hint; the browser return often arrives before the IPN, so status may still be PENDING briefly).

## Endpoints

| Method | Path                   | Auth           | Purpose                                                              |
| ------ | ---------------------- | -------------- | -------------------------------------------------------------------- |
| POST   | /payments/checkout     | Session cookie | Create payment for order total (incl. shipping) and return VNPay URL |
| GET    | /payments/:id          | Session cookie | Authoritative payment status                                         |
| GET    | /payments/vnpay/return | Public         | Verify signature and redirect browser to client (no mutation)        |
| GET    | /payments/vnpay/ipn    | Public         | Verify signature and update status idempotently (server-to-server)   |

## Idempotency

The IPN is keyed by `vnpTxnRef`. Duplicate IPNs are safe — once an attempt reaches a terminal status (SUCCESS or FAILED), the handler returns VNPay's "already confirmed" code and makes no further changes. The amount is validated against the stored attempt amount; a mismatch or bad checksum is rejected.

## Environment Variables

| Name                  | Purpose                                                         | Default (Sandbox)                           |
| --------------------- | --------------------------------------------------------------- | ------------------------------------------- |
| VNP_TMN_CODE          | Merchant terminal code                                          | (from VNPay)                                |
| VNP_HASH_SECRET       | Hash secret for signing and verifying                           | (from VNPay)                                |
| VNP_URL               | VNPay gateway host                                              | https://sandbox.vnpayment.vn                |
| VNP_RETURN_URL        | Backend return endpoint sent as vnp_ReturnUrl                   | http://localhost:3000/payments/vnpay/return |
| VNP_IPN_URL           | IPN URL registered in the VNPay merchant portal (informational) | (none)                                      |
| VNP_CLIENT_RETURN_URL | Web landing URL the return endpoint redirects to                | FRONTEND_URL + /vnpay_return                |
| VNP_MOBILE_RETURN_URL | Mobile deep link landing                                        | glowscan://vnpay-return                     |

## Local Testing

- Start infra with `docker compose up -d`; run the API on the host with `npm run start:dev`.
- Seed data includes a PENDING order to test against.
- The IPN is a server-to-server call from VNPay, so it needs a publicly reachable URL — use a tunnel like ngrok in development and register that URL (plus path `/payments/vnpay/ipn`) in the VNPay merchant portal.
- Pay with a VNPay sandbox test card (e.g., NCB bank test card from VNPay's sandbox docs).

## Production Notes

In production the app mounts a global `/api` prefix, so `VNP_RETURN_URL` and the IPN URL registered in the portal must include `/api` (e.g., `https://host/api/payments/vnpay/return`).
