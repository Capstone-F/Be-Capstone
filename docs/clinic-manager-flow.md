# Clinic Manager Integration Guide

End-to-end guide for integrating **Clinic Manager** (`clinic_manager`) features with this backend: auth, clinic-scoped user directory, expert onboarding, expert profile maintenance, consultation fees, and weekly availability.

A clinic manager is a **single-clinic** operator. Every write is silently scoped to the manager's own `clinicId`; cross-clinic access returns **403**.

**Auth (login):** do not duplicate here — use:

- [Web Authentication Guide](auth-web.md) — session cookie (`sid`) for SPAs
- [Mobile Authentication Guide](auth-mobile.md) — Bearer tokens for Expo / React Native

See also:

- [Admin Integration Guide](admin-flow.md) — global surface; admin owns clinics, roles, wallet, catalog
- [Staff Flow Guide](staff-flow.md) — stock import forms and customer support chat (`staff` / `app_admin`)
- [User Management & RBAC](users.md) — roles, clinic scoping, user model
- [Consultation Flow](consultation-flow.md) — customer booking path that consumes the availability configured here
- [Image Uploads](uploads.md) — R2 upload then attach URL to expert avatars

---

## Status legend

| Marker     | Meaning                                            |
| ---------- | -------------------------------------------------- |
| ✅ Ready   | Controller + service exist; usable today           |
| ❌ Missing | Not implemented yet (schema/module may exist)      |
| 🔶 Extend  | Endpoint exists but needs more work for this actor |

---

## Table of Contents

1. [Flow overview](#1-flow-overview)
2. [Base URL & auth](#2-base-url--auth)
3. [Prerequisites](#3-prerequisites)
4. [Flow A — Login as Clinic Manager](#4-flow-a--login-as-clinic-manager)
5. [Flow B — Clinic user directory](#5-flow-b--clinic-user-directory)
6. [Flow C — Onboard an expert (account → profile → fee → availability)](#6-flow-c--onboard-an-expert-account--profile--fee--availability)
7. [Flow D — Maintain expert profiles](#7-flow-d--maintain-expert-profiles)
8. [Flow E — Consultation fees](#8-flow-e--consultation-fees)
9. [Flow F — Weekly availability](#9-flow-f--weekly-availability)
10. [Flow G — Verify the customer-facing result](#10-flow-g--verify-the-customer-facing-result)
11. [Scoping rules & error matrix](#11-scoping-rules--error-matrix)
12. [Endpoint checklist](#12-endpoint-checklist)
13. [Remaining gaps](#13-remaining-gaps)

---

## 1. Flow overview

```
┌──────────────────┐
│ Login as         │
│ clinic_manager   │
│ (clinicId bound) │
└────────┬─────────┘
         │
         ├───────────────────────────────┐
         ▼                               ▼
┌──────────────────┐            ┌─────────────────────┐
│ Clinic directory │            │ Clinic profile      │
│ GET /users       │            │ GET /clinics/:id    │
│ (auto-scoped)    │            │ (read-only)         │
└────────┬─────────┘            └─────────────────────┘
         │ (expert accounts)
         ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Expert account   │────▶│ Expert profile   │────▶│ Consultation fee │
│ POST /users      │     │ POST /experts    │     │ PUT fee          │
└──────────────────┘     └──────────────────┘     └────────┬─────────┘
                                                           │
                                                           ▼
                                                  ┌──────────────────┐
                                                  │ Availability     │
                                                  │ CRUD blocks      │
                                                  └────────┬─────────┘
                                                           │
                                                           ▼
                                                  ┌──────────────────┐
                                                  │ Bookable slots   │
                                                  │ GET /bookings/:id│
                                                  └──────────────────┘
```

**What Clinic Manager can do (summary):**

| Area         | Capability                                                               |
| ------------ | ------------------------------------------------------------------------ |
| Users        | List/search users **in own clinic**; create `expert` accounts only       |
| Experts      | Create / update clinic-bound expert profiles; activate / deactivate      |
| Fees         | Set consultation fee for any expert in own clinic                        |
| Availability | Full CRUD on weekly availability blocks for own-clinic experts           |
| Discovery    | Read clinics, experts, expert feedback, and bookable slots (shared read) |
| Uploads      | Upload images and attach them as expert avatars                          |

**What Clinic Manager cannot do:**

| Not allowed                                     | Owner                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| Create `staff` or `clinic_manager` accounts     | `app_admin` — [admin-flow.md §5.2](admin-flow.md#52-create-a-managed-account--ready) |
| Replace roles / disable accounts                | `app_admin` (`PATCH /users/:id/roles`, `/status`)                                    |
| Create, edit, or deactivate the clinic itself   | `app_admin` (`/admin/clinics`)                                                       |
| Move an expert to a different clinic            | `app_admin`                                                                          |
| Catalog, stock, wallet, survey bank, commerce   | `app_admin` / `staff`                                                                |
| Clinic-scoped booking list or revenue reporting | Not implemented — see [§13](#13-remaining-gaps)                                      |

---

## 2. Base URL & auth

| Environment | Path prefix | Example                         |
| ----------- | ----------- | ------------------------------- |
| Development | none        | `http://localhost:3000/experts` |
| Production  | `/api`      | `https://host/api/experts`      |

**Calling protected routes:**

| Client  | Auth mechanism                                                                   |
| ------- | -------------------------------------------------------------------------------- |
| Web SPA | Session cookie `sid` (`credentials: 'include'`) — see [auth-web.md](auth-web.md) |
| Mobile  | `Authorization: Bearer <accessToken>` — see [auth-mobile.md](auth-mobile.md)     |

All flows in this document require an authenticated **`clinic_manager`** session. Every endpoint listed here also accepts `app_admin` (global scope) and, where noted, `expert` (self scope).

| Actor          | Role             | Scope                                     |
| -------------- | ---------------- | ----------------------------------------- |
| Clinic Manager | `clinic_manager` | Own `clinicId` only                       |
| App Admin      | `app_admin`      | Global (bypasses every clinic check)      |
| Expert         | `expert`         | Own profile only (fee, avatar, own slots) |

### The `clinicId` binding

Authorization for this role depends on `clinicId`, which is resolved as follows:

1. `POST /users` (by admin) stores `clinicId` on the local `users` row.
2. At login the value is copied into the session / auth context (`session.clinicId`).
3. Guards and services compare `caller.clinicId` against the target row's `clinicId`.

> **Gotcha:** `clinicId` is a **snapshot taken at login**. If an admin re-binds a manager to another clinic, the manager must log out and log back in before the new scope takes effect.

A manager whose `clinicId` is `null` is effectively broken: writes fail with `Clinic manager is not bound to a clinic` (**403**).

---

## 3. Prerequisites

| Requirement           | How to get it                                                          | Status   |
| --------------------- | ---------------------------------------------------------------------- | -------- |
| Running API + DB      | `docker compose up -d` + `npm run start:dev`                           | ✅ Ready |
| Migrations            | `npm run migration:run`                                                | ✅ Ready |
| An active clinic      | Seeded (`npm run seed`) or admin `POST /admin/clinics`                 | ✅ Ready |
| A clinic_manager user | Seeded (`glowscan-clinic-manager-d1` / `-d3`, password `P@ssw0rd`)     | ✅ Ready |
|                       | or admin: `POST /users { role: "clinic_manager", clinicId }`           | ✅ Ready |
| R2 (optional)         | Env vars in [uploads.md](uploads.md); else use placeholder avatar URLs | ✅ Ready |

Creating the manager account itself is an **admin** action — see [admin-flow.md §5.2](admin-flow.md#52-create-a-managed-account--ready).

```http
POST /users
Content-Type: application/json

{
  "email": "manager@clinic.example.com",
  "name": "Mai Manager",
  "role": "clinic_manager",
  "clinicId": "<clinic-uuid>",
  "temporaryPassword": "TempPass123!"
}
```

---

## 4. Flow A — Login as Clinic Manager

Same auth stack as any user. After login, confirm both the role **and** the clinic binding before rendering the console.

**Sequence:**

1. Start login → Keycloak → callback (web) **or** mobile token exchange.
2. Confirm `roles` includes `clinic_manager` and `clinicId` is non-null.

```http
GET /users/me
```

Example (abbreviated):

```json
{
  "id": "<manager-user-uuid>",
  "email": "manager@clinic.example.com",
  "roles": ["clinic_manager"],
  "clinicId": "<clinic-uuid>",
  "isActive": true
}
```

Store `clinicId` in FE state — you need it as the request body value for `POST /experts`, and to pre-filter list screens.

```http
GET /clinics/<clinicId>
```

Use this to render the clinic header (name, address, geo). Details in [§10.3](#103-clinic-profile--ready).

If `roles` does not include `clinic_manager`, these routes return **403**. Web: [auth-web.md](auth-web.md) §3–5. Mobile: [auth-mobile.md](auth-mobile.md).

---

## 5. Flow B — Clinic user directory

### 5.1 List / search users ✅ Ready

| Method | Path         | Roles                            | Status   |
| ------ | ------------ | -------------------------------- | -------- |
| GET    | `/users`     | app_admin, staff, clinic_manager | ✅ Ready |
| GET    | `/users/:id` | app_admin, staff, clinic_manager | ✅ Ready |

Results are **automatically restricted** to the caller's clinic — a `clinicId` query param sent by a manager is ignored and replaced with their own.

**Query params:**

| Param      | Description                                                |
| ---------- | ---------------------------------------------------------- |
| `q`        | Search email or name                                       |
| `role`     | Filter by application role (`expert`, `clinic_manager`, …) |
| `clinicId` | **Ignored for managers** (auto-scoped); admin/staff only   |
| `page`     | Page number (default 1)                                    |
| `limit`    | Page size (default 20, max 100)                            |

```http
GET /users?role=expert&page=1&limit=20
```

This is the canonical way to list **expert accounts** in the clinic, including ones with no consultation profile yet and ones that are deactivated — `GET /experts` only returns active, bookable profiles.

```http
GET /users/<userId>
```

Requesting a user outside your clinic returns **403** `Clinic manager can only access users in their clinic`.

---

### 5.2 Create an expert account ✅ Ready

| Method | Path     | Roles                     | Status   |
| ------ | -------- | ------------------------- | -------- |
| POST   | `/users` | app_admin, clinic_manager | ✅ Ready |

A manager may create **`expert` only**. Any other role → **403** `Insufficient permissions to create this role`.

```http
POST /users
Content-Type: application/json

{
  "email": "expert@clinic.example.com",
  "name": "Jane Expert",
  "role": "expert",
  "temporaryPassword": "TempPass123!"
}
```

| Field               | Notes                                                                     |
| ------------------- | ------------------------------------------------------------------------- |
| `role`              | Must be `expert` for this actor                                           |
| `clinicId`          | **Overridden** with the caller's clinic — send it or omit it, same result |
| `temporaryPassword` | User must change it on first login (`UPDATE_PASSWORD` required action)    |

Creates the user in Keycloak (`UPDATE_PASSWORD` + `VERIFY_EMAIL`), assigns the realm role, and stores a local `users` row. Response includes local `id` — keep it as `userId` for [Flow C](#6-flow-c--onboard-an-expert-account--profile--fee--availability).

This creates the **account only**. The bookable consultation profile is a separate step (`POST /experts`).

---

## 6. Flow C — Onboard an expert (account → profile → fee → availability)

End-to-end setup so a new expert appears in discovery and accepts bookings at your clinic.

**Full sequence:**

```
1. GET  /users/me                        → capture clinicId
2. POST /users                           { role: "expert" }        → userId
3. POST /experts                          { userId, clinicId, specialization, ... }
4. PUT  /experts/:id/consultation-fee     { consultationFee }   (optional if set on create)
5. POST /experts/:expertId/availability   (repeat for weekly blocks)
6. POST /uploads/images                   (optional)
7. PATCH /experts/:id                     { avatarUrl }         (optional)
8. GET  /bookings/:expertId               → verify slots are open
```

### 6.1 Create the account ✅ Ready

See [§5.2](#52-create-an-expert-account--ready). Capture response `id` as `userId`.

---

### 6.2 Create the clinic-bound expert profile ✅ Ready

| Method | Path       | Roles                     | Status   |
| ------ | ---------- | ------------------------- | -------- |
| POST   | `/experts` | app_admin, clinic_manager | ✅ Ready |

```http
POST /experts
Content-Type: application/json

{
  "userId": "<user-uuid-from-POST-/users>",
  "clinicId": "<your-clinic-uuid>",
  "specialization": "DERMATOLOGY",
  "licenseNumber": "LIC-12345",
  "bio": "Board-certified dermatologist",
  "avatarUrl": "https://placehold.co/400",
  "consultationFee": 400000,
  "sessionLengthHours": 1,
  "isActive": true
}
```

**Specialty enum:** `DERMATOLOGY` | `COSMETIC_DERMATOLOGY` | `ACNE_TREATMENT` | `ANTI_AGING` | `PIGMENTATION` | `LASER_THERAPY` | `AESTHETIC_MEDICINE`.

| Rule                                     | Result                                                                |
| ---------------------------------------- | --------------------------------------------------------------------- |
| `clinicId` required                      | Must equal **your** clinic, else **403**                              |
| `userId` must already have role `expert` | Otherwise **400** `userId must belong to a user with the expert role` |
| Target user must be in your clinic       | Otherwise **403**                                                     |
| Duplicate profile for the same user      | **409**                                                               |
| `isActive: true` without a clinic        | **400** `clinicId is required to activate an expert`                  |
| Defaults                                 | `consultationFee: 0`, `sessionLengthHours: 1`, `isActive: true`       |

Creating the profile also writes `clinicId` back onto the expert's `users` row. Response `id` is the **expertId** used by availability, fee, and booking APIs — it is **not** the `userId`.

---

### 6.3 Optional avatar ✅ Ready

```http
POST /uploads/images
Content-Type: multipart/form-data

file: <image>
```

```http
PATCH /experts/<expertId>
Content-Type: application/json

{
  "avatarUrl": "https://pub-xxx.r2.dev/images/2026/08/uuid.jpg"
}
```

Without R2 configured, send a placeholder URL such as `https://placehold.co/400`. Details: [uploads.md](uploads.md).

---

## 7. Flow D — Maintain expert profiles

Day-2 operations for experts already bound to your clinic.

| Method | Path           | Roles                     | Status   |
| ------ | -------------- | ------------------------- | -------- |
| GET    | `/experts`     | Public                    | ✅ Ready |
| GET    | `/experts/:id` | Public                    | ✅ Ready |
| PATCH  | `/experts/:id` | app_admin, clinic_manager | ✅ Ready |

### 7.1 Roster ✅ Ready

```http
GET /experts?clinicId=<your-clinic-uuid>&page=1&limit=20
```

Also available as `GET /clinics/<clinicId>/experts` with the same filters. Both return **active experts linked to an active clinic only** — deactivated experts disappear from these lists, so pair them with `GET /users?role=expert` ([§5.1](#51-list--search-users--ready)) for a complete roster.

Supported filters: `specialization`, `clinicId`, `minRating`, `minFee`, `maxFee`, `lat` + `lng` + `radiusKm`, `page`, `limit`.

---

### 7.2 Update a profile ✅ Ready

```http
PATCH /experts/<expertId>
Content-Type: application/json

{
  "specialization": "ACNE_TREATMENT",
  "licenseNumber": "LIC-98765",
  "bio": "Updated bio",
  "avatarUrl": "https://placehold.co/400",
  "consultationFee": 450000,
  "sessionLengthHours": 2,
  "isActive": true
}
```

All fields optional. Notes for this actor:

| Field                | Behavior                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `clinicId`           | May only be set to **your own** clinic; cannot be cleared (**400**). Transfers between clinics are admin-only |
| `isActive: false`    | Hides the expert from discovery and blocks new bookings                                                       |
| `isActive: true`     | Requires a clinic; otherwise **400**                                                                          |
| `sessionLengthHours` | `1`–`8`; changes the length of every generated booking slot                                                   |
| `consultationFee`    | Also settable here, but prefer the dedicated endpoint in [§8](#8-flow-e--consultation-fees)                   |

Patching an expert from another clinic returns **403** `Clinic manager can only manage experts in their clinic`.

**Deactivating an expert** is the clinic manager's substitute for disabling the account (`PATCH /users/:id/status` is `app_admin` only). It removes them from discovery but leaves the login intact.

---

## 8. Flow E — Consultation fees

| Method | Path                            | Roles                             | Status   |
| ------ | ------------------------------- | --------------------------------- | -------- |
| PUT    | `/experts/:id/consultation-fee` | expert, clinic_manager, app_admin | ✅ Ready |

Create-or-replace in VND. Charged to the customer wallet at `POST /bookings/:id/pay` — see [consultation-flow.md](consultation-flow.md).

```http
PUT /experts/<expertId>/consultation-fee
Content-Type: application/json

{
  "consultationFee": 450000
}
```

| Rule                       | Detail                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------- |
| Minimum                    | `0` (a `0` fee makes the consultation free)                                            |
| Expert outside your clinic | **403** `Clinic manager can only manage consultation fees for experts in their clinic` |
| Experts calling for others | **403** — experts may only set their own fee                                           |

The new fee applies to **future** bookings; already-paid consultations keep the amount recorded in `feeChargedVnd`.

---

## 9. Flow F — Weekly availability

Weekly recurring windows that drive the customer-facing slot calendar. This is the highest-traffic clinic-manager surface.

| Method | Path                                  | Roles                             | Status   |
| ------ | ------------------------------------- | --------------------------------- | -------- |
| GET    | `/experts/:expertId/availability`     | expert, clinic_manager, app_admin | ✅ Ready |
| POST   | `/experts/:expertId/availability`     | expert, clinic_manager, app_admin | ✅ Ready |
| PATCH  | `/experts/:expertId/availability/:id` | expert, clinic_manager, app_admin | ✅ Ready |
| DELETE | `/experts/:expertId/availability/:id` | expert, clinic_manager, app_admin | ✅ Ready |

### 9.1 List blocks ✅ Ready

```http
GET /experts/<expertId>/availability
```

```json
{
  "items": [
    {
      "id": "uuid",
      "expertId": "uuid",
      "dayOfWeek": 1,
      "startHour": 9,
      "endHour": 12
    },
    {
      "id": "uuid",
      "expertId": "uuid",
      "dayOfWeek": 1,
      "startHour": 13,
      "endHour": 18
    }
  ]
}
```

Ordered by `dayOfWeek`, then `startHour`.

---

### 9.2 Create a block ✅ Ready

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

> **No blocks configured?** The slot generator treats the whole `09:00–20:00` window as open. Configure blocks explicitly if the expert should not be bookable all day.

---

### 9.3 Update / delete a block ✅ Ready

```http
PATCH /experts/<expertId>/availability/<availabilityId>
Content-Type: application/json

{
  "startHour": 10,
  "endHour": 14
}
```

Omitted fields keep their current value; the merged window is re-validated for range and overlap (the block being edited is excluded from the overlap check).

```http
DELETE /experts/<expertId>/availability/<availabilityId>
```

Returns **204**. Existing bookings inside a deleted window are **not** cancelled — cancel them separately via the expert or customer.

**Availability sequence:**

```
GET    /experts/:expertId/availability
  → POST   /experts/:expertId/availability   (× N weekly blocks)
  → PATCH  /experts/:expertId/availability/:id
  → DELETE /experts/:expertId/availability/:id
  → verify with GET /bookings/:expertId
```

| Error                    | HTTP  | Cause                                                                     |
| ------------------------ | ----- | ------------------------------------------------------------------------- |
| Invalid hour window      | `400` | Outside 09–20, or `endHour <= startHour`                                  |
| Overlaps existing block  | `409` | Same `dayOfWeek`, intersecting hours                                      |
| Expert in another clinic | `403` | `Clinic manager can only manage availability for experts in their clinic` |
| Expert / availability id | `404` | Unknown `expertId` or block id                                            |

---

## 10. Flow G — Verify the customer-facing result

Read-only checks a manager uses to confirm configuration landed correctly.

### 10.1 Bookable slots ✅ Ready

| Method | Path                  | Auth          | Status   |
| ------ | --------------------- | ------------- | -------- |
| GET    | `/bookings/:expertId` | Authenticated | ✅ Ready |

```http
GET /bookings/<expertId>?date=2026-08-10&range=week
```

Returns hourly-stepped slots for the week or month containing the anchor date (Asia/Ho_Chi_Minh). Each slot spans `sessionLengthHours`; slots overlapping active bookings come back marked unavailable. All timestamps are GMT+7.

This is the fastest way to confirm that availability blocks, `sessionLengthHours`, and the active flag combine into the calendar you expect.

---

### 10.2 Expert feedback & rating ✅ Ready

| Method | Path                     | Auth          | Status   |
| ------ | ------------------------ | ------------- | -------- |
| GET    | `/experts/:id/feedbacks` | Authenticated | ✅ Ready |

```http
GET /experts/<expertId>/feedbacks?page=1&limit=20
```

Paginated customer feedback plus `averageRating` and `ratingCount`. Ratings are recalculated whenever a customer submits feedback on a `COMPLETED` consultation.

---

### 10.3 Clinic profile ✅ Ready

| Method | Path           | Auth          | Status   |
| ------ | -------------- | ------------- | -------- |
| GET    | `/clinics`     | Authenticated | ✅ Ready |
| GET    | `/clinics/:id` | Authenticated | ✅ Ready |

```http
GET /clinics/<your-clinic-uuid>
```

Read-only for this role: name, address, latitude/longitude, `isActive`. Editing requires `app_admin` via `/admin/clinics` — see [admin-flow.md §13](admin-flow.md#13-flow-j--manage-clinics).

> If your clinic is deactivated by an admin, **all** of its experts drop out of `GET /experts` and `GET /clinics/:id/experts` even though their own `isActive` flags are unchanged.

---

## 11. Scoping rules & error matrix

Scoping is enforced in the service layer, after the role guard. A manager therefore sees **403 Forbidden**, not 404, when reaching across clinics.

| Operation                           | Scope check                                                   | Violation message                                                              |
| ----------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `GET /users`                        | Query forced to `caller.clinicId`                             | — (silently filtered)                                                          |
| `GET /users/:id`                    | `target.clinicId === caller.clinicId`                         | `Clinic manager can only access users in their clinic`                         |
| `POST /users`                       | Role must be `expert`; `clinicId` overridden                  | `Insufficient permissions to create this role`                                 |
| `POST /experts`                     | `body.clinicId === caller.clinicId` and target user in clinic | `Clinic manager can only manage experts in their clinic`                       |
| `PATCH /experts/:id`                | `expert.clinicId === caller.clinicId`                         | `Clinic manager can only manage experts in their clinic`                       |
| `PUT /experts/:id/consultation-fee` | `expert.clinicId === caller.clinicId`                         | `Clinic manager can only manage consultation fees for experts in their clinic` |
| `*/availability*`                   | `expert.clinicId === caller.clinicId`                         | `Clinic manager can only manage availability for experts in their clinic`      |
| Any write with `clinicId: null`     | Caller must be bound to a clinic                              | `Clinic manager is not bound to a clinic`                                      |

**Status codes to handle in the UI:**

| HTTP  | Meaning for this role                                                         |
| ----- | ----------------------------------------------------------------------------- |
| `400` | Validation — bad hour window, missing expert role on the user, cleared clinic |
| `401` | Session expired — re-run the auth flow                                        |
| `403` | Wrong role, cross-clinic target, or manager not bound to a clinic             |
| `404` | Unknown user / expert / availability id                                       |
| `409` | Duplicate expert profile, or overlapping availability block                   |

---

## 12. Endpoint checklist

### Auth & profile

| Method | Path        | Roles             | Status   |
| ------ | ----------- | ----------------- | -------- |
| GET    | `/users/me` | Any authenticated | ✅ Ready |
| PATCH  | `/users/me` | Any authenticated | ✅ Ready |

### Clinic user directory

| Method | Path         | Roles                            | Status   |
| ------ | ------------ | -------------------------------- | -------- |
| GET    | `/users`     | app_admin, staff, clinic_manager | ✅ Ready |
| GET    | `/users/:id` | app_admin, staff, clinic_manager | ✅ Ready |
| POST   | `/users`     | app_admin, clinic_manager        | ✅ Ready |

### Experts

| Method | Path                            | Roles                             | Status   |
| ------ | ------------------------------- | --------------------------------- | -------- |
| GET    | `/experts`                      | Public                            | ✅ Ready |
| GET    | `/experts/:id`                  | Public                            | ✅ Ready |
| GET    | `/experts/:id/feedbacks`        | Authenticated                     | ✅ Ready |
| POST   | `/experts`                      | app_admin, clinic_manager         | ✅ Ready |
| PATCH  | `/experts/:id`                  | app_admin, clinic_manager         | ✅ Ready |
| PUT    | `/experts/:id/consultation-fee` | expert, clinic_manager, app_admin | ✅ Ready |

### Availability & slots

| Method | Path                                  | Roles                             | Status   |
| ------ | ------------------------------------- | --------------------------------- | -------- |
| GET    | `/experts/:expertId/availability`     | expert, clinic_manager, app_admin | ✅ Ready |
| POST   | `/experts/:expertId/availability`     | expert, clinic_manager, app_admin | ✅ Ready |
| PATCH  | `/experts/:expertId/availability/:id` | expert, clinic_manager, app_admin | ✅ Ready |
| DELETE | `/experts/:expertId/availability/:id` | expert, clinic_manager, app_admin | ✅ Ready |
| GET    | `/bookings/:expertId`                 | Authenticated                     | ✅ Ready |

### Clinics & uploads

| Method | Path                   | Roles         | Status   |
| ------ | ---------------------- | ------------- | -------- |
| GET    | `/clinics`             | Authenticated | ✅ Ready |
| GET    | `/clinics/:id`         | Authenticated | ✅ Ready |
| GET    | `/clinics/:id/experts` | Public        | ✅ Ready |
| POST   | `/uploads/images`      | Authenticated | ✅ Ready |

---

## 13. Remaining gaps

| Gap                              | Status     | Notes                                                                                                                                                  |
| -------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Clinic-scoped booking list       | ❌ Missing | `GET /bookings/me` resolves a customer or expert perspective only; a pure `clinic_manager` gets **403** `Insufficient permissions to list bookings`    |
| Clinic revenue / reporting       | ❌ Missing | No endpoint aggregates consultation fees per clinic despite the role description in [users.md](users.md)                                               |
| Book on behalf of a customer     | 🔶 Extend  | `POST /bookings` allows `clinic_manager`, but the booking is created for the **caller's own** auto-created customer profile, not an arbitrary customer |
| Self-service clinic profile edit | ❌ Missing | Managers can read their clinic but cannot update name/address/geo (`/admin/clinics` is `app_admin`)                                                    |
| Inactive-expert roster           | 🔶 Extend  | `GET /experts` hides inactive profiles; use `GET /users?role=expert` as a workaround                                                                   |
| Suspend an expert login          | 🔶 Extend  | Only `PATCH /experts/:id { isActive: false }`; `PATCH /users/:id/status` stays `app_admin`                                                             |
| Unbound manager on `GET /users`  | 🔶 Extend  | A manager with `clinicId: null` is not filtered on the list endpoint (detail and writes are still blocked)                                             |
| `clinicId` refresh               | 🔶 Extend  | Session snapshots `clinicId` at login; re-binding requires re-login                                                                                    |

---

## Quick reference — happy-path sequences

**New expert ready to take bookings:**

```
Login (clinic_manager)
→ GET  /users/me                          (capture clinicId)
→ POST /users { role: expert }
→ POST /experts { userId, clinicId, specialization, consultationFee, … }
→ POST /experts/:expertId/availability    (× N weekly blocks)
→ optional avatar upload + PATCH /experts/:id
→ GET  /bookings/:expertId                (verify open slots)
```

**Re-price a clinic:**

```
Login (clinic_manager)
→ GET /experts?clinicId=<your-clinic>
→ PUT /experts/:id/consultation-fee { consultationFee }   (per expert)
```

**Change an expert's weekly schedule:**

```
Login (clinic_manager)
→ GET    /experts/:expertId/availability
→ PATCH  /experts/:expertId/availability/:id   (or DELETE + POST)
→ GET    /bookings/:expertId
```

**Take an expert off the schedule:**

```
Login (clinic_manager)
→ PATCH /experts/:expertId { isActive: false }
→ verify: GET /experts?clinicId=<your-clinic>   (expert no longer listed)
```
