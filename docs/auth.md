# Authentication Guide (BFF Pattern)

[Vietnamese version](auth.vi.md)

This guide walks frontend clients through integrating with the backend authentication API. The backend uses a **BFF (Backend For Frontend)** pattern — all Auth0 interactions happen server-side. The frontend only deals with **session cookies**, never with tokens.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Step-by-step: Login](#3-step-by-step-login)
4. [Step-by-step: Google Login](#4-step-by-step-google-login)
5. [Step-by-step: Get current user](#5-step-by-step-get-current-user)
6. [Step-by-step: Check auth status](#6-step-by-step-check-auth-status)
7. [Step-by-step: Logout](#7-step-by-step-logout)
8. [Calling protected API routes](#8-calling-protected-api-routes)
9. [Endpoint reference](#9-endpoint-reference)
10. [User model reference](#10-user-model-reference)
11. [CORS & cookie setup](#11-cors--cookie-setup)
12. [Error reference](#12-error-reference)

---

## 1. Overview

```
Client (browser)
  │
  │  1. POST /auth/login { client_redirect_uri } → { login_uri } (Set-Cookie: sid)
  │
  │  2. window.location.href = login_uri → Auth0 Universal Login
  │
  │  3. User authenticates on Auth0 (or Google via Auth0 social connection)
  │
  │  4. Auth0 302 → Backend /auth/callback?code=...&state=...
  │
  │  5. Backend exchanges code for tokens (server-to-server)
  │     └── Stores tokens in server-side session
  │     └── Upserts local user record
  │
  │  6. Backend 302 → client_redirect_uri (same origin as FRONTEND_URL)
  │
  │  7. Frontend calls /auth/me (cookie sent automatically)
  │     ◄── { user profile from local DB }
  │
  │  8. All subsequent API calls include cookie automatically
  │
  │  9. POST /auth/logout → { success, logout_uri }
  │     └── Frontend sends browser to logout_uri to also kill the Auth0 SSO session
```

**Key principle:** The frontend never sees or stores any Auth0 tokens. Authentication state is managed entirely through an HTTP-only session cookie (`sid`). Sessions are stored in **Redis** for fast access and easy horizontal scaling.

---

## 2. Prerequisites

| What         | Value                                                              |
| ------------ | ------------------------------------------------------------------ |
| Backend API  | Running at `http://localhost:3000` (or deployed URL)               |
| Frontend     | Running at `http://localhost:5173` (configured via `FRONTEND_URL`) |
| Auth0 tenant | Configured per the README "Auth0 setup" section                    |

### Required environment variables (backend)

| Variable                                  | Description                                                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `AUTH0_DOMAIN`                            | Auth0 tenant domain (e.g. `tenant.us.auth0.com`). Issuer is `https://${AUTH0_DOMAIN}/`                            |
| `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` | Auth0 application credentials                                                                                     |
| `AUTH0_AUDIENCE`                          | Auth0 API identifier — required so Auth0 issues a real access token                                               |
| `AUTH0_REDIRECT_URI`                      | Where Auth0 sends the browser after authorize. Must be in the application's Allowed Callback URLs                 |
| `AUTH0_LOGOUT_RETURN_URL`                 | Default `returnTo` for `v2/logout`. Must be in the application's Allowed Logout URLs. Defaults to `FRONTEND_URL`. |
| `REDIS_URL`                               | Redis connection URL for session storage (e.g. `redis://redis:6379`). Defaults to `redis://localhost:6379`        |
| `SESSION_SECRET`                          | Secret for signing session cookies                                                                                |
| `FRONTEND_URL`                            | Allowed frontend origin — must match `client_redirect_uri` on login (same origin) and CORS                        |
| `CORS_ORIGIN`                             | Allowed CORS origin (defaults to `FRONTEND_URL`)                                                                  |

---

## 3. Step-by-step: Login

### Step 1 — Start login (POST)

Call the backend with the URL you want to land on after OAuth (must be the **same origin** as `FRONTEND_URL`):

```js
const res = await fetch('http://localhost:3000/auth/login', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_redirect_uri: `${window.location.origin}${window.location.pathname}`,
  }),
});
const { login_uri } = await res.json();
window.location.href = login_uri;
```

The backend will:

1. Validate `client_redirect_uri` against `FRONTEND_URL` origin (open-redirect protection)
2. Generate a CSRF `state` parameter and store it in the session (with your redirect URI)
3. Return JSON `{ login_uri }` — the Auth0 `/authorize` URL (with `audience` so a real API access token is issued)

### Step 2 — User logs in on Auth0

The browser shows the Auth0 Universal Login page. The user signs in with their email/password or via a social connection.

### Step 3 — Automatic callback handling

After login, Auth0 redirects to the backend's `/auth/callback`. The backend:

1. Validates the `state` parameter (CSRF protection)
2. Exchanges the authorization code for tokens (server-to-server)
3. Upserts the user in the local database (keyed by `auth0Sub`)
4. Stores tokens in the server-side session
5. Redirects (302) to **`client_redirect_uri`** (with `?isNewUser=true` when applicable)

If this is the user's first login, the redirect URL includes `?isNewUser=true`:

```js
const params = new URLSearchParams(window.location.search);
if (params.get('isNewUser') === 'true') {
  // Navigate to onboarding
} else {
  // Navigate to dashboard
}
```

---

## 4. Step-by-step: Google Login

Google login uses the same POST body with `idpHint`:

```js
body: JSON.stringify({
  client_redirect_uri: `${window.location.origin}/`,
  idpHint: 'google',
}),
```

The backend translates `idpHint=google` into Auth0's `connection=google-oauth2` query parameter. This skips the Auth0 Universal Login picker and sends the browser straight to Google.

> Any other `idpHint` value is passed through unchanged as the Auth0 `connection` name (e.g. `github`, `Username-Password-Authentication`).

| Login                    | What happens                                          |
| ------------------------ | ----------------------------------------------------- |
| First time (new user)    | Google sign-in → Auth0 user record created → callback |
| Existing user via Google | Google sign-in → callback                             |

---

## 5. Step-by-step: Get current user

```js
const res = await fetch('http://localhost:3000/auth/me', {
  credentials: 'include', // REQUIRED — sends the session cookie
});

if (res.ok) {
  const user = await res.json();
  console.log(user);
  // { id, auth0Sub, email, name, isActive, createdAt, updatedAt }
} else {
  // Not authenticated — redirect to login
}
```

The backend reads the session, auto-refreshes the Auth0 access token if it is near expiry, and returns the user profile from the local database.

---

## 6. Step-by-step: Check auth status

A lightweight endpoint that doesn't load the full user profile:

```js
const { authenticated } = await fetch('http://localhost:3000/auth/status', {
  credentials: 'include',
}).then((r) => r.json());

if (!authenticated) {
  // Trigger POST /auth/login then navigate to login_uri (see section 3)
}
```

---

## 7. Step-by-step: Logout

```js
const res = await fetch('http://localhost:3000/auth/logout', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  // Optional: override the post-logout return URL (must be allow-listed in Auth0 too)
  body: JSON.stringify({ return_to: `${window.location.origin}/goodbye` }),
});

const { logout_uri } = await res.json();

// Send the browser to Auth0's v2/logout so the SSO session is also ended.
// Auth0 will then redirect back to AUTH0_LOGOUT_RETURN_URL (or return_to).
window.location.href = logout_uri;
```

The backend will:

1. Revoke the refresh token on Auth0 (`oauth/revoke`)
2. Destroy the server-side session
3. Clear the `sid` cookie
4. Return `{ success: true, logout_uri }` — the Auth0 `v2/logout` URL the browser must visit

> If you skip the `window.location.href = logout_uri` step, the local session is gone but the Auth0 SSO cookie persists, and the next `POST /auth/login` will silently re-authenticate without a Universal Login prompt.

---

## 8. Calling protected API routes

With the BFF pattern, all API calls just need `credentials: 'include'` — the browser sends the session cookie automatically:

```js
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
  });

  if (res.status === 401) {
    // Session expired — start login (POST /auth/login, then login_uri)
    return null;
  }

  return res;
}

const data = await apiFetch('http://localhost:3000/api/some-resource').then(
  (r) => r.json(),
);
```

No `Authorization` header, no token management, no refresh logic needed on the frontend.

---

## 9. Endpoint reference

| Method | Path             | Auth                       | Description                                                             |
| ------ | ---------------- | -------------------------- | ----------------------------------------------------------------------- |
| `POST` | `/auth/login`    | None (sets session cookie) | JSON `{ client_redirect_uri, idpHint? }` → `{ login_uri }`              |
| `GET`  | `/auth/callback` | None                       | OAuth callback (Auth0 redirects here)                                   |
| `GET`  | `/auth/me`       | Session cookie             | Get current user profile                                                |
| `GET`  | `/auth/status`   | None                       | Check if session is authenticated                                       |
| `POST` | `/auth/logout`   | Session cookie             | Destroy session, revoke refresh token, return `{ success, logout_uri }` |

### `POST /auth/login` — JSON body

| Field                 | Required | Description                                                                                                  |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `client_redirect_uri` | Yes      | Absolute URL to open after login (same origin as `FRONTEND_URL`)                                             |
| `idpHint`             | No       | `google` to skip Universal Login and go straight to Google. Other values map to the Auth0 `connection` name. |

### `GET /auth/callback` — query params (set by Auth0)

| Param   | Description                   |
| ------- | ----------------------------- |
| `code`  | Authorization code from Auth0 |
| `state` | CSRF state parameter          |

### `POST /auth/logout` — JSON body

| Field       | Required | Description                                                                           |
| ----------- | -------- | ------------------------------------------------------------------------------------- |
| `return_to` | No       | Override `AUTH0_LOGOUT_RETURN_URL`. Same-origin restriction as `client_redirect_uri`. |

---

## 10. User model reference

### User fields (from database, returned by `/auth/me`)

| Field       | Type           | Description                                       |
| ----------- | -------------- | ------------------------------------------------- | -------------------- | -------------------------- |
| `id`        | UUID           | Primary key in our database                       |
| `auth0Sub`  | string         | Immutable Auth0 user ID (`sub` claim, e.g. `auth0 | ...`, `google-oauth2 | ...`) — use as foreign key |
| `email`     | string \| null | Refreshed from Auth0 on every login               |
| `name`      | string \| null | Refreshed from Auth0 on every login               |
| `isActive`  | boolean        | `true` by default                                 |
| `createdAt` | ISO date       | When the user first logged in                     |
| `updatedAt` | ISO date       | When the user last logged in                      |

> The previous schema had `keycloakSub` and `provider` columns. Both were removed. The Auth0 `sub` already encodes the connection (`auth0|...` for database users, `google-oauth2|...` for Google, etc.), so a separate `provider` column is unnecessary.

---

## 11. CORS & cookie setup

For the session cookie to flow between the frontend and backend (different origins), both sides need correct configuration:

### Backend (already configured)

- CORS: `origin: FRONTEND_URL`, `credentials: true`
- Cookie: `httpOnly: true`, `sameSite: 'lax'`, `secure: true` (in production)
- Session store: Redis (via `connect-redis` + `redis`)

### Frontend

Every `fetch` call must include `credentials: 'include'`:

```js
fetch('http://localhost:3000/auth/me', { credentials: 'include' });
```

If using **Axios**:

```js
const api = axios.create({
  baseURL: 'http://localhost:3000',
  withCredentials: true,
});
```

---

## 12. Error reference

| HTTP                                          | Scenario                             | What to do                                  |
| --------------------------------------------- | ------------------------------------ | ------------------------------------------- |
| `401 Unauthorized`                            | No active session or session expired | Start login again (`POST /auth/login`)      |
| `400 Bad Request`                             | Invalid `client_redirect_uri`        | Fix URL or align with `FRONTEND_URL` origin |
| `302` to `/auth/error?reason=missing_params`  | Callback missing code/state          | Start login flow again                      |
| `302` to `/auth/error?reason=state_mismatch`  | CSRF state mismatch                  | Start login flow again                      |
| `302` to `/auth/error?reason=exchange_failed` | Auth0 code exchange failed           | Start login flow again                      |
