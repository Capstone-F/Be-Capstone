# Hướng dẫn Authentication (BFF Pattern)

[English version](auth.md)

Tài liệu này hướng dẫn frontend tích hợp với backend authentication API. Backend sử dụng **BFF (Backend For Frontend)** pattern — mọi tương tác với Auth0 đều diễn ra ở phía server. Frontend chỉ cần làm việc với **session cookie**, không bao giờ phải xử lý token.

---

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Điều kiện tiên quyết](#2-điều-kiện-tiên-quyết)
3. [Từng bước: Đăng nhập](#3-từng-bước-đăng-nhập)
4. [Từng bước: Đăng nhập Google](#4-từng-bước-đăng-nhập-google)
5. [Từng bước: Lấy thông tin user](#5-từng-bước-lấy-thông-tin-user)
6. [Từng bước: Kiểm tra trạng thái auth](#6-từng-bước-kiểm-tra-trạng-thái-auth)
7. [Từng bước: Đăng xuất](#7-từng-bước-đăng-xuất)
8. [Gọi API được bảo vệ](#8-gọi-api-được-bảo-vệ)
9. [Danh sách endpoint](#9-danh-sách-endpoint)
10. [User model](#10-user-model)
11. [Cấu hình CORS & cookie](#11-cấu-hình-cors--cookie)
12. [Bảng lỗi](#12-bảng-lỗi)

---

## 1. Tổng quan

```
Client (browser)
  │
  │  1. POST /auth/login { client_redirect_uri } → { login_uri } (Set-Cookie: sid)
  │
  │  2. window.location.href = login_uri → Auth0 Universal Login
  │
  │  3. User đăng nhập trên Auth0 (hoặc Google qua social connection)
  │
  │  4. Auth0 302 → Backend /auth/callback?code=...&state=...
  │
  │  5. Backend đổi code lấy token (server-to-server)
  │     └── Lưu token vào server session
  │     └── Upsert user vào database
  │
  │  6. Backend 302 → client_redirect_uri (cùng origin với FRONTEND_URL)
  │
  │  7. Frontend gọi /auth/me (cookie tự động gửi kèm)
  │     ◄── { thông tin user từ database }
  │
  │  8. Mọi API call tiếp theo đều tự động gửi cookie
  │
  │  9. POST /auth/logout → { success, logout_uri }
  │     └── Frontend chuyển browser tới logout_uri để hủy luôn Auth0 SSO session
```

**Nguyên tắc chính:** Frontend không bao giờ nhìn thấy hay lưu trữ token Auth0. Trạng thái xác thực được quản lý hoàn toàn qua HTTP-only session cookie (`sid`). Session được lưu trữ trong **Redis** để truy xuất nhanh và dễ scale ngang.

---

## 2. Điều kiện tiên quyết

| Thành phần   | Giá trị                                                        |
| ------------ | -------------------------------------------------------------- |
| Backend API  | Chạy tại `http://localhost:3000`                               |
| Frontend     | Chạy tại `http://localhost:5173` (cấu hình qua `FRONTEND_URL`) |
| Auth0 tenant | Đã cấu hình theo phần "Auth0 setup" trong README               |

### Biến môi trường bắt buộc (backend)

| Biến                                      | Mô tả                                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `AUTH0_DOMAIN`                            | Auth0 tenant domain (ví dụ `tenant.us.auth0.com`). Issuer = `https://${AUTH0_DOMAIN}/`             |
| `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` | Credentials của Auth0 application                                                                  |
| `AUTH0_AUDIENCE`                          | Auth0 API identifier — bắt buộc để Auth0 cấp access token thật                                     |
| `AUTH0_REDIRECT_URI`                      | URL Auth0 redirect tới sau khi authorize. Phải nằm trong Allowed Callback URLs                     |
| `AUTH0_LOGOUT_RETURN_URL`                 | `returnTo` mặc định cho `v2/logout`. Phải nằm trong Allowed Logout URLs. Mặc định = `FRONTEND_URL` |
| `REDIS_URL`                               | URL kết nối Redis để lưu session (vd `redis://redis:6379`). Mặc định `redis://localhost:6379`      |
| `SESSION_SECRET`                          | Secret để ký session cookie                                                                        |
| `FRONTEND_URL`                            | Origin frontend được phép — phải trùng origin với `client_redirect_uri` khi đăng nhập và CORS      |
| `CORS_ORIGIN`                             | Origin CORS (mặc định = `FRONTEND_URL`)                                                            |

---

## 3. Từng bước: Đăng nhập

### Bước 1 — Gọi POST /auth/login

Gửi URL muốn quay lại sau OAuth (phải **cùng origin** với `FRONTEND_URL`):

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

Backend sẽ:

1. Kiểm tra `client_redirect_uri` (chống open redirect)
2. Tạo `state` CSRF, lưu vào session kèm redirect URI
3. Trả JSON `{ login_uri }` — URL `/authorize` của Auth0 (đã kèm `audience` để được cấp access token thật)

### Bước 2 — User đăng nhập trên Auth0

Browser hiển thị trang Auth0 Universal Login. User đăng nhập bằng email/password hoặc social connection.

### Bước 3 — Xử lý callback tự động

Sau khi đăng nhập, Auth0 redirect về `/auth/callback` của backend. Backend sẽ:

1. Validate `state` parameter
2. Đổi authorization code lấy token (server-to-server)
3. Upsert user vào database (key theo `auth0Sub`)
4. Lưu token vào session
5. Redirect (302) về **`client_redirect_uri`** (có thể thêm `?isNewUser=true`)

Nếu đây là lần đăng nhập đầu tiên, URL sẽ có thêm `?isNewUser=true`:

```js
const params = new URLSearchParams(window.location.search);
if (params.get('isNewUser') === 'true') {
  // Chuyển đến trang onboarding
} else {
  // Chuyển đến dashboard
}
```

---

## 4. Từng bước: Đăng nhập Google

Thêm `idpHint` trong body POST:

```js
body: JSON.stringify({
  client_redirect_uri: `${window.location.origin}/`,
  idpHint: 'google',
}),
```

Backend sẽ map `idpHint=google` thành tham số `connection=google-oauth2` của Auth0. Browser sẽ bỏ qua màn picker Universal Login và đi thẳng sang Google.

> Mọi giá trị `idpHint` khác sẽ được pass nguyên dạng vào tham số Auth0 `connection` (vd `github`, `Username-Password-Authentication`).

| Lần đăng nhập           | Điều gì xảy ra                             |
| ----------------------- | ------------------------------------------ |
| Lần đầu (user mới)      | Google sign-in → Auth0 tạo user → callback |
| User đã có sẵn (Google) | Google sign-in → callback                  |

---

## 5. Từng bước: Lấy thông tin user

```js
const res = await fetch('http://localhost:3000/auth/me', {
  credentials: 'include', // BẮT BUỘC — gửi session cookie
});

if (res.ok) {
  const user = await res.json();
  // { id, auth0Sub, email, name, isActive, createdAt, updatedAt }
}
```

Backend sẽ đọc session, tự refresh access token nếu sắp hết hạn, rồi trả profile từ database local.

---

## 6. Từng bước: Kiểm tra trạng thái auth

```js
const { authenticated } = await fetch('http://localhost:3000/auth/status', {
  credentials: 'include',
}).then((r) => r.json());

if (!authenticated) {
  // Gọi POST /auth/login rồi chuyển tới login_uri (xem mục 3)
}
```

---

## 7. Từng bước: Đăng xuất

```js
const res = await fetch('http://localhost:3000/auth/logout', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  // Tùy chọn: override URL Auth0 redirect về sau logout (phải nằm trong Allowed Logout URLs)
  body: JSON.stringify({ return_to: `${window.location.origin}/goodbye` }),
});

const { logout_uri } = await res.json();

// Chuyển browser tới Auth0 v2/logout để hủy luôn SSO session.
// Auth0 sẽ redirect về AUTH0_LOGOUT_RETURN_URL (hoặc return_to bạn truyền).
window.location.href = logout_uri;
```

Backend sẽ:

1. Revoke refresh token tại Auth0 (`oauth/revoke`)
2. Hủy session phía server
3. Xóa cookie `sid`
4. Trả `{ success: true, logout_uri }` — URL `v2/logout` của Auth0

> Nếu bỏ qua bước `window.location.href = logout_uri`, session local đã mất nhưng cookie SSO của Auth0 vẫn còn — lần `POST /auth/login` tiếp theo sẽ tự động đăng nhập lại không cần qua Universal Login.

---

## 8. Gọi API được bảo vệ

Chỉ cần thêm `credentials: 'include'` — browser tự gửi cookie:

```js
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
  });

  if (res.status === 401) {
    // Session hết hạn — bắt đầu login lại (POST /auth/login)
    return null;
  }

  return res;
}
```

Không cần `Authorization` header, không cần quản lý token, không cần refresh logic ở frontend.

---

## 9. Danh sách endpoint

| Method | Path             | Auth                       | Mô tả                                                            |
| ------ | ---------------- | -------------------------- | ---------------------------------------------------------------- |
| `POST` | `/auth/login`    | Không (set session cookie) | JSON `{ client_redirect_uri, idpHint? }` → `{ login_uri }`       |
| `GET`  | `/auth/callback` | Không                      | OAuth callback (Auth0 redirect về đây)                           |
| `GET`  | `/auth/me`       | Session cookie             | Lấy thông tin user hiện tại                                      |
| `GET`  | `/auth/status`   | Không                      | Kiểm tra session có authenticated không                          |
| `POST` | `/auth/logout`   | Session cookie             | Hủy session, revoke refresh token, trả `{ success, logout_uri }` |

### `POST /auth/login` — JSON body

| Field                 | Bắt buộc | Mô tả                                                                                                           |
| --------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `client_redirect_uri` | Có       | URL tuyệt đối sau khi đăng nhập (cùng origin với `FRONTEND_URL`)                                                |
| `idpHint`             | Không    | `google` để bỏ qua Universal Login và đi thẳng sang Google. Giá trị khác sẽ map vào tham số Auth0 `connection`. |

### `POST /auth/logout` — JSON body

| Field       | Bắt buộc | Mô tả                                                                      |
| ----------- | -------- | -------------------------------------------------------------------------- |
| `return_to` | Không    | Override `AUTH0_LOGOUT_RETURN_URL`. Cùng origin với `client_redirect_uri`. |

---

## 10. User model

| Field       | Type           | Mô tả                                            |
| ----------- | -------------- | ------------------------------------------------ | -------------------- | ---------------------------- |
| `id`        | UUID           | Primary key trong database                       |
| `auth0Sub`  | string         | Auth0 user ID cố định (`sub` claim, ví dụ `auth0 | ...`, `google-oauth2 | ...`) — dùng làm foreign key |
| `email`     | string \| null | Cập nhật từ Auth0 mỗi lần đăng nhập              |
| `name`      | string \| null | Cập nhật từ Auth0 mỗi lần đăng nhập              |
| `isActive`  | boolean        | Mặc định `true`                                  |
| `createdAt` | ISO date       | Thời điểm đăng nhập lần đầu                      |
| `updatedAt` | ISO date       | Thời điểm đăng nhập gần nhất                     |

> Schema cũ có cột `keycloakSub` và `provider`. Cả hai đã bị xóa. `sub` của Auth0 đã encode connection (`auth0|...` cho database user, `google-oauth2|...` cho Google, …) nên không cần cột `provider` riêng.

---

## 11. Cấu hình CORS & cookie

Để session cookie hoạt động giữa frontend và backend (khác origin):

### Frontend

Mọi `fetch` call phải có `credentials: 'include'`:

```js
fetch('http://localhost:3000/auth/me', { credentials: 'include' });
```

Nếu dùng **Axios**:

```js
const api = axios.create({
  baseURL: 'http://localhost:3000',
  withCredentials: true,
});
```

---

## 12. Bảng lỗi

| HTTP                                         | Tình huống                            | Cách xử lý                                   |
| -------------------------------------------- | ------------------------------------- | -------------------------------------------- |
| `401 Unauthorized`                           | Không có session hoặc session hết hạn | Đăng nhập lại (`POST /auth/login`)           |
| `400 Bad Request`                            | `client_redirect_uri` không hợp lệ    | Sửa URL hoặc trùng origin với `FRONTEND_URL` |
| `302` → `/auth/error?reason=missing_params`  | Callback thiếu code/state             | Bắt đầu lại login flow                       |
| `302` → `/auth/error?reason=state_mismatch`  | CSRF state không khớp                 | Bắt đầu lại login flow                       |
| `302` → `/auth/error?reason=exchange_failed` | Auth0 code exchange thất bại          | Bắt đầu lại login flow                       |
