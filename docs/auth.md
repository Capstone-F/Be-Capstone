# Authentication Guide (BFF Pattern)

[Vietnamese version](auth.vi.md)

This guide walks frontend clients through integrating with the backend authentication API. The backend uses a **BFF (Backend For Frontend)** pattern — all Keycloak interactions happen server-side. The frontend only deals with **session cookies**, never with tokens.

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
  │  1. window.location.href = '/auth/login'
  │     (browser navigates to backend)
  │
  │  2. Backend 302 → Keycloak login page
  │
  │  3. User authenticates on Keycloak (or Google)
  │
  │  4. Keycloak 302 → Backend /auth/callback?code=...
  │
  │  5. Backend exchanges code for tokens (server-to-server)
  │     └── Stores tokens in server-side session
  │     └── Upserts local user record
  │
  │  6. Backend 302 → FRONTEND_URL (Set-Cookie: sid=...)
  │
  │  7. Frontend calls /auth/me (cookie sent automatically)
  │     ◄── { user profile from local DB }
  │
  │  8. All subsequent API calls include cookie automatically
  │
  │  9. POST /auth/logout to end session
```

**Key principle:** The frontend never sees or stores any Keycloak tokens. Authentication state is managed entirely through an HTTP-only session cookie (`sid`). Sessions are stored in **Redis** for fast access and easy horizontal scaling.

---

## 2. Prerequisites

| What | Value |
|---|---|
| Backend API | Running at `http://localhost:3000` (or deployed URL) |
| Frontend | Running at `http://localhost:5173` (configured via `FRONTEND_URL`) |
| Keycloak | Running at `http://localhost:8080` |
| Realm | `be-capstone` (auto-imported by Docker Compose) |

### Required environment variables (backend)

| Variable | Description |
|---|---|
| `KEYCLOAK_PUBLIC_URL` | Keycloak URL reachable by the browser (e.g. `http://localhost:8080`) |
| `KEYCLOAK_INTERNAL_URL` | Keycloak URL for server-to-server calls inside Docker (e.g. `http://keycloak:8080`). Defaults to `KEYCLOAK_PUBLIC_URL`. |
| `REDIS_URL` | Redis connection URL for session storage (e.g. `redis://redis:6379`). Defaults to `redis://localhost:6379`. |
| `SESSION_SECRET` | Secret for signing session cookies |
| `FRONTEND_URL` | Frontend origin (e.g. `http://localhost:5173`) |
| `CORS_ORIGIN` | Allowed CORS origin (defaults to `FRONTEND_URL`) |

---

## 3. Step-by-step: Login

### Step 1 — Redirect to login

Simply navigate the browser to the backend login endpoint:

```js
window.location.href = 'http://localhost:3000/auth/login';
```

The backend will:
1. Generate a CSRF `state` parameter and store it in the session
2. Redirect (302) to the Keycloak login page

### Step 2 — User logs in on Keycloak

The browser shows the Keycloak login page. The user enters credentials or creates an account.

### Step 3 — Automatic callback handling

After login, Keycloak redirects to the backend's `/auth/callback`. The backend:
1. Validates the `state` parameter (CSRF protection)
2. Exchanges the authorization code for tokens (server-to-server)
3. Upserts the user in the local database
4. Stores tokens in the server-side session
5. Redirects (302) to `FRONTEND_URL`

If this is the user's first login, the redirect URL includes `?isNewUser=true`:

```js
// In your frontend router, check for this param:
const params = new URLSearchParams(window.location.search);
if (params.get('isNewUser') === 'true') {
  // Navigate to onboarding
} else {
  // Navigate to dashboard
}
```

---

## 4. Step-by-step: Google Login

Google login uses the same flow with the `idpHint=google` query parameter:

```js
window.location.href = 'http://localhost:3000/auth/login?idpHint=google';
```

This tells Keycloak to skip its own login page and redirect straight to Google.

| Login | What happens |
|---|---|
| First time (new user) | Google sign-in → Keycloak "Review Profile" form → callback |
| Subsequent logins | Google sign-in → callback (no profile prompt) |

---

## 5. Step-by-step: Get current user

```js
const res = await fetch('http://localhost:3000/auth/me', {
  credentials: 'include',  // REQUIRED — sends the session cookie
});

if (res.ok) {
  const user = await res.json();
  console.log(user);
  // { id, keycloakSub, email, name, provider, isActive, createdAt, updatedAt }
} else {
  // Not authenticated — redirect to login
}
```

The backend reads the session, auto-refreshes the Keycloak token if needed, and returns the user profile from the local database.

---

## 6. Step-by-step: Check auth status

A lightweight endpoint that doesn't load the full user profile:

```js
const { authenticated } = await fetch('http://localhost:3000/auth/status', {
  credentials: 'include',
}).then(r => r.json());

if (!authenticated) {
  window.location.href = 'http://localhost:3000/auth/login';
}
```

---

## 7. Step-by-step: Logout

```js
await fetch('http://localhost:3000/auth/logout', {
  method: 'POST',
  credentials: 'include',
});

// Session is destroyed, cookie is cleared
window.location.href = '/login';
```

The backend will:
1. Revoke the refresh token on Keycloak
2. Destroy the server-side session
3. Clear the `sid` cookie

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
    // Session expired — redirect to login
    window.location.href = '/auth/login';
    return null;
  }

  return res;
}

// Usage
const data = await apiFetch('http://localhost:3000/api/some-resource').then(r => r.json());
```

No `Authorization` header, no token management, no refresh logic needed on the frontend.

---

## 9. Endpoint reference

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/auth/login` | None | Redirects browser to Keycloak login |
| `GET` | `/auth/callback` | None | OAuth callback (Keycloak redirects here) |
| `GET` | `/auth/me` | Session cookie | Get current user profile |
| `GET` | `/auth/status` | None | Check if session is authenticated |
| `POST` | `/auth/logout` | Session cookie | Destroy session and revoke tokens |

### `GET /auth/login` — query params

| Param | Required | Description |
|---|---|---|
| `idpHint` | No | `google` to skip Keycloak login page |

### `GET /auth/callback` — query params (set by Keycloak)

| Param | Description |
|---|---|
| `code` | Authorization code from Keycloak |
| `state` | CSRF state parameter |

---

## 10. User model reference

### User fields (from database, returned by `/auth/me`)

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key in our database |
| `keycloakSub` | string | Immutable Keycloak user ID — use as foreign key |
| `email` | string \| null | Refreshed from Keycloak on every login |
| `name` | string \| null | Refreshed from Keycloak on every login |
| `provider` | string | `"google"` or `"keycloak"` — set at first login |
| `isActive` | boolean | `true` by default |
| `createdAt` | ISO date | When the user first logged in |
| `updatedAt` | ISO date | When the user last logged in |

---

## 11. CORS & cookie setup

For the session cookie to flow between the frontend and backend (different origins), both sides need correct configuration:

### Backend (already configured)

- CORS: `origin: FRONTEND_URL`, `credentials: true`
- Cookie: `httpOnly: true`, `sameSite: 'lax'`, `secure: true` (in production)
- Session store: Redis (via `connect-redis` + `ioredis`)

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

| HTTP | Scenario | What to do |
|---|---|---|
| `401 Unauthorized` | No active session or session expired | Redirect to `GET /auth/login` |
| `302` to `/auth/error?reason=missing_params` | Callback missing code/state | Start login flow again |
| `302` to `/auth/error?reason=state_mismatch` | CSRF state mismatch | Start login flow again |
| `302` to `/auth/error?reason=exchange_failed` | Keycloak code exchange failed | Start login flow again |
