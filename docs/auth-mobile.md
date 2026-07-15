# Authentication Guide — Mobile (Expo Deep Link)

[Vietnamese version](auth-mobile.vi.md) · [Web auth guide](auth-web.md)

This guide covers the **mobile** authentication flows for Expo / React Native. Two approaches are available:

1. **OAuth deep-link flow** — opens a system browser for Keycloak login (supports Google / social login).
2. **Direct login/register** — `POST` with username/password, no browser redirect required.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites & env](#2-prerequisites--env)
3. [Direct login (no redirect)](#3-direct-login-no-redirect)
4. [Direct register (no redirect)](#4-direct-register-no-redirect)
5. [OAuth deep-link login](#5-oauth-deep-link-login)
6. [Exchange code for tokens](#6-exchange-code-for-tokens)
7. [Refresh tokens](#7-refresh-tokens)
8. [Calling protected APIs (Bearer)](#8-calling-protected-apis-bearer)
9. [Endpoint reference](#9-endpoint-reference)
10. [Error codes](#10-error-codes)
11. [Security notes](#11-security-notes)
12. [Expo example](#12-expo-example)

---

## 1. Overview

### Direct login/register (simplest)

```
Expo app
  │
  │  POST /auth/mobile/login   { username, password }
  │  POST /auth/mobile/register { email, password, name? }
  │    ← { accessToken, refreshToken, expiresIn, user, isNewUser }
  │
  │  Subsequent API calls: Authorization: Bearer <accessToken>
```

### OAuth deep-link flow (Google / social login)

```
Expo app
  │
  │  1. POST /auth/login { client_redirect_uri: "glowscan://auth/callback" }
  │     → Backend stores OAuth state + redirect URI in Redis
  │     → { login_uri }  (no session cookie required)
  │
  │  2. Open login_uri in system browser (AuthSession / WebBrowser)
  │
  │  3. User authenticates on Keycloak (or Google)
  │
  │  4. Keycloak 302 → Backend GET /auth/callback?code=...&state=...
  │     (no cookie needed — state comes from Redis)
  │
  │  5. Backend exchanges Keycloak code, issues one-time MOBILE_CODE
  │     → 302 glowscan://auth/callback?code=MOBILE_CODE
  │
  │  6. Expo calls POST /auth/mobile/exchange { code }
  │     ← { accessToken, refreshToken, expiresIn, user, isNewUser }
  │
  │  7. Subsequent API calls: Authorization: Bearer <accessToken>
```

---

## 2. Prerequisites & env

| Variable                         | Default                    | Description                                 |
| -------------------------------- | -------------------------- | ------------------------------------------- |
| `MOBILE_REDIRECT_URIS`           | `glowscan://auth/callback` | Comma-separated whitelist of deep-link URIs |
| `MOBILE_AUTH_CODE_TTL_SECONDS`   | `120`                      | TTL for one-time exchange codes in Redis    |
| `MOBILE_OAUTH_STATE_TTL_SECONDS` | `600`                      | TTL for mobile OAuth state entries in Redis |

`client_redirect_uri` must **exactly match** an entry in `MOBILE_REDIRECT_URIS`. Unknown schemes and `http://evil.com` are rejected with `400`.

---

## 3. Direct login (no redirect)

The simplest login option — no browser redirect required.

```js
const res = await fetch(`${API_URL}/auth/mobile/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'user@example.com', // email or Keycloak username
    password: 'mypassword',
  }),
});

// 200: { accessToken, refreshToken, expiresIn, user, isNewUser }
// 401: invalid username or password
```

The backend authenticates via Keycloak's password grant server-side. Credentials are never sent directly to Keycloak from the mobile client.

---

## 4. Direct register (no redirect)

Creates a new customer account and immediately returns tokens (no email verification step).

```js
const res = await fetch(`${API_URL}/auth/mobile/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'newuser@example.com',
    password: 'mypassword', // minimum 8 characters
    name: 'John Doe', // optional
  }),
});

// 200: { accessToken, refreshToken, expiresIn, user, isNewUser: true }
// 409: email already registered
// 400: validation error (invalid email, password too short)
```

The new account receives the `customer` role automatically (Keycloak realm default). Google / social login still requires the OAuth deep-link flow below.

---

## 5. OAuth deep-link login

Use this flow for Google login or when you want to use the Keycloak login page.

```js
const res = await fetch(`${API_URL}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_redirect_uri: 'glowscan://auth/callback',
    // idpHint: 'google', // optional
  }),
});
const { login_uri } = await res.json();
// Open login_uri in the system browser; wait for deep-link return
```

The backend:

1. Detects a whitelisted mobile deep link
2. Stores `{ clientRedirectUri, idpHint, flow: 'mobile' }` in Redis under `oauth:state:{state}` (single-use, TTL)
3. Returns `{ login_uri }` — **does not** rely on a session cookie

After Keycloak login, the backend redirects to:

```
glowscan://auth/callback?code=<one-time-code>
```

Optionally `&isNewUser=true` for first-time users. **Never** includes `accessToken` or `refreshToken` in the URL.

---

## 6. Exchange code for tokens

```js
const res = await fetch(`${API_URL}/auth/mobile/exchange`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code }),
});
// 200:
// { accessToken, refreshToken, expiresIn, user, isNewUser }
// 401: invalid, expired, or already-used code
```

The code is stored at `oauth:mobile-code:{code}` and consumed with `GETDEL` (single use).

---

## 7. Refresh tokens

```js
const res = await fetch(`${API_URL}/auth/mobile/refresh`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ refreshToken }),
});
// 200: { accessToken, refreshToken, expiresIn }
// 401: invalid or expired refresh token
```

---

## 8. Calling protected APIs (Bearer)

```js
const res = await fetch(`${API_URL}/users/me`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
```

The backend verifies the Keycloak JWT against the realm JWKS and resolves the local user by `sub`. Cookie-based web sessions continue to work unchanged.

---

## 9. Endpoint reference

| Method | Path                    | Auth             | Description                                                              |
| ------ | ----------------------- | ---------------- | ------------------------------------------------------------------------ |
| `POST` | `/auth/mobile/login`    | None             | `{ username, password }` → tokens + user (direct, no redirect)           |
| `POST` | `/auth/mobile/register` | None             | `{ email, password, name? }` → tokens + user (direct, no redirect)       |
| `POST` | `/auth/login`           | None             | OAuth: deep-link `client_redirect_uri` → `{ login_uri }` (Redis state)   |
| `GET`  | `/auth/callback`        | None             | OAuth: issues one-time code, 302 to deep link                            |
| `POST` | `/auth/mobile/exchange` | None             | `{ code }` → `{ accessToken, refreshToken, expiresIn, user, isNewUser }` |
| `POST` | `/auth/mobile/refresh`  | None             | `{ refreshToken }` → `{ accessToken, refreshToken, expiresIn }`          |
| `GET`  | `/users/me`             | Bearer or cookie | Current user profile                                                     |

---

## 10. Error codes

### Direct login/register errors

| Status | Meaning                                                |
| ------ | ------------------------------------------------------ |
| `400`  | Validation error (missing fields, invalid email, etc.) |
| `401`  | Invalid username or password (login), account disabled |
| `409`  | Email already registered (register)                    |

### OAuth deep-link errors

On failure the backend redirects to the deep link with an `error` query param:

| Redirect                                         | Meaning                                 |
| ------------------------------------------------ | --------------------------------------- |
| `glowscan://auth/callback?error=missing_params`  | Callback missing `code`                 |
| `glowscan://auth/callback?error=state_mismatch`  | OAuth state missing / expired / invalid |
| `glowscan://auth/callback?error=exchange_failed` | Keycloak code exchange failed           |

---

## 11. Security notes

- OAuth `state` and mobile auth `code` are **single-use** (Redis `GETDEL`) with short TTLs.
- Access / refresh tokens are **never** embedded in the deep-link URL.
- Only URIs listed in `MOBILE_REDIRECT_URIS` are accepted as `client_redirect_uri`.
- Store tokens in secure device storage (e.g. Expo SecureStore), not AsyncStorage in production.
- Direct login/register credentials are sent over HTTPS to the backend only; the Keycloak token endpoint is never exposed to the mobile client.

---

## 12. Expo example

```js
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

WebBrowser.maybeCompleteAuthSession();

const REDIRECT = 'glowscan://auth/callback';

async function loginWithKeycloak() {
  const start = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_redirect_uri: REDIRECT }),
  }).then((r) => r.json());

  const result = await WebBrowser.openAuthSessionAsync(
    start.login_uri,
    REDIRECT,
  );

  if (result.type !== 'success' || !result.url) {
    throw new Error('Login cancelled');
  }

  const url = Linking.parse(result.url);
  if (url.queryParams?.error) {
    throw new Error(String(url.queryParams.error));
  }

  const code = url.queryParams?.code;
  if (!code) {
    throw new Error('Missing code');
  }

  const tokens = await fetch(`${API_URL}/auth/mobile/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  }).then((r) => r.json());

  // Persist tokens.accessToken / tokens.refreshToken securely
  return tokens;
}
```

### Direct login/register (no browser)

```js
async function loginDirect(username, password) {
  const res = await fetch(`${API_URL}/auth/mobile/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) throw new Error('Login failed');
  return res.json();
  // { accessToken, refreshToken, expiresIn, user, isNewUser }
}

async function registerDirect(email, password, name) {
  const res = await fetch(`${API_URL}/auth/mobile/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });

  if (res.status === 409) throw new Error('Email already registered');
  if (!res.ok) throw new Error('Registration failed');
  return res.json();
  // { accessToken, refreshToken, expiresIn, user, isNewUser: true }
}
```

Configure the `glowscan` scheme in `app.json` / `app.config.js` so the OS routes the deep link back to the app (only needed for the OAuth flow).
