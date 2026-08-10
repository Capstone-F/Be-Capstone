# Staff Integration Guide

End-to-end guide for **Staff** (`staff`) and **App Admin** (`app_admin`) stock import forms: create draft → update → submit → confirm (applies inventory), or cancel / reject.

**Auth (login):** do not duplicate here — use:

- [Web Authentication Guide](auth-web.md) — session cookie (`sid`) for SPAs
- [Mobile Authentication Guide](auth-mobile.md) — Bearer tokens for Expo / React Native

See also:

- [Admin Integration Guide](admin-flow.md) — catalog onboarding and direct `POST /stock/batches`
- [User Management & RBAC](users.md) — roles and permissions

---

## Status legend

| Marker   | Meaning                                  |
| -------- | ---------------------------------------- |
| ✅ Ready | Controller + service exist; usable today |

---

## Table of Contents

1. [Roles & auth](#1-roles--auth)
2. [Lifecycle](#2-lifecycle)
3. [Create draft](#3-create-draft)
4. [List / filter](#4-list--filter)
5. [Get one](#5-get-one)
6. [Update line fields](#6-update-line-fields)
7. [Submit](#7-submit)
8. [Confirm (apply stock)](#8-confirm-apply-stock)
9. [Cancel](#9-cancel)
10. [Reject](#10-reject)
11. [Endpoint checklist](#11-endpoint-checklist)

---

## 1. Roles & auth

All `/stock/import-forms` endpoints require:

- Authenticated session (cookie or Bearer)
- Role **`staff`** or **`app_admin`**

Same actor may create, submit, and confirm (no separation-of-duties rule).

Direct batch import (`POST /stock/batches`) remains available for immediate stock-in without a form — see [admin-flow.md](admin-flow.md) Flow D.

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
  "items": [
    /* StockImportFormResponseDto */
  ],
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

## 11. Endpoint checklist

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
