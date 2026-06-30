# BE Capstone

[English version](README.md)

Backend API viết bằng NestJS, sử dụng PostgreSQL, Keycloak (OIDC / đăng nhập Google), TypeORM và Swagger.

---

## Điều kiện tiên quyết

| Công cụ                                            | Phiên bản | Mục đích                                                 |
| -------------------------------------------------- | --------- | -------------------------------------------------------- |
| [Node.js](https://nodejs.org)                      | >= 20     | Runtime                                                  |
| [npm](https://www.npmjs.com)                       | >= 10     | Trình quản lý package                                    |
| [Docker](https://docs.docker.com/get-docker/)      | >= 24     | Chạy Postgres, Keycloak và production API bằng container |
| [Docker Compose](https://docs.docker.com/compose/) | >= 2.20   | Điều phối nhiều container                                |

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
    cd.yaml        Push version tag: build image + deploy lên DigitalOcean droplet
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
  "loginTheme": "capstone",
  "registrationAllowed": true,
  "resetPasswordAllowed": true,
  "rememberMe": true,
  "requiredActions": [
    {
      "alias": "VERIFY_PROFILE",
      "name": "Verify Profile",
      "providerId": "VERIFY_PROFILE",
      "enabled": false,
      "defaultAction": false,
      "priority": 90
    }
  ],
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
  "authenticationFlows": [
    {
      "alias": "capstone first broker login",
      "description": "First broker login flow: review profile then create or link user",
      "providerId": "basic-flow",
      "topLevel": true,
      "builtIn": false,
      "authenticationExecutions": [
        {
          "authenticator": "idp-review-profile",
          "authenticatorFlow": false,
          "requirement": "REQUIRED",
          "priority": 10,
          "authenticatorConfig": "review profile config"
        },
        {
          "authenticatorFlow": true,
          "requirement": "REQUIRED",
          "priority": 20,
          "flowAlias": "capstone create or link user"
        }
      ]
    },
    {
      "alias": "capstone create or link user",
      "providerId": "basic-flow",
      "topLevel": false,
      "builtIn": false,
      "authenticationExecutions": [
        {
          "authenticator": "idp-create-user-if-unique",
          "requirement": "ALTERNATIVE",
          "priority": 10
        },
        {
          "authenticatorFlow": true,
          "requirement": "ALTERNATIVE",
          "priority": 20,
          "flowAlias": "capstone handle existing account"
        }
      ]
    },
    {
      "alias": "capstone handle existing account",
      "providerId": "basic-flow",
      "topLevel": false,
      "builtIn": false,
      "authenticationExecutions": [
        {
          "authenticator": "idp-confirm-link",
          "requirement": "REQUIRED",
          "priority": 10
        },
        {
          "authenticator": "idp-email-verification",
          "requirement": "ALTERNATIVE",
          "priority": 20
        },
        {
          "authenticator": "idp-username-password-form",
          "requirement": "ALTERNATIVE",
          "priority": 30
        }
      ]
    }
  ],
  "authenticatorConfig": [
    {
      "alias": "review profile config",
      "config": {
        "update.profile.on.first.login": "on"
      }
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
      "firstBrokerLoginFlowAlias": "capstone first broker login",
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

> **Tại sao API chạy trực tiếp trên máy, không chạy trong Docker Compose:**
> API sử dụng `KEYCLOAK_URL=http://localhost:8080` và `KEYCLOAK_HEALTH_URL=http://localhost:9000/health/ready` để kết nối Keycloak. Điều này đảm bảo issuer (`iss`) trong JWT luôn là `http://localhost:8080/...` cho cả browser lẫn server — tránh lỗi xác thực token do hostname không khớp. Nếu API chạy trong Docker Compose, `localhost` sẽ trỏ tới chính container thay vì máy host, khiến Keycloak và Postgres không thể truy cập được. Docker Compose chỉ dùng để chạy Postgres và Keycloak; API cần chạy trực tiếp trên máy của bạn.

### 1. Chạy Postgres và Keycloak

> Hãy đảm bảo bạn đã hoàn thành phần [Thiết lập ban đầu](#thiết-lập-ban-đầu).

```bash
docker compose up -d
```

| Dịch vụ         | URL                                                |
| --------------- | -------------------------------------------------- |
| Keycloak admin  | http://localhost:8080 (`admin` / `admin`)          |
| Keycloak health | http://localhost:9000/health/ready                 |
| Postgres        | localhost:5432 (`admin` / `admin` / `be-capstone`) |

Dừng container:

```bash
docker compose down
```

Xóa luôn volume database (buộc Keycloak import lại realm):

```bash
docker compose down -v
```

### 2. Cài dependency và chạy API

```bash
npm install
npm run start:dev
```

| Dịch vụ      | URL                          |
| ------------ | ---------------------------- |
| API          | http://localhost:3000        |
| Swagger docs | http://localhost:3000/docs   |
| Health check | http://localhost:3000/health |

API sẽ chạy tại `http://localhost:3000` với hot-reload.

---

## Biến môi trường

Tất cả env được quản lý tập trung trong `src/config/env.config.ts`.

| Biến                     | Bắt buộc | Mặc định                              | Mô tả                                                      |
| ------------------------ | -------- | ------------------------------------- | ---------------------------------------------------------- |
| `NODE_ENV`               | Không    | `development`                         | Môi trường chạy                                            |
| `PORT`                   | Không    | `3000`                                | Port của API                                               |
| `DATABASE_URL`           | Có       | —                                     | Chuỗi kết nối Postgres                                     |
| `KEYCLOAK_URL`           | Có       | —                                     | URL gốc của Keycloak (dùng cho cả API và browser redirect) |
| `KEYCLOAK_HEALTH_URL`    | Không    | `http://localhost:9000/health/ready`  | Endpoint health của Keycloak                               |
| `KEYCLOAK_REALM`         | Không    | `be-capstone`                         | Tên realm Keycloak                                         |
| `KEYCLOAK_CLIENT_ID`     | Không    | `be-capstone-api`                     | OIDC client ID                                             |
| `KEYCLOAK_CLIENT_SECRET` | Không    | `be-capstone-secret`                  | OIDC client secret                                         |
| `KEYCLOAK_REDIRECT_URI`  | Không    | `http://localhost:3000/auth/callback` | Redirect URI mặc định                                      |

---

## Các script có sẵn

| Lệnh                         | Mô tả                                 |
| ---------------------------- | ------------------------------------- |
| `npm run start:dev`          | Chạy ở chế độ watch                   |
| `npm run start:debug`        | Chạy ở chế độ debug + watch           |
| `npm run start:prod`         | Chạy bản build production             |
| `npm run build`              | Build TypeScript ra `dist/`           |
| `npm run test`               | Chạy unit test                        |
| `npm run test:e2e`           | Chạy e2e test                         |
| `npm run test:cov`           | Chạy test và xuất coverage            |
| `npm run lint`               | Lint và auto-fix                      |
| `npm run migration:run`      | Chạy migration TypeORM (development)  |
| `npm run migration:run:prod` | Chạy migration từ bản build `dist/`   |
| `npm run migration:revert`   | Hoàn tác migration gần nhất           |
| `npm run seed`               | Seed dữ liệu tham chiếu (development) |
| `npm run seed:prod`          | Seed dữ liệu tham chiếu từ `dist/`    |
| `npm run format`             | Format code bằng Prettier             |

---

## API endpoints

### Core

| Method | Path      | Mô tả                                 |
| ------ | --------- | ------------------------------------- |
| `GET`  | `/`       | Hello World                           |
| `GET`  | `/health` | Kiểm tra sức khỏe API + DB + Keycloak |
| `GET`  | `/docs`   | Swagger UI                            |

### Auth

| Method | Path              | Mô tả                                                         |
| ------ | ----------------- | ------------------------------------------------------------- |
| `GET`  | `/auth/endpoints` | OIDC discovery endpoints                                      |
| `GET`  | `/auth/login`     | Lấy authorization URL (`?idpHint=google` để đăng nhập Google) |
| `GET`  | `/auth/callback`  | Exchange code qua query params                                |
| `POST` | `/auth/token`     | Exchange code qua JSON body                                   |
| `POST` | `/auth/refresh`   | Refresh access token                                          |
| `POST` | `/auth/logout`    | Thu hồi session                                               |
| `GET`  | `/users/me`       | Lấy profile hiện tại (session cookie)                         |

> Xem hướng dẫn frontend chi tiết tại [docs/auth.vi.md](docs/auth.vi.md).

---

## Cấu hình Keycloak

### Auto-import

Service `keycloak` được cấu hình với `--import-realm`. Khi khởi động lần đầu, nó sẽ tự import:

- Realm `be-capstone`
- Client bảo mật `be-capstone-api`
- Google identity provider
- Protocol mapper để thêm claim `identity_provider` vào token
- Custom login theme `capstone`
- Luồng đăng nhập tùy chỉnh cho Google (chỉ yêu cầu cập nhật hồ sơ lần đầu)
- Vô hiệu hóa `VERIFY_PROFILE` required action (tránh hỏi cập nhật hồ sơ lặp lại)

File realm nằm tại `keycloak/realm-import/be-capstone-realm.json`.

> Thư mục này đang **gitignore**. Xem lại phần [Thiết lập ban đầu](#thiết-lập-ban-đầu) để tạo file nếu máy mới clone repo.

### Luồng xác thực tùy chỉnh

Realm sử dụng luồng `capstone first broker login` cho Google IDP:

```
capstone first broker login
├── Review Profile                     REQUIRED  (hiển thị 1 lần khi đăng nhập Google lần đầu)
└── Create or Link User                REQUIRED  (sub-flow)
    ├── Create User If Unique          ALTERNATIVE  (email mới → tạo user)
    └── Handle Existing Account        ALTERNATIVE  (sub-flow, nếu email đã tồn tại)
        ├── Confirm Link               REQUIRED
        ├── Email Verification         ALTERNATIVE
        └── Username/Password Form     ALTERNATIVE
```

| Tình huống                                  | Hành vi                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| Đăng nhập Google lần đầu (user mới)         | Hiển thị form cập nhật hồ sơ → tạo user → hoàn tất                                  |
| Đăng nhập Google lần đầu (email đã đăng ký) | Hiển thị form cập nhật hồ sơ → xác nhận liên kết → xác thực qua email hoặc mật khẩu |
| Các lần đăng nhập Google tiếp theo          | Không hỏi hồ sơ — chuyển thẳng tới callback                                         |

> **Lưu ý:** Keycloak 26.x mặc định bật `VERIFY_PROFILE` required action, khiến mỗi lần đăng nhập đều bị hỏi cập nhật hồ sơ. Realm này đã tắt tính năng đó, chỉ giữ lại form cập nhật hồ sơ trong luồng first broker login (chạy 1 lần duy nhất).

### Custom Keycloak login theme

Dự án hiện có sẵn một custom Keycloak login theme tại:

```text
keycloak/themes/capstone/login/
```

Các file chính:

| File                       | Vai trò                                          |
| -------------------------- | ------------------------------------------------ |
| `theme.properties`         | Khai báo theme và parent theme (`keycloak.v2`)   |
| `login.ftl`                | Layout trang đăng nhập tùy chỉnh                 |
| `resources/css/styles.css` | Màu sắc, spacing, typography, responsive styling |

Theme được mount vào container bằng Docker Compose:

```yaml
volumes:
  - ./keycloak/themes:/opt/keycloak/themes
```

Và realm import đã được cấu hình để dùng theme này:

```json
"loginTheme": "capstone"
```

Nếu muốn tùy chỉnh thêm:

1. Sửa `keycloak/themes/capstone/login/login.ftl` để đổi bố cục/nội dung
2. Sửa `keycloak/themes/capstone/login/resources/css/styles.css` để đổi giao diện
3. Khởi động lại Keycloak:

```bash
docker compose restart keycloak
```

Nếu giao diện vẫn bị cache, hãy recreate container:

```bash
docker compose up -d --force-recreate keycloak
```

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

| Cột           | Kiểu               | Mô tả                         |
| ------------- | ------------------ | ----------------------------- |
| `id`          | UUID               | Khóa chính                    |
| `keycloakSub` | string (unique)    | ID bất biến từ Keycloak       |
| `email`       | varchar (nullable) | Đồng bộ lại mỗi lần đăng nhập |
| `name`        | varchar (nullable) | Đồng bộ lại mỗi lần đăng nhập |
| `provider`    | string             | `keycloak` hoặc `google`      |
| `isActive`    | boolean            | Mặc định `true`               |
| `createdAt`   | timestamp          | Tự động                       |
| `updatedAt`   | timestamp          | Tự động                       |

> Với production, nên đặt `synchronize: false` và dùng migration.

---

## CI/CD

### CI

Workflow `ci.yaml` chạy khi push và pull request:

1. Khởi tạo Postgres service container (truy cập tại `localhost:5432`)
2. `npm ci`
3. `npm run build`
4. `npm run test`
5. `npm run test:e2e`

> **Lưu ý:** Keycloak **không** chạy trong CI. Các biến `KEYCLOAK_URL`, v.v. được đặt sẵn để validation env pass, nhưng unit test mock toàn bộ HTTP call tới Keycloak. API chạy trực tiếp trên GitHub Actions runner, không chạy trong Docker.

### Build & publish image

Workflow `build.yaml` chạy khi push vào `main`:

1. Build Docker image bằng multi-stage `Dockerfile`
2. Push lên GitHub Container Registry `ghcr.io/<owner>/<repo>`
3. Tag: `latest` và git SHA

> **Image này chỉ dùng cho môi trường deploy** (Kubernetes, ECS, Docker Swarm). **Không** dùng cho local development — xem [Chạy nhanh](#chạy-nhanh).

### Deploy (`.github/workflows/cd.yaml`)

Chỉ chạy **khi push tag semver (`v*.*.*`)** và commit của tag nằm trên `main`:

1. Kiểm tra commit của tag có nằm trên `main` không (nếu không thì dừng)
2. Build Docker image và push lên GHCR theo version (`v1.2.3` → `1.2.3`, `1.2`, `latest`)
3. SSH vào droplet DigitalOcean và cập nhật stack với image mới

Xem [Triển khai production](#triển-khai-production) để biết yêu cầu trên droplet và các secret cần thiết.

---

## Triển khai production

Production được deploy lên **DigitalOcean droplet** bằng pipeline [`cd.yaml`](.github/workflows/cd.yaml). Push một version tag sẽ build image theo version, push lên GHCR, rồi cập nhật stack đang chạy qua SSH.

### Bước 1 — Chuẩn bị thư mục deploy trên VPS

Pipeline CD chỉ pull image và restart stack — **không** copy bất kỳ config nào. Trước lần deploy đầu, hãy chuẩn bị thư mục deploy (đường dẫn đặt trong `DEPLOY_PATH`, vd `/opt/be-capstone`) với các file bên dưới. Service `be-api`/`db-init` chạy từ image GHCR, nhưng các service còn lại bind-mount config từ ổ đĩa nên các file này phải tồn tại.

```text
$DEPLOY_PATH/
├── docker-compose.yaml                     # stack compose production
├── .env                                    # biến môi trường production
├── nginx/
│   └── nginx.conf                          # cấu hình reverse-proxy (ingress)
├── keycloak/
│   ├── realm-import/
│   │   └── be-capstone-realm.json          # realm + client + Google IDP
│   └── themes/
│       └── capstone/                       # theme login tùy chỉnh
└── observability/
    ├── loki/
    │   └── loki-config.yaml                # cấu hình lưu log Loki
    ├── alloy/
    │   └── config.alloy                    # cấu hình thu thập log Alloy
    └── grafana/
        └── provisioning/                   # datasource/dashboard Grafana
```

| Đường dẫn (so với `$DEPLOY_PATH`)              | Service cần | Mục đích                                                           |
| ---------------------------------------------- | ----------- | ------------------------------------------------------------------ |
| `docker-compose.yaml`                          | tất cả      | Stack compose production (bản copy của `docker-compose.prod.yaml`) |
| `.env`                                         | tất cả      | Biến môi trường + `API_IMAGE=ghcr.io/<owner>/be-capstone:latest`   |
| `nginx/nginx.conf`                             | `nginx`     | Reverse proxy ingress (`/api`, `/auth`, `/gfn`)                    |
| `keycloak/realm-import/be-capstone-realm.json` | `keycloak`  | Realm, client và Google IDP tự import                              |
| `keycloak/themes/capstone/`                    | `keycloak`  | Theme login tùy chỉnh                                              |
| `observability/loki/loki-config.yaml`          | `loki`      | Cấu hình lưu trữ log                                               |
| `observability/alloy/config.alloy`             | `alloy`     | Thu thập log container Docker                                      |
| `observability/grafana/provisioning/`          | `grafana`   | Datasource/dashboard cấu hình sẵn                                  |

> Đổi tên `docker-compose.prod.yaml` thành `docker-compose.yaml` trên droplet (hoặc đặt `COMPOSE_FILE` trong `.env`). Cách đơn giản nhất là clone repo trên droplet rồi copy các đường dẫn này vào `$DEPLOY_PATH` và tạo `.env` từ secret của bạn.

### Bước 2 — Secret GitHub cần thiết

Cấu hình tại **Settings → Secrets and variables → Actions**:

| Secret             | Mô tả                                       |
| ------------------ | ------------------------------------------- |
| `DROPLET_HOST`     | IP hoặc hostname của droplet                |
| `DROPLET_USERNAME` | User SSH (vd `root` hoặc user deploy riêng) |
| `DROPLET_SSH_KEY`  | Private SSH key được phép truy cập droplet  |
| `DROPLET_SSH_PORT` | Cổng SSH (vd `22`)                          |
| `DEPLOY_PATH`      | Đường dẫn tuyệt đối tới thư mục deploy      |

`GITHUB_TOKEN` được cung cấp tự động, dùng để droplet `docker login` vào GHCR.

### Phát hành phiên bản mới

Từ máy local, tạo và push một tag semver trên commit thuộc `main`:

```bash
git checkout main
git pull origin main
git tag v1.2.3
git push origin v1.2.3
```

Pipeline sẽ tự động:

1. Build và push `ghcr.io/<owner>/<repo>:1.2.3` (kèm `1.2` và `latest`)
2. Trên droplet, chạy:
   ```bash
   cd "$DEPLOY_PATH"
   docker login ghcr.io ...
   docker compose pull
   docker compose up -d --remove-orphans
   docker image prune -f
   ```

### Migration và seed

`docker-compose.yaml` đi kèm có service `db-init` chạy migration và seed trước khi API khởi động, nên `docker compose up -d` thường tự áp dụng migration. Nếu compose trên droplet không có `db-init`, chạy migration thủ công sau deploy:

```bash
docker compose run --rm --no-deps be-api \
  node ./node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js
```

### Xác minh deploy

```bash
curl -f http://<droplet-host>/health
docker compose ps
docker compose logs --tail=50 be-api
```

### Rollback

Gắn lại tag vào commit tốt đã biết (hoặc dời release tag) rồi push để chạy lại pipeline, hoặc trên droplet ghim image phiên bản trước và restart:

```bash
cd "$DEPLOY_PATH"
# trỏ tag image be-api về phiên bản trước, rồi:
docker compose pull
docker compose up -d --no-deps be-api
```

> Nên fix tiến (forward-fix) migration trong release mới thay vì revert trên production.

---

## Docker (ảnh production)

Dockerfile tạo ra image production. **Không dùng cho local development** — các URL `localhost` trong `.env` sẽ không hoạt động bên trong container. Để phát triển, chạy API trực tiếp bằng `npm run start:dev`.

### Dockerfile nhiều stage

| Stage     | Mục đích                                                        |
| --------- | --------------------------------------------------------------- |
| `deps`    | Cài toàn bộ dependency                                          |
| `builder` | Build TypeScript                                                |
| `runner`  | Ảnh production chỉ chứa dependency cần thiết và output đã build |

### Chạy image trong môi trường deploy

Container cần env vars trỏ tới **Postgres và Keycloak thật** (không phải `localhost`):

```bash
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://user:pass@db-host:5432/be-capstone \
  -e KEYCLOAK_URL=https://auth.example.com \
  -e KEYCLOAK_HEALTH_URL=https://auth.example.com:9000/health/ready \
  -e KEYCLOAK_REALM=be-capstone \
  -e KEYCLOAK_CLIENT_ID=be-capstone-api \
  -e KEYCLOAK_CLIENT_SECRET=your-secret \
  -e KEYCLOAK_REDIRECT_URI=https://app.example.com/auth/callback \
  -e NODE_ENV=production \
  ghcr.io/<owner>/be-capstone:latest
```

| Biến                     | Mô tả                                                                      |
| ------------------------ | -------------------------------------------------------------------------- |
| `DATABASE_URL`           | Chuỗi kết nối Postgres (phải truy cập được từ container)                   |
| `KEYCLOAK_URL`           | URL gốc Keycloak — phải giống URL mà **browser** dùng để truy cập Keycloak |
| `KEYCLOAK_HEALTH_URL`    | Endpoint health management của Keycloak                                    |
| `KEYCLOAK_CLIENT_SECRET` | Phải trùng với secret đã cấu hình trong Keycloak                           |
| `KEYCLOAK_REDIRECT_URI`  | Phải trùng với URL callback public của frontend                            |

> **Quan trọng:** `KEYCLOAK_URL` phải là URL mà browser dùng để truy cập Keycloak, để claim `iss` trong JWT khớp giữa token phát hành từ browser và server-side validation. Trong môi trường deploy, thường là domain public như `https://auth.example.com`.

### Build thủ công

```bash
docker build -t be-capstone .
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
