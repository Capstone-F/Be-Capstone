# User Management & RBAC

This document describes the five application roles, session-based RBAC, and user-management API endpoints for GlowScan.

See also: [Web Authentication Guide](auth-web.md) · [Mobile Authentication Guide](auth-mobile.md) · [Admin Integration Guide](admin-flow.md) (all `app_admin` flows + API sequences) · [Clinic Manager Flow Guide](clinic-manager-flow.md) (all `clinic_manager` flows + clinic scoping rules) · [Consultation Flow](consultation-flow.md) (discover → book → wallet pay → session → feedback)

---

## Roles

| Role           | Keycloak name    | Description                                                   |
| -------------- | ---------------- | ------------------------------------------------------------- |
| Customer       | `customer`       | Default role assigned on self-registration                    |
| App Admin      | `app_admin`      | Super admin with full system permissions                      |
| Staff          | `staff`          | E-commerce staff (general customer support)                   |
| Expert         | `expert`         | Clinic-bound certified expert (paid consultations)            |
| Clinic Manager | `clinic_manager` | Manages experts, bookings, and revenue for one partner clinic |

Roles are defined as **realm roles** in Keycloak (`be-capstone` realm) and appear in access tokens under `realm_access.roles`.

### Default role on registration

New self-registered users automatically receive the `customer` role via the realm default composite role.

### Bootstrap admin (development)

Docker Compose imports a seed admin user:

| Field    | Value            |
| -------- | ---------------- |
| Username | `glowscan-admin` |
| Password | `admin`          |
| Role     | `app_admin`      |

In production, assign roles through the Keycloak Admin Console or the user-management API.

---

## RBAC model

- Roles are read from the Keycloak access token at login and cached on the server session (`session.roles`).
- Protected endpoints use `SessionGuard` (authentication) + `RolesGuard` (authorization).
- The local `users` table mirrors `roles` and `clinicId` for querying and clinic scoping.
- Experts and clinic managers are bound to a partner clinic via `clinicId`.

### Clinic scoping

| Caller                | List users      | Create users                  | Scope             |
| --------------------- | --------------- | ----------------------------- | ----------------- |
| `app_admin`           | All             | staff, expert, clinic_manager | Global            |
| `staff`               | All             | —                             | Read-only global  |
| `clinic_manager`      | Own clinic only | expert only                   | Own `clinicId`    |
| `customer` / `expert` | —               | —                             | Self profile only |

### Expert profiles (clinic-bound)

Every bookable expert profile (`experts` row) **must** have a non-null `clinicId`. Creating or updating a profile without a clinic is rejected. Booking an expert without a clinic is blocked. List endpoints only return active experts linked to an **active** clinic.

| Method   | Path                   | Roles                     | Description                                                        |
| -------- | ---------------------- | ------------------------- | ------------------------------------------------------------------ |
| `GET`    | `/clinics`             | Any authenticated         | List active clinics                                                |
| `GET`    | `/clinics/:id`         | Any authenticated         | Clinic profile (name, address, geo)                                |
| `GET`    | `/admin/clinics`       | app_admin                 | List clinics (includes inactive; `q`, `activeOnly`)                |
| `POST`   | `/admin/clinics`       | app_admin                 | Create partner clinic                                              |
| `PATCH`  | `/admin/clinics/:id`   | app_admin                 | Update clinic (may set `isActive`)                                 |
| `DELETE` | `/admin/clinics/:id`   | app_admin                 | Soft-deactivate clinic                                             |
| `GET`    | `/clinics/:id/experts` | Any authenticated         | Bookable experts in that clinic                                    |
| `GET`    | `/experts`             | Any authenticated         | List active experts (`?clinicId=` supported)                       |
| `GET`    | `/experts/:id`         | Any authenticated         | Expert detail (includes clinic summary)                            |
| `GET`    | `/experts/me`          | expert                    | Own expert profile                                                 |
| `POST`   | `/experts`             | app_admin, clinic_manager | Create expert profile for an existing expert user                  |
| `PATCH`  | `/experts/:id`         | app_admin, clinic_manager | Update profile (`clinicId` cannot be cleared; may set `avatarUrl`) |
| `PATCH`  | `/experts/me`          | expert                    | Update own `avatarUrl` only                                        |

`POST /users` with `role: expert` still creates the **account** only; call `POST /experts` to attach the clinic-bound consultation profile.

Expert responses include optional `avatarUrl`. Upload images via [uploads.md](uploads.md), then set the URL with `PATCH /experts/:id` or `PATCH /experts/me`.

List/detail responses include:

```json
{
  "clinicId": "uuid",
  "clinicName": "GlowScan District 1 Clinic",
  "clinic": {
    "id": "uuid",
    "name": "GlowScan District 1 Clinic",
    "address": "12 Nguyen Hue, District 1, Ho Chi Minh City"
  }
}
```

`clinic_manager` callers are scoped to their own `clinicId`.

### Bookings (`GET /bookings/me`)

| Param    | Description                                                                                                                                           |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tab`    | `upcoming` (PENDING\|CONFIRMED\|IN_PROGRESS and `scheduledAt >= now`), `past` (COMPLETED), `cancelled` (CANCELLED). Mutually exclusive with `status`. |
| `status` | Exact consultation status filter                                                                                                                      |
| `as`     | `customer` or `expert` perspective                                                                                                                    |

Response includes `expertName`, `expertSpecialization`, nested `clinic { id, name, address }`, `customerName`, `reason`, `status`, `scheduledAt`, and `feedback { rating, comment }` when present.

### Confirm booking (`PATCH /bookings/:id/confirm`)

Assigned **expert** only. Transitions `PENDING` → `CONFIRMED`. Other statuses return `400`. Confirming another expert’s booking returns `403`. Customers see the updated status (and clinic) on `GET /bookings/me`.

### Cancel booking (`PATCH /bookings/:id/cancel`)

Owning **customer** or assigned **expert**. Body may include optional `reason`.

| Rule            | Detail                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------- |
| Allowed from    | `PENDING`, `CONFIRMED` only                                                                        |
| Not cancellable | `IN_PROGRESS`, `COMPLETED`, `CANCELLED` → `400`                                                    |
| Effect          | Status → `CANCELLED`; stores `cancelledAt`, `cancelReason`, `cancelledBy` (`CUSTOMER` \| `EXPERT`) |
| Slots           | Cancelled bookings leave `ACTIVE` filters, so the slot is bookable again                           |

Unauthorized actor → `403`.

### Start / complete (`PATCH /bookings/:id/start`, `.../complete`)

Assigned **expert** only.

| Endpoint             | Transition                  | Side effects       |
| -------------------- | --------------------------- | ------------------ |
| `PATCH .../start`    | `CONFIRMED` → `IN_PROGRESS` | Sets `startedAt`   |
| `PATCH .../complete` | `IN_PROGRESS` → `COMPLETED` | Sets `completedAt` |

Start is **required** before complete (completing from `CONFIRMED` returns `400`). Completed bookings appear under `GET /bookings/me?tab=past`.

### Feedback (`POST /bookings/:id/feedback`)

Owning **customer** only, when status is `COMPLETED`. Body: `{ rating: 1–5, comment?: string }`.

| Rule           | Detail                                                                            |
| -------------- | --------------------------------------------------------------------------------- |
| Duplicate      | One feedback per consultation (`409`)                                             |
| Invalid status | PENDING / CANCELLED / etc. → `400`                                                |
| Expert rating  | Recalculated as average of all feedback ratings for that expert                   |
| List by expert | `GET /experts/:id/feedbacks` (paginated; includes `averageRating`, `ratingCount`) |

Also available on `GET /bookings/me`, `GET /bookings/me/:id` as nested `feedback { rating, comment }` when present.

---

## Endpoints

All endpoints require the session cookie (`sid`) unless noted. Use `credentials: 'include'` in fetch calls.

| Method  | Path                | Roles                            | Description                   |
| ------- | ------------------- | -------------------------------- | ----------------------------- |
| `GET`   | `/users/me`         | Any authenticated                | Get own profile               |
| `PATCH` | `/users/me`         | Any authenticated                | Update own profile (`name`)   |
| `GET`   | `/users`            | app_admin, staff, clinic_manager | List/search users (paginated) |
| `GET`   | `/users/:id`        | app_admin, staff, clinic_manager | Get user by id                |
| `POST`  | `/users`            | app_admin, clinic_manager        | Create managed account        |
| `PATCH` | `/users/:id/roles`  | app_admin                        | Replace application roles     |
| `PATCH` | `/users/:id/status` | app_admin                        | Enable/disable account        |

### `GET /users` query params

| Param      | Description                                                   |
| ---------- | ------------------------------------------------------------- |
| `q`        | Search email or name                                          |
| `role`     | Filter by application role                                    |
| `clinicId` | Filter by clinic (admin/staff only; managers are auto-scoped) |
| `page`     | Page number (default 1)                                       |
| `limit`    | Page size (default 20, max 100)                               |

### `POST /users` body

```json
{
  "email": "expert@clinic.example.com",
  "name": "Jane Expert",
  "role": "expert",
  "clinicId": "clinic-uuid",
  "temporaryPassword": "TempPass123!"
}
```

Creates the user in Keycloak with `UPDATE_PASSWORD` and `VERIFY_EMAIL` required actions, assigns the realm role, and stores a local user record.

### `PATCH /users/:id/roles` body

```json
{
  "roles": ["staff"]
}
```

Replaces all application roles in Keycloak and the local database.

### `PATCH /users/:id/status` body

```json
{
  "isActive": false
}
```

Disables the account in Keycloak and sets `isActive` locally.

---

## Admin customer cheat endpoints (App Admin)

Used for QA / demos. Require `app_admin`. Full admin flows (users, experts, catalog, wallet, question bank): [admin-flow.md](admin-flow.md). See also [survey-flow.md](survey-flow.md) §5.

| Method  | Path                           | Description                                                                                                                     |
| ------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `PATCH` | `/admin/customers/:id/survey`  | Replace survey answers by `questionCode` + `labelCodes`; re-derives skin type; deletes existing recommendations for that survey |
| `PATCH` | `/admin/customers/:id/profile` | Update `fullName`, `phone`, `age`, and/or `allergyCodes`                                                                        |

### `PATCH /admin/customers/:id/survey` body

```json
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

Returns a `SurveyResponseDto`. Label codes must be valid options for each question. After update, call `GET /recommendations/latest` again to rebuild a snapshot.

### `PATCH /admin/customers/:id/profile` body

```json
{
  "fullName": "Demo Customer",
  "phone": "+84901234567",
  "age": 28,
  "allergyCodes": ["FRAGRANCE"]
}
```

All fields optional. Setting `allergyCodes` replaces the customer’s allergy set and clears recommendation snapshots for that customer so the next recommendation run re-filters products.

---

## User model fields

| Field         | Type           | Description                                |
| ------------- | -------------- | ------------------------------------------ |
| `id`          | UUID           | Local primary key                          |
| `keycloakSub` | string         | Keycloak user id (`sub`)                   |
| `email`       | string \| null | Email                                      |
| `name`        | string \| null | Display name                               |
| `provider`    | string         | Identity provider at first login           |
| `roles`       | Role[]         | Application roles (mirrored from Keycloak) |
| `clinicId`    | UUID \| null   | Partner clinic for expert / clinic_manager |
| `isActive`    | boolean        | Account enabled flag                       |
| `createdAt`   | ISO date       | First login / creation time                |
| `updatedAt`   | ISO date       | Last update time                           |

The `/users/me` endpoint is the canonical profile endpoint and returns the same fields including `roles` and `clinicId`.
