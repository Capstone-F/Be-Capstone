# Authentication Guide — Mobile (Expo Deep Link)

[Vietnamese version](auth-mobile.vi.md) · [Web auth guide](auth-web.md)

This guide covers the **mobile** OAuth flow for Expo / React Native. Unlike the web BFF cookie flow, mobile uses a **deep-link redirect** and a **one-time exchange code**. Access and refresh tokens are never placed in the redirect URL.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites & env](#2-prerequisites--env)
3. [Step-by-step login](#3-step-by-step-login)
4. [Exchange code for tokens](#4-exchange-code-for-tokens)
5. [Refresh tokens](#5-refresh-tokens)
6. [Calling protected APIs (Bearer)](#6-calling-protected-apis-bearer)
7. [Endpoint reference](#7-endpoint-reference)
8. [Error deep links](#8-error-deep-links)
9. [Security notes](#9-security-notes)
10. [Expo example](#10-expo-example)

---

## 1. Overview

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

## 3. Step-by-step login

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

## 4. Exchange code for tokens

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

## 5. Refresh tokens

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

## 6. Calling protected APIs (Bearer)

```js
const res = await fetch(`${API_URL}/users/me`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
```

The backend verifies the Keycloak JWT against the realm JWKS and resolves the local user by `sub`. Cookie-based web sessions continue to work unchanged.

---

## 7. Endpoint reference

| Method | Path                    | Auth             | Description                                                              |
| ------ | ----------------------- | ---------------- | ------------------------------------------------------------------------ |
| `POST` | `/auth/login`           | None             | Mobile: deep-link `client_redirect_uri` → `{ login_uri }` (Redis state)  |
| `GET`  | `/auth/callback`        | None             | Mobile: issues one-time code, 302 to deep link                           |
| `POST` | `/auth/mobile/exchange` | None             | `{ code }` → `{ accessToken, refreshToken, expiresIn, user, isNewUser }` |
| `POST` | `/auth/mobile/refresh`  | None             | `{ refreshToken }` → `{ accessToken, refreshToken, expiresIn }`          |
| `GET`  | `/users/me`             | Bearer or cookie | Current user profile                                                     |

---

## 8. Error deep links

On failure the backend redirects to the deep link with an `error` query param:

| Redirect                                         | Meaning                                 |
| ------------------------------------------------ | --------------------------------------- |
| `glowscan://auth/callback?error=missing_params`  | Callback missing `code`                 |
| `glowscan://auth/callback?error=state_mismatch`  | OAuth state missing / expired / invalid |
| `glowscan://auth/callback?error=exchange_failed` | Keycloak code exchange failed           |

---

## 9. Security notes

- OAuth `state` and mobile auth `code` are **single-use** (Redis `GETDEL`) with short TTLs.
- Access / refresh tokens are **never** embedded in the deep-link URL.
- Only URIs listed in `MOBILE_REDIRECT_URIS` are accepted as `client_redirect_uri`.
- Store tokens in secure device storage (e.g. Expo SecureStore), not AsyncStorage in production.

---

## 10. Expo example

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

Configure the `glowscan` scheme in `app.json` / `app.config.js` so the OS routes the deep link back to the app.
