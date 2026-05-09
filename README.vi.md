# BE Capstone

[English version](README.md)

Backend API viết bằng NestJS, sử dụng PostgreSQL, Auth0 (OIDC / Google social), TypeORM và Swagger.

---

## Điều kiện tiên quyết

| Công cụ                                            | Phiên bản | Mục đích                                             |
| -------------------------------------------------- | --------- | ---------------------------------------------------- |
| [Node.js](https://nodejs.org)                      | >= 20     | Runtime                                              |
| [npm](https://www.npmjs.com)                       | >= 10     | Trình quản lý package                                |
| [Docker](https://docs.docker.com/get-docker/)      | >= 24     | Chạy Postgres, Redis và API image bằng container     |
| [Docker Compose](https://docs.docker.com/compose/) | >= 2.20   | Điều phối nhiều container                            |
| [Auth0 tenant](https://auth0.com/signup)           | —         | Identity provider hosted (free tier đủ dùng cho dev) |

---

## Cấu trúc dự án

```text
src/
  config/          Quản lý env tập trung (ConfigModule, env.config.ts)
  auth/            Endpoint OIDC chạy với Auth0 (login, callback, status, me, logout)
  health/          Endpoint kiểm tra sức khỏe API, DB, Auth0, Redis
  users/           User entity và service insert/update khi đăng nhập
  app.module.ts    Root module
  main.ts          Bootstrap, validate env, cấu hình Swagger
docs/
  auth.md          Hướng dẫn frontend tích hợp auth (EN)
  auth.vi.md       Hướng dẫn frontend tích hợp auth (VI)
commitlint.config.cjs      Rule Conventional Commit cho Husky `commit-msg`
scripts/
  validate-branch-name.cjs Kiểm tra tên nhánh cho Husky `pre-push`
.github/
  workflows/
    ci.yaml        Build + test + secretlint khi push / pull request
    build.yaml     Build image và push lên GHCR khi merge vào main
```

---

## Thiết lập ban đầu

### 1. Tạo các file `.env`

```bash
cp .env.example .env
cp .env.dev.example .env.dev
```

- **`.env`** — dùng khi chạy API trực tiếp trên máy bằng `npm run start:dev`.
- **`.env.dev`** — dùng cho `docker compose` (Postgres / Redis local, hoặc API image khi chạy trong Compose).

Nếu dùng compose production:

```bash
cp .env.prod.example .env.prod
```

### 2. Cấu hình Auth0 tenant

Trong [Auth0 dashboard](https://manage.auth0.com):

1. **Tạo Application** → "Regular Web Application". Ghi lại **Domain**, **Client ID**, **Client Secret**.
2. **Allowed Callback URLs** phải có `http://localhost:3000/auth/callback` (và `http://localhost:3001/auth/callback` nếu dùng `docker-compose.yaml`, kèm URL production nếu cần).
3. **Allowed Logout URLs** phải có `FRONTEND_URL` (ví dụ `http://localhost:5173`).
4. **APIs** → **Create API**. Đặt identifier duy nhất, ví dụ `https://api.be-capstone.local`. Đây là giá trị **`AUTH0_AUDIENCE`**.
5. **Authentication** → **Social** → bật **Google** (connection mặc định là `google-oauth2`). Với tenant non-dev, hãy thêm Google OAuth Client ID / Secret của bạn.
6. Điền `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_AUDIENCE` tương ứng vào `.env` (và `.env.dev` / `.env.prod` nếu dùng Compose).

> Auth0 phát hành access token với `iss=https://${AUTH0_DOMAIN}/`. Luôn dùng cùng một domain ở browser và server để token validate được khớp.

---

## Chạy nhanh

> **Tại sao API chạy trực tiếp trên máy chứ không chạy trong Compose:**
> Auth0 là dịch vụ hosted nên API chỉ cần internet là kết nối được — kể cả khi chạy ngay trên máy bạn. Compose ở local chỉ phục vụ Postgres và Redis. Service `be-api` trong `docker-compose.yaml` chỉ tùy chọn khi bạn muốn chạy luôn cả image production.

### 1. Chạy Postgres và Redis

> Hãy đảm bảo bạn đã hoàn tất [Thiết lập ban đầu](#thiết-lập-ban-đầu).

```bash
docker compose up -d postgres redis
```

| Dịch vụ  | URL                                                |
| -------- | -------------------------------------------------- |
| Postgres | localhost:5432 (`admin` / `admin` / `be-capstone`) |
| Redis    | localhost:6379                                     |

Dừng container:

```bash
docker compose down
```

Xóa luôn volume (drop bảng `users` cũ — hữu ích sau khi migrate Auth0 để cột `auth0Sub` mới được tạo lại sạch sẽ):

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

| Biến                      | Bắt buộc | Mặc định                               | Mô tả                                                                       |
| ------------------------- | -------- | -------------------------------------- | --------------------------------------------------------------------------- |
| `NODE_ENV`                | Không    | `development`                          | Môi trường chạy                                                             |
| `PORT`                    | Không    | `3000`                                 | Port của API                                                                |
| `DATABASE_URL`            | Có       | —                                      | Chuỗi kết nối Postgres                                                      |
| `AUTH0_DOMAIN`            | Có       | —                                      | Tenant domain (không kèm protocol). Issuer = `https://${AUTH0_DOMAIN}/`     |
| `AUTH0_CLIENT_ID`         | Có       | —                                      | Auth0 application client id                                                 |
| `AUTH0_CLIENT_SECRET`     | Có       | —                                      | Auth0 application client secret                                             |
| `AUTH0_AUDIENCE`          | Có       | —                                      | Auth0 API identifier (truyền vào `audience` để Auth0 cấp access token thật) |
| `AUTH0_REDIRECT_URI`      | Không    | `http://localhost:3000/auth/callback`  | URL Auth0 redirect về sau authorize. Phải nằm trong Allowed Callback URLs   |
| `AUTH0_LOGOUT_RETURN_URL` | Không    | `FRONTEND_URL`                         | URL Auth0 redirect về sau v2/logout. Phải nằm trong Allowed Logout URLs     |
| `REDIS_URL`               | Không    | `redis://localhost:6379`               | URL Redis cho session                                                       |
| `SESSION_SECRET`          | Có       | —                                      | Secret ký session cookie                                                    |
| `SESSION_COOKIE_SECURE`   | Không    | `true` ở production, ngược lại `false` | Đặt `false` cho HTTP local để browser nhận cookie                           |
| `FRONTEND_URL`            | Có       | —                                      | Origin frontend (dùng cho redirect và CORS)                                 |
| `CORS_ORIGIN`             | Không    | `FRONTEND_URL`                         | Origin CORS được phép                                                       |

---

## Các script có sẵn

| Lệnh                           | Mô tả                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| `npm run start:dev`            | Chạy ở chế độ watch                                                                       |
| `npm run start:debug`          | Chạy ở chế độ debug + watch                                                               |
| `npm run start:prod`           | Chạy bản build production                                                                 |
| `npm run build`                | Build TypeScript ra `dist/`                                                               |
| `npm run test`                 | Chạy unit test                                                                            |
| `npm run test:e2e`             | Chạy e2e test                                                                             |
| `npm run test:cov`             | Chạy test và xuất coverage                                                                |
| `npm run lint`                 | Lint và auto-fix                                                                          |
| `npm run format`               | Format code bằng Prettier                                                                 |
| `npm run secretlint`           | Quét toàn repo tìm rò rỉ credential (cùng công cụ với CI / pre-commit qua lint-staged)    |
| `npm run commitlint -- <file>` | Tự lint nội dung commit bằng file (giống Husky `commit-msg`; ví dụ `.git/COMMIT_EDITMSG`) |

---

## Quy ước commit và tên nhánh

Dự án tuân theo [Conventional Commits](https://www.conventionalcommits.org/). Các **type** cho phép: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Ví dụ dòng chủ đề: `feat(auth): add google login`.

**Tên nhánh** được kiểm tra khi `git push` (Husky `pre-push`). Dùng `<type>/<mô-tả-ngắn>` với cùng danh **type** như trên — slug chữ thường có thể chứa `-`, `.`, `_` giữa các ký tự chữ/số (tối đa 60 ký tự), ví dụ `feat/auth0-google-login`.

Được **phép không theo pattern** đó: `main`, `release/*`, `hotfix/*`, `dependabot/*`, `cursor/*` (workflow tác tử Cursor).

Hook Husky tự cài khi chạy **`npm install`** (script `prepare`). Trường hợp khẩn cấp: `git commit --no-verify` / `git push --no-verify`.

| Hook         | Nội dung chạy                                |
| ------------ | -------------------------------------------- |
| `pre-commit` | lint-staged: secretlint, ESLint, Prettier    |
| `commit-msg` | commitlint (@commitlint/config-conventional) |
| `pre-push`   | `scripts/validate-branch-name.cjs`           |

---

## API endpoints

### Core

| Method | Path      | Mô tả                                      |
| ------ | --------- | ------------------------------------------ |
| `GET`  | `/`       | Hello World                                |
| `GET`  | `/health` | Kiểm tra sức khỏe API + DB + Auth0 + Redis |
| `GET`  | `/docs`   | Swagger UI                                 |

### Auth

| Method | Path             | Mô tả                                                                                                                                                                                                   |
| ------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/auth/login`    | Trả về `{ login_uri }` — URL `/authorize` của Auth0 cho browser. Body: `{ client_redirect_uri, idpHint? }`                                                                                              |
| `GET`  | `/auth/callback` | Auth0 redirect về đây; BFF exchange code, lưu session, rồi 302 về `client_redirect_uri`                                                                                                                 |
| `GET`  | `/auth/status`   | `{ authenticated: boolean }`                                                                                                                                                                            |
| `GET`  | `/auth/me`       | Profile user hiện tại (cần session cookie)                                                                                                                                                              |
| `POST` | `/auth/logout`   | Revoke refresh token, hủy session, trả `{ success, logout_uri }`. Frontend phải redirect tới `logout_uri` để hủy luôn Auth0 SSO. Body (tùy chọn): `{ return_to }` để override `AUTH0_LOGOUT_RETURN_URL` |

> Xem hướng dẫn frontend chi tiết tại [docs/auth.vi.md](docs/auth.vi.md).

### Đăng nhập Google

`POST /auth/login` chấp nhận `idpHint`. Backend sẽ map `idpHint=google` thành tham số `connection=google-oauth2` của Auth0, bỏ qua màn picker Universal Login:

```json
{
  "client_redirect_uri": "http://localhost:5173/dashboard",
  "idpHint": "google"
}
```

Mọi giá trị `idpHint` khác sẽ được pass nguyên dạng vào tham số Auth0 `connection` (ví dụ `github`, `Username-Password-Authentication`).

---

## Cấu hình Auth0

### Application (trong dashboard)

| Trường                               | Giá trị                                                                |
| ------------------------------------ | ---------------------------------------------------------------------- |
| Application type                     | Regular Web Application                                                |
| Token endpoint authentication method | `Post` (hoặc `Basic`)                                                  |
| Allowed Callback URLs                | `http://localhost:3000/auth/callback` (và URL deploy nếu có)           |
| Allowed Logout URLs                  | `http://localhost:5173` (và origin frontend deploy)                    |
| Allowed Web Origins                  | `http://localhost:5173` (và origin frontend deploy)                    |
| Refresh Token Rotation               | Bật (khuyến nghị)                                                      |
| Refresh Token                        | Bật "Allow Offline Access" để scope `offline_access` trả refresh token |

### API (trong dashboard)

| Trường                | Giá trị                                                                    |
| --------------------- | -------------------------------------------------------------------------- |
| Identifier (audience) | `https://api.be-capstone.local` (URI duy nhất, phải khớp `AUTH0_AUDIENCE`) |
| Signing algorithm     | RS256                                                                      |
| Allow Offline Access  | Bật                                                                        |

### Google social connection

Vào Auth0 dashboard → **Authentication → Social → Google** và bật connection. Auth0 dev keys mặc định đủ dùng cho prototype. Với tenant non-dev, điền Google OAuth Client ID / Secret của bạn.

> Khi dùng dev keys của Auth0 thì không cần cấu hình redirect URI bên Google. Khi dùng credentials Google riêng, set **Authorized redirect URI** là `https://${AUTH0_DOMAIN}/login/callback`.

---

## Database

- Engine: PostgreSQL 16
- ORM: TypeORM
- `synchronize: true` để tự tạo bảng trong môi trường dev
- Bảng `users` được tạo từ `src/users/user.entity.ts`

| Cột         | Kiểu               | Mô tả                                         |
| ----------- | ------------------ | --------------------------------------------- | -------------------- | ----- |
| `id`        | UUID               | Khóa chính                                    |
| `auth0Sub`  | string (unique)    | ID bất biến từ Auth0 (sub claim, ví dụ `auth0 | ...`, `google-oauth2 | ...`) |
| `email`     | varchar (nullable) | Đồng bộ lại mỗi lần đăng nhập                 |
| `name`      | varchar (nullable) | Đồng bộ lại mỗi lần đăng nhập                 |
| `isActive`  | boolean            | Mặc định `true`                               |
| `createdAt` | timestamp          | Tự động                                       |
| `updatedAt` | timestamp          | Tự động                                       |

> Với production, nên đặt `synchronize: false` và dùng migration.

> **Migrate từ schema Keycloak cũ:** các cột `keycloakSub` và `provider` đã bị xóa. Sau khi pull thay đổi này, hãy chạy `docker compose down -v` một lần để Postgres được tạo lại sạch sẽ với schema mới.

---

## CI/CD

### CI

Workflow `ci.yaml` chạy khi push và pull request:

- Job **secretlint**: `npm ci`, sau đó `npm run secretlint` (quét cây file đã track tìm secret).
- Job **test**: như cũ, chạy song song với secretlint.

1. Khởi tạo Postgres service container (truy cập tại `localhost:5432`)
2. `npm ci`
3. `npm run build`
4. `npm run test`
5. `npm run test:e2e`

> **Các hook:** [Husky](https://typicode.github.io/husky/) — **pre-commit** chạy `lint-staged` (secretlint trên file stage, sau đó ESLint/Prettier); **commit-msg** chạy commitlint (Conventional Commits); **pre-push** kiểm tra tên nhánh. CI chỉ dự phòng cho secret (chứng từ commit/tên nhánh chỉ chạy local, có thể bỏ qua bằng `--no-verify`).

> **Lưu ý:** Auth0 **không** được kết nối trong CI. Các biến `AUTH0_*` được đặt giá trị placeholder để config validation pass; mọi HTTP call tới Auth0 đều được mock trong unit / e2e test.

### Build & publish image

Workflow `build.yaml` chạy khi push vào `main`:

1. Build Docker image bằng multi-stage `Dockerfile`
2. Push lên GitHub Container Registry `ghcr.io/<owner>/<repo>`
3. Tag: `latest` và git SHA

> Cùng image này được dùng bởi service `be-api` (tùy chọn) trong `docker-compose.yaml`. Để có hot-reload khi develop, hãy chạy `npm run start:dev` trên máy.

---

## Docker (image và môi trường deploy)

Dockerfile tạo ra image production. Vì Auth0 ở off-cluster, container chỉ cần kết nối được tới **Postgres**, **Redis** và **`https://${AUTH0_DOMAIN}/`** — các URL kiểu `localhost` thường phải thay bằng hostname thật.

### Dockerfile nhiều stage

| Stage     | Mục đích                                                          |
| --------- | ----------------------------------------------------------------- |
| `deps`    | Cài toàn bộ dependency                                            |
| `builder` | Build TypeScript                                                  |
| `runner`  | Image production chỉ chứa dependency cần thiết và output đã build |

### Chạy image trực tiếp

```bash
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://user:pass@db-host:5432/be-capstone \
  -e AUTH0_DOMAIN=tenant.us.auth0.com \
  -e AUTH0_CLIENT_ID=your-client-id \
  -e AUTH0_CLIENT_SECRET=your-client-secret \
  -e AUTH0_AUDIENCE=https://api.example.com \
  -e AUTH0_REDIRECT_URI=https://api.example.com/auth/callback \
  -e AUTH0_LOGOUT_RETURN_URL=https://app.example.com \
  -e REDIS_URL=redis://redis-host:6379 \
  -e SESSION_SECRET=long-random-secret \
  -e FRONTEND_URL=https://app.example.com \
  -e NODE_ENV=production \
  ghcr.io/<owner>/be-capstone:latest
```

| Biến                                          | Mô tả                                                                         |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| `DATABASE_URL`                                | Chuỗi kết nối Postgres (phải truy cập được từ container)                      |
| `AUTH0_DOMAIN`                                | Auth0 tenant domain (không kèm protocol). Issuer = `https://${AUTH0_DOMAIN}/` |
| `AUTH0_CLIENT_SECRET`                         | Phải trùng với secret của application trong Auth0                             |
| `AUTH0_AUDIENCE`                              | Phải trùng identifier của API trong Auth0                                     |
| `AUTH0_REDIRECT_URI`                          | Phải nằm trong Allowed Callback URLs của application                          |
| `AUTH0_LOGOUT_RETURN_URL`                     | Phải nằm trong Allowed Logout URLs của application                            |
| `REDIS_URL`, `SESSION_SECRET`, `FRONTEND_URL` | Bắt buộc cho session, CORS / redirect                                         |

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
