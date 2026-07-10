# Hướng dẫn Authentication — Mobile (Expo Deep Link)

[English version](auth-mobile.md) · [Hướng dẫn web](auth-web.vi.md)

Tài liệu này mô tả flow OAuth **mobile** cho Expo / React Native. Khác với web BFF (cookie), mobile dùng **deep-link redirect** và **one-time exchange code**. Access/refresh token **không bao giờ** nằm trong URL redirect.

---

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Điều kiện & biến môi trường](#2-điều-kiện--biến-môi-trường)
3. [Từng bước đăng nhập](#3-từng-bước-đăng-nhập)
4. [Đổi code lấy token](#4-đổi-code-lấy-token)
5. [Refresh token](#5-refresh-token)
6. [Gọi API bảo vệ (Bearer)](#6-gọi-api-bảo-vệ-bearer)
7. [Danh sách endpoint](#7-danh-sách-endpoint)
8. [Deep link lỗi](#8-deep-link-lỗi)
9. [Lưu ý bảo mật](#9-lưu-ý-bảo-mật)
10. [Ví dụ Expo](#10-ví-dụ-expo)

---

## 1. Tổng quan

```
Expo app
  │
  │  1. POST /auth/login { client_redirect_uri: "glowscan://auth/callback" }
  │     → Backend lưu OAuth state + redirect URI vào Redis
  │     → { login_uri }  (không cần session cookie)
  │
  │  2. Mở login_uri bằng system browser
  │
  │  3. User đăng nhập Keycloak (hoặc Google)
  │
  │  4. Keycloak 302 → Backend GET /auth/callback?code=...&state=...
  │
  │  5. Backend đổi Keycloak code, tạo MOBILE_CODE one-time
  │     → 302 glowscan://auth/callback?code=MOBILE_CODE
  │
  │  6. Expo gọi POST /auth/mobile/exchange { code }
  │     ← { accessToken, refreshToken, expiresIn, user, isNewUser }
  │
  │  7. API tiếp theo: Authorization: Bearer <accessToken>
```

---

## 2. Điều kiện & biến môi trường

| Biến                             | Mặc định                   | Mô tả                                         |
| -------------------------------- | -------------------------- | --------------------------------------------- |
| `MOBILE_REDIRECT_URIS`           | `glowscan://auth/callback` | Whitelist deep-link (phân tách bằng dấu phẩy) |
| `MOBILE_AUTH_CODE_TTL_SECONDS`   | `120`                      | TTL one-time code trong Redis                 |
| `MOBILE_OAUTH_STATE_TTL_SECONDS` | `600`                      | TTL OAuth state mobile trong Redis            |

`client_redirect_uri` phải **khớp chính xác** một URI trong whitelist. URI lạ / `http://evil.com` → `400`.

---

## 3. Từng bước đăng nhập

```js
const res = await fetch(`${API_URL}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_redirect_uri: 'glowscan://auth/callback',
  }),
});
const { login_uri } = await res.json();
```

Sau Keycloak, backend redirect:

```
glowscan://auth/callback?code=<one-time-code>
```

Có thể kèm `&isNewUser=true`. **Không** đưa access/refresh token vào URL.

---

## 4. Đổi code lấy token

```js
const res = await fetch(`${API_URL}/auth/mobile/exchange`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code }),
});
// 200: { accessToken, refreshToken, expiresIn, user, isNewUser }
// 401: code sai / hết hạn / đã dùng
```

---

## 5. Refresh token

```js
const res = await fetch(`${API_URL}/auth/mobile/refresh`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ refreshToken }),
});
// 200: { accessToken, refreshToken, expiresIn }
```

---

## 6. Gọi API bảo vệ (Bearer)

```js
const res = await fetch(`${API_URL}/users/me`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
```

Backend verify JWT qua JWKS của Keycloak realm và map user local theo `sub`.

---

## 7. Danh sách endpoint

| Method | Path                    | Auth               | Mô tả                                            |
| ------ | ----------------------- | ------------------ | ------------------------------------------------ |
| `POST` | `/auth/login`           | Không              | Mobile deep-link → `{ login_uri }` (state Redis) |
| `GET`  | `/auth/callback`        | Không              | Tạo one-time code, 302 về deep link              |
| `POST` | `/auth/mobile/exchange` | Không              | `{ code }` → tokens + user                       |
| `POST` | `/auth/mobile/refresh`  | Không              | `{ refreshToken }` → token mới                   |
| `GET`  | `/users/me`             | Bearer hoặc cookie | Profile user hiện tại                            |

---

## 8. Deep link lỗi

| Redirect                                         | Ý nghĩa                     |
| ------------------------------------------------ | --------------------------- |
| `glowscan://auth/callback?error=missing_params`  | Callback thiếu `code`       |
| `glowscan://auth/callback?error=state_mismatch`  | State thiếu / hết hạn / sai |
| `glowscan://auth/callback?error=exchange_failed` | Đổi code Keycloak thất bại  |

---

## 9. Lưu ý bảo mật

- `state` và mobile `code` chỉ dùng **một lần** (`GETDEL`), TTL ngắn.
- Không đưa token vào deep-link URL.
- Chỉ chấp nhận URI trong `MOBILE_REDIRECT_URIS`.
- Lưu token bằng SecureStore (không dùng AsyncStorage trên production).

---

## 10. Ví dụ Expo

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
  const tokens = await fetch(`${API_URL}/auth/mobile/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  }).then((r) => r.json());

  return tokens;
}
```

Cấu hình scheme `glowscan` trong `app.json` / `app.config.js`.
