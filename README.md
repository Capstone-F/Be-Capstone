# BE Capstone

[Vietnamese version](README.vi.md)

NestJS backend API with PostgreSQL, Auth0 (OIDC / Google social), TypeORM, and Swagger.

---

## Prerequisites

| Tool                                               | Version | Purpose                                                |
| -------------------------------------------------- | ------- | ------------------------------------------------------ |
| [Node.js](https://nodejs.org)                      | >= 20   | Runtime                                                |
| [npm](https://www.npmjs.com)                       | >= 10   | Package manager                                        |
| [Docker](https://docs.docker.com/get-docker/)      | >= 24   | Containers for Postgres, Redis, and the API image      |
| [Docker Compose](https://docs.docker.com/compose/) | >= 2.20 | Multi-container orchestration                          |
| [Auth0 tenant](https://auth0.com/signup)           | —       | Hosted identity provider (free tier is enough for dev) |

---

## Project structure

```
src/
  config/          Centralized env config (ConfigModule, env.config.ts)
  auth/            OIDC auth endpoints against Auth0 (login, callback, status, me, logout)
  health/          Health check endpoint (API, DB, Auth0, Redis)
  users/           User entity + upsert-on-login service
  app.module.ts    Root module
  main.ts          Bootstrap with env validation + Swagger setup
docs/
  auth.md          Frontend auth integration guide
commitlint.config.cjs      Conventional Commit rules for Husky `commit-msg`
scripts/
  validate-branch-name.cjs Branch naming checks for Husky `pre-push`
.github/
  workflows/
    ci.yaml        PR/push: secretlint, build, test (with Postgres service)
    build.yaml     Push to main: build + publish Docker image to GHCR
```

---

## Initial setup

### 1. Create your `.env` files

```bash
cp .env.example .env
cp .env.dev.example .env.dev
```

- **`.env`** — used when you run the API with Node on your machine (`npm run start:dev`).
- **`.env.dev`** — used by `docker compose` for local Postgres / Redis (and the API image when run in Compose).

If you also use the production-style Compose file:

```bash
cp .env.prod.example .env.prod
```

### 2. Configure your Auth0 tenant

In the [Auth0 dashboard](https://manage.auth0.com):

1. **Create an Application** → "Regular Web Application". Note the **Domain**, **Client ID**, **Client Secret**.
2. **Allowed Callback URLs** must include `http://localhost:3000/auth/callback` (and `http://localhost:3001/auth/callback` if using `docker-compose.yaml`, plus the prod URL if applicable).
3. **Allowed Logout URLs** must include your `FRONTEND_URL` (e.g. `http://localhost:5173`).
4. **APIs** → **Create API**. Use any unique identifier, e.g. `https://api.be-capstone.local`. This is the **`AUTH0_AUDIENCE`** value.
5. **Authentication** → **Social** → enable **Google** (default connection name `google-oauth2`). For non-dev tenants supply your own Google OAuth credentials in the connection settings.
6. Fill in the matching `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, and `AUTH0_AUDIENCE` values in your `.env` (and `.env.dev` / `.env.prod` if you use Compose).

> Auth0 issues access tokens against `iss=https://${AUTH0_DOMAIN}/`. Always use the same domain in both browser and server contexts so token validation matches.

---

## Quick start

> **Why the API runs locally, not in Docker Compose:**
> Auth0 is a hosted SaaS, so the API can run anywhere it has internet access — including on your host. Compose is used only for local Postgres and Redis. The optional `be-api` service in `docker-compose.yaml` builds and runs the production image when you want a fully containerized stack.

### 1. Start Postgres and Redis

> Make sure you have completed [Initial setup](#initial-setup) first.

```bash
docker compose up -d postgres redis
```

| Service  | URL                                          |
| -------- | -------------------------------------------- |
| Postgres | localhost:5432 (admin / admin / be-capstone) |
| Redis    | localhost:6379                               |

To stop containers:

```bash
docker compose down
```

To also wipe volumes (drops the local `users` table — handy after this Auth0 migration so the renamed `auth0Sub` column takes effect cleanly):

```bash
docker compose down -v
```

### 2. Install dependencies and start the API

```bash
npm install
npm run start:dev
```

| Service      | URL                          |
| ------------ | ---------------------------- |
| API          | http://localhost:3000        |
| Swagger docs | http://localhost:3000/docs   |
| Health check | http://localhost:3000/health |

The API is now running at http://localhost:3000 with hot-reload.

---

## Environment variables

All env vars are centrally managed in `src/config/env.config.ts`. The app validates them at startup and logs any missing required keys.

| Variable                  | Required | Default                               | Description                                                                                     |
| ------------------------- | -------- | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `NODE_ENV`                | No       | `development`                         | Runtime mode                                                                                    |
| `PORT`                    | No       | `3000`                                | API listen port                                                                                 |
| `DATABASE_URL`            | **Yes**  | —                                     | Postgres connection URL                                                                         |
| `AUTH0_DOMAIN`            | **Yes**  | —                                     | Auth0 tenant domain (no protocol). Issuer = `https://${AUTH0_DOMAIN}/`                          |
| `AUTH0_CLIENT_ID`         | **Yes**  | —                                     | Auth0 application client id                                                                     |
| `AUTH0_CLIENT_SECRET`     | **Yes**  | —                                     | Auth0 application client secret                                                                 |
| `AUTH0_AUDIENCE`          | **Yes**  | —                                     | Auth0 API identifier (passed as `audience` so a real access token is issued)                    |
| `AUTH0_REDIRECT_URI`      | No       | `http://localhost:3000/auth/callback` | Where Auth0 sends the browser after authorize. Must be allow-listed in the Application settings |
| `AUTH0_LOGOUT_RETURN_URL` | No       | `FRONTEND_URL`                        | Where `v2/logout` sends the browser back. Must be allow-listed in the Application settings      |
| `REDIS_URL`               | No       | `redis://localhost:6379`              | Redis URL for sessions                                                                          |
| `SESSION_SECRET`          | **Yes**  | —                                     | Secret for signing the session cookie                                                           |
| `SESSION_COOKIE_SECURE`   | No       | `true` in production, else `false`    | Set to `false` for local HTTP setups so the browser accepts the cookie                          |
| `FRONTEND_URL`            | **Yes**  | —                                     | Frontend origin (used for redirects and CORS)                                                   |
| `CORS_ORIGIN`             | No       | `FRONTEND_URL`                        | Allowed CORS origin                                                                             |

---

## Available scripts

| Command                        | Description                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| `npm run start:dev`            | Start in watch mode (development)                                                            |
| `npm run start:debug`          | Start in debug + watch mode                                                                  |
| `npm run start:prod`           | Start compiled production build                                                              |
| `npm run build`                | Compile TypeScript to `dist/`                                                                |
| `npm run test`                 | Run unit tests                                                                               |
| `npm run test:e2e`             | Run end-to-end tests                                                                         |
| `npm run test:cov`             | Run tests with coverage report                                                               |
| `npm run lint`                 | Lint and auto-fix with ESLint                                                                |
| `npm run format`               | Format code with Prettier                                                                    |
| `npm run secretlint`           | Scan the repo for leaked credentials (same engine as CI / pre-commit via lint-staged)        |
| `npm run commitlint -- <file>` | Manually lint a commit message file (same as Husky `commit-msg`; e.g. `.git/COMMIT_EDITMSG`) |

---

## Commit & branch conventions

This repo follows [Conventional Commits](https://www.conventionalcommits.org/). Allowed **types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Example header: `feat(auth): add google login`.

**Branch names** are checked on `git push` (Husky `pre-push`). Use `<type>/<short-description>` with the same **type** list as above — lowercase slug with hyphens, dots, underscores between alphanumerics (max 60 characters), e.g. `feat/auth0-google-login`.

Also allowed **without** that pattern: `main`, `release/*`, `hotfix/*`, `dependabot/*`, `cursor/*` (Cursor agent workflows).

Husky hooks install automatically when you run **`npm install`** (`prepare` script). Escape hatch for emergencies: `git commit --no-verify` / `git push --no-verify`.

| Hook         | What runs                                    |
| ------------ | -------------------------------------------- |
| `pre-commit` | lint-staged: secretlint, ESLint, Prettier    |
| `commit-msg` | commitlint (@commitlint/config-conventional) |
| `pre-push`   | `scripts/validate-branch-name.cjs`           |

---

## API endpoints

### Core

| Method | Path      | Description                             |
| ------ | --------- | --------------------------------------- |
| `GET`  | `/`       | Hello World                             |
| `GET`  | `/health` | Health check (API + DB + Auth0 + Redis) |
| `GET`  | `/docs`   | Swagger UI                              |

### Auth

| Method | Path             | Description                                                                                                                                                                                                                                    |
| ------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/auth/login`    | Returns `{ login_uri }` — Auth0 `/authorize` URL the browser must visit. Body: `{ client_redirect_uri, idpHint? }`                                                                                                                             |
| `GET`  | `/auth/callback` | Auth0 redirects here; the BFF exchanges the code, sets the session cookie, then 302s to `client_redirect_uri`                                                                                                                                  |
| `GET`  | `/auth/status`   | `{ authenticated: boolean }`                                                                                                                                                                                                                   |
| `GET`  | `/auth/me`       | Current user profile (requires session cookie)                                                                                                                                                                                                 |
| `POST` | `/auth/logout`   | Revokes the refresh token, destroys the local session, returns `{ success, logout_uri }`. The frontend must redirect to `logout_uri` to also end the Auth0 SSO session. Body (optional): `{ return_to }` to override `AUTH0_LOGOUT_RETURN_URL` |

> For full frontend integration details, see [docs/auth.md](docs/auth.md).

### Google login

`POST /auth/login` accepts `idpHint`. The backend translates `idpHint=google` into Auth0's `connection=google-oauth2` query param, skipping the Universal Login picker:

```json
{
  "client_redirect_uri": "http://localhost:5173/dashboard",
  "idpHint": "google"
}
```

Any other `idpHint` value is passed through unchanged as the Auth0 `connection` name (e.g. `github`, `Username-Password-Authentication`).

---

## Auth0 setup

### Application configuration (Auth0 dashboard)

| Field                                | Value                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| Application type                     | Regular Web Application                                                            |
| Token endpoint authentication method | `Post` (or `Basic`)                                                                |
| Allowed Callback URLs                | `http://localhost:3000/auth/callback` (and any other deployed redirect URIs)       |
| Allowed Logout URLs                  | `http://localhost:5173` (and any deployed frontend origin)                         |
| Allowed Web Origins                  | `http://localhost:5173` (and any deployed frontend origin)                         |
| Refresh Token Rotation               | Enabled (recommended)                                                              |
| Refresh Token                        | "Allow Offline Access" enabled (so `offline_access` scope returns a refresh token) |

### API configuration (Auth0 dashboard)

| Field                 | Value                                                                         |
| --------------------- | ----------------------------------------------------------------------------- |
| Identifier (audience) | `https://api.be-capstone.local` (any unique URI, must match `AUTH0_AUDIENCE`) |
| Signing algorithm     | RS256                                                                         |
| Allow Offline Access  | Enabled                                                                       |

### Google social connection

In Auth0 dashboard → **Authentication → Social → Google**: enable the connection. The default Auth0 dev keys work for prototypes; for non-dev tenants, supply your own Google OAuth Client ID / Secret in the connection settings.

> No Google redirect URI to configure on Google's side: with the default Auth0 dev keys it just works. With your own Google OAuth credentials, set the **Authorized redirect URI** to `https://${AUTH0_DOMAIN}/login/callback`.

---

## Database

- **Engine:** PostgreSQL 16
- **ORM:** TypeORM with `synchronize: true` (auto-creates tables from entities in dev)
- **User table:** Auto-created from `src/users/user.entity.ts` on first boot

| Column      | Type               | Description                                     |
| ----------- | ------------------ | ----------------------------------------------- | -------------------- | ----- |
| `id`        | UUID               | Primary key                                     |
| `auth0Sub`  | string (unique)    | Immutable Auth0 user ID (sub claim, e.g. `auth0 | ...`, `google-oauth2 | ...`) |
| `email`     | varchar (nullable) | Refreshed on every login                        |
| `name`      | varchar (nullable) | Refreshed on every login                        |
| `isActive`  | boolean            | Default `true`                                  |
| `createdAt` | timestamp          | Auto-managed                                    |
| `updatedAt` | timestamp          | Auto-managed                                    |

> **Production:** Set `synchronize: false` and use TypeORM migrations instead.

> **Migrating from the old Keycloak schema:** the `keycloakSub` and `provider` columns no longer exist. Run `docker compose down -v` once after pulling this change so Postgres is recreated from scratch and the new column layout is applied.

---

## CI/CD

### CI (`.github/workflows/ci.yaml`)

Runs on every push and pull request:

- **secretlint** job: `npm ci`, then `npm run secretlint` (full-tree scan for secrets).
- **test** job: same as before, in parallel with secretlint.

1. Spins up a Postgres service container (accessible at `localhost:5432`)
2. Installs dependencies (`npm ci`)
3. Builds the project (`npm run build`)
4. Runs unit tests (`npm run test`)
5. Runs e2e tests (`npm run test:e2e`)

> **Hooks:** [Husky](https://typicode.github.io/husky/) runs `lint-staged` on **pre-commit** (secretlint on staged files, then ESLint/Prettier). **commit-msg** runs commitlint (Conventional Commits). **pre-push** validates branch names. CI is a backstop for secrets only; commit/branch rules are local (skippable with `--no-verify`).

> **Note:** Auth0 is **not** contacted in CI. All `AUTH0_*` env vars are set to placeholder values so the app config validation passes, and unit / e2e tests mock all Auth0 HTTP calls.

### Build & Publish (`.github/workflows/build.yaml`)

Runs on push to `main` only:

1. Builds the Docker image using the multi-stage `Dockerfile`
2. Pushes to GitHub Container Registry (`ghcr.io/<owner>/<repo>`)
3. Tags: `latest` + git SHA

> The same image is used by the optional `be-api` service in `docker-compose.yaml`. For a hot-reload dev API, run `npm run start:dev` on the host instead.

---

## Docker (image and deployed environments)

The Dockerfile produces a production image. With Auth0 hosted off-cluster, you only need the container to reach **Postgres**, **Redis**, and **`https://${AUTH0_DOMAIN}/`** — `localhost` style URLs typically need to be replaced with real hostnames.

### Multi-stage Dockerfile

| Stage     | Purpose                                                      |
| --------- | ------------------------------------------------------------ |
| `deps`    | Install all dependencies                                     |
| `builder` | Compile TypeScript                                           |
| `runner`  | Production image with only production deps + compiled output |

### Running the image directly

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

| Variable                                      | Description                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| `DATABASE_URL`                                | Postgres connection URL (must be reachable from the container)         |
| `AUTH0_DOMAIN`                                | Auth0 tenant domain (no protocol). Issuer = `https://${AUTH0_DOMAIN}/` |
| `AUTH0_CLIENT_SECRET`                         | Must match the application secret in Auth0                             |
| `AUTH0_AUDIENCE`                              | Must match the API identifier in Auth0                                 |
| `AUTH0_REDIRECT_URI`                          | Must be in the application's Allowed Callback URLs                     |
| `AUTH0_LOGOUT_RETURN_URL`                     | Must be in the application's Allowed Logout URLs                       |
| `REDIS_URL`, `SESSION_SECRET`, `FRONTEND_URL` | Required for sessions and CORS / redirects                             |

### Build manually

```bash
docker build -t be-capstone .
```

---

## Testing

```bash
# Unit tests
npm run test

# Unit tests in watch mode
npm run test:watch

# E2e tests (requires Postgres running)
npm run test:e2e

# Coverage report
npm run test:cov
```

Tests are co-located with source files (`*.spec.ts`). E2e tests are in `test/`.

---

## Documentation

- **[README.vi.md](README.vi.md)** — Vietnamese project guide
- **[docs/auth.md](docs/auth.md)** — Step-by-step frontend auth integration guide (web + mobile, standard + Google login, PKCE, token refresh, error handling)
- **[docs/auth.vi.md](docs/auth.vi.md)** — Vietnamese frontend auth integration guide
- **Swagger UI** — Available at `/docs` when the API is running
