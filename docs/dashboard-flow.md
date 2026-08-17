# Dashboard Integration Guide

Operational dashboards expose authoritative aggregates rather than asking a
client to count a paginated list. All endpoints require the normal web session
cookie or Bearer token and accept `range=7d|30d|90d` (default `30d`).

Every response contains an inclusive `period` with `from`, `to`, and the fixed
`Asia/Ho_Chi_Minh` timezone. Trend arrays include zero-valued points for days
with no records. Invalid range values return `400`.

## Admin dashboard

```http
GET /admin/dashboard?range=30d
```

Role: `app_admin`. Returns platform KPIs, net product/consultation money,
attention counts, daily trends, and recent activity. Money includes completed
ledger transactions, subtracts linked refunds, and excludes wallet top-ups.

Treatment-plan money is reported separately from consultations:
`metrics.treatmentPaymentsCollectedVnd` (completed `TREATMENT_PLAN_PAYMENT`
transactions) and `metrics.treatmentRefundsVnd` (completed `REFUND`
transactions with a `treatmentId`). Both fields also appear on every
`trend[]` point, so platform inflow can be reconciled as product +
consultation + treatment payments minus their refunds.

The `recentActivity` feed is capped at 10 rows; for the full paginated,
filterable log use `GET /admin/activity` (see
[admin-finance-flow.md](./admin-finance-flow.md)).

## Expert dashboard

```http
GET /experts/me/dashboard?range=30d
```

Role: `expert`. The authenticated user is resolved to their own profile.
Returns today's appointments, requests waiting for confirmation, completed and
follow-up counts, net fees, ratings, daily trends, and five pending/upcoming
bookings. An expert account without a profile receives `404`.

## Staff dashboard

```http
GET /staff/dashboard?range=30d
```

Roles: `staff`, `app_admin`. Returns shared support/stock/return queues,
workflow failures, and daily support/stock trends. `myActiveSupport` is scoped
to the authenticated user. Queue previews contain at most five items and are
ordered oldest first.
