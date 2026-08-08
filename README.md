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
  auth-web.md      Web SPA auth integration guide (BFF / session cookie)
  auth-web.vi.md   Vietnamese web auth guide
  auth-mobile.md   Expo / mobile deep-link auth guide
  auth-mobile.vi.md Vietnamese mobile auth guide
  users.md         User management & RBAC
.github/
  workflows/
    ci.yaml        PR/push: lint, build, test (with Postgres service)
    build.yaml     Push to main: build + publish Docker image to GHCR
    cd.yaml        Push version tag: build image + deploy to DigitalOcean droplet
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
  "sslRequired": "none",
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

| Service         | URL                                          |
| --------------- | -------------------------------------------- |
| Keycloak admin  | http://localhost:8080 (admin / admin)        |
| Keycloak health | http://localhost:9000/health/ready           |
| Postgres        | localhost:5432 (admin / admin / be-capstone) |

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

| Service      | URL                          |
| ------------ | ---------------------------- |
| API          | http://localhost:3000        |
| Swagger docs | http://localhost:3000/docs   |
| Health check | http://localhost:3000/health |

The API is now running at http://localhost:3000 with hot-reload.

---

## Environment variables

All env vars are centrally managed in `src/config/env.config.ts`. The app validates them at startup and logs any missing required keys.

| Variable                         | Required | Default                               | Description                                                               |
| -------------------------------- | -------- | ------------------------------------- | ------------------------------------------------------------------------- |
| `NODE_ENV`                       | No       | `development`                         | Runtime mode                                                              |
| `PORT`                           | No       | `3000`                                | API listen port                                                           |
| `DATABASE_URL`                   | **Yes**  | —                                     | Postgres connection URL                                                   |
| `KEYCLOAK_PUBLIC_URL`            | **Yes**  | —                                     | Keycloak URL reachable by the browser                                     |
| `KEYCLOAK_INTERNAL_URL`          | No       | `KEYCLOAK_PUBLIC_URL`                 | Keycloak URL for server-to-server calls                                   |
| `KEYCLOAK_HEALTH_URL`            | No       | derived (port 9000)                   | Keycloak management health endpoint                                       |
| `KEYCLOAK_REALM`                 | No       | `be-capstone`                         | Keycloak realm name                                                       |
| `KEYCLOAK_CLIENT_ID`             | No       | `be-capstone-api`                     | OIDC client ID                                                            |
| `KEYCLOAK_CLIENT_SECRET`         | No       | `be-capstone-secret`                  | OIDC client secret                                                        |
| `KEYCLOAK_REDIRECT_URI`          | No       | `http://localhost:3000/auth/callback` | OAuth callback URI registered in Keycloak                                 |
| `REDIS_URL`                      | No       | `redis://localhost:6379`              | Redis for sessions + mobile OAuth state/codes                             |
| `SESSION_SECRET`                 | **Yes**  | —                                     | Secret for signing the session cookie                                     |
| `FRONTEND_URL`                   | **Yes**  | —                                     | Web SPA origin (post-login redirect whitelist)                            |
| `CORS_ORIGIN`                    | No       | `FRONTEND_URL`                        | Allowed CORS origin                                                       |
| `MOBILE_REDIRECT_URIS`           | No       | `glowscan://auth/callback`            | Comma-separated whitelist of mobile deep-link redirect URIs               |
| `MOBILE_AUTH_CODE_TTL_SECONDS`   | No       | `120`                                 | TTL for one-time mobile auth codes in Redis                               |
| `MOBILE_OAUTH_STATE_TTL_SECONDS` | No       | `600`                                 | TTL for mobile OAuth state entries in Redis                               |
| `LLM_PROVIDER`                   | No       | `mock`                                | Routine + face-scan LLM: `mock` \| `ollama` \| `gemini` (openai reserved) |
| `OLLAMA_BASE_URL`                | No       | `http://host.docker.internal:11434`   | Ollama API base (Docker API → host Ollama)                                |
| `OLLAMA_MODEL`                   | No       | `gpt-oss:120b-cloud`                  | Ollama model tag for routine generation                                   |
| `OLLAMA_VISION_MODEL`            | No       | `mistral-large-3:675b-cloud`          | Ollama multimodal model for face-scan                                     |
| `OLLAMA_TIMEOUT_MS`              | No       | `120000`                              | Ollama / Gemini chat request timeout (ms)                                 |
| `GEMINI_API_KEY`                 | No       | —                                     | Google AI Studio key (required when `LLM_PROVIDER=gemini`)                |
| `GEMINI_MODEL`                   | No       | `gemini-2.5-flash-lite`               | Gemini model for routine generation and face-scan                         |

---

## Available scripts

| Command                      | Description                                  |
| ---------------------------- | -------------------------------------------- |
| `npm run start:dev`          | Start in watch mode (development)            |
| `npm run start:debug`        | Start in debug + watch mode                  |
| `npm run start:prod`         | Start compiled production build              |
| `npm run build`              | Compile TypeScript to `dist/`                |
| `npm run test`               | Run unit tests                               |
| `npm run test:e2e`           | Run end-to-end tests                         |
| `npm run test:cov`           | Run tests with coverage report               |
| `npm run lint`               | Lint and auto-fix with ESLint                |
| `npm run migration:run`      | Run pending TypeORM migrations (development) |
| `npm run migration:run:prod` | Run migrations from compiled `dist/`         |
| `npm run migration:revert`   | Revert the last migration                    |
| `npm run seed`               | Seed reference data (development)            |
| `npm run seed:prod`          | Seed reference data from compiled `dist/`    |
| `npm run format`             | Format code with Prettier                    |

---

## API endpoints

### Core

| Method | Path      | Description                        |
| ------ | --------- | ---------------------------------- |
| `GET`  | `/`       | Hello World                        |
| `GET`  | `/health` | Health check (API + DB + Keycloak) |
| `GET`  | `/docs`   | Swagger UI                         |

### Auth

| Method | Path                    | Description                                                           |
| ------ | ----------------------- | --------------------------------------------------------------------- |
| `POST` | `/auth/login`           | Start login (web session or mobile Redis state) → `{ login_uri }`     |
| `GET`  | `/auth/callback`        | OAuth callback (web: session cookie; mobile: one-time code deep link) |
| `GET`  | `/auth/status`          | Check if the current session is authenticated                         |
| `POST` | `/auth/logout`          | Destroy session and revoke tokens (web)                               |
| `POST` | `/auth/mobile/exchange` | Exchange one-time mobile code → tokens + user                         |
| `POST` | `/auth/mobile/refresh`  | Refresh Keycloak tokens for mobile                                    |
| `GET`  | `/users/me`             | Current user profile (session cookie **or** `Authorization: Bearer`)  |

> Web SPA: [docs/auth-web.md](docs/auth-web.md). Mobile / Expo: [docs/auth-mobile.md](docs/auth-mobile.md).

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

> **Existing devs:** If you already created `be-capstone-realm.json` before this change, add `"sslRequired": "none"` to the realm JSON, then recreate Keycloak: `docker compose up -d --force-recreate keycloak`. To re-import the realm from scratch, wipe the Postgres volume first (`docker compose down -v`).

### Troubleshooting: "HTTPS required" on macOS

**Symptom:** Opening `http://localhost:8080/admin` or the app login flow shows a `HTTPS required` page, most commonly on macOS with Docker Desktop.

**Cause:** Docker Desktop runs containers inside a Linux VM. Requests reaching Keycloak may not be recognized as coming from a local/private address, so Keycloak's default `sslRequired: EXTERNAL` policy blocks HTTP access.

**Fix (already applied in this repo):**

1. Keycloak ports in `docker-compose.yaml` are bound to `127.0.0.1` (not `0.0.0.0`).
2. The `be-capstone` realm template sets `"sslRequired": "none"` for local development.

After pulling these changes, recreate the Keycloak container so the new port binding takes effect:

```bash
docker compose up -d --force-recreate keycloak
```

If the admin console (`master` realm) still shows the error, the loopback port binding is the fix for that realm. The `sslRequired: none` setting only applies to `be-capstone`.

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

> **Note:** Keycloak is **not** running in CI. All Keycloak-related env vars (`KEYCLOAK_URL`, etc.) are set so the app config validation passes, but unit tests mock all Keycloak HTTP calls. The API runs directly on the GitHub Actions runner, not in a Docker container.

### Build & Publish (`.github/workflows/build.yaml`)

Runs on push to `main` only:

1. Builds the Docker image using the multi-stage `Dockerfile`
2. Pushes to GitHub Container Registry (`ghcr.io/<owner>/<repo>`)
3. Tags: `latest` + git SHA

> **This image is for deployed environments only** (e.g. Kubernetes, ECS, Docker Swarm). It is **not** meant for local development — see [Quick start](#quick-start).

### Deploy (`.github/workflows/cd.yaml`)

Runs **only when a semver tag (`v*.*.*`) is pushed** and the tagged commit is on `main`:

1. Verifies the tag commit is reachable from `main` (otherwise it aborts)
2. Builds the Docker image and pushes it to GHCR tagged with the version (`v1.2.3` → `1.2.3`, `1.2`, `latest`)
3. SSHes into the DigitalOcean droplet and rolls the stack with the new image

See [Production deployment](#production-deployment) for the droplet prerequisites and required secrets.

---

## Production deployment

Production is deployed to a **DigitalOcean droplet** by the [`cd.yaml`](.github/workflows/cd.yaml) pipeline. Pushing a version tag builds a versioned image, publishes it to GHCR, and remotely updates the running stack over SSH.

### Step 1 — Prepare the VPS deploy folder

The CD pipeline only pulls the image and restarts the stack — it does **not** copy any config. Before the first deploy, provision the deploy folder (the path you set in `DEPLOY_PATH`, e.g. `/opt/be-capstone`) with the files below. The `be-api`/`db-init` services run from the GHCR image, but every other service bind-mounts config from disk, so these files must exist.

```text
$DEPLOY_PATH/
├── docker-compose.yaml                     # the production compose stack
├── .env                                    # production environment variables
├── nginx/
│   └── nginx.conf                          # reverse-proxy config (ingress)
├── keycloak/
│   ├── realm-import/
│   │   └── be-capstone-realm.json          # realm + client + Google IDP
│   └── themes/
│       └── capstone/                       # custom login theme
```

| Path (relative to `$DEPLOY_PATH`)              | Required by service | Purpose                                                       |
| ---------------------------------------------- | ------------------- | ------------------------------------------------------------- |
| `docker-compose.yaml`                          | all                 | Production compose stack (copy of `docker-compose.prod.yaml`) |
| `.env`                                         | all                 | Env vars + `API_IMAGE=ghcr.io/<owner>/be-capstone:latest`     |
| `nginx/nginx.conf`                             | `nginx`             | Ingress reverse proxy (`/api`, `/auth`)                       |
| `keycloak/realm-import/be-capstone-realm.json` | `keycloak`          | Auto-imported realm, client, and Google IDP                   |
| `keycloak/themes/capstone/`                    | `keycloak`          | Custom login theme                                            |

> Rename `docker-compose.prod.yaml` to `docker-compose.yaml` on the droplet (or set `COMPOSE_FILE` in `.env`). The simplest way to provision everything is to clone the repo on the droplet, then copy these paths into `$DEPLOY_PATH` and create `.env` from your secrets.

### External database (required before first deploy)

Production does **not** bundle Postgres. Create the databases on your provider **before** `docker compose up`. Typical setup uses two databases on the same managed Postgres instance:

| Database      | Used by                          | `.env` variable      |
| ------------- | -------------------------------- | -------------------- |
| `be-capstone` | `be-api`, `db-init` (migrations) | `DATABASE_URL`       |
| `keycloak`    | `keycloak` service               | `KC_DB_URL_DATABASE` |

On DigitalOcean Managed Database (or any Postgres admin console), connect as the admin user and run:

```sql
CREATE DATABASE "be-capstone";
CREATE DATABASE keycloak;
```

> If you prefer a single database, set `KC_DB_URL_DATABASE=be-capstone` (same as `DATABASE_URL` database name). Separate databases are recommended so Keycloak and app migrations stay isolated.

Also ensure:

- The droplet IP is in the database **trusted sources** / firewall allowlist
- `DATABASE_URL` includes `?sslmode=require` if your provider requires TLS
- `KC_DB_URL_HOST`, `KC_DB_USERNAME`, and `KC_DB_PASSWORD` match credentials that can access both databases (or use separate users per DB)

### Step 2 — Required GitHub secrets

### Required GitHub secrets

Configure these under **Settings → Secrets and variables → Actions**:

| Secret             | Description                                       |
| ------------------ | ------------------------------------------------- |
| `DROPLET_HOST`     | Droplet IP or hostname                            |
| `DROPLET_USERNAME` | SSH user (e.g. `root` or a dedicated deploy user) |
| `DROPLET_SSH_KEY`  | Private SSH key authorized on the droplet         |
| `DROPLET_SSH_PORT` | SSH port (e.g. `22`)                              |
| `DEPLOY_PATH`      | Absolute path of the deploy folder on the droplet |

`GITHUB_TOKEN` is provided automatically and is used to authenticate the droplet's `docker login` to GHCR.

### Releasing a new version

From your local machine, create and push a semver tag on a commit that is on `main`:

```bash
git checkout main
git pull origin main
git tag v1.2.3
git push origin v1.2.3
```

The pipeline then automatically:

1. Builds and pushes `ghcr.io/<owner>/<repo>:1.2.3` (plus `1.2` and `latest`)
2. On the droplet, runs:
   ```bash
   cd "$DEPLOY_PATH"
   docker login ghcr.io ...
   docker compose pull
   docker compose up -d --remove-orphans
   docker image prune -f
   ```

### Migrations and seeding

The bundled `docker-compose.yaml` includes a `db-init` service that runs migrations and the seed before the API starts, so a routine `docker compose up -d` applies pending migrations automatically. If your droplet compose omits `db-init`, run migrations manually after deploy:

```bash
docker compose run --rm --no-deps be-api \
  node ./node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js
```

### Verify the deployment

```bash
curl -f http://<droplet-host>/health
docker compose ps
docker compose logs --tail=50 be-api
```

### Rollback

Re-tag a known-good commit (or move a release tag) and push it to re-trigger the pipeline, or on the droplet pin the previous image and restart:

```bash
cd "$DEPLOY_PATH"
# point the be-api image tag to the previous version, then:
docker compose pull
docker compose up -d --no-deps be-api
```

> Prefer forward-fixing migrations in a new release over reverting in production.

---

## Docker (production image)

The Dockerfile produces a production image. **Do not use it for local development** — `localhost` URLs in `.env` won't resolve inside a container. For local development, run the API directly with `npm run start:dev`.

### Multi-stage Dockerfile

| Stage     | Purpose                                                      |
| --------- | ------------------------------------------------------------ |
| `deps`    | Install all dependencies                                     |
| `builder` | Compile TypeScript                                           |
| `runner`  | Production image with only production deps + compiled output |

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

| Variable                 | Description                                                             |
| ------------------------ | ----------------------------------------------------------------------- |
| `DATABASE_URL`           | Postgres connection URL (must be reachable from the container)          |
| `KEYCLOAK_URL`           | Keycloak base URL as seen by **both** the browser and the API container |
| `KEYCLOAK_HEALTH_URL`    | Keycloak management health endpoint                                     |
| `KEYCLOAK_CLIENT_SECRET` | Must match the secret configured in Keycloak                            |
| `KEYCLOAK_REDIRECT_URI`  | Must match the public URL of your frontend callback                     |

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
- **[docs/auth-web.md](docs/auth-web.md)** — Web SPA BFF auth (session cookie, Google login)
- **[docs/auth-web.vi.md](docs/auth-web.vi.md)** — Vietnamese web auth guide
- **[docs/auth-mobile.md](docs/auth-mobile.md)** — Expo / mobile deep-link auth (one-time code, Bearer tokens)
- **[docs/auth-mobile.vi.md](docs/auth-mobile.vi.md)** — Vietnamese mobile auth guide
- **Swagger UI** — Available at `/docs` when the API is running
