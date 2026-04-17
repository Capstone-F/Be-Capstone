# Hướng dẫn Authentication (BFF Pattern)

[English version](auth.md)

Tài liệu này hướng dẫn frontend tích hợp với backend authentication API. Backend sử dụng **BFF (Backend For Frontend)** pattern — mọi tương tác với Keycloak đều diễn ra ở phía server. Frontend chỉ cần làm việc với **session cookie**, không bao giờ phải xử lý token.

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
  │  1. window.location.href = '/auth/login'
  │     (browser chuyển hướng đến backend)
  │
  │  2. Backend 302 → Keycloak login page
  │
  │  3. User đăng nhập trên Keycloak (hoặc Google)
  │
  │  4. Keycloak 302 → Backend /auth/callback?code=...
  │
  │  5. Backend đổi code lấy token (server-to-server)
  │     └── Lưu token vào server session
  │     └── Upsert user vào database
  │
  │  6. Backend 302 → FRONTEND_URL (Set-Cookie: sid=...)
  │
  │  7. Frontend gọi /auth/me (cookie tự động gửi kèm)
  │     ◄── { thông tin user từ database }
  │
  │  8. Mọi API call tiếp theo đều tự động gửi cookie
  │
  │  9. POST /auth/logout để đăng xuất
```

**Nguyên tắc chính:** Frontend không bao giờ nhìn thấy hay lưu trữ token Keycloak. Trạng thái xác thực được quản lý hoàn toàn qua HTTP-only session cookie (`sid`). Session được lưu trữ trong **Redis** để truy xuất nhanh và dễ scale ngang.

---

## 2. Điều kiện tiên quyết

| Thành phần | Giá trị |
|---|---|
| Backend API | Chạy tại `http://localhost:3000` |
| Frontend | Chạy tại `http://localhost:5173` (cấu hình qua `FRONTEND_URL`) |
| Keycloak (public) | `http://localhost:8080` — browser truy cập |
| Keycloak (internal) | `http://keycloak:8080` — backend gọi qua Docker network |
| Realm | `be-capstone` |

### Biến môi trường bắt buộc (backend)

| Biến | Mô tả |
|---|---|
| `KEYCLOAK_PUBLIC_URL` | URL Keycloak browser truy cập được (vd: `http://localhost:8080`) |
| `KEYCLOAK_INTERNAL_URL` | URL Keycloak cho server-to-server trong Docker (vd: `http://keycloak:8080`). Mặc định = `KEYCLOAK_PUBLIC_URL`. |
| `REDIS_URL` | URL kết nối Redis để lưu session (vd: `redis://redis:6379`). Mặc định `redis://localhost:6379`. |
| `SESSION_SECRET` | Secret để ký session cookie |
| `FRONTEND_URL` | URL gốc frontend (vd: `http://localhost:5173`) |

---

## 3. Từng bước: Đăng nhập

### Bước 1 — Chuyển hướng đến login

Chỉ cần chuyển hướng browser đến backend:

```js
window.location.href = 'http://localhost:3000/auth/login';
```

Backend sẽ:
1. Tạo `state` parameter cho CSRF protection, lưu vào session
2. Redirect (302) đến trang login Keycloak

### Bước 2 — User đăng nhập trên Keycloak

Browser hiển thị trang login Keycloak. User nhập thông tin đăng nhập.

### Bước 3 — Xử lý callback tự động

Sau khi đăng nhập, Keycloak redirect về `/auth/callback` của backend. Backend sẽ:
1. Validate `state` parameter
2. Đổi authorization code lấy token (server-to-server)
3. Upsert user vào database
4. Lưu token vào session
5. Redirect (302) về `FRONTEND_URL`

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

Dùng tham số `idpHint=google`:

```js
window.location.href = 'http://localhost:3000/auth/login?idpHint=google';
```

| Lần đăng nhập | Điều gì xảy ra |
|---|---|
| Lần đầu (user mới) | Google sign-in → Keycloak "Review Profile" → callback |
| Các lần sau | Google sign-in → callback |

---

## 5. Từng bước: Lấy thông tin user

```js
const res = await fetch('http://localhost:3000/auth/me', {
  credentials: 'include',  // BẮT BUỘC — gửi session cookie
});

if (res.ok) {
  const user = await res.json();
  // { id, keycloakSub, email, name, provider, isActive, createdAt, updatedAt }
}
```

---

## 6. Từng bước: Kiểm tra trạng thái auth

```js
const { authenticated } = await fetch('http://localhost:3000/auth/status', {
  credentials: 'include',
}).then(r => r.json());

if (!authenticated) {
  window.location.href = 'http://localhost:3000/auth/login';
}
```

---

## 7. Từng bước: Đăng xuất

```js
await fetch('http://localhost:3000/auth/logout', {
  method: 'POST',
  credentials: 'include',
});
window.location.href = '/login';
```

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
    window.location.href = '/auth/login';
    return null;
  }

  return res;
}
```

Không cần `Authorization` header, không cần quản lý token, không cần refresh logic ở frontend.

---

## 9. Danh sách endpoint

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| `GET` | `/auth/login` | Không | Redirect browser đến Keycloak login |
| `GET` | `/auth/callback` | Không | OAuth callback (Keycloak redirect về đây) |
| `GET` | `/auth/me` | Session cookie | Lấy thông tin user hiện tại |
| `GET` | `/auth/status` | Không | Kiểm tra session có authenticated không |
| `POST` | `/auth/logout` | Session cookie | Hủy session và thu hồi token |

### `GET /auth/login` — query params

| Param | Bắt buộc | Mô tả |
|---|---|---|
| `idpHint` | Không | `google` để bỏ qua trang login Keycloak |

---

## 10. User model

| Field | Type | Mô tả |
|---|---|---|
| `id` | UUID | Primary key trong database |
| `keycloakSub` | string | ID cố định từ Keycloak — dùng làm foreign key |
| `email` | string \| null | Cập nhật từ Keycloak mỗi lần đăng nhập |
| `name` | string \| null | Cập nhật từ Keycloak mỗi lần đăng nhập |
| `provider` | string | `"google"` hoặc `"keycloak"` — set lần đăng nhập đầu |
| `isActive` | boolean | Mặc định `true` |
| `createdAt` | ISO date | Thời điểm đăng nhập lần đầu |
| `updatedAt` | ISO date | Thời điểm đăng nhập gần nhất |

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

| HTTP | Tình huống | Cách xử lý |
|---|---|---|
| `401 Unauthorized` | Không có session hoặc session hết hạn | Redirect đến `GET /auth/login` |
| `302` → `/auth/error?reason=missing_params` | Callback thiếu code/state | Bắt đầu lại login flow |
| `302` → `/auth/error?reason=state_mismatch` | CSRF state không khớp | Bắt đầu lại login flow |
| `302` → `/auth/error?reason=exchange_failed` | Keycloak code exchange thất bại | Bắt đầu lại login flow |
