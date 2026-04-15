# Hướng dẫn Authentication

[English version](auth.md)

Tài liệu này hướng dẫn frontend web/mobile tích hợp từng bước với backend authentication API sử dụng **Keycloak** theo chuẩn **OAuth 2.0 Authorization Code Flow**.

---

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Điều kiện tiên quyết](#2-điều-kiện-tiên-quyết)
3. [Môi trường và URL nền tảng](#3-môi-trường-và-url-nền-tảng)
4. [Từng bước: đăng nhập tài khoản Keycloak thường](#4-từng-bước-đăng-nhập-tài-khoản-keycloak-thường)
5. [Từng bước: đăng nhập Google](#5-từng-bước-đăng-nhập-google)
6. [Từng bước: refresh token](#6-từng-bước-refresh-token)
7. [Từng bước: logout](#7-từng-bước-logout)
8. [Gọi API được bảo vệ](#8-gọi-api-được-bảo-vệ)
9. [Lấy hồ sơ người dùng hiện tại](#9-lấy-hồ-sơ-người-dùng-hiện-tại)
10. [Danh sách endpoint](#10-danh-sách-endpoint)
11. [Tham chiếu token và user model](#11-tham-chiếu-token-và-user-model)
12. [PKCE cho SPA/mobile](#12-pkce-cho-spamobile)
13. [Các lỗi thường gặp](#13-các-lỗi-thường-gặp)

---

## 1. Tổng quan

```text
Client (browser / mobile)
  │
  │  1. GET /auth/login[?idpHint=google]
  │  ◄── { authorizationUrl, state, redirectUri }
  │
  │  2. Redirect browser → authorizationUrl (trang đăng nhập Keycloak / Google)
  │
  │  3. Người dùng xác thực
  │     └── Lần đầu đăng nhập Google: Keycloak hiển thị form "Cập nhật hồ sơ"
  │
  │  4. Keycloak redirect → redirectUri?code=...&state=...
  │
  │  5. POST /auth/token { code, redirectUri [, idpHint] }
  │  ◄── { token, profile, user, isNewUser }
  │
  │  6. Lưu access_token + refresh_token
  │
  │  7. Gọi API kèm Authorization: Bearer <access_token>
  │
  │  8. POST /auth/refresh khi access token hết hạn
  │
  │  9. POST /auth/logout để kết thúc session
```

Backend đóng vai trò **token broker**: mọi tác vụ nhạy cảm với Keycloak đều được xử lý server-to-server. Client chỉ gọi backend API.

---

## 2. Điều kiện tiên quyết

| Thành phần | Giá trị |
|---|---|
| Backend API | `http://localhost:3000` (hoặc domain deploy) |
| Keycloak | `http://localhost:8080` |
| Realm | `be-capstone` |
| Client ID | `be-capstone-api` |
| Google OAuth app | Cấu hình trong Keycloak admin → Identity Providers → Google |

> Thiết lập Google OAuth một lần:
> 1. Vào [console.cloud.google.com](https://console.cloud.google.com)
> 2. Tạo OAuth 2.0 Client ID
> 3. Thêm redirect URI: `http://localhost:8080/realms/be-capstone/broker/google/endpoint`
> 4. Chép Client ID và Client Secret vào Keycloak

---

## 3. Môi trường và URL nền tảng

| Biến | Local dev | Mô tả |
|---|---|---|
| Backend API | `http://localhost:3000` | NestJS API server |
| `KEYCLOAK_URL` | `http://localhost:8080` | URL gốc Keycloak (API + browser) |

Mọi URL trả về từ `/auth/login` và `/auth/endpoints` đều dùng `KEYCLOAK_URL`, nên frontend/browser có thể truy cập trực tiếp.

---

## 4. Từng bước: đăng nhập tài khoản Keycloak thường

### Bước 1 — Lấy authorization URL

```http
GET /auth/login
```

Query params tùy chọn:

| Param | Mô tả |
|---|---|
| `redirectUri` | Nơi Keycloak redirect về sau khi đăng nhập. Mặc định là `KEYCLOAK_REDIRECT_URI`. |

**Response**

```json
{
  "authorizationUrl": "http://localhost:8080/realms/be-capstone/protocol/openid-connect/auth?...",
  "state": "550e8400-e29b-41d4-a716-446655440000",
  "redirectUri": "http://localhost:3000/auth/callback",
  "idpHint": null
}
```

**Web**

```js
const { authorizationUrl, state } = await fetch('/auth/login').then(r => r.json());
sessionStorage.setItem('oauth_state', state);
window.location.href = authorizationUrl;
```

**Mobile**

```js
const { authorizationUrl, state } = await fetch(
  `/auth/login?redirectUri=${encodeURIComponent('myapp://auth/callback')}`
).then(r => r.json());

await openInAppBrowser(authorizationUrl);
```

### Bước 2 — Người dùng đăng nhập trên Keycloak

Trình duyệt/in-app browser sẽ hiển thị trang đăng nhập Keycloak.

### Bước 3 — Xử lý callback và exchange code

Sau khi đăng nhập thành công, Keycloak redirect tới `redirectUri?code=...&state=...`.

> Hãy kiểm tra `state` để chống CSRF.

**Web SPA**

```js
const params = new URLSearchParams(window.location.search);
const code = params.get('code');
const state = params.get('state');

if (state !== sessionStorage.getItem('oauth_state')) {
  throw new Error('State mismatch');
}

const res = await fetch('/auth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code,
    redirectUri: window.location.origin + '/callback',
  }),
});

const { token, profile, user, isNewUser } = await res.json();

localStorage.setItem('access_token', token.access_token);
localStorage.setItem('refresh_token', token.refresh_token);
```

**Mobile**

```js
const res = await fetch('/auth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code,
    redirectUri: 'myapp://auth/callback',
  }),
});

const { token, user, isNewUser } = await res.json();
await SecureStore.setItemAsync('access_token', token.access_token);
await SecureStore.setItemAsync('refresh_token', token.refresh_token);
```

**Response**

```json
{
  "token": {
    "access_token": "eyJhbGci...",
    "expires_in": 300,
    "refresh_expires_in": 1800,
    "refresh_token": "eyJhbGci...",
    "token_type": "Bearer",
    "id_token": "eyJhbGci...",
    "scope": "openid profile email"
  },
  "profile": {
    "sub": "a1b2c3d4-0000-0000-0000-000000000000",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "user": {
    "id": "uuid-from-our-db",
    "keycloakSub": "a1b2c3d4-0000-0000-0000-000000000000",
    "email": "user@example.com",
    "name": "John Doe",
    "provider": "keycloak",
    "isActive": true
  },
  "isNewUser": true
}
```

`isNewUser: true` nghĩa là backend vừa tạo mới người dùng trong bảng `users`.

---

## 5. Từng bước: đăng nhập Google

Flow này giống hệt đăng nhập thường, chỉ khác là có `idpHint=google` để bỏ qua trang login Keycloak và chuyển thẳng tới Google.

### Đăng nhập Google lần đầu — cập nhật hồ sơ

Ở **lần đầu tiên** đăng nhập Google (khi chưa có user Keycloak tương ứng), Keycloak sẽ hiển thị form "Cập nhật hồ sơ" để người dùng xác nhận/chỉnh sửa tên và email trước khi tạo tài khoản. Điều này chỉ xảy ra **một lần duy nhất** — các lần đăng nhập sau sẽ chuyển thẳng tới callback.

| Lần đăng nhập | Điều gì xảy ra |
|---|---|
| Lần đầu (user mới) | Đăng nhập Google → form "Cập nhật hồ sơ" → tạo tài khoản → callback |
| Các lần sau | Đăng nhập Google → callback (không hỏi hồ sơ) |

### Bước 1 — Lấy Google authorization URL

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
window.location.href = authorizationUrl;
```

### Bước 2 — Người dùng xác thực trên Google

Google hiển thị trang đăng nhập riêng. Sau khi người dùng đồng ý, Google redirect lại Keycloak, sau đó Keycloak redirect về ứng dụng.

> **Chỉ lần đầu:** Keycloak sẽ hiển thị form "Cập nhật hồ sơ" giữa bước đăng nhập Google và redirect callback. Người dùng xác nhận tên/email rồi submit. Điều này chỉ xảy ra một lần cho mỗi tài khoản Google.

### Bước 3 — Exchange code và truyền `idpHint`

```js
const { token, user, isNewUser } = await fetch('/auth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code,
    redirectUri,
    idpHint: 'google',
  }),
}).then(r => r.json());
```

Lúc này `user.provider` sẽ là `"google"`.

---

## 6. Từng bước: refresh token

Access token sẽ hết hạn sau `expires_in` giây. Dùng refresh token để lấy access token mới.

```http
POST /auth/refresh
Content-Type: application/json

{ "refreshToken": "<refresh_token>" }
```

**Response**

```json
{
  "access_token": "eyJhbGci...",
  "expires_in": 300,
  "refresh_token": "eyJhbGci...",
  "token_type": "Bearer"
}
```

**Web**

```js
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refresh_token');
  const res = await fetch('/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    localStorage.clear();
    window.location.href = '/login';
    return null;
  }

  const token = await res.json();
  localStorage.setItem('access_token', token.access_token);
  localStorage.setItem('refresh_token', token.refresh_token);
  return token.access_token;
}
```

---

## 7. Từng bước: logout

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

---

## 8. Gọi API được bảo vệ

Luôn gửi access token theo dạng Bearer:

```http
GET /api/some-resource
Authorization: Bearer <access_token>
```

Ví dụ wrapper tự refresh khi gặp `401`:

```js
async function apiFetch(url, options = {}) {
  const request = (token) =>
    fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });

  let res = await request(localStorage.getItem('access_token'));

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken) return res;
    res = await request(newToken);
  }

  return res;
}
```

---

## 9. Lấy hồ sơ người dùng hiện tại

```http
GET /auth/me
Authorization: Bearer <access_token>
```

**Response**

```json
{
  "sub": "a1b2c3d4-0000-0000-0000-000000000000",
  "email": "user@example.com",
  "name": "John Doe",
  "preferred_username": "john",
  "identity_provider": "google"
}
```

---

## 10. Danh sách endpoint

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| `GET` | `/auth/endpoints` | None | OIDC discovery endpoints |
| `GET` | `/auth/login` | None | Lấy authorization URL |
| `GET` | `/auth/callback` | None | Exchange code qua query params |
| `POST` | `/auth/token` | None | Exchange code qua body |
| `POST` | `/auth/refresh` | None | Refresh access token |
| `POST` | `/auth/logout` | None | Thu hồi refresh token |
| `GET` | `/auth/me` | Bearer token | Lấy profile hiện tại |

### Query params của `GET /auth/login`

| Param | Bắt buộc | Mặc định | Mô tả |
|---|---|---|---|
| `redirectUri` | Không | `KEYCLOAK_REDIRECT_URI` | Callback URL |
| `idpHint` | Không | — | Dùng `google` để chuyển thẳng sang Google |

### Body của `POST /auth/token`

```json
{
  "code": "authorization-code",
  "redirectUri": "http://localhost:5173/callback",
  "codeVerifier": "pkce-verifier",
  "idpHint": "google"
}
```

---

## 11. Tham chiếu token và user model

### Các field của token

| Field | Kiểu | Mô tả |
|---|---|---|
| `access_token` | string | JWT dùng để gọi API |
| `expires_in` | number | Số giây trước khi access token hết hạn |
| `refresh_token` | string | Dùng để lấy access token mới |
| `refresh_expires_in` | number | Số giây trước khi refresh token hết hạn |
| `token_type` | string | Luôn là `"Bearer"` |
| `id_token` | string | OIDC identity token |
| `scope` | string | Scope được cấp |

### Các field của `user` trong DB

| Field | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính trong DB |
| `keycloakSub` | string | ID bất biến của người dùng trong Keycloak |
| `email` | string \| null | Đồng bộ lại mỗi lần đăng nhập |
| `name` | string \| null | Đồng bộ lại mỗi lần đăng nhập |
| `provider` | string | `"google"` hoặc `"keycloak"` |
| `isActive` | boolean | Mặc định `true` |
| `createdAt` | ISO date | Lần đầu đăng nhập |
| `updatedAt` | ISO date | Lần đăng nhập gần nhất |

### Claim quan trọng trong JWT

| Claim | Mô tả |
|---|---|
| `sub` | ID bất biến của user trong Keycloak |
| `email` | Email của user |
| `preferred_username` | Username |
| `exp` | Thời điểm hết hạn token |
| `realm_access.roles` | Danh sách role realm |
| `identity_provider` | Provider đã dùng (`google`, hoặc không có nếu local account) |

---

## 12. PKCE cho SPA/mobile

PKCE giúp chống việc bị đánh cắp authorization code. Khuyến nghị mạnh cho SPA/mobile.

### Bước 1 — Tạo verifier và challenge

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
```

### Bước 2 — Gắn PKCE params vào authorization URL

```js
const { authorizationUrl, state } = await fetch('/auth/login').then(r => r.json());
const url = new URL(authorizationUrl);
url.searchParams.set('code_challenge', codeChallenge);
url.searchParams.set('code_challenge_method', 'S256');
window.location.href = url.toString();
```

### Bước 3 — Gửi `codeVerifier` khi exchange code

```js
const { token } = await fetch('/auth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code,
    redirectUri: window.location.origin + '/callback',
    codeVerifier,
  }),
}).then(r => r.json());
```

---

## 13. Các lỗi thường gặp

| HTTP | Tình huống | Cách xử lý |
|---|---|---|
| `400` | Thiếu `code` hoặc `refreshToken` | Kiểm tra lại request |
| `401` | Thiếu/sai Authorization header ở `/auth/me` | Đăng nhập lại |
| `401` | Access token hết hạn | Gọi `/auth/refresh` rồi retry |
| `502` | Keycloak trả lỗi (code sai/hết hạn) | Bắt đầu flow đăng nhập lại |
| `502` | Keycloak không truy cập được | Kiểm tra `/health` |

### Một số lỗi Keycloak thường thấy

| Code | Ý nghĩa |
|---|---|
| `invalid_grant` | Code đã dùng, hết hạn, hoặc sai `redirect_uri` |
| `invalid_client` | Sai client ID hoặc secret |
| `invalid_redirect_uri` | `redirectUri` chưa được phép trong Keycloak client |
| `unauthorized_client` | Client không được phép dùng grant type này |
