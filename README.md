# BE Capstone

[Vietnamese version](README.vi.md)

NestJS backend API with PostgreSQL, Keycloak (OIDC / Google login), TypeORM, and Swagger.

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| [Node.js](https://nodejs.org) | >= 20 | Runtime |
| [npm](https://www.npmjs.com) | >= 10 | Package manager |
| [Docker](https://docs.docker.com/get-docker/) | >= 24 | Containers for Postgres, Keycloak, and production API |
| [Docker Compose](https://docs.docker.com/compose/) | >= 2.20 | Multi-container orchestration |

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

### 1. Create your `.env` file

```bash
cp .env.example .env
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

> Replace `REPLACE_WITH_GOOGLE_CLIENT_ID` and `REPLACE_WITH_GOOGLE_CLIENT_SECRET` with your real Google OAuth credentials (see [Google identity provider](#google-identity-provider) below). If you don't need Google login yet, leave the placeholders — Keycloak will import with Google IDP disabled until valid credentials are set.

---

## Quick start

### Option A — Run everything with Docker Compose (recommended)

This starts Postgres, Keycloak (with pre-configured realm + Google IDP), and the API in one command.

> Make sure you have completed [Initial setup](#initial-setup) first.

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| API | http://localhost:3000 |
| Swagger docs | http://localhost:3000/docs |
| Health check | http://localhost:3000/health |
| Keycloak admin | http://localhost:8080 (admin / admin) |
| Keycloak health | http://localhost:9000/health/ready |
| Postgres | localhost:5432 (admin / admin / be-capstone) |

To stop and remove containers:

```bash
docker compose down
```

To also wipe the database volume:

```bash
docker compose down -v
```

---

### Option B — Run API locally (dev mode)

Use this when you want hot-reload and want to develop against a local or Docker-hosted Postgres + Keycloak.

#### 1. Start Postgres and Keycloak

> Make sure you have completed [Initial setup](#initial-setup) first.

```bash
docker compose up postgres keycloak
```

#### 2. Install dependencies and start

```bash
npm install
npm run start:dev
```

The API is now running at http://localhost:3000 with hot-reload.

---

## Environment variables

All env vars are centrally managed in `src/config/env.config.ts`. The app validates them at startup and logs any missing required keys.

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | Runtime mode |
| `PORT` | No | `3000` | API listen port |
| `DATABASE_URL` | **Yes** | — | Postgres connection URL |
| `KEYCLOAK_URL` | **Yes** | — | Internal Keycloak base URL (server-to-server) |
| `KEYCLOAK_PUBLIC_URL` | No | Falls back to `KEYCLOAK_URL` | Public Keycloak URL (browser-facing login redirects) |
| `KEYCLOAK_HEALTH_URL` | No | `http://localhost:9000/health/ready` | Keycloak management health endpoint |
| `KEYCLOAK_REALM` | No | `be-capstone` | Keycloak realm name |
| `KEYCLOAK_CLIENT_ID` | No | `be-capstone-api` | OIDC client ID |
| `KEYCLOAK_CLIENT_SECRET` | No | `be-capstone-secret` | OIDC client secret |
| `KEYCLOAK_REDIRECT_URI` | No | `http://localhost:3000/auth/callback` | Default OAuth redirect URI |

---

## Available scripts

| Command | Description |
|---|---|
| `npm run start:dev` | Start in watch mode (development) |
| `npm run start:debug` | Start in debug + watch mode |
| `npm run start:prod` | Start compiled production build |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run test` | Run unit tests |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run test:cov` | Run tests with coverage report |
| `npm run lint` | Lint and auto-fix with ESLint |
| `npm run format` | Format code with Prettier |

---

## API endpoints

### Core

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Hello World |
| `GET` | `/health` | Health check (API + DB + Keycloak) |
| `GET` | `/docs` | Swagger UI |

### Auth

| Method | Path | Description |
|---|---|---|
| `GET` | `/auth/endpoints` | OIDC discovery endpoints |
| `GET` | `/auth/login` | Get authorization URL (`?idpHint=google` for Google login) |
| `GET` | `/auth/callback` | Exchange code via query params (Keycloak redirect target) |
| `POST` | `/auth/token` | Exchange code via JSON body (preferred for SPAs) |
| `POST` | `/auth/refresh` | Refresh access token |
| `POST` | `/auth/logout` | Revoke session |
| `GET` | `/auth/me` | Current user profile (requires `Authorization: Bearer`) |

> For full frontend integration details, see [docs/auth.md](docs/auth.md).

---

## Keycloak setup

### Auto-import (Docker Compose)

The `keycloak` service is configured with `--import-realm`. On first start it automatically imports:

- Realm: `be-capstone`
- Confidential client: `be-capstone-api`
- Google identity provider (requires manual credential setup — see below)
- Protocol mapper to expose `identity_provider` claim in tokens

The realm file is at `keycloak/realm-import/be-capstone-realm.json`.

> This directory is **gitignored** because it can contain real OAuth secrets. See [Initial setup](#initial-setup) for how to create it.

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

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `keycloakSub` | string (unique) | Immutable Keycloak user ID |
| `email` | varchar (nullable) | Refreshed on every login |
| `name` | varchar (nullable) | Refreshed on every login |
| `provider` | string | `keycloak` or `google` — set at first login |
| `isActive` | boolean | Default `true` |
| `createdAt` | timestamp | Auto-managed |
| `updatedAt` | timestamp | Auto-managed |

> **Production:** Set `synchronize: false` and use TypeORM migrations instead.

---

## CI/CD

### CI (`.github/workflows/ci.yaml`)

Runs on every push and pull request:

1. Spins up a Postgres service container
2. Installs dependencies (`npm ci`)
3. Builds the project (`npm run build`)
4. Runs unit tests (`npm run test`)
5. Runs e2e tests (`npm run test:e2e`)

### Build & Publish (`.github/workflows/build.yaml`)

Runs on push to `main` only:

1. Builds the Docker image using the multi-stage `Dockerfile`
2. Pushes to GitHub Container Registry (`ghcr.io/<owner>/<repo>`)
3. Tags: `latest` + git SHA

---

## Docker

### Multi-stage Dockerfile

| Stage | Purpose |
|---|---|
| `deps` | Install all dependencies |
| `builder` | Compile TypeScript |
| `runner` | Production image with only production deps + compiled output |

### Build manually

```bash
docker build -t be-capstone .
docker run -p 3000:3000 --env-file .env be-capstone
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
