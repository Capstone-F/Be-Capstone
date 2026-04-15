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

> **Why the API runs locally, not in Docker Compose:**
> The API uses `KEYCLOAK_URL=http://localhost:8080` and `KEYCLOAK_HEALTH_URL=http://localhost:9000/health/ready` to reach Keycloak. This ensures the JWT issuer (`iss` claim) is always `http://localhost:8080/...` for both browser and server — avoiding token validation mismatches. If the API ran inside Docker Compose, `localhost` would resolve to the container itself instead of the host machine, making Keycloak and Postgres unreachable. Docker Compose is used only for Postgres and Keycloak; run the API on your host machine.

### 1. Start Postgres and Keycloak

> Make sure you have completed [Initial setup](#initial-setup) first.

```bash
docker compose up -d
```

| Service | URL |
|---|---|
| Keycloak admin | http://localhost:8080 (admin / admin) |
| Keycloak health | http://localhost:9000/health/ready |
| Postgres | localhost:5432 (admin / admin / be-capstone) |

To stop containers:

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

| Service | URL |
|---|---|
| API | http://localhost:3000 |
| Swagger docs | http://localhost:3000/docs |
| Health check | http://localhost:3000/health |

The API is now running at http://localhost:3000 with hot-reload.

---

## Environment variables

All env vars are centrally managed in `src/config/env.config.ts`. The app validates them at startup and logs any missing required keys.

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | Runtime mode |
| `PORT` | No | `3000` | API listen port |
| `DATABASE_URL` | **Yes** | — | Postgres connection URL |
| `KEYCLOAK_URL` | **Yes** | — | Keycloak base URL (used for both API and browser redirects) |
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

| Scenario | Behavior |
|---|---|
| First Google login (new user) | Profile review form → user created → done |
| First Google login (email already registered) | Profile review form → confirm link → verify via email or password |
| Subsequent Google logins | No profile prompt — straight to callback |

> **Important:** Keycloak 26.x has a `VERIFY_PROFILE` required action enabled by default that prompts profile review on every login. This realm disables it so that only the first broker login flow triggers the one-time review.

### Custom Keycloak login theme

This project now includes a custom Keycloak login theme located at:

```text
keycloak/themes/capstone/login/
```

Key files:

| File | Purpose |
|---|---|
| `theme.properties` | Declares the theme and its parent (`keycloak.v2`) |
| `login.ftl` | Custom login page layout |
| `resources/css/styles.css` | Branding, layout, colors, responsive styling |

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

1. Spins up a Postgres service container (accessible at `localhost:5432`)
2. Installs dependencies (`npm ci`)
3. Builds the project (`npm run build`)
4. Runs unit tests (`npm run test`)
5. Runs e2e tests (`npm run test:e2e`)

> **Note:** Keycloak is **not** running in CI. All Keycloak-related env vars (`KEYCLOAK_URL`, etc.) are set so the app config validation passes, but unit tests mock all Keycloak HTTP calls. The API runs directly on the GitHub Actions runner, not in a Docker container.

### Build & Publish (`.github/workflows/build.yaml`)

Runs on push to `main` only:

1. Builds the Docker image using the multi-stage `Dockerfile`
2. Pushes to GitHub Container Registry (`ghcr.io/<owner>/<repo>`)
3. Tags: `latest` + git SHA

> **This image is for deployed environments only** (e.g. Kubernetes, ECS, Docker Swarm). It is **not** meant for local development — see [Quick start](#quick-start).

---

## Docker (production deployment only)

The Dockerfile produces a production image. **Do not use it locally** — `localhost` URLs in `.env` won't resolve inside a container. For local development, run the API directly with `npm run start:dev`.

### Multi-stage Dockerfile

| Stage | Purpose |
|---|---|
| `deps` | Install all dependencies |
| `builder` | Compile TypeScript |
| `runner` | Production image with only production deps + compiled output |

### Running the image in a deployed environment

The container requires env vars pointing to **real** Postgres and Keycloak instances (not `localhost`):

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

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection URL (must be reachable from the container) |
| `KEYCLOAK_URL` | Keycloak base URL as seen by **both** the browser and the API container |
| `KEYCLOAK_HEALTH_URL` | Keycloak management health endpoint |
| `KEYCLOAK_CLIENT_SECRET` | Must match the secret configured in Keycloak |
| `KEYCLOAK_REDIRECT_URI` | Must match the public URL of your frontend callback |

> **Important:** `KEYCLOAK_URL` must be the same URL the browser uses to reach Keycloak, so the JWT `iss` claim matches between browser-issued tokens and server-side validation. In a deployed environment, this is typically a public domain like `https://auth.example.com`.

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
