# BE Capstone

[Vietnamese version](README.vi.md)

NestJS backend API with PostgreSQL, Keycloak (OIDC / Google login), TypeORM, and Swagger.

---

## Prerequisites

| Tool                                               | Version | Purpose                                               |
| -------------------------------------------------- | ------- | ----------------------------------------------------- |
| [Node.js](https://nodejs.org)                      | >= 20   | Runtime                                               |
| [npm](https://www.npmjs.com)                       | >= 10   | Package manager                                       |
| [Docker](https://docs.docker.com/get-docker/)      | >= 24   | Containers for Postgres, Keycloak, and production API |
| [Docker Compose](https://docs.docker.com/compose/) | >= 2.20 | Multi-container orchestration                         |

---

## Project structure

```
src/
  config/          Centralized env config (ConfigModule, env.config.ts)
  auth/            OIDC auth endpoints (login, callback, token, refresh, logout, me)
  health/          Health check endpoint (API, DB, Keycloak)
  users/           User entity + upsert-on-login service
  app.module.ts    Root module
  main.ts          Bootstrap with env validation + Swagger setup
keycloak/
  realm-import/    Keycloak realm JSON auto-imported on startup
docs/
  auth.md          Frontend auth integration guide
.github/
  workflows/
    ci.yaml        PR/push: lint, build, test (with Postgres service)
    build.yaml     Push to main: build + publish Docker image to GHCR
```

---

## Initial setup

### 1. Create your `.env` files

```bash
cp .env.example .env
cp .env.dev.example .env.dev
```

- **`.env`** — used when you run the API with Node on your machine (`npm run start:dev`). Match `DATABASE_URL` user, password, and database name to the values in **`.env.dev`**, and point Redis to `redis://localhost:6379` if Redis is up from Compose.
- **`.env.dev`** — used by `docker compose` (and `docker-compose.yaml`) for Postgres, Keycloak, and optional full-stack services. Set strong values for the `CHANGE_ME` fields.

If you also use the production-style Compose file, add:

```bash
cp .env.prod.example .env.prod
```

### 2. Create the Keycloak realm import file

The `keycloak/realm-import/` directory is **gitignored** because it can contain secrets (Google OAuth credentials). You must create it manually before starting Keycloak.

```bash
mkdir -p keycloak/realm-import
```

Then create `keycloak/realm-import/be-capstone-realm.json` with the following content:

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

> Replace `REPLACE_WITH_GOOGLE_CLIENT_ID` and `REPLACE_WITH_GOOGLE_CLIENT_SECRET` with your real Google OAuth credentials (see [Google identity provider](#google-identity-provider) below). If you don't need Google login yet, leave the placeholders — Keycloak will import with Google IDP disabled until valid credentials are set.

---

## Quick start

> **Default workflow:** start only **Postgres, Redis, and Keycloak** with Compose, then run the API on the host for hot-reload. The API must use a **browser-reachable** `KEYCLOAK_PUBLIC_URL` (e.g. `http://localhost:8080`) and, when the API runs on the host, an internal base URL that reaches Keycloak from that process (e.g. set `KEYCLOAK_INTERNAL_URL=http://localhost:8080` and `KEYCLOAK_HEALTH_URL=http://localhost:9000/health/ready`, or omit internal URL so it follows the public URL). For Redis sessions, use `REDIS_URL=redis://localhost:6379` while the Redis service from Compose is running. To run the **built API image, observability, and (for prod) nginx** in Docker, see [Docker Compose (local)](#docker-compose-local).

### 1. Start Postgres, Redis, and Keycloak

> Make sure you have completed [Initial setup](#initial-setup) first (including `.env.dev` for Compose).

```bash
docker compose up -d postgres redis keycloak
```

| Service         | URL                                                           |
| --------------- | ------------------------------------------------------------- |
| Keycloak admin  | http://localhost:8080 (credentials from `KC_*` in `.env.dev`) |
| Keycloak health | http://localhost:9000/health/ready                            |
| Postgres        | `localhost:5432` (user / password / DB from `.env.dev`)       |
| Redis           | `localhost:6379`                                              |

To stop these services:

```bash
docker compose down
```

To also wipe the database volume (forces fresh Keycloak realm import):

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

## Docker Compose (local)

Two Compose files are provided. Both expect the Keycloak realm import from [Initial setup](#initial-setup). **Do not run both stacks at the same time** — they use the same container names (e.g. `capstone-postgres`) and would conflict.

### `docker-compose.yaml` (default)

**Purpose:** Local “full” stack: Postgres, Redis, Keycloak, the API **Docker image**, Loki, Alloy, and Grafana. Uses **`.env.dev`**.

1. Create **`.env.dev`** from the example and set secrets (see [Initial setup](#initial-setup)):

   ```bash
   cp .env.dev.example .env.dev
   ```

2. Start everything (Compose defaults to `docker-compose.yaml`):

   ```bash
   docker compose up -d
   ```

   To pin the file explicitly: `docker compose -f docker-compose.yaml up -d`

3. Stop and remove containers:

   ```bash
   docker compose down
   ```

   To remove named volumes (fresh DB and realm re-import on next start):

   ```bash
   docker compose down -v
   ```

| Exposed on host | Service                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------- |
| `5432`          | Postgres                                                                                 |
| `6379`          | Redis                                                                                    |
| `8080`, `9000`  | Keycloak (admin UI and health)                                                           |
| `3001`          | **API** → maps to app port `3000` in the container (Swagger: http://localhost:3001/docs) |
| `3100`          | Loki                                                                                     |
| `12345`         | Alloy UI                                                                                 |
| `3002`          | Grafana (anonymous viewer enabled in Compose)                                            |

Align **`KEYCLOAK_REDIRECT_URI`** in `.env.dev` with the API port you use (e.g. `http://localhost:3001/auth/callback` in `.env.dev.example`).

You can still start **only** infrastructure for host-based API development: `docker compose up -d postgres redis keycloak` (see [Quick start](#quick-start)).

### `docker-compose.prod.yaml` (production-like: nginx in front)

**Purpose:** Same services as the dev file, with **nginx** as a single entrypoint on port **80**: Keycloak is under **`/auth`**, the API is under **`/api`**, Grafana under **`/gfn`**. Keycloak and the API are not published on separate host ports. Uses **`.env.prod`**.

1. Create **`.env.prod`** from the example and set secrets, especially **`PUBLIC_URL`** (e.g. `http://localhost` for local use):

   ```bash
   cp .env.prod.example .env.prod
   ```

2. Start:

   ```bash
   docker compose -f docker-compose.prod.yaml up -d
   ```

3. Stop:

   ```bash
   docker compose -f docker-compose.prod.yaml down
   ```

   With volumes: `docker compose -f docker-compose.prod.yaml down -v`

| Entry                               | URL (with `PUBLIC_URL=http://localhost`)                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Nginx (health)                      | http://localhost/nginx-health                                                                           |
| API (path prefix stripped by nginx) | http://localhost/api/ (e.g. http://localhost/api/docs for Swagger)                                      |
| Keycloak                            | http://localhost/auth/                                                                                  |
| Grafana                             | http://localhost/gfn/                                                                                   |
| Postgres                            | Host port from `POSTGRES_PORT` in `.env.prod` (default `5432`) — Redis is **not** exposed in this file. |

**Google OAuth (prod-like stack):** set the **Authorized redirect URI** in Google Cloud to  
`http://localhost/auth/realms/be-capstone/broker/google/endpoint` (nginx → Keycloak), not `http://localhost:8080/...`, because Keycloak is only reachable via nginx on port 80 in this setup.

---

## Environment variables

All env vars are centrally managed in `src/config/env.config.ts`. The app validates them at startup and logs any missing required keys.

| Variable                 | Required | Default                                | Description                                                                                      |
| ------------------------ | -------- | -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `NODE_ENV`               | No       | `development`                          | Runtime mode                                                                                     |
| `PORT`                   | No       | `3000`                                 | API listen port                                                                                  |
| `DATABASE_URL`           | **Yes**  | —                                      | Postgres connection URL                                                                          |
| `KEYCLOAK_PUBLIC_URL`    | **Yes**  | —                                      | Keycloak base URL in the **browser** (login redirects)                                           |
| `KEYCLOAK_INTERNAL_URL`  | No       | same as public                         | Keycloak base URL for **server** calls; set to a Docker service URL when the API runs in Compose |
| `KEYCLOAK_HEALTH_URL`    | No       | derived from internal URL, port `9000` | Keycloak management health endpoint                                                              |
| `KEYCLOAK_REALM`         | No       | `be-capstone`                          | Keycloak realm name                                                                              |
| `KEYCLOAK_CLIENT_ID`     | No       | `be-capstone-api`                      | OIDC client ID                                                                                   |
| `KEYCLOAK_CLIENT_SECRET` | No       | `be-capstone-secret`                   | OIDC client secret                                                                               |
| `KEYCLOAK_REDIRECT_URI`  | No       | `http://localhost:3000/auth/callback`  | OAuth redirect URI                                                                               |
| `REDIS_URL`              | No       | `redis://localhost:6379`               | Redis URL for sessions                                                                           |
| `SESSION_SECRET`         | **Yes**  | —                                      | Secret for signing the session cookie                                                            |
| `FRONTEND_URL`           | **Yes**  | —                                      | Frontend origin (redirects, CORS)                                                                |

---

## Available scripts

| Command               | Description                       |
| --------------------- | --------------------------------- |
| `npm run start:dev`   | Start in watch mode (development) |
| `npm run start:debug` | Start in debug + watch mode       |
| `npm run start:prod`  | Start compiled production build   |
| `npm run build`       | Compile TypeScript to `dist/`     |
| `npm run test`        | Run unit tests                    |
| `npm run test:e2e`    | Run end-to-end tests              |
| `npm run test:cov`    | Run tests with coverage report    |
| `npm run lint`        | Lint and auto-fix with ESLint     |
| `npm run format`      | Format code with Prettier         |

---

## API endpoints

### Core

| Method | Path      | Description                        |
| ------ | --------- | ---------------------------------- |
| `GET`  | `/`       | Hello World                        |
| `GET`  | `/health` | Health check (API + DB + Keycloak) |
| `GET`  | `/docs`   | Swagger UI                         |

### Auth

| Method | Path              | Description                                                |
| ------ | ----------------- | ---------------------------------------------------------- |
| `GET`  | `/auth/endpoints` | OIDC discovery endpoints                                   |
| `GET`  | `/auth/login`     | Get authorization URL (`?idpHint=google` for Google login) |
| `GET`  | `/auth/callback`  | Exchange code via query params (Keycloak redirect target)  |
| `POST` | `/auth/token`     | Exchange code via JSON body (preferred for SPAs)           |
| `POST` | `/auth/refresh`   | Refresh access token                                       |
| `POST` | `/auth/logout`    | Revoke session                                             |
| `GET`  | `/auth/me`        | Current user profile (requires `Authorization: Bearer`)    |

> For full frontend integration details, see [docs/auth.md](docs/auth.md).

---

## Keycloak setup

### Auto-import (Docker Compose)

The `keycloak` service is configured with `--import-realm`. On first start it automatically imports:

- Realm: `be-capstone`
- Confidential client: `be-capstone-api`
- Google identity provider (requires manual credential setup — see below)
- Protocol mapper to expose `identity_provider` claim in tokens
- Custom login theme: `capstone`
- Custom first broker login flow (profile review on first Google login only)
- Disabled `VERIFY_PROFILE` required action (prevents repeated profile prompts)

The realm file is at `keycloak/realm-import/be-capstone-realm.json`.

> This directory is **gitignored** because it can contain real OAuth secrets. See [Initial setup](#initial-setup) for how to create it.

### Custom authentication flow

The realm uses a custom `capstone first broker login` flow for Google IDP:

```
capstone first broker login
├── Review Profile                     REQUIRED  (shows once on first Google login)
└── Create or Link User                REQUIRED  (sub-flow)
    ├── Create User If Unique          ALTERNATIVE  (new email → create user)
    └── Handle Existing Account        ALTERNATIVE  (sub-flow, if email exists)
        ├── Confirm Link               REQUIRED
        ├── Email Verification         ALTERNATIVE
        └── Username/Password Form     ALTERNATIVE
```

| Scenario                                      | Behavior                                                          |
| --------------------------------------------- | ----------------------------------------------------------------- |
| First Google login (new user)                 | Profile review form → user created → done                         |
| First Google login (email already registered) | Profile review form → confirm link → verify via email or password |
| Subsequent Google logins                      | No profile prompt — straight to callback                          |

> **Important:** Keycloak 26.x has a `VERIFY_PROFILE` required action enabled by default that prompts profile review on every login. This realm disables it so that only the first broker login flow triggers the one-time review.

### Custom Keycloak login theme

This project now includes a custom Keycloak login theme located at:

```text
keycloak/themes/capstone/login/
```

Key files:

| File                       | Purpose                                           |
| -------------------------- | ------------------------------------------------- |
| `theme.properties`         | Declares the theme and its parent (`keycloak.v2`) |
| `login.ftl`                | Custom login page layout                          |
| `resources/css/styles.css` | Branding, layout, colors, responsive styling      |

The theme is mounted into the container by Docker Compose:

```yaml
volumes:
  - ./keycloak/themes:/opt/keycloak/themes
```

And the imported realm is configured to use it:

```json
"loginTheme": "capstone"
```

If you want to customize the login page further:

1. Edit `keycloak/themes/capstone/login/login.ftl` for layout/content
2. Edit `keycloak/themes/capstone/login/resources/css/styles.css` for colors, spacing, typography
3. Restart Keycloak:

```bash
docker compose restart keycloak
```

If the UI still looks cached, recreate the Keycloak container:

```bash
docker compose up -d --force-recreate keycloak
```

### Google identity provider

Google IDP is pre-configured in the realm import with placeholder credentials. To enable it:

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an OAuth 2.0 Client ID (Web application)
3. Set **Authorized redirect URI** to:
   ```
   http://localhost:8080/realms/be-capstone/broker/google/endpoint
   ```
4. Open Keycloak admin at http://localhost:8080 → `be-capstone` realm → Identity Providers → Google
5. Enter the Google Client ID and Client Secret
6. Save

Users can now log in via Google using:

```
GET /auth/login?idpHint=google
```

---

## Database

- **Engine:** PostgreSQL 16
- **ORM:** TypeORM with `synchronize: true` (auto-creates tables from entities in dev)
- **User table:** Auto-created from `src/users/user.entity.ts` on first boot

| Column        | Type               | Description                                 |
| ------------- | ------------------ | ------------------------------------------- |
| `id`          | UUID               | Primary key                                 |
| `keycloakSub` | string (unique)    | Immutable Keycloak user ID                  |
| `email`       | varchar (nullable) | Refreshed on every login                    |
| `name`        | varchar (nullable) | Refreshed on every login                    |
| `provider`    | string             | `keycloak` or `google` — set at first login |
| `isActive`    | boolean            | Default `true`                              |
| `createdAt`   | timestamp          | Auto-managed                                |
| `updatedAt`   | timestamp          | Auto-managed                                |

> **Production:** Set `synchronize: false` and use TypeORM migrations instead.

---

## CI/CD

### CI (`.github/workflows/ci.yaml`)

Runs on every push and pull request:

1. Spins up a Postgres service container (accessible at `localhost:5432`)
2. Installs dependencies (`npm ci`)
3. Builds the project (`npm run build`)
4. Runs unit tests (`npm run test`)
5. Runs e2e tests (`npm run test:e2e`)

> **Note:** Keycloak is **not** running in CI. All Keycloak-related env vars (`KEYCLOAK_PUBLIC_URL`, etc.) are set so the app config validation passes, but unit tests mock all Keycloak HTTP calls. The API runs directly on the GitHub Actions runner, not in a Docker container.

### Build & Publish (`.github/workflows/build.yaml`)

Runs on push to `main` only:

1. Builds the Docker image using the multi-stage `Dockerfile`
2. Pushes to GitHub Container Registry (`ghcr.io/<owner>/<repo>`)
3. Tags: `latest` + git SHA

> The same image is used by [Docker Compose (local)](#docker-compose-local) for the `be-api` service. For a hot-reload API on the host, use `npm run start:dev` and only the Compose infrastructure services, as in [Quick start](#quick-start).

---

## Docker (image and production-style runs)

The Dockerfile production image is used in **`docker-compose.yaml` / `docker-compose.prod.yaml`** (see [Docker Compose (local)](#docker-compose-local)) with `KEYCLOAK_INTERNAL_URL`, `DATABASE_URL`, and other vars set to **Docker network hostnames** (`postgres`, `keycloak`, `redis`), not `localhost`. For a **raw** `docker run` on a real host or VM, use URLs that the container can resolve (e.g. `https://auth.example.com` for both public and internal Keycloak, or public + internal if they differ on your network).

### Multi-stage Dockerfile

| Stage     | Purpose                                                      |
| --------- | ------------------------------------------------------------ |
| `deps`    | Install all dependencies                                     |
| `builder` | Compile TypeScript                                           |
| `runner`  | Production image with only production deps + compiled output |

### Running the image in a deployed environment

The container needs env vars for Postgres, Keycloak, Redis, and the session secret (see `src/config/env.config.ts`). `localhost` in `DATABASE_URL` or Keycloak URLs **only works** if the browser-facing URL is the same and Keycloak/Postgres are reachable from the container in your setup; usually you use real hostnames.

```bash
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://user:pass@db-host:5432/be-capstone \
  -e KEYCLOAK_PUBLIC_URL=https://auth.example.com \
  -e KEYCLOAK_INTERNAL_URL=https://auth.example.com \
  -e KEYCLOAK_HEALTH_URL=https://auth.example.com:9000/health/ready \
  -e KEYCLOAK_REALM=be-capstone \
  -e KEYCLOAK_CLIENT_ID=be-capstone-api \
  -e KEYCLOAK_CLIENT_SECRET=your-secret \
  -e KEYCLOAK_REDIRECT_URI=https://app.example.com/auth/callback \
  -e REDIS_URL=redis://redis-host:6379 \
  -e SESSION_SECRET=long-random-secret \
  -e FRONTEND_URL=https://app.example.com \
  -e NODE_ENV=production \
  ghcr.io/<owner>/be-capstone:latest
```

| Variable                                      | Description                                                                                    |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                | Postgres connection URL (must be reachable from the container)                                 |
| `KEYCLOAK_PUBLIC_URL`                         | Keycloak base URL for **browser** redirects (JWT issuer must match)                            |
| `KEYCLOAK_INTERNAL_URL`                       | Keycloak for **server** token and metadata calls (often same as public if one URL serves both) |
| `KEYCLOAK_HEALTH_URL`                         | Keycloak management health endpoint                                                            |
| `KEYCLOAK_CLIENT_SECRET`                      | Must match the secret configured in Keycloak                                                   |
| `KEYCLOAK_REDIRECT_URI`                       | Must match the registered OAuth redirect for this client                                       |
| `REDIS_URL`, `SESSION_SECRET`, `FRONTEND_URL` | Required for sessions and CORS/redirects                                                       |

> **Important:** The JWT `iss` claim from Keycloak must match what the API expects — typically `KEYCLOAK_PUBLIC_URL` matches the Keycloak base URL the browser uses.

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
