# Authentication Guide

[Vietnamese version](auth.vi.md)

This guide walks web and mobile frontend clients through every step of integrating with the backend authentication API powered by **Keycloak** (OAuth 2.0 Authorization Code Flow).

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Environment & Base URLs](#3-environment--base-urls)
4. [Step-by-step: Standard Login (Keycloak account)](#4-step-by-step-standard-login-keycloak-account)
5. [Step-by-step: Google Login](#5-step-by-step-google-login)
6. [Step-by-step: Token refresh](#6-step-by-step-token-refresh)
7. [Step-by-step: Logout](#7-step-by-step-logout)
8. [Calling protected API routes](#8-calling-protected-api-routes)
9. [Getting current user profile](#9-getting-current-user-profile)
10. [Endpoint reference](#10-endpoint-reference)
11. [Token & user model reference](#11-token--user-model-reference)
12. [PKCE (recommended for SPA & mobile)](#12-pkce-recommended-for-spa--mobile)
13. [Error reference](#13-error-reference)

---

## 1. Overview

```
Client (browser / mobile)
  │
  │  1. GET /auth/login[?idpHint=google]
  │  ◄── { authorizationUrl, state, redirectUri }
  │
  │  2. Redirect browser → authorizationUrl (Keycloak / Google login page)
  │
  │  3. User authenticates on Keycloak (or Google)
  │     └── First Google login only: Keycloak shows "Review Profile" form
  │
  │  4. Keycloak redirects → redirectUri?code=...&state=...
  │
  │  5. POST /auth/token  { code, redirectUri [, idpHint] }
  │  ◄── { token, profile, user, isNewUser }
  │
  │  6. Store access_token + refresh_token
  │
  │  7. Call protected routes with  Authorization: Bearer <access_token>
  │
  │  8. POST /auth/refresh when access_token expires
  │
  │  9. POST /auth/logout to end session
```

The backend acts as the **token broker**: all sensitive exchanges with Keycloak happen server-to-server. The client only ever speaks to the backend API.

---

## 2. Prerequisites

| What | Value |
|---|---|
| Backend API | Running at `http://localhost:3000` (or deployed URL) |
| Keycloak | Running at `http://localhost:8080` |
| Realm | `be-capstone` (auto-imported by Docker Compose) |
| Client ID | `be-capstone-api` |
| Google OAuth app | Credentials set in Keycloak admin → Identity Providers → Google |

> **Google OAuth app setup (one-time):**
> 1. Go to [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → Create OAuth 2.0 Client ID
> 2. Set Authorized redirect URI to: `http://localhost:8080/realms/be-capstone/broker/google/endpoint`
> 3. Copy Client ID and Client Secret into Keycloak admin → Identity Providers → Google → Edit

---

## 3. Environment & Base URLs

| Variable | Local dev | Description |
|---|---|---|
| Backend API | `http://localhost:3000` | NestJS API server |
| `KEYCLOAK_URL` | `http://localhost:8080` | Keycloak base URL (API + browser) |

All URLs returned by `/auth/login` and `/auth/endpoints` use `KEYCLOAK_URL` — they are safe to open in a browser.

---

## 4. Step-by-step: Standard Login (Keycloak account)

### Step 1 — Get the authorization URL

```http
GET /auth/login
```

Optional query params:

| Param | Description |
|---|---|
| `redirectUri` | Where Keycloak sends the user back after login. Defaults to `KEYCLOAK_REDIRECT_URI`. |

**Response**

```json
{
  "authorizationUrl": "http://localhost:8080/realms/be-capstone/protocol/openid-connect/auth?client_id=be-capstone-api&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback&response_type=code&scope=openid+profile+email&state=550e8400-e29b-41d4-a716-446655440000",
  "state": "550e8400-e29b-41d4-a716-446655440000",
  "redirectUri": "http://localhost:3000/auth/callback",
  "idpHint": null
}
```

**Web**

```js
const { authorizationUrl, state } = await fetch('/auth/login').then(r => r.json());
sessionStorage.setItem('oauth_state', state); // CSRF protection
window.location.href = authorizationUrl;       // redirect browser to Keycloak
```

**Mobile (React Native / Flutter)**

```js
// Use expo-auth-session or flutter_appauth with a deep link redirect URI
const { authorizationUrl, state } = await fetch(
  `/auth/login?redirectUri=${encodeURIComponent('myapp://auth/callback')}`
).then(r => r.json());

// Open in-app browser
await openInAppBrowser(authorizationUrl);
```

---

### Step 2 — User logs in on Keycloak

The browser/in-app browser shows the Keycloak login page. The user enters credentials (or creates an account if `registrationAllowed: true`).

---

### Step 3 — Handle the callback and exchange the code

After login Keycloak redirects to `redirectUri?code=...&state=...`.

> **CSRF check:** verify the `state` param matches what you stored in step 1.

**Web SPA** — your frontend catches the redirect:

```js
// Running at http://localhost:5173/callback
const params = new URLSearchParams(window.location.search);
const code  = params.get('code');
const state = params.get('state');

if (state !== sessionStorage.getItem('oauth_state')) {
  throw new Error('State mismatch — possible CSRF attack');
}
sessionStorage.removeItem('oauth_state');

const res = await fetch('/auth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code,
    redirectUri: window.location.origin + '/callback',
  }),
});
const { token, profile, user, isNewUser } = await res.json();

localStorage.setItem('access_token',  token.access_token);
localStorage.setItem('refresh_token', token.refresh_token);

if (isNewUser) {
  // First time login → navigate to onboarding
} else {
  // Returning user → navigate to dashboard
}
```

**Mobile**

```js
// After in-app browser returns with code:
const res = await fetch('/auth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code,
    redirectUri: 'myapp://auth/callback',
  }),
});
const { token, user, isNewUser } = await res.json();
await SecureStore.setItemAsync('access_token',  token.access_token);
await SecureStore.setItemAsync('refresh_token', token.refresh_token);
```

**Response shape**

```json
{
  "token": {
    "access_token":       "eyJhbGci...",
    "expires_in":         300,
    "refresh_expires_in": 1800,
    "refresh_token":      "eyJhbGci...",
    "token_type":         "Bearer",
    "id_token":           "eyJhbGci...",
    "scope":              "openid profile email"
  },
  "profile": {
    "sub":                "a1b2c3d4-0000-0000-0000-000000000000",
    "email":              "user@example.com",
    "name":               "John Doe",
    "preferred_username": "john",
    "email_verified":     true
  },
  "user": {
    "id":           "uuid-from-our-db",
    "keycloakSub":  "a1b2c3d4-0000-0000-0000-000000000000",
    "email":        "user@example.com",
    "name":         "John Doe",
    "provider":     "keycloak",
    "isActive":     true,
    "createdAt":    "2026-04-15T10:00:00.000Z",
    "updatedAt":    "2026-04-15T10:00:00.000Z"
  },
  "isNewUser": true
}
```

> `isNewUser: true` means this is the **first ever login** — the backend just inserted a new row in the `users` table.

---

## 5. Step-by-step: Google Login

Google login uses the exact same flow as standard login. The only difference is the `idpHint=google` parameter, which tells Keycloak to **skip its own login page** and redirect straight to Google.

### First-time Google login — profile review

On the **very first** Google login (when no Keycloak user exists for that Google account), Keycloak shows a "Review Profile" form. This lets the user verify/edit their name and email before the account is created. This only happens **once** — all subsequent logins go straight through to the callback.

| Login | What happens |
|---|---|
| First time (new user) | Google sign-in → Keycloak "Review Profile" form → account created → callback |
| Subsequent logins | Google sign-in → callback (no profile prompt) |

### Step 1 — Get the Google authorization URL

```http
GET /auth/login?idpHint=google
```

**Response**

```json
{
  "authorizationUrl": "http://localhost:8080/realms/be-capstone/protocol/openid-connect/auth?...&kc_idp_hint=google",
  "state": "550e8400-e29b-41d4-a716-446655440001",
  "redirectUri": "http://localhost:3000/auth/callback",
  "idpHint": "google"
}
```

```js
const { authorizationUrl, state } = await fetch('/auth/login?idpHint=google').then(r => r.json());
sessionStorage.setItem('oauth_state', state);
window.location.href = authorizationUrl; // opens Google sign-in directly
```

---

### Step 2 — User authenticates on Google

Google shows its own sign-in page. After the user grants access, Google redirects back to Keycloak, which then redirects to your `redirectUri`.

> **First login only:** Keycloak will show a "Review Profile" form between Google sign-in and the callback redirect. The user can verify their name/email and submit. This happens only once per Google account.

---

### Step 3 — Exchange the code (pass idpHint)

Same as standard login, but include `idpHint` so the backend records the correct provider on first login:

```js
const { token, user, isNewUser } = await fetch('/auth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code, redirectUri, idpHint: 'google' }),
}).then(r => r.json());
```

**Response** — same shape as standard login, but `user.provider` will be `"google"`:

```json
{
  "user": {
    "provider": "google",
    ...
  },
  "isNewUser": true
}
```

---

## 6. Step-by-step: Token refresh

Access tokens expire after `expires_in` seconds (default 300 s / 5 min). Use the refresh token to get a new one without requiring the user to log in again.

### When to refresh

- Proactively: track expiry with `Date.now() + token.expires_in * 1000` and refresh ~30 s before
- Reactively: catch a `401 Unauthorized` from any protected route and retry once after refreshing

```http
POST /auth/refresh
Content-Type: application/json

{ "refreshToken": "<refresh_token>" }
```

**Response**

```json
{
  "access_token":  "eyJhbGci...",
  "expires_in":    300,
  "refresh_token": "eyJhbGci...",
  "token_type":    "Bearer"
}
```

**Web**

```js
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) { redirectToLogin(); return null; }

  const res = await fetch('/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    // Refresh token expired — force re-login
    localStorage.clear();
    redirectToLogin();
    return null;
  }

  const token = await res.json();
  localStorage.setItem('access_token',  token.access_token);
  localStorage.setItem('refresh_token', token.refresh_token);
  return token.access_token;
}
```

**Mobile**

```js
const token = await fetch('/auth/refresh', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ refreshToken: await SecureStore.getItemAsync('refresh_token') }),
}).then(r => r.json());

await SecureStore.setItemAsync('access_token',  token.access_token);
await SecureStore.setItemAsync('refresh_token', token.refresh_token);
```

---

## 7. Step-by-step: Logout

Revoking the refresh token ends the session server-side. The user will need to log in again to get new tokens.

```http
POST /auth/logout
Content-Type: application/json

{ "refreshToken": "<refresh_token>" }
```

**Response**

```json
{ "success": true }
```

**Web**

```js
async function logout() {
  const refreshToken = localStorage.getItem('refresh_token');
  if (refreshToken) {
    await fetch('/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  }
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  window.location.href = '/login';
}
```

**Mobile**

```js
await fetch('/auth/logout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ refreshToken: await SecureStore.getItemAsync('refresh_token') }),
});
await SecureStore.deleteItemAsync('access_token');
await SecureStore.deleteItemAsync('refresh_token');
```

---

## 8. Calling protected API routes

Include the access token as a Bearer token in every authenticated request.

```http
GET /api/some-resource
Authorization: Bearer <access_token>
```

**Recommended: reusable fetch wrapper with auto-refresh**

```js
async function apiFetch(url, options = {}) {
  const makeRequest = (token) =>
    fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });

  let res = await makeRequest(localStorage.getItem('access_token'));

  if (res.status === 401) {
    // Try refreshing once
    const newToken = await refreshAccessToken();
    if (!newToken) return res; // already redirected to login
    res = await makeRequest(newToken);
  }

  return res;
}

// Usage
const data = await apiFetch('/api/profile').then(r => r.json());
```

---

## 9. Getting current user profile

Returns the live profile claims from Keycloak for the authenticated user.

```http
GET /auth/me
Authorization: Bearer <access_token>
```

**Response**

```json
{
  "sub":                "a1b2c3d4-0000-0000-0000-000000000000",
  "email":              "user@example.com",
  "name":               "John Doe",
  "given_name":         "John",
  "family_name":        "Doe",
  "preferred_username": "john",
  "email_verified":     true,
  "identity_provider":  "google"
}
```

> `identity_provider` is present only when the user logged in via a federated provider (e.g. Google).

---

## 10. Endpoint reference

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/auth/endpoints` | None | OIDC endpoint discovery (public URLs) |
| `GET` | `/auth/login` | None | Get authorization URL to redirect user |
| `GET` | `/auth/callback` | None | Exchange code (query param driven, Keycloak redirect target) |
| `POST` | `/auth/token` | None | Exchange code for tokens (body driven, preferred for SPAs) |
| `POST` | `/auth/refresh` | None | Refresh access token |
| `POST` | `/auth/logout` | None | Revoke refresh token / end session |
| `GET` | `/auth/me` | Bearer token | Get current user's Keycloak profile |

### `GET /auth/login` — query params

| Param | Required | Default | Description |
|---|---|---|---|
| `redirectUri` | No | `KEYCLOAK_REDIRECT_URI` | Callback URL after login |
| `idpHint` | No | — | `google` to skip Keycloak login page and go straight to Google |

### `POST /auth/token` — request body

```json
{
  "code":         "authorization-code-from-keycloak",
  "redirectUri":  "http://localhost:5173/callback",
  "codeVerifier": "pkce-verifier (optional)",
  "idpHint":      "google (optional, for recording provider)"
}
```

### `POST /auth/refresh` — request body

```json
{ "refreshToken": "eyJhbGci..." }
```

### `POST /auth/logout` — request body

```json
{ "refreshToken": "eyJhbGci..." }
```

---

## 11. Token & user model reference

### Token fields

| Field | Type | Description |
|---|---|---|
| `access_token` | string | JWT for API calls. Pass as `Authorization: Bearer` |
| `expires_in` | number | Seconds until access token expires (default 300) |
| `refresh_token` | string | Used to get new access tokens |
| `refresh_expires_in` | number | Seconds until refresh token expires (default 1800) |
| `token_type` | string | Always `"Bearer"` |
| `id_token` | string | OIDC identity token with user claims |
| `scope` | string | Granted scopes |

### User fields (from our database)

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key in our database |
| `keycloakSub` | string | Immutable Keycloak user ID — use as foreign key for related data |
| `email` | string \| null | Refreshed from Keycloak on every login |
| `name` | string \| null | Refreshed from Keycloak on every login |
| `provider` | string | `"google"` or `"keycloak"` — set at first login, never changes |
| `isActive` | boolean | `true` by default |
| `createdAt` | ISO date | When the user first logged in |
| `updatedAt` | ISO date | When the user last logged in |

### Important JWT claims

| Claim | Description |
|---|---|
| `sub` | **Immutable** Keycloak user ID — always use this as foreign key, never email |
| `email` | User email (can change) |
| `preferred_username` | Username (can change) |
| `exp` | Token expiry (Unix timestamp) |
| `realm_access.roles` | Array of realm-level Keycloak roles |
| `identity_provider` | Which IDP was used (`google`, absent for local accounts) |

---

## 12. PKCE (recommended for SPA & mobile)

PKCE (Proof Key for Code Exchange) prevents authorization code interception attacks. It is strongly recommended for browser SPAs and mobile apps.

### Step 1 — Generate verifier and challenge before login

```js
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const codeVerifier  = generateCodeVerifier();
const codeChallenge = await generateCodeChallenge(codeVerifier);
sessionStorage.setItem('code_verifier', codeVerifier);
```

### Step 2 — Append PKCE params to the authorization URL

After calling `GET /auth/login`, append PKCE params before redirecting:

```js
const { authorizationUrl, state } = await fetch('/auth/login').then(r => r.json());
sessionStorage.setItem('oauth_state', state);

const url = new URL(authorizationUrl);
url.searchParams.set('code_challenge',        codeChallenge);
url.searchParams.set('code_challenge_method', 'S256');

window.location.href = url.toString();
```

### Step 3 — Send verifier with the code exchange

```js
const { token, user, isNewUser } = await fetch('/auth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code,
    redirectUri:  window.location.origin + '/callback',
    codeVerifier: sessionStorage.getItem('code_verifier'),
  }),
}).then(r => r.json());

sessionStorage.removeItem('code_verifier');
```

---

## 13. Error reference

| HTTP | Scenario | What to do |
|---|---|---|
| `400 Bad Request` | Missing `code` or `refreshToken` field | Check request body / query params |
| `401 Unauthorized` | Missing or invalid `Authorization` header on `/auth/me` | Re-authenticate |
| `401 Unauthorized` | Access token expired on a protected route | Call `POST /auth/refresh` then retry |
| `502 Bad Gateway` | Keycloak returned an error (e.g. invalid code, expired code) | Start login flow again |
| `502 Bad Gateway` | Keycloak is unreachable | Check Keycloak health at `GET /health` |

### Keycloak error codes (inside 502 message)

| Code | Meaning |
|---|---|
| `invalid_grant` | Code already used, expired, or wrong `redirect_uri` |
| `invalid_client` | Wrong client ID or secret |
| `invalid_redirect_uri` | `redirectUri` not registered in Keycloak client |
| `unauthorized_client` | Client not allowed to use this grant type |
