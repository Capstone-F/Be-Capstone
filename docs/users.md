# User Management & RBAC

This document describes the five application roles, session-based RBAC, and user-management API endpoints for GlowScan.

See also: [Web Authentication Guide](auth-web.md) · [Mobile Authentication Guide](auth-mobile.md)

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

Used for QA / demos. Require `app_admin`. See also [survey-flow.md](survey-flow.md) §5.

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
