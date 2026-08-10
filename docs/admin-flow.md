# Admin Integration Guide

End-to-end guide for integrating **App Admin** (`app_admin`) features with this backend: auth, user/RBAC management, expert onboarding, catalog & stock, survey question bank, commerce settings, wallet credit, and QA customer cheats.

**Auth (login):** do not duplicate here — use:

- [Web Authentication Guide](auth-web.md) — session cookie (`sid`) for SPAs
- [Mobile Authentication Guide](auth-mobile.md) — Bearer tokens for Expo / React Native

See also:

- [Staff Flow Guide](staff-flow.md) — approval-based stock import forms (`staff` / `app_admin`)
- [Clinic Manager Flow Guide](clinic-manager-flow.md) — clinic-scoped expert onboarding, fees, availability
- [User Management & RBAC](users.md) — roles, clinic scoping, user model
- [E-Commerce Integration Guide](ecommerce-flow.md) — customer purchase path; admin owns catalog + combo settings
- [Survey Flow Guide](survey-flow.md) — customer survey path; admin owns question bank + QA cheats
- [Consultation Flow](consultation-flow.md) — booking / wallet; admin owns wallet top-up + expert setup
- [Image Uploads](uploads.md) — R2 upload then attach URL to products / experts

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
3. [Prerequisites](#3-prerequisites)
4. [Flow A — Login as App Admin](#4-flow-a--login-as-app-admin)
5. [Flow B — Manage users & roles](#5-flow-b--manage-users--roles)
6. [Flow C — Onboard an expert (account → profile → fee → availability)](#6-flow-c--onboard-an-expert-account--profile--fee--availability)
7. [Flow D — Product catalog & stock](#7-flow-d--product-catalog--stock)
8. [Flow E — Survey question bank](#8-flow-e--survey-question-bank)
9. [Flow F — Commerce settings (survey combo discount)](#9-flow-f--commerce-settings-survey-combo-discount)
10. [Flow G — Wallet inspect & top-up](#10-flow-g--wallet-inspect--top-up)
11. [Flow H — Customer QA cheats (profile / survey)](#11-flow-h--customer-qa-cheats-profile--survey)
12. [Flow I — Maintain experts (update / fee / availability)](#12-flow-i--maintain-experts-update--fee--availability)
13. [Flow J — Manage clinics](#13-flow-j--manage-clinics)
14. [Endpoint checklist](#14-endpoint-checklist)
15. [Remaining gaps](#15-remaining-gaps)

---

## 1. Flow overview

```
┌─────────────┐
│ Login as    │
│ app_admin   │
└──────┬──────┘
       │
       ├──────────────────────────────────────────────────────────┐
       │                                                          │
       ▼                                                          ▼
┌──────────────────┐                                    ┌─────────────────────┐
│ Users & RBAC     │                                    │ Wallet credit (QA)  │
│ list / create /  │                                    │ GET + top-up        │
│ roles / status   │                                    └─────────────────────┘
└────────┬─────────┘
         │ (expert accounts)
         ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Expert profile   │────▶│ Consultation fee │────▶│ Availability     │
│ POST /experts    │     │ PUT fee          │     │ CRUD blocks      │
└──────────────────┘     └──────────────────┘     └──────────────────┘

┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Product onboard  │────▶│ Variant image    │────▶│ Stock batch      │
│ POST /products   │     │ PATCH + upload   │     │ import / adjust  │
└──────────────────┘     └──────────────────┘     └──────────────────┘

┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Survey questions │     │ Combo discount   │     │ Customer cheats  │
│ CRUD bank        │     │ GET / PATCH      │     │ profile / survey │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

**What Admin can do (summary):**

| Area        | Capability                                                                     |
| ----------- | ------------------------------------------------------------------------------ |
| Users       | List/search, create staff/expert/clinic_manager, replace roles, enable/disable |
| Clinics     | Create / update / soft-deactivate partner clinics                              |
| Experts     | Create/update clinic-bound profiles, set fee, manage weekly availability       |
| Catalog     | Onboard products (+ ingredients), set variant images                           |
| Stock       | Import batches, adjust remaining quantity (auth only; RBAC planned)            |
| Survey      | Full question-bank CRUD; soft-deactivate                                       |
| Commerce    | Read/update survey combo discount % and min subtotal                           |
| Wallet      | Read any user’s balance; direct ledger credit (no payment gateway)             |
| Customer QA | Force-update profile/allergies; replace survey answers + re-derive skin type   |

Clinics are managed via **`/admin/clinics`** (create / update / soft-deactivate). Public discovery still uses `GET /clinics` (active only).

---

## 2. Base URL & auth

| Environment | Path prefix | Example                             |
| ----------- | ----------- | ----------------------------------- |
| Development | none        | `http://localhost:3000/admin/users` |
| Production  | `/api`      | `https://host/api/admin/users`      |

**Calling protected routes:**

| Client  | Auth mechanism                                                                   |
| ------- | -------------------------------------------------------------------------------- |
| Web SPA | Session cookie `sid` (`credentials: 'include'`) — see [auth-web.md](auth-web.md) |
| Mobile  | `Authorization: Bearer <accessToken>` — see [auth-mobile.md](auth-mobile.md)     |

All admin flows require an authenticated **`app_admin`** session (or Bearer with that realm role). Shared staff endpoints (`POST /products`, stock) also accept `staff` where noted.

| Actor     | Role        | Notes                                       |
| --------- | ----------- | ------------------------------------------- |
| App Admin | `app_admin` | Full admin surface in this document         |
| Staff     | `staff`     | Catalog onboarding only (shared with admin) |

---

## 3. Prerequisites

| Requirement      | How to get it                                                   | Status   |
| ---------------- | --------------------------------------------------------------- | -------- |
| Running API + DB | `docker compose up -d` + `npm run start:dev`                    | ✅ Ready |
| Migrations       | `npm run migration:run`                                         | ✅ Ready |
| Seeded clinics   | `npm run seed` → resolve IDs via `GET /clinics`                 | ✅ Ready |
| Bootstrap admin  | Username `glowscan-admin` / password `admin` (dev Keycloak)     | ✅ Ready |
| R2 (optional)    | Env vars in [uploads.md](uploads.md); else use placeholder URLs | ✅ Ready |

---

## 4. Flow A — Login as App Admin

Same auth stack as any user; the seed admin has realm role `app_admin`.

**Sequence:**

1. Start login → Keycloak → callback (web) **or** mobile token exchange.
2. Confirm roles include `app_admin`.

```http
GET /users/me
```

Example (abbreviated):

```json
{
  "id": "<admin-user-uuid>",
  "email": "glowscan-admin@...",
  "roles": ["app_admin"],
  "clinicId": null,
  "isActive": true
}
```

If `roles` does not include `app_admin`, admin routes return **403**.

Web: [auth-web.md](auth-web.md) §3–5. Mobile: [auth-mobile.md](auth-mobile.md).

---

## 5. Flow B — Manage users & roles

### 5.1 List / search users ✅ Ready

| Method | Path           | Roles                            | Status   |
| ------ | -------------- | -------------------------------- | -------- |
| GET    | `/users`       | app_admin, staff, clinic_manager | ✅ Ready |
| GET    | `/admin/users` | app_admin                        | ✅ Ready |
| GET    | `/users/:id`   | app_admin, staff, clinic_manager | ✅ Ready |

`GET /admin/users` is equivalent to `GET /users` for `app_admin` (handy when building admin-only tools, e.g. pick `userId` for wallet top-up).

**Query params** (`GET /users` and `GET /admin/users`):

| Param      | Description                                              |
| ---------- | -------------------------------------------------------- |
| `q`        | Search email or name                                     |
| `role`     | Filter by application role                               |
| `clinicId` | Filter by clinic (admin/staff; managers are auto-scoped) |
| `page`     | Page number (default 1)                                  |
| `limit`    | Page size (default 20, max 100)                          |

```http
GET /admin/users?role=expert&clinicId=<clinic-uuid>&page=1&limit=20
```

```http
GET /users/<userId>
```

**Sequence (admin console user picker):**

1. `GET /admin/users?q=...` → pick `id`
2. Optional: `GET /users/:id` for detail

---

### 5.2 Create a managed account ✅ Ready

| Method | Path     | Roles                     | Status   |
| ------ | -------- | ------------------------- | -------- |
| POST   | `/users` | app_admin, clinic_manager | ✅ Ready |

`app_admin` may create: `staff`, `expert`, `clinic_manager`.  
`clinicId` is **required** for `expert` and `clinic_manager`.

```http
POST /users
Content-Type: application/json

{
  "email": "expert@clinic.example.com",
  "name": "Jane Expert",
  "role": "expert",
  "clinicId": "<clinic-uuid>",
  "temporaryPassword": "TempPass123!"
}
```

Creates the user in Keycloak (`UPDATE_PASSWORD` + `VERIFY_EMAIL`), assigns the realm role, and stores a local `users` row. Response includes local `id` — keep it for **Flow C** (`POST /experts`).

Creating `role: expert` creates the **account only**. Consultation profile is a separate step (`POST /experts`).

---

### 5.3 Replace roles ✅ Ready

| Method | Path               | Roles     | Status   |
| ------ | ------------------ | --------- | -------- |
| PATCH  | `/users/:id/roles` | app_admin | ✅ Ready |

```http
PATCH /users/<userId>/roles
Content-Type: application/json

{
  "roles": ["staff"]
}
```

Replaces **all** application roles in Keycloak and the local DB.

---

### 5.4 Enable / disable account ✅ Ready

| Method | Path                | Roles     | Status   |
| ------ | ------------------- | --------- | -------- |
| PATCH  | `/users/:id/status` | app_admin | ✅ Ready |

```http
PATCH /users/<userId>/status
Content-Type: application/json

{
  "isActive": false
}
```

Disables the account in Keycloak and sets `isActive` locally.

**Typical admin user-management sequence:**

```
GET /admin/users?q=...
  → GET /users/:id
  → POST /users                    (create)
  → PATCH /users/:id/roles         (optional re-role)
  → PATCH /users/:id/status        (suspend / restore)
```

---

## 6. Flow C — Onboard an expert (account → profile → fee → availability)

End-to-end setup so an expert appears in discovery and accepts bookings.

**Prerequisites:** at least one active clinic (`GET /clinics` or create via `POST /admin/clinics`).

**Full sequence:**

```
1. GET  /clinics
2. POST /users                          { role: "expert", clinicId }
3. POST /experts                        { userId, clinicId, specialization, ... }
4. PUT  /experts/:id/consultation-fee   { consultationFee }   (optional if set on create)
5. POST /experts/:expertId/availability (repeat for weekly blocks)
6. POST /uploads/images                 (optional)
7. PATCH /experts/:id                   { avatarUrl }         (optional)
```

### 6.1 Resolve clinic ✅ Ready

```http
GET /clinics?page=1&limit=20
```

```http
GET /clinics/<clinicId>
```

Store `clinic.id` for user create + expert create.

---

### 6.2 Create expert Keycloak/local account ✅ Ready

See [§5.2](#52-create-a-managed-account--ready). Capture response `id` as `userId`.

---

### 6.3 Create clinic-bound expert profile ✅ Ready

| Method | Path       | Roles                     | Status   |
| ------ | ---------- | ------------------------- | -------- |
| POST   | `/experts` | app_admin, clinic_manager | ✅ Ready |

```http
POST /experts
Content-Type: application/json

{
  "userId": "<user-uuid-from-POST-/users>",
  "clinicId": "<clinic-uuid>",
  "specialization": "DERMATOLOGY",
  "licenseNumber": "LIC-12345",
  "bio": "Board-certified dermatologist",
  "consultationFee": 400000,
  "sessionLengthHours": 1,
  "isActive": true
}
```

**Specialty enum:** `DERMATOLOGY` | `COSMETIC_DERMATOLOGY` | `ACNE_TREATMENT` | `ANTI_AGING` | `PIGMENTATION` | `LASER_THERAPY` | `AESTHETIC_MEDICINE`.

`clinicId` is required. Duplicate profile for the same user → **409**. Response `id` is the **expertId** used in availability and booking APIs.

---

### 6.4 Set / update consultation fee ✅ Ready

| Method | Path                            | Roles                             | Status   |
| ------ | ------------------------------- | --------------------------------- | -------- |
| PUT    | `/experts/:id/consultation-fee` | expert, clinic_manager, app_admin | ✅ Ready |

```http
PUT /experts/<expertId>/consultation-fee
Content-Type: application/json

{
  "consultationFee": 450000
}
```

---

### 6.5 Weekly availability blocks ✅ Ready

| Method | Path                                  | Roles                             | Status   |
| ------ | ------------------------------------- | --------------------------------- | -------- |
| GET    | `/experts/:expertId/availability`     | expert, clinic_manager, app_admin | ✅ Ready |
| POST   | `/experts/:expertId/availability`     | expert, clinic_manager, app_admin | ✅ Ready |
| PATCH  | `/experts/:expertId/availability/:id` | same                              | ✅ Ready |
| DELETE | `/experts/:expertId/availability/:id` | same                              | ✅ Ready |

```http
POST /experts/<expertId>/availability
Content-Type: application/json

{
  "dayOfWeek": 1,
  "startHour": 9,
  "endHour": 12
}
```

| Field       | Rules                                         |
| ----------- | --------------------------------------------- |
| `dayOfWeek` | `0` = Sunday … `6` = Saturday (Vietnam local) |
| `startHour` | Inclusive, GMT+7, business window **09–20**   |
| `endHour`   | Exclusive, must be `> startHour`, max `20`    |
| Overlaps    | Rejected with **409** on the same day         |

Repeat for each weekly window (e.g. Mon–Fri morning + afternoon). Seeded experts use `09–12` and `13–18` on days 1–5.

---

### 6.6 Optional avatar ✅ Ready

```http
POST /uploads/images
Content-Type: multipart/form-data

file: <image>
```

```http
PATCH /experts/<expertId>
Content-Type: application/json

{
  "avatarUrl": "https://..."
}
```

Without R2, send a placeholder URL such as `https://placehold.co/400`. Details: [uploads.md](uploads.md).

---

## 7. Flow D — Product catalog & stock

Shared with **`staff`**. Not part of the customer purchase flow — see [ecommerce-flow.md](ecommerce-flow.md) for catalog browse → cart → order.

### 7.1 Onboard a product ✅ Ready

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

Missing ingredients are **auto-created** inside the onboarding transaction. Response includes `variants[]` — store `variants[0].id` as `productVariantId` for stock and cart.

**Helper (public):** `GET /ingredients` lists active ingredients; `GET /products/categories` lists categories for filters / onboarding UX.

---

### 7.2 Update variant image ✅ Ready

| Method | Path                            | Roles            | Status   |
| ------ | ------------------------------- | ---------------- | -------- |
| PATCH  | `/products/variants/:variantId` | app_admin, staff | ✅ Ready |

**Sequence:**

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

### 7.3 Import stock batch ✅ Ready

| Method | Path             | Auth          | Status   |
| ------ | ---------------- | ------------- | -------- |
| POST   | `/stock/batches` | Authenticated | ✅ Ready |

> **Note:** Stock endpoints currently require authentication only; dedicated `app_admin` / `staff` RBAC is planned (🔶 Extend).
>
> For an approval-based import (draft → submit → confirm), see [staff-flow.md](staff-flow.md).

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

Expiration is computed from the variant shelf life.

---

### 7.4 Adjust batch quantity ✅ Ready

| Method | Path                        | Auth          | Status   |
| ------ | --------------------------- | ------------- | -------- |
| POST   | `/stock/batches/:id/adjust` | Authenticated | ✅ Ready |

Sets the **absolute** remaining quantity and records an `ADJUSTMENT` movement.

```http
POST /stock/batches/<batchId>/adjust
Content-Type: application/json

{
  "quantity": 50,
  "note": "Physical inventory count correction"
}
```

**Catalog + stock sequence:**

```
POST /products
  → (optional) POST /uploads/images → PATCH /products/variants/:variantId
  → POST /stock/batches
  → (optional) POST /stock/batches/:id/adjust
  → verify with GET /products/:id
```

---

## 8. Flow E — Survey question bank

Admin CRUD for the dynamic question bank used by `GET /surveys/questions`. Customer survey session APIs stay unchanged — see [survey-flow.md](survey-flow.md).

| Method | Path                                  | Roles     | Status   |
| ------ | ------------------------------------- | --------- | -------- |
| GET    | `/admin/survey-questions`             | app_admin | ✅ Ready |
| GET    | `/admin/survey-questions/:id`         | app_admin | ✅ Ready |
| POST   | `/admin/survey-questions`             | app_admin | ✅ Ready |
| PATCH  | `/admin/survey-questions/:id`         | app_admin | ✅ Ready |
| PUT    | `/admin/survey-questions/:id/options` | app_admin | ✅ Ready |
| DELETE | `/admin/survey-questions/:id`         | app_admin | ✅ Ready |

`DELETE` **soft-deactivates** (`isActive: false`); it does not hard-delete.

Query: `GET /admin/survey-questions?activeOnly=true`.

### 8.1 List / get ✅ Ready

```http
GET /admin/survey-questions?activeOnly=true
```

```http
GET /admin/survey-questions/<questionId>
```

---

### 8.2 Create question + options ✅ Ready

```http
POST /admin/survey-questions
Content-Type: application/json

{
  "code": "PRIMARY_CONCERN",
  "text": "What is your main skin concern?",
  "questionType": "MULTI_SELECT",
  "displayOrder": 10,
  "priority": "CORE",
  "category": "CONCERN",
  "intent": "Drive protocol matching",
  "isActive": true,
  "askWhen": {
    "match": "any",
    "anyLabelCodes": ["ACNE"]
  },
  "options": [
    { "labelCode": "ACNE", "displayOrder": 0 },
    { "labelCode": "BLACKHEADS", "displayOrder": 1 }
  ]
}
```

| Field      | Notes                                                                 |
| ---------- | --------------------------------------------------------------------- |
| `priority` | `CORE` \| `CONDITIONAL` \| `OPTIONAL`                                 |
| `askWhen`  | Branching for CONDITIONAL/OPTIONAL (`anyLabelCodes`, age gates, etc.) |
| `options`  | At least one; `labelCode` must match rule-engine / seed conventions   |

---

### 8.3 Update metadata / replace options / deactivate ✅ Ready

```http
PATCH /admin/survey-questions/<questionId>
Content-Type: application/json

{
  "text": "Updated question text",
  "displayOrder": 12,
  "isActive": true
}
```

```http
PUT /admin/survey-questions/<questionId>/options
Content-Type: application/json

{
  "options": [
    { "labelCode": "ACNE", "displayOrder": 0 },
    { "labelCode": "DRYNESS", "displayOrder": 1 }
  ]
}
```

```http
DELETE /admin/survey-questions/<questionId>
```

**Question-bank sequence:**

```
GET /admin/survey-questions
  → POST /admin/survey-questions
  → PATCH /admin/survey-questions/:id
  → PUT /admin/survey-questions/:id/options
  → DELETE /admin/survey-questions/:id   (soft deactivate)
  → verify customer path: GET /surveys/questions
```

---

## 9. Flow F — Commerce settings (survey combo discount)

Controls the discount applied when a **SURVEY** order subtotal meets the minimum. Used by order create (customer path in [survey-flow.md](survey-flow.md) / [ecommerce-flow.md](ecommerce-flow.md)).

| Method | Path                                             | Roles     | Status   |
| ------ | ------------------------------------------------ | --------- | -------- |
| GET    | `/admin/commerce-settings/survey-combo-discount` | app_admin | ✅ Ready |
| PATCH  | `/admin/commerce-settings/survey-combo-discount` | app_admin | ✅ Ready |

**Sequence:**

```
GET /admin/commerce-settings/survey-combo-discount
  → PATCH /admin/commerce-settings/survey-combo-discount
```

```http
GET /admin/commerce-settings/survey-combo-discount
```

```json
{
  "percent": 10,
  "minSubtotalVnd": 300000
}
```

```http
PATCH /admin/commerce-settings/survey-combo-discount
Content-Type: application/json

{
  "percent": 15,
  "minSubtotalVnd": 300000
}
```

Both fields optional on PATCH; `percent` is `0–100`, `minSubtotalVnd` ≥ `0`.

---

## 10. Flow G — Wallet inspect & top-up

Direct ledger credit for demos / support — **does not** go through VNPay or `POST /wallet/top-up` (customer gateway). Used heavily when testing [consultation-flow.md](consultation-flow.md) and [treatment-plan-flow.md](treatment-plan-flow.md).

| Method | Path                            | Roles     | Status   |
| ------ | ------------------------------- | --------- | -------- |
| GET    | `/admin/wallets/:userId`        | app_admin | ✅ Ready |
| POST   | `/admin/wallets/:userId/top-up` | app_admin | ✅ Ready |

**Sequence:**

```
GET /admin/users?q=...          → pick customer userId
GET /admin/wallets/:userId      → current balance (creates zero wallet if missing)
POST /admin/wallets/:userId/top-up
```

```http
GET /admin/wallets/<userId>
```

```http
POST /admin/wallets/<userId>/top-up
Content-Type: application/json

{
  "amountVnd": 500000,
  "note": "Support credit for testing"
}
```

| Rule         | Detail         |
| ------------ | -------------- |
| Min amount   | `1000` VND     |
| Ledger type  | `WALLET_TOPUP` |
| User missing | **404**        |

Example response:

```json
{
  "walletId": "...",
  "userId": "...",
  "balanceVnd": "500000",
  "transactionId": "...",
  "amountVnd": "500000",
  "note": "Support credit for testing"
}
```

---

## 11. Flow H — Customer QA cheats (profile / survey)

Dev / demo shortcuts. Require `app_admin`. After survey cheat, call `GET /recommendations/latest` **as that customer** to rebuild a recommendation snapshot.

| Method | Path                           | Roles     | Status   |
| ------ | ------------------------------ | --------- | -------- |
| PATCH  | `/admin/customers/:id/profile` | app_admin | ✅ Ready |
| PATCH  | `/admin/customers/:id/survey`  | app_admin | ✅ Ready |

`:id` is the **customer** id (not always equal to `userId` — resolve via your user/customer tooling or known seed ids).

### 11.1 Update profile / allergies ✅ Ready

```http
PATCH /admin/customers/<customerId>/profile
Content-Type: application/json

{
  "fullName": "Demo Customer",
  "phone": "+84901234567",
  "age": 28,
  "allergyCodes": ["FRAGRANCE"]
}
```

All fields optional. Setting `allergyCodes` replaces the allergy set and clears recommendation snapshots so the next recommendation run re-filters products.

---

### 11.2 Replace survey answers ✅ Ready

```http
PATCH /admin/customers/<customerId>/survey
Content-Type: application/json

{
  "answers": [
    {
      "questionCode": "PRIMARY_CONCERN",
      "labelCodes": ["ACNE", "BLACKHEADS"]
    },
    {
      "questionCode": "SKIN_GOALS",
      "labelCodes": ["ACNE_TREATMENT"]
    }
  ]
}
```

Replaces answers by `questionCode` + `labelCodes`, re-derives skin type, and deletes existing recommendations for that survey. Label codes must be valid options for each question.

**QA sequence:**

```
PATCH /admin/customers/:id/profile
  → PATCH /admin/customers/:id/survey
  → (as customer) GET /recommendations/latest
```

---

## 12. Flow I — Maintain experts (update / fee / availability)

Day-2 operations after [Flow C](#6-flow-c--onboard-an-expert-account--profile--fee--availability).

| Method | Path                               | Roles                             | Status   |
| ------ | ---------------------------------- | --------------------------------- | -------- |
| GET    | `/experts` / `/experts/:id`        | Authenticated / public list       | ✅ Ready |
| PATCH  | `/experts/:id`                     | app_admin, clinic_manager         | ✅ Ready |
| PUT    | `/experts/:id/consultation-fee`    | expert, clinic_manager, app_admin | ✅ Ready |
| \*     | `/experts/:expertId/availability…` | expert, clinic_manager, app_admin | ✅ Ready |

```http
PATCH /experts/<expertId>
Content-Type: application/json

{
  "specialization": "ACNE_TREATMENT",
  "bio": "Updated bio",
  "sessionLengthHours": 2,
  "isActive": true,
  "clinicId": "<clinic-uuid>"
}
```

`clinicId` cannot be cleared (activation requires a clinic). `clinic_manager` callers are scoped to their own clinic.

**Maintain sequence:**

```
GET /experts?clinicId=...
  → PATCH /experts/:id
  → PUT /experts/:id/consultation-fee
  → GET/POST/PATCH/DELETE /experts/:expertId/availability
```

> **Bookings:** `POST /bookings` allows `app_admin`, but the booking is created for the **caller’s** customer profile (admin user), not an arbitrary customer. Prefer customer-role sessions for real booking tests — see [consultation-flow.md](consultation-flow.md).

---

## 13. Flow J — Manage clinics

Partner clinics for expert binding and discovery. Public `GET /clinics` still returns **active only**; admin list includes inactive by default.

| Method | Path                 | Roles     | Status   |
| ------ | -------------------- | --------- | -------- |
| GET    | `/admin/clinics`     | app_admin | ✅ Ready |
| GET    | `/admin/clinics/:id` | app_admin | ✅ Ready |
| POST   | `/admin/clinics`     | app_admin | ✅ Ready |
| PATCH  | `/admin/clinics/:id` | app_admin | ✅ Ready |
| DELETE | `/admin/clinics/:id` | app_admin | ✅ Ready |

`DELETE` **soft-deactivates** (`isActive: false`). Hard delete is not supported while experts reference the clinic (`ON DELETE RESTRICT`). Reactivate with `PATCH` `{ "isActive": true }`.

**Query params** (`GET /admin/clinics`):

| Param        | Description                     |
| ------------ | ------------------------------- |
| `q`          | Case-insensitive name contains  |
| `activeOnly` | `true` to hide inactive clinics |
| `page`       | Page number (default 1)         |
| `limit`      | Page size (default 20, max 100) |

**Sequence:**

```
GET /admin/clinics?q=...
  → POST /admin/clinics
  → PATCH /admin/clinics/:id
  → DELETE /admin/clinics/:id          (soft deactivate)
  → PATCH /admin/clinics/:id { isActive: true }   (optional reactivate)
  → verify public: GET /clinics (active only)
```

```http
POST /admin/clinics
Content-Type: application/json

{
  "name": "GlowScan District 7 Clinic",
  "address": "12 Nguyen Hue, District 1, Ho Chi Minh City",
  "latitude": 10.7769,
  "longitude": 106.7009,
  "isActive": true
}
```

```http
PATCH /admin/clinics/<clinicId>
Content-Type: application/json

{
  "name": "GlowScan D7 Clinic",
  "address": null,
  "isActive": true
}
```

```http
DELETE /admin/clinics/<clinicId>
```

---

## 14. Endpoint checklist

### Auth & profile

| Method | Path        | Roles             | Status   |
| ------ | ----------- | ----------------- | -------- |
| GET    | `/users/me` | Any authenticated | ✅ Ready |
| PATCH  | `/users/me` | Any authenticated | ✅ Ready |

### Users & RBAC

| Method | Path                | Roles                            | Status   |
| ------ | ------------------- | -------------------------------- | -------- |
| GET    | `/users`            | app_admin, staff, clinic_manager | ✅ Ready |
| GET    | `/admin/users`      | app_admin                        | ✅ Ready |
| GET    | `/users/:id`        | app_admin, staff, clinic_manager | ✅ Ready |
| POST   | `/users`            | app_admin, clinic_manager        | ✅ Ready |
| PATCH  | `/users/:id/roles`  | app_admin                        | ✅ Ready |
| PATCH  | `/users/:id/status` | app_admin                        | ✅ Ready |

### Experts & clinics

| Method | Path                                  | Roles                             | Status   |
| ------ | ------------------------------------- | --------------------------------- | -------- |
| GET    | `/clinics`                            | Authenticated                     | ✅ Ready |
| GET    | `/clinics/:id`                        | Authenticated                     | ✅ Ready |
| GET    | `/admin/clinics`                      | app_admin                         | ✅ Ready |
| GET    | `/admin/clinics/:id`                  | app_admin                         | ✅ Ready |
| POST   | `/admin/clinics`                      | app_admin                         | ✅ Ready |
| PATCH  | `/admin/clinics/:id`                  | app_admin                         | ✅ Ready |
| DELETE | `/admin/clinics/:id`                  | app_admin                         | ✅ Ready |
| POST   | `/experts`                            | app_admin, clinic_manager         | ✅ Ready |
| PATCH  | `/experts/:id`                        | app_admin, clinic_manager         | ✅ Ready |
| PUT    | `/experts/:id/consultation-fee`       | expert, clinic_manager, app_admin | ✅ Ready |
| GET    | `/experts/:expertId/availability`     | expert, clinic_manager, app_admin | ✅ Ready |
| POST   | `/experts/:expertId/availability`     | expert, clinic_manager, app_admin | ✅ Ready |
| PATCH  | `/experts/:expertId/availability/:id` | expert, clinic_manager, app_admin | ✅ Ready |
| DELETE | `/experts/:expertId/availability/:id` | expert, clinic_manager, app_admin | ✅ Ready |

### Catalog & stock

| Method | Path                            | Roles / Auth     | Status   |
| ------ | ------------------------------- | ---------------- | -------- |
| POST   | `/products`                     | app_admin, staff | ✅ Ready |
| PATCH  | `/products/variants/:variantId` | app_admin, staff | ✅ Ready |
| GET    | `/products/categories`          | Public           | ✅ Ready |
| GET    | `/ingredients`                  | Public           | ✅ Ready |
| POST   | `/uploads/images`               | Authenticated    | ✅ Ready |
| POST   | `/stock/batches`                | Authenticated 🔶 | ✅ Ready |
| POST   | `/stock/batches/:id/adjust`     | Authenticated 🔶 | ✅ Ready |

### Survey admin

| Method | Path                                  | Roles     | Status   |
| ------ | ------------------------------------- | --------- | -------- |
| GET    | `/admin/survey-questions`             | app_admin | ✅ Ready |
| GET    | `/admin/survey-questions/:id`         | app_admin | ✅ Ready |
| POST   | `/admin/survey-questions`             | app_admin | ✅ Ready |
| PATCH  | `/admin/survey-questions/:id`         | app_admin | ✅ Ready |
| PUT    | `/admin/survey-questions/:id/options` | app_admin | ✅ Ready |
| DELETE | `/admin/survey-questions/:id`         | app_admin | ✅ Ready |
| PATCH  | `/admin/customers/:id/profile`        | app_admin | ✅ Ready |
| PATCH  | `/admin/customers/:id/survey`         | app_admin | ✅ Ready |

### Commerce & wallet

| Method | Path                                             | Roles     | Status   |
| ------ | ------------------------------------------------ | --------- | -------- |
| GET    | `/admin/commerce-settings/survey-combo-discount` | app_admin | ✅ Ready |
| PATCH  | `/admin/commerce-settings/survey-combo-discount` | app_admin | ✅ Ready |
| GET    | `/admin/wallets/:userId`                         | app_admin | ✅ Ready |
| POST   | `/admin/wallets/:userId/top-up`                  | app_admin | ✅ Ready |

---

## 15. Remaining gaps

| Gap                                | Status     | Notes                                                                 |
| ---------------------------------- | ---------- | --------------------------------------------------------------------- |
| Stock RBAC (`app_admin` / `staff`) | 🔶 Extend  | Endpoints are authenticated; admin role check still TODO              |
| Admin order / delivery console     | ❌ Missing | No admin list/retry GHN endpoint yet (see [shipping.md](shipping.md)) |
| Admin book-for-customer            | ❌ Missing | `POST /bookings` as admin books the admin’s own customer profile      |
| Staff vs admin product update      | 🔶 Extend  | Onboard + variant image only; no full product PATCH catalog editor    |

---

## Quick reference — happy-path sequences

**New clinic + expert ready to take bookings:**

```
Login (app_admin)
→ POST /admin/clinics
→ POST /users { role: expert, clinicId }
→ POST /experts { userId, clinicId, specialization, consultationFee, … }
→ POST /experts/:expertId/availability (× N weekly blocks)
→ optional avatar upload + PATCH /experts/:id
```

**New expert ready to take bookings:**

```
Login (app_admin)
→ GET /clinics   (or GET /admin/clinics)
→ POST /users { role: expert, clinicId }
→ POST /experts { userId, clinicId, specialization, consultationFee, … }
→ POST /experts/:expertId/availability (× N weekly blocks)
→ optional avatar upload + PATCH /experts/:id
```

**New SKU sellable:**

```
Login (app_admin | staff)
→ POST /products
→ optional POST /uploads/images → PATCH /products/variants/:variantId
→ POST /stock/batches
```

**Fund a customer for consultation testing:**

```
Login (app_admin)
→ GET /admin/users?q=...
→ POST /admin/wallets/:userId/top-up { amountVnd }
```

**Tune survey commerce:**

```
Login (app_admin)
→ GET /admin/commerce-settings/survey-combo-discount
→ PATCH /admin/commerce-settings/survey-combo-discount
→ manage questions via /admin/survey-questions
```
