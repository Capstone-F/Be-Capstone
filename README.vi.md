# BE Capstone

[English version](README.md)

Backend API viết bằng NestJS, sử dụng PostgreSQL, Keycloak (OIDC / đăng nhập Google), TypeORM và Swagger.

---

## Điều kiện tiên quyết

| Công cụ | Phiên bản | Mục đích |
|---|---|---|
| [Node.js](https://nodejs.org) | >= 20 | Runtime |
| [npm](https://www.npmjs.com) | >= 10 | Trình quản lý package |
| [Docker](https://docs.docker.com/get-docker/) | >= 24 | Chạy Postgres, Keycloak và production API bằng container |
| [Docker Compose](https://docs.docker.com/compose/) | >= 2.20 | Điều phối nhiều container |

---

## Cấu trúc dự án

```text
src/
  config/          Quản lý env tập trung (ConfigModule, env.config.ts)
  auth/            Các endpoint OIDC (login, callback, token, refresh, logout, me)
  health/          Endpoint kiểm tra sức khỏe API, DB, Keycloak
  users/           User entity và service insert/update user khi đăng nhập
  app.module.ts    Root module
  main.ts          Bootstrap, validate env, cấu hình Swagger
keycloak/
  realm-import/    File JSON realm để Keycloak tự import khi khởi động
docs/
  auth.md          Hướng dẫn frontend tích hợp auth (EN)
  auth.vi.md       Hướng dẫn frontend tích hợp auth (VI)
.github/
  workflows/
    ci.yaml        Build + test khi push / pull request
    build.yaml     Build image và push lên GHCR khi merge vào main
```

---

## Thiết lập ban đầu

### 1. Tạo file `.env`

```bash
cp .env.example .env
```

### 2. Tạo file realm import cho Keycloak

Thư mục `keycloak/realm-import/` đang được **gitignore** vì có thể chứa secret thật (ví dụ Google OAuth credentials). Bạn cần tự tạo trước khi chạy Keycloak.

```bash
mkdir -p keycloak/realm-import
```

Sau đó tạo file `keycloak/realm-import/be-capstone-realm.json` với nội dung sau:

```json
{
  "realm": "be-capstone",
  "enabled": true,
  "registrationAllowed": true,
  "resetPasswordAllowed": true,
  "rememberMe": true,
  "clients": [
    {
      "clientId": "be-capstone-api",
      "name": "be-capstone-api",
      "enabled": true,
      "protocol": "openid-connect",
      "publicClient": false,
      "standardFlowEnabled": true,
      "directAccessGrantsEnabled": false,
      "serviceAccountsEnabled": true,
      "secret": "be-capstone-secret",
      "redirectUris": ["*"],
      "webOrigins": ["*"],
      "attributes": {
        "post.logout.redirect.uris": "+"
      },
      "protocolMappers": [
        {
          "name": "identity-provider-mapper",
          "protocol": "openid-connect",
          "protocolMapper": "oidc-usersessionmodel-note-mapper",
          "consentRequired": false,
          "config": {
            "user.session.note": "identity_provider",
            "id.token.claim": "true",
            "access.token.claim": "true",
            "claim.name": "identity_provider",
            "jsonType.label": "String"
          }
        }
      ]
    }
  ],
  "identityProviders": [
    {
      "alias": "google",
      "displayName": "Google",
      "providerId": "google",
      "enabled": true,
      "trustEmail": true,
      "storeToken": false,
      "addReadTokenRoleOnCreate": false,
      "authenticateByDefault": false,
      "linkOnly": false,
      "firstBrokerLoginFlowAlias": "first broker login",
      "config": {
        "clientId": "REPLACE_WITH_GOOGLE_CLIENT_ID",
        "clientSecret": "REPLACE_WITH_GOOGLE_CLIENT_SECRET",
        "syncMode": "FORCE",
        "useJwksUrl": "true"
      }
    }
  ],
  "identityProviderMappers": [
    {
      "name": "google-email-mapper",
      "identityProviderAlias": "google",
      "identityProviderMapper": "oidc-user-attribute-idp-mapper",
      "config": {
        "syncMode": "INHERIT",
        "claim": "email",
        "user.attribute": "email"
      }
    },
    {
      "name": "google-name-mapper",
      "identityProviderAlias": "google",
      "identityProviderMapper": "oidc-user-attribute-idp-mapper",
      "config": {
        "syncMode": "INHERIT",
        "claim": "name",
        "user.attribute": "name"
      }
    }
  ]
}
```

> Hãy thay `REPLACE_WITH_GOOGLE_CLIENT_ID` và `REPLACE_WITH_GOOGLE_CLIENT_SECRET` bằng thông tin thật của Google OAuth. Nếu chưa cần đăng nhập Google, bạn có thể tạm để placeholder và cấu hình sau.

---

## Chạy nhanh

### Cách A — Chạy toàn bộ bằng Docker Compose (khuyến nghị)

Lệnh này sẽ khởi động Postgres, Keycloak và API cùng lúc.

> Hãy đảm bảo bạn đã hoàn thành phần [Thiết lập ban đầu](#thiết-lập-ban-đầu).

```bash
docker compose up --build
```

| Dịch vụ | URL |
|---|---|
| API | http://localhost:3000 |
| Swagger docs | http://localhost:3000/docs |
| Health check | http://localhost:3000/health |
| Keycloak admin | http://localhost:8080 (`admin` / `admin`) |
| Keycloak health | http://localhost:9000/health/ready |
| Postgres | localhost:5432 (`admin` / `admin` / `be-capstone`) |

Dừng container:

```bash
docker compose down
```

Xóa luôn volume database:

```bash
docker compose down -v
```

---

### Cách B — Chạy API local ở chế độ dev

Dùng cách này nếu bạn muốn hot-reload khi code.

#### 1. Chạy Postgres và Keycloak

> Hãy đảm bảo bạn đã hoàn thành phần [Thiết lập ban đầu](#thiết-lập-ban-đầu).

```bash
docker compose up postgres keycloak
```

#### 2. Cài dependency và chạy app

```bash
npm install
npm run start:dev
```

API sẽ chạy tại `http://localhost:3000`.

---

## Biến môi trường

Tất cả env được quản lý tập trung trong `src/config/env.config.ts`.

| Biến | Bắt buộc | Mặc định | Mô tả |
|---|---|---|---|
| `NODE_ENV` | Không | `development` | Môi trường chạy |
| `PORT` | Không | `3000` | Port của API |
| `DATABASE_URL` | Có | — | Chuỗi kết nối Postgres |
| `KEYCLOAK_URL` | Có | — | URL nội bộ của Keycloak cho server-to-server |
| `KEYCLOAK_PUBLIC_URL` | Không | fallback về `KEYCLOAK_URL` | URL public để frontend/browser truy cập |
| `KEYCLOAK_HEALTH_URL` | Không | `http://localhost:9000/health/ready` | Endpoint health của Keycloak |
| `KEYCLOAK_REALM` | Không | `be-capstone` | Tên realm Keycloak |
| `KEYCLOAK_CLIENT_ID` | Không | `be-capstone-api` | OIDC client ID |
| `KEYCLOAK_CLIENT_SECRET` | Không | `be-capstone-secret` | OIDC client secret |
| `KEYCLOAK_REDIRECT_URI` | Không | `http://localhost:3000/auth/callback` | Redirect URI mặc định |

---

## Các script có sẵn

| Lệnh | Mô tả |
|---|---|
| `npm run start:dev` | Chạy ở chế độ watch |
| `npm run start:debug` | Chạy ở chế độ debug + watch |
| `npm run start:prod` | Chạy bản build production |
| `npm run build` | Build TypeScript ra `dist/` |
| `npm run test` | Chạy unit test |
| `npm run test:e2e` | Chạy e2e test |
| `npm run test:cov` | Chạy test và xuất coverage |
| `npm run lint` | Lint và auto-fix |
| `npm run format` | Format code bằng Prettier |

---

## API endpoints

### Core

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/` | Hello World |
| `GET` | `/health` | Kiểm tra sức khỏe API + DB + Keycloak |
| `GET` | `/docs` | Swagger UI |

### Auth

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/auth/endpoints` | OIDC discovery endpoints |
| `GET` | `/auth/login` | Lấy authorization URL (`?idpHint=google` để đăng nhập Google) |
| `GET` | `/auth/callback` | Exchange code qua query params |
| `POST` | `/auth/token` | Exchange code qua JSON body |
| `POST` | `/auth/refresh` | Refresh access token |
| `POST` | `/auth/logout` | Thu hồi session |
| `GET` | `/auth/me` | Lấy profile hiện tại (cần Bearer token) |

> Xem hướng dẫn frontend chi tiết tại [docs/auth.vi.md](docs/auth.vi.md).

---

## Cấu hình Keycloak

### Auto-import

Service `keycloak` được cấu hình với `--import-realm`. Khi khởi động lần đầu, nó sẽ tự import:

- Realm `be-capstone`
- Client bảo mật `be-capstone-api`
- Google identity provider
- Protocol mapper để thêm claim `identity_provider` vào token

File realm nằm tại `keycloak/realm-import/be-capstone-realm.json`.

> Thư mục này đang **gitignore**. Xem lại phần [Thiết lập ban đầu](#thiết-lập-ban-đầu) để tạo file nếu máy mới clone repo.

### Google identity provider

Google IDP đã được chuẩn bị sẵn trong realm import với placeholder credentials. Để bật:

1. Mở [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Tạo OAuth 2.0 Client ID
3. Khai báo redirect URI:

```text
http://localhost:8080/realms/be-capstone/broker/google/endpoint
```

4. Mở Keycloak admin tại `http://localhost:8080`
5. Vào realm `be-capstone` → Identity Providers → Google
6. Điền Client ID và Client Secret
7. Lưu lại

Người dùng có thể đăng nhập Google bằng:

```text
GET /auth/login?idpHint=google
```

---

## Database

- Engine: PostgreSQL 16
- ORM: TypeORM
- `synchronize: true` để tự tạo bảng trong môi trường dev
- Bảng `users` được tạo từ `src/users/user.entity.ts`

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID | Khóa chính |
| `keycloakSub` | string (unique) | ID bất biến từ Keycloak |
| `email` | varchar (nullable) | Đồng bộ lại mỗi lần đăng nhập |
| `name` | varchar (nullable) | Đồng bộ lại mỗi lần đăng nhập |
| `provider` | string | `keycloak` hoặc `google` |
| `isActive` | boolean | Mặc định `true` |
| `createdAt` | timestamp | Tự động |
| `updatedAt` | timestamp | Tự động |

> Với production, nên đặt `synchronize: false` và dùng migration.

---

## CI/CD

### CI

Workflow `ci.yaml` chạy khi push và pull request:

1. Khởi tạo Postgres service container
2. `npm ci`
3. `npm run build`
4. `npm run test`
5. `npm run test:e2e`

### Build & publish image

Workflow `build.yaml` chạy khi push vào `main`:

1. Build Docker image bằng multi-stage `Dockerfile`
2. Push lên GitHub Container Registry `ghcr.io/<owner>/<repo>`
3. Tag: `latest` và git SHA

---

## Docker

### Dockerfile nhiều stage

| Stage | Mục đích |
|---|---|
| `deps` | Cài toàn bộ dependency |
| `builder` | Build TypeScript |
| `runner` | Ảnh production chỉ chứa dependency cần thiết và output đã build |

### Build thủ công

```bash
docker build -t be-capstone .
docker run -p 3000:3000 --env-file .env be-capstone
```

---

## Test

```bash
npm run test
npm run test:watch
npm run test:e2e
npm run test:cov
```

Các file unit test nằm cạnh source (`*.spec.ts`). E2E test nằm trong thư mục `test/`.

---

## Tài liệu

- **[English README](README.md)**
- **[docs/auth.vi.md](docs/auth.vi.md)** — Hướng dẫn frontend tích hợp auth từng bước
- **[docs/auth.md](docs/auth.md)** — English auth guide
- Swagger UI tại `/docs`
