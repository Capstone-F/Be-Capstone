# Admin Finance Integration Guide

Transaction-level money oversight for the platform admin: the full ledger, the
per-clinic money position, and the paginated activity log. All endpoints
require role `app_admin` (session cookie or Bearer token), follow the shared
pagination convention (`page` default 1, `limit` default 20 / max 100,
response `{ items, total, page, limit }`), and sort **newest first**
(`createdAt DESC`) unless stated otherwise.

Amounts are integer VND. Because the underlying columns are `bigint`, ledger
and balance endpoints return them as **strings** (e.g. `"45000"`), same as
`/admin/clinic-withdrawals`. Date filters `from` / `to` accept `YYYY-MM-DD`
and are interpreted as calendar days in `Asia/Ho_Chi_Minh`: `from` starts at
00:00:00.000 and `to` ends at 23:59:59.999 local time.

## 1. Platform ledger

```http
GET /admin/transactions
```

The clinic statement (`GET /clinic/transactions`) without the single-clinic
scope. Every filter is optional:

| Param                           | Type              | Notes                                     |
| ------------------------------- | ----------------- | ----------------------------------------- |
| `search`                        | string            | Matches `note`, `externalRef`, or the ID  |
| `type`                          | TransactionType   | See enum below                            |
| `status`                        | TransactionStatus | `PENDING` `COMPLETED` `FAILED` `REFUNDED` |
| `clinicId`                      | uuid              | One clinic                                |
| `userId`                        | uuid              | Related customer                          |
| `expertId`                      | uuid              |                                           |
| `orderId`                       | uuid              |                                           |
| `from` / `to`                   | YYYY-MM-DD        | On `createdAt`, VN timezone               |
| `minAmountVnd` / `maxAmountVnd` | number            | Inclusive bounds                          |
| `page` / `limit`                | number            | Default 1 / 20, limit max 100             |

Each item carries the ledger row plus `clinicName` and `userName` joined
server-side (`null` when the FK is null; `userName` falls back to the user's
email when they have no display name):

```json
{
  "id": "uuid",
  "type": "COMMISSION",
  "status": "COMPLETED",
  "amountVnd": "45000",
  "fromAccount": "PLATFORM_ESCROW",
  "toAccount": "PLATFORM_REVENUE",
  "clinicId": "uuid | null",
  "clinicName": "Phòng khám Quận 1 | null",
  "userId": "uuid | null",
  "userName": "Nguyễn Văn A | null",
  "orderId": "uuid | null",
  "consultationId": "uuid | null",
  "treatmentId": "uuid | null",
  "treatmentPhaseId": "uuid | null",
  "escrowHoldId": "uuid | null",
  "withdrawalId": "uuid | null",
  "expertId": "uuid | null",
  "externalRef": "string | null",
  "note": "string | null",
  "createdAt": "2026-08-16T03:12:44.000Z"
}
```

`TransactionType` (complete enum): `PRODUCT_PURCHASE`,
`CONSULTATION_PAYMENT`, `TREATMENT_PLAN_PAYMENT`, `WALLET_TOPUP`, `REFUND`,
`WITHDRAWAL`, `WITHDRAWAL_REVERSAL`, `ESCROW_RELEASE`, `COMMISSION`.

`REFUND` rows are discriminated by which FK is set: `orderId` (product),
`consultationId` (booking), `treatmentId` (treatment plan).

### CSV export

```http
GET /admin/transactions/export
```

Same filters; `page` / `limit` are ignored. Returns
`Content-Type: text/csv; charset=utf-8` with a UTF-8 BOM, up to 10,000 rows
**oldest first**, including the joined clinic/user names.

## 2. Per-clinic balances

```http
GET /admin/clinics/balances
```

Optional `clinicId` (uuid) and `search` (clinic name, case-insensitive), plus
pagination. Sorted by clinic name. One row per clinic, matching what that
clinic's manager sees on `GET /clinic/wallet`:

```json
{
  "clinicId": "uuid",
  "clinicName": "Phòng khám Quận 1",
  "balanceVnd": "12500000",
  "heldEscrowVnd": "3200000",
  "pendingWithdrawalsVnd": "5000000",
  "commissionEarnedVnd": "1450000",
  "lastPayoutAt": "2026-08-10T04:00:00.000Z"
}
```

- `balanceVnd` — available (withdrawable) wallet balance.
- `heldEscrowVnd` — escrow holds with status `HELD`.
- `pendingWithdrawalsVnd` — withdrawal requests with status `REQUESTED`
  (already debited from the available balance, awaiting admin review).
- `commissionEarnedVnd` — all-time completed `COMMISSION` transactions to
  `PLATFORM_REVENUE` from this clinic.
- `lastPayoutAt` — `processedAt` of the most recent `PAID` withdrawal, or
  `null`.

## 3. Activity log

```http
GET /admin/activity
```

The admin dashboard's `recentActivity` feed without the 10-row cap. Amounts
here are plain numbers (same shape as the dashboard feed). Filters:

| Param            | Type       | Notes                                           |
| ---------------- | ---------- | ----------------------------------------------- |
| `type`           | string[]   | Repeatable: `?type=REFUND&type=WITHDRAWAL_PAID` |
| `from` / `to`    | YYYY-MM-DD | On `occurredAt`, VN timezone                    |
| `actorId`        | uuid       | The acting user                                 |
| `page` / `limit` | number     | Default 1 / 20, limit max 100                   |

Activity types: `USER_CREATED`, `PRODUCT_PAYMENT`, `CONSULTATION_PAYMENT`,
`TREATMENT_PLAN_PAYMENT`, `REFUND`, `ORDER_CANCELLATION`, `STOCK_IMPORT`,
`WITHDRAWAL_REQUESTED`, `WITHDRAWAL_PAID`, `WITHDRAWAL_REJECTED`.

```json
{
  "id": "uuid",
  "type": "WITHDRAWAL_PAID",
  "title": "Duyệt rút tiền phòng khám",
  "description": "Phòng khám Quận 1",
  "amountVnd": 5000000,
  "actorId": "uuid | null",
  "actorName": "Admin Trung | null",
  "entityId": "uuid | null",
  "occurredAt": "2026-08-16T03:12:44.000Z"
}
```

`actorId` / `actorName` attribute the event to the user who performed it
(requester for withdrawals requests and cancellations, the processing admin
for withdrawal decisions, the paying customer for payments). `entityId` is
the ID of the source record for deep links: the withdrawal, cancellation,
stock form, or transaction; for `PRODUCT_PAYMENT` it is the **order** ID.

## Default sort confirmation

`GET /admin/clinic-withdrawals` and `GET /admin/order-cancellations` both
sort `createdAt DESC` (newest first) by default — the assumption the FE
phase-1 stitching makes is correct.
