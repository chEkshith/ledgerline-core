# LedgerLine Core Production Deployment Flow

**Target stack:** Vercel (React/Vite frontend) + Render (Express API) + Render PostgreSQL

**Status:** Deployment procedure prepared for review. Nothing in this guide has been deployed. Do not treat it as a production security sign-off until the Production Security Gates are resolved.

**Scope:** This guide changes no application or financial logic. It documents how to deploy the repository as it currently exists and calls out where the current code does not meet production requirements.

---

## 1. Project Deployment Overview

LedgerLine is a three-tier application:

```text
Browser
  |
  | HTTPS
  v
Vercel static site (React/Vite)
  |
  | HTTPS + Authorization: Bearer <JWT>
  v
Render Web Service (Express API)
  |
  | Private network connection
  v
Render PostgreSQL
```

Deployment order:

1. Create the production PostgreSQL database.
2. Run the Render-specific database compatibility preparation.
3. Apply database migrations.
4. Bootstrap the initial administrator and HMAC secret.
5. Deploy the Render API against the migrated database.
6. Deploy the Vercel frontend with the Render API URL.
7. Configure domains/CORS and perform end-to-end verification.

The application uses bearer-token authentication. It does **not** use cookie authentication. The frontend stores the JWT in `sessionStorage`.

### Source-of-truth warning

Several repository documents are stale. Use the source code and migrations when following this guide:

- `README.md` and `docs/ARCHITECTURE.md` contain outdated account-field names such as `name`, `type`, and `cached_balance_paise`. The actual schema uses `account_number`, `account_type`, `system_role_type`, `current_balance`, and related fields.
- `docs/API.md` references endpoints that do not exist, including `/api/auth/me` and `/api/users`. It also describes health responses inaccurately. Use the routes listed in this guide.
- `docs/DEPLOYMENT.md` describes generic infrastructure and is not the Vercel/Render procedure.
- Do not use historical demo/test credentials found in repository history or `.env.test`.

---

## 2. Verified Technology Stack

| Layer | Verified technology | Verified command/behavior |
|---|---|---|
| Frontend | React 18, Vite, Tailwind CSS v4 | Node.js 24.x; `npm run build`; output `dist/` |
| Frontend tests | Node test runner | `npm test` |
| Backend | Node.js 24.x, Express 4 | `npm start` -> `node src/server.js` |
| Backend tests | Node test runner | `npm test` -> `node --env-file=.env.test --test` |
| Database | PostgreSQL with `pgcrypto`, roles, RLS, PL/pgSQL procedures | Render PostgreSQL, recommended version 16 |
| CI | GitHub Actions | PostgreSQL 16 service; server/client tests + Vite build (`HEAD` `3c23bad` ran Node 20; working-tree Node 24 update is unpushed and has not run remotely) |
| Authentication | JWT bearer token | `Authorization: Bearer <token>` |
| Token persistence | Browser `sessionStorage` | Not `localStorage`; not an HttpOnly cookie |
| API health | `GET /api/health` | `200` when database is reachable; `503` when degraded |
| Request body limit | 10 KB | Enforced in `server/src/app.js` |
| CORS | Single exact `CLIENT_ORIGIN` | Wildcards and multiple origins are not supported |
| Backend port | Render-provided `PORT` | `server/src/server.js` listens on `env.PORT` |

Node 24 is the project baseline. Node 20 reached end of life on 30 April 2026 and must not be used for new production deployments. The verified local version is Node `24.22.1`; the server and client test suites and the Vite production build pass on that version locally. The local working tree declares `"engines": { "node": "24.x" }` in the root, server, and client package files and updates `.github/workflows/ci.yml` to Node 24, but those changes are uncommitted relative to `HEAD` (`3c23bad`), and CI has **not** run remotely for this newer, unpushed release.

At the time of this audit, Render defaulted new services to Node `24.22.1`, while Vercel defaulted to Node `26.x`, which is outside this project's baseline. Set the platform Node version explicitly to Node 24:

- Render: set `NODE_VERSION=24.22.1` on the service (or commit an equivalent Node version file), and redeploy.
- Vercel: select Node.js `24.x` in the project settings.

Render documentation: <https://render.com/docs/node-version>. Vercel documentation: <https://vercel.com/docs/functions/runtimes/node-js/node-js-versions>.

Use `npm ci`, not `npm install`, because both client and server have lockfiles.

---

## 3. Deployment Architecture

### Production components

```text
Vercel project
  Root directory: client
  Framework: Vite
  Build: npm run build
  Output: dist
  Public env: VITE_API_BASE_URL
        |
        v
Render Web Service
  Root directory: server
  Build: npm ci
  Start: npm start
  Health check: /api/health
  Private DB host
        |
        v
Render PostgreSQL
  Internal hostname for Render services in the same region
  External hostname only for administrative tools
```

### Network and security boundaries

- The browser never connects directly to PostgreSQL.
- The Render API is the only application component that connects to the database at runtime.
- The runtime database role is `ledgerline_app`, which has limited table and function privileges.
- `ledgerline_owner` owns database objects but cannot log in.
- The Render database default user is used for migrations and bootstrap only. It is not a runtime application credential.
- Vercel and Render terminate HTTPS for their public endpoints.
- The current authentication design requires the frontend origin to be allowed by CORS exactly.

### Repository state and release contents

At the time of this audit, `main` was at commit `3c23badd7569ec2e18d4ceffd8911f3785f21602`. The committed HEAD tree did **not** include `client/src/pages/Landing.jsx`, `client/src/components/landing/`, `client/src/components/ui/`, `client/src/components/AuthLayout.jsx`, `client/src/components/ThemeToggle.jsx`, or `client/vercel.json`. HEAD's `client/src/App.jsx` still routed `/` to the protected `Dashboard` page, and HEAD's CI workflow/package manifests did not yet include the local working tree's Node 24 updates (`engines` and `node-version: 24`). The local working tree contains those landing/UI files, a different `App.jsx` that implements the public landing page, and the Node 24 updates.

The current HEAD is therefore not the intended frontend release, and remote CI has **not** run for this newer, unpushed release. Before deploying from Vercel or Render, create a release commit that intentionally includes the landing page, UI components, updated `App.jsx`, Node 24 baseline settings, and `client/vercel.json`, then verify remote CI completes successfully for that exact commit. Review `git status`, `git diff`, and `git diff --cached`; exclude unrelated working-tree changes or include them deliberately. This guide does not create that commit and does not authorize committing or pushing on its own.

---

## 4. Prerequisites

### Accounts and access

- A Render account with permission to create paid PostgreSQL databases and paid services, and to run one-off jobs.
- A Vercel account connected to the repository.
- A GitHub repository containing the release commit.
- Optional: a custom domain and DNS access.
- A secure password manager or secrets store.

### Local tools

- Node.js 24.x for parity with CI. The verified version is `24.22.1`.
- npm.
- Git.
- Optional: `psql` for running the database preparation SQL through Render's external connection command.

### Decisions to make before creating resources

- Render region. Use the same region for the web service and database.
- Database plan. Use a paid production plan. Render Free databases expire after 30 days and do not support backups or point-in-time recovery, so they are not suitable for production.
- PostgreSQL version. Use version 16 for parity with CI unless a documented reason requires another supported version.
- Custom domains for the frontend and API.
- Who will own the production administrator account and the Render database credentials.

### 4.1 Render Free versus paid plan limitations

Do not use Render Free instances for this production deployment. Free instances are explicitly documented by Render as unsuitable for production. The capabilities required by this guide are only available on paid plans.

| Capability | Render Free | Render paid | Impact on this deployment |
|---|---|---|---|
| PostgreSQL lifetime | Expires 30 days after creation; deleted after a 14-day grace period | Persistent while the plan is active | A Free database cannot hold production data. |
| PostgreSQL storage | Fixed at 1 GB | Plan-dependent storage | The 1 GB limit is not a production capacity plan. |
| Concurrent free databases | One active Free database per workspace | Multiple databases subject to plan | A second Free database cannot be used as a production staging copy. |
| Backups and recovery | No backups of any kind; no point-in-time recovery | Managed backups and point-in-time recovery | Backups/PITR are required before the first production write. |
| One-off jobs | Not supported on Free web services | Supported on paid web/private services | The migration and bootstrap procedure in this guide requires one-off jobs. |
| Shell access | Not supported on Free web services | Supported on paid services | Optional, but the guide uses one-off jobs instead. |
| Web service availability | Spins down after 15 minutes without inbound traffic; approximately one minute to wake | Remains running according to plan and scaling settings | Free cold starts and restarts are unsuitable for a production API and health check. |
| Private networking | Cannot receive private network traffic; can send private requests | Private services and private network connections are supported | The API should use the database's internal hostname from the same region. |
| Persistent disk | Not supported | Available on paid services | Not required by LedgerLine, but Free filesystems are ephemeral. |
| Scaling | Single instance only | Plan-dependent | Production capacity and availability require a paid plan. |

Official references: <https://render.com/docs/free> and <https://render.com/docs/postgresql-backups>. Review <https://render.com/pricing> for current plan and pricing details; this guide deliberately does not hard-code prices.

### Pre-deployment safety

- Confirm the release commit and review the diff.
- Confirm no real secrets are committed.
- Back up any existing production data before migrations.
- Never point migration or bootstrap commands at a development or test database.
- Keep the Render database default credentials out of application runtime environment variables.

---

## 5. Production Security Gates

These are release gates, not optional hardening suggestions.

| Gate | Current finding | Required action before production |
|---|---|---|
| JWT/XSS exposure | JWT is stored in browser `sessionStorage` | **PRODUCTION BLOCKER.** Move authentication to a hardened HttpOnly cookie design with CSRF protection, or obtain a documented risk acceptance. Do not describe `sessionStorage` as production-safe. |
| Rate limiting | Neither Express application-level rate limiting nor verified edge/WAF protection on the API exists | **PRODUCTION BLOCKER.** Implement application-level rate limiting in Express, or place a verified edge/WAF/reverse-proxy directly in front of the public Render API hostname covering login, registration, and financial endpoints. A firewall protecting only the Vercel frontend does not protect direct calls to Render. |
| Health endpoint information disclosure | Public `GET /api/health` returns `database.error = error.message` when the database check fails | **PRODUCTION BLOCKER.** Remove raw database error messages and internal diagnostics from the public response, log the failure server-side, and expose only a safe status. Preserve the HTTP `200`/`503` contract used by Render. |
| HTTPS | Vercel and Render provide TLS | Verify HTTPS on both custom domains; do not disable TLS. |
| CORS | Exact single-origin configuration; credentials enabled, but cookies are not used | Set `CLIENT_ORIGIN` to the exact production frontend origin. CORS is browser-enforced response-access control (not server authentication or request blocking). Vercel preview URLs will lack browser CORS access unless handled explicitly. |
| Authentication | Bearer JWT; server-side authorization middleware | Verify protected routes and admin-only routes after deployment. |
| Database privileges | Runtime role `ledgerline_app`; owner role is non-login | Never use `ledgerline_owner` or the Render default user as the runtime `DB_USER`. |
| Row-Level Security | Migrations enable and force RLS on domain tables | Verify policies and forced RLS after migration; do not disable RLS to "fix" an authorization problem. |
| Admin bootstrap | `bootstrap.js` upserts the initial admin and active HMAC secret | Run once, protect the initial password, then remove bootstrap-only secrets from runtime services. Re-running can reset the administrator password and HMAC secret. |
| Secrets | HMAC, JWT, database, and admin secrets are environment-driven | Generate unique production values; store them only in Render/Vercel secret settings; never commit them. |
| Request limits | JSON and URL-encoded bodies are limited to 10 KB | Keep the limit; do not raise it without review. |
| Error handling | Production errors are sanitized | Confirm stack traces and secrets do not appear in logs or API responses. |
| Backups | Render paid plans provide point-in-time recovery | Enable/verify backups before the first production write. Do not rely on the free plan for production recovery. |
| Dependency review | Dependencies are lockfile-pinned, but the audit is not clean | See section 5.1. Run production and full audits at the release commit; do not claim zero vulnerabilities from a production-only audit. Upgrade or document the Vite/esbuild advisory before release approval. |

The deployment is **not production-ready** and production is **not approved** while any of these unresolved blockers or readiness gaps remain:

- JWT stored in `sessionStorage`, leaving XSS token-theft exposure.
- Rate limiting is neither implemented in Express nor verified at an edge/WAF/reverse proxy in front of the public Render API hostname (covering login, registration, and financial endpoints); a Vercel frontend firewall alone does not protect direct Render API calls.
- Public `GET /api/health` exposes `database.error = error.message` and internal diagnostics on database failure.
- Render PostgreSQL 16 preflight has not been verified on an actual Render-managed PostgreSQL 16 instance (only local PostgreSQL 18.6 compatibility was tested).
- Committed `HEAD` (`3c23bad`) does not contain the intended landing page and UI release files.
- The Vercel SPA rewrite file (`client/vercel.json`) is absent from audited `HEAD`.
- Client Vite/esbuild dependency advisories require an upgrade or documented risk acceptance.
- Remote GitHub Actions CI has not run for the newer, unpushed working-tree release.

### 5.1 Dependency audit evidence

Audit snapshot taken on 10 November 2026 with Node `24.22.1` and npm `12.2.1` from the `server/` and `client/` lockfiles:

| Workspace | Command | Informational | Low | Moderate | High | Critical | Total |
|---|---|---:|---:|---:|---:|---:|---:|
| Server | `npm audit` | 0 | 0 | 2 | 0 | 0 | 2 |
| Server | `npm audit --omit=dev` | 0 | 0 | 0 | 0 | 0 | 0 |
| Client | `npm audit` | 0 | 0 | 1 | 1 | 0 | 2 |
| Client | `npm audit --omit=dev` | 0 | 0 | 1 | 1 | 0 | 2 |

Findings at that snapshot:

- The server's two moderate findings are dev-only (`nodemon` via `minimatch`). The server's production dependency closure reported no advisories.
- The client reports one high and one moderate finding in the Vite/esbuild build tooling. `vite@5.4.21` is pulled both directly and through `@tailwindcss/vite@4.3.5`, so it remains in the `--omit=dev` view. The available fix is a major upgrade to `vite@8.3.7`.
- These are build/dev-server advisories, not a claim that the deployed static bundle has the same exposure. They still require release review.

Do not describe the dependency tree as clean or as having "zero vulnerabilities." A clean `--omit=dev` result for the server does not make the client tree clean, and a production-only audit does not cover development tooling. Re-run both commands for `server/` and `client/` at the exact release commit, retain the JSON output as evidence, and record the disposition of every advisory.

---

## 6. PostgreSQL Setup

### 6.1 Create the Render PostgreSQL instance

In the Render Dashboard:

1. Choose **New -> Postgres**.
2. Set a clear name, for example `ledgerline-prod-db`.
3. Set the database name and user, or accept Render-generated values and record them securely.
4. Choose the same region that the Render web service will use.
5. Choose PostgreSQL 16 for parity with CI.
6. Choose the production compute plan and storage.
7. Enable storage autoscaling only after reviewing cost implications.
8. Create the database and wait until it is available.

Record these values securely:

- Internal host
- External host
- Port (`5432`)
- Database name
- Default database user
- Default database password

The Render web service must use the **internal** host. The external host is for administrative tools only.

External Render PostgreSQL connections are encrypted and reject unencrypted clients. The current Node database clients and migration scripts do not configure SSL options. Therefore:

- Run production migrations from inside Render (Render Shell or a one-off Render Job) using the internal host.
- Do not disable TLS or change the application to accept insecure external connections merely to make local migrations work.
- If you use `psql` from a local machine for preparation SQL, use Render's provided PSQL command or a URL containing `sslmode=require`.

### 6.2 Render database compatibility preparation

Render-managed PostgreSQL default user attributes (`rolsuper`, `rolcreaterole`, `rolcreatedb`, and `rolbypassrls`) are **unverified** on an actual Render PostgreSQL 16 instance by this audit and must be inspected before creating roles or running migrations.

The migration suite transfers table, function, and other object ownership to `ledgerline_owner`, then continues creating foreign keys and dependent objects. Under a non-superuser migration administrator, the administrator needs membership in `ledgerline_owner` with both `SET` and `INHERIT` enabled: `SET` is required by `ALTER ... OWNER TO`, and `INHERIT` is required for subsequent owner-level DDL.

First, connect to the target database as the Render database default user and inspect `current_user`:

```sql
SELECT
    rolname AS current_admin_role,
    rolsuper,
    rolcreaterole,
    rolcreatedb,
    rolcanlogin,
    rolbypassrls
FROM pg_roles
WHERE rolname = current_user;
```

Inspect the actual result **before** executing the role-preparation SQL below:

- If `rolsuper = false` **and** `rolcreaterole = false`, **stop immediately** and obtain an approved administrative procedure. Do not work around missing role-creation privileges by bypassing security controls or running the API as an elevated role.
- When a **non-superuser with `CREATEROLE`** creates a role in PostgreSQL 16, PostgreSQL automatically grants the creating administrator `ADMIN OPTION` with `SET FALSE` and `INHERIT FALSE` (`ADMIN TRUE, SET FALSE, INHERIT FALSE`): <https://www.postgresql.org/docs/16/role-attributes.html>. That `ADMIN OPTION` is what `bootstrap.js` needs for `ALTER ROLE ledgerline_app WITH PASSWORD`.
- Do **not** assume that same `pg_auth_members` membership row if the role is created by a PostgreSQL **superuser** (`rolsuper = true`), because superusers already hold privilege to `ALTER ROLE` and transfer ownership without relying on `pg_auth_members` entries.
- Do **not** grant `ledgerline_app` to the administrator with `SET` or `INHERIT`.

Once `rolsuper = true` or `rolcreaterole = true` is confirmed, run this role-preparation SQL as the Render database default user connected to the target database:

```sql
-- Run as the Render database default user, connected to the target database,
-- after confirming rolsuper = true or rolcreaterole = true above.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledgerline_owner') THEN
        CREATE ROLE ledgerline_owner WITH
            NOLOGIN
            NOSUPERUSER
            NOINHERIT
            NOCREATEDB
            NOCREATEROLE
            NOREPLICATION;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledgerline_app') THEN
        CREATE ROLE ledgerline_app WITH
            LOGIN
            NOSUPERUSER
            NOINHERIT
            NOCREATEDB
            NOCREATEROLE
            NOREPLICATION;
    END IF;
END $$;

-- Required for non-superuser migration administration (harmless if already superuser):
-- SET for ALTER ... OWNER TO, INHERIT for later owner-level DDL.
GRANT ledgerline_owner TO CURRENT_USER WITH SET TRUE, INHERIT TRUE;

-- Do not grant ledgerline_app with SET or INHERIT. Under non-superuser CREATEROLE
-- provisioning in PostgreSQL 16+, creating ledgerline_app automatically grants
-- ADMIN OPTION (ADMIN TRUE, SET FALSE, INHERIT FALSE) to the creating role.
```

Verify the LedgerLine role attributes and the administrator's membership options:

```sql
SELECT
    r.rolname,
    r.rolsuper,
    r.rolcreaterole,
    r.rolcreatedb,
    r.rolcanlogin,
    r.rolinherit,
    r.rolreplication,
    r.rolbypassrls,
    COALESCE(bool_or(m.admin_option), false) AS admin_option,
    COALESCE(bool_or(m.inherit_option), false) AS inherit_option,
    COALESCE(bool_or(m.set_option), false) AS set_option
FROM pg_roles r
LEFT JOIN pg_auth_members m
       ON m.roleid = r.oid
      AND m.member = (SELECT oid FROM pg_roles WHERE rolname = current_user)
WHERE r.rolname IN ('ledgerline_owner', 'ledgerline_app')
GROUP BY r.rolname, r.rolsuper, r.rolcreaterole, r.rolcreatedb,
         r.rolcanlogin, r.rolinherit, r.rolreplication, r.rolbypassrls
ORDER BY r.rolname;
```

Expected result for the two LedgerLine application roles (the Render database default administrator remains a separate privileged login role and must never be used by the application at runtime):

- Both `ledgerline_owner` and `ledgerline_app`: `rolsuper = false`, `rolbypassrls = false`, `rolcreatedb = false`, `rolcreaterole = false`, `rolreplication = false`.
- `ledgerline_owner`: `rolcanlogin = false` (`NOLOGIN`), `set_option = true`, `inherit_option = true` (required for a non-superuser migration administrator).
- `ledgerline_app`: `rolcanlogin = true`, `set_option = false`, `inherit_option = false`. Conditional `admin_option`: when created on a clean database by a non-superuser `CREATEROLE` administrator (or explicitly granted to a designated non-superuser bootstrap administrator), `admin_option = true` is expected so `bootstrap.js` can run `ALTER ROLE ledgerline_app WITH PASSWORD`; if inspected under a superuser (`rolsuper = true`), superuser privilege already permits `ALTER ROLE` even if `admin_option` is `false`.

Local compatibility evidence (not Render PostgreSQL 16 verification): this preflight and the full migration/bootstrap sequence were validated on a clean local **PostgreSQL 18.6** cluster using a non-superuser administrator with `CREATEROLE` and `rolsuper = false`. The validated grant was only `ledgerline_owner ... WITH SET TRUE, INHERIT TRUE`; no explicit `ledgerline_app` grant was used. The test applied all nine migrations and the structural seed, ran bootstrap, passed `verify_install.js`, and confirmed that `ledgerline_app` cannot create a table in `public`.

Two negative tests on that local PostgreSQL 18.6 cluster confirmed why both owner options are required under non-superuser `CREATEROLE` administration:

- `ledgerline_owner` with `INHERIT TRUE` but `SET FALSE` failed at migration `002` with `must be able to SET ROLE "ledgerline_owner"`.
- `ledgerline_owner` with `SET TRUE` but `INHERIT FALSE` failed at migration `002` with `permission denied for table accounts`.

Repeat the preflight and verification queries on the actual Render PostgreSQL 16 database before treating this step as complete. If bootstrap runs under a different non-superuser administrator, or the roles already exist under another owner, that administrator must hold `ADMIN OPTION` on `ledgerline_app`; grant `ledgerline_app ... WITH ADMIN TRUE, SET FALSE, INHERIT FALSE` rather than broad membership.

If the grants fail, stop. The roles may already have been created by a different administrator, or the current user may not have admin rights on them. Do not work around this by using a superuser at runtime or by disabling security checks. Use a fresh database or an approved migration-administration procedure.

### 6.3 Database role model

| Role | Login | Purpose |
|---|---|---|
| Render database default user | Yes | Create database, run migrations/bootstrap, administer the instance. Not for application runtime. |
| `ledgerline_owner` | No | Non-login owner of database objects and `SECURITY DEFINER` functions (`rolbypassrls = false`); internal table access under `FORCE RLS` uses explicit `TO ledgerline_owner` owner policies, not the `BYPASSRLS` role attribute. |
| `ledgerline_app` | Yes | Runtime API role with limited table and function privileges (`rolbypassrls = false`). |

`ledgerline_owner` is configured with `rolbypassrls = false` and does **not** hold PostgreSQL's `BYPASSRLS` role attribute. Because migrations enable and force Row-Level Security (`FORCE ROW LEVEL SECURITY`) on the seven public domain tables, `ledgerline_owner`-owned `SECURITY DEFINER` functions access those tables through the explicit owner policies (`p_owner_bypass_*` scoped `TO ledgerline_owner` in migration `003_rls_helpers_and_policies.sql`) and the `SECURITY DEFINER` execution model, rather than through `BYPASSRLS`.

The migrations also install `pgcrypto` in the `ledger_secure` schema, install security-definer procedures, and grant only the required runtime privileges. Do not simplify these steps.

### 6.4 Backup and recovery

- Enable point-in-time recovery/backups on a paid production plan.
- Record the current recovery window.
- Take a backup before migration and before bootstrap.
- Do not delete the Render database to "start over" without first confirming that no production data exists.

---

## 7. Environment Variables and Secret Generation

### 7.1 Backend runtime variables

Set these on the Render web service. Do not include migration/bootstrap-only values.

| Variable | Value/example | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Enables production validation and error handling. |
| `PORT` | Render-managed | Do not hard-code; Render supplies it. |
| `HOST` | Optional | Present in config; `server.js` listens on `PORT`, so do not rely on `HOST` for binding. |
| `DB_HOST` | Render internal hostname | Same-region private connection. |
| `DB_PORT` | `5432` | Render default PostgreSQL port. |
| `DB_NAME` | Render database name | Copy from the database dashboard. |
| `DB_USER` | `ledgerline_app` | Runtime role only. |
| `DB_PASSWORD` | Generated application password | Set during bootstrap and stored in Render secrets; changing this env var alone does not rotate the PostgreSQL role password (see section 14.6). |
| `DB_POOL_MAX` | `10`-`20` | Start conservatively; stay below database connection limits. |
| `DB_IDLE_TIMEOUT_MS` | `30000` | Pool idle timeout. |
| `DB_CONNECTION_TIMEOUT_MS` | `2000`-`5000` | Pool connection timeout. |
| `CLIENT_ORIGIN` | Exact Vercel origin, e.g. `https://ledgerline.vercel.app` | Scheme + host only; no trailing slash; no wildcard. |
| `IDENTITY_HMAC_SECRET` | 64 hex characters | Generate 32 random bytes and hex-encode; must match active secret in `ledger_secure.auth_secrets`. |
| `JWT_SECRET` | At least 32 characters | Generate a high-entropy secret. |
| `HMAC_KEY_VERSION` | `1` | Increment only with a synchronized HMAC rotation (see section 14.6 controlled fallback). |

Do **not** set `DATABASE_URL`. The application does not read it. `HOST` is parsed but is not used by the current listener; Render routes to the port supplied in `PORT`.

### 7.2 Temporary migration base variables

Set these on the temporary paid migration base service described in section 10, not on the long-running web service. The one-off jobs inherit this environment snapshot from the base service.

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DB_HOST` | Render internal host |
| `DB_PORT` | `5432` |
| `DB_NAME` | Render database name |
| `DB_USER` | `ledgerline_app` |
| `DB_PASSWORD` | Application-role password to provision |
| `ADMIN_DB_USER` | Render database default user |
| `ADMIN_DB_PASSWORD` | Render database default password |
| `IDENTITY_HMAC_SECRET` | Production HMAC secret |
| `JWT_SECRET` | Production JWT secret |
| `HMAC_KEY_VERSION` | `1` |
| `INITIAL_ADMIN_EMAIL` | Production administrator email |
| `INITIAL_ADMIN_PASSWORD` | At least 12 characters; generated and stored securely |
| `CLIENT_ORIGIN` | Production Vercel origin |

The temporary base service needs the runtime values as well because `env.js` validates `IDENTITY_HMAC_SECRET`, `JWT_SECRET`, and, in production, `DB_PASSWORD` before any script runs. It also needs `ADMIN_DB_*` for migrations/bootstrap and `INITIAL_ADMIN_*` for bootstrap.

After the migration, bootstrap, and verification jobs succeed, delete the temporary migration base service. Never add `ADMIN_DB_*` or `INITIAL_ADMIN_*` to the long-running production API. Retain the bootstrap record in a secure secret store. `DB_PASSWORD` is the one migration-derived value that must also be set on the runtime API because it is the `ledgerline_app` login password.

### 7.3 Frontend variables

| Variable | Value | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | `https://your-render-api.onrender.com` | Scheme + host only, no trailing slash. The client appends `/api/...`. |

`VITE_API_BASE_URL` is embedded into the built JavaScript. It is public and changes require a new Vercel build. Do not place any database, JWT, or HMAC secret in a `VITE_` variable.

### 7.4 Platform-provided build and runtime settings

These are platform settings, not values read by `server/src/config/env.js`.

| Platform | Setting | Value | Notes |
|---|---|---|---|
| Render | `NODE_VERSION` | `24.22.1` | Pins the verified Node 24 runtime. Redeploy after changing. Alternatively commit an equivalent Node version file supported by Render. |
| Render | `PORT` | Render-managed | Do not hard-code or override. |
| Vercel | Node.js version | `24.x` | Select explicitly because Vercel's default major version is newer than 24. |
| Vercel | `VITE_API_BASE_URL` | Public API URL | Build-time value from section 7.3. |

Do not treat `NODE_VERSION` as an application secret or as a substitute for the `engines.node` declaration.

### 7.5 Secret generation commands

Run these locally; do not paste output into source files.

```bash
# 64 hex characters = 32 random bytes
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# JWT secret, at least 32 characters
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# Password suggestion
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Use a password manager/secrets store. Never use `.env.test` values, repository examples, or historical demo credentials in production.

---

## 8. Backend Deployment on Render

### 8.1 Create the web service

In Render:

1. Choose **New -> Web Service**.
2. Connect the GitHub repository and select the release branch/commit.
3. Set **Root Directory** to `server`.
4. Set **Runtime** to Node.
5. Set **Build Command** to `npm ci`.
6. Set **Start Command** to `npm start`.
7. Set **Health Check Path** to `/api/health`.
8. Select the same region as the database.
9. Set `NODE_VERSION=24.22.1`.
10. Add the runtime environment variables from section 7.1.
11. Deploy.

Do not set the Render database default credentials as the web service's database credentials. The runtime user must be `ledgerline_app`.

### 8.2 Why the first deploy may be unhealthy

The API can start before the database has been migrated, but `/api/health` will return `503` and report `DEGRADED` while the database check fails. Deploy the web service after the migration/bootstrap jobs have completed, or expect a temporary unhealthy state.

### 8.3 Verify startup logs

Confirm:

- Node version is 24.x (verified `24.22.1`), not an older or unexpected major version.
- The process starts with `node src/server.js`.
- The configured port is used.
- The CORS origin is the production frontend origin.
- Database connection verification succeeds.
- No passwords, JWTs, HMAC values, or database URLs are printed.

The root route advertises `/docs`, but the application does not implement a docs route. Do not use that as a health check.

### 8.4 Health endpoint behavior

`GET /api/health` is public and unauthenticated. It returns:

- `200` with `status: "UP"` and `database.status: "CONNECTED"` when the database query succeeds.
- `503` with `status: "DEGRADED"` and `database.status: "DISCONNECTED"` when the database query fails.

Current source finding: on failure, `server/src/services/health.service.js` sets `database.error = error.message`. Because the endpoint is public, this can disclose internal database diagnostics such as hostnames, driver errors, connection details, or schema information. The response also exposes the driver name, latency, server time, service version, and uptime.

**Required before production:** remove `database.error` and other unnecessary internal diagnostics from the public response; log the underlying error server-side with request/context metadata; keep the `200`/`503` contract so Render health checks continue to work. The endpoint can still report `UP`/`DEGRADED` and database `CONNECTED`/`DISCONNECTED`. Do not solve this by making the health endpoint depend on a secret or by disabling Render health checks.

---

## 9. Frontend Deployment on Vercel

### 9.1 Create the Vercel project

1. Import the GitHub repository.
2. Set **Root Directory** to `client`.
3. Select the **Vite** framework preset.
4. Set the install command to `npm ci`.
5. Set the build command to `npm run build`.
6. Set the output directory to `dist`.
7. Select Node.js `24.x` explicitly; Vercel's current default major version is newer than the project baseline.
8. Add the production environment variable `VITE_API_BASE_URL` from section 7.3.
9. Deploy.

### 9.2 SPA fallback

The frontend uses `BrowserRouter` with these routes:

| Route | Access | Current behavior |
|---|---|---|
| `/` | Public | Shows the landing page when unauthenticated. Authenticated users are redirected to `/dashboard`. |
| `/login` | Public | Login page. Authenticated users are not automatically redirected away from this page. |
| `/register` | Public | Registration page. Authenticated users are not automatically redirected away from this page. |
| `/dashboard` | Protected | Requires authentication; unauthenticated users are redirected to `/login`. |
| `/accounts` | Protected | Requires authentication. |
| `/accounts/:id` | Protected | Requires authentication; account access is also enforced by the API. |
| `/operations` | Protected | Requires authentication. |
| `/transactions/:id` | Protected | Requires authentication; transaction access is also enforced by the API. |
| `/health` | Protected | Frontend system-health page. This is separate from the public API health endpoint. |
| `/admin` | Protected, admin-only | Requires an authenticated user with the `admin` role; other authenticated roles see the access-restricted view. |
| `*` | Fallback | Redirects to `/`. |

The navigation shell is hidden on `/`, `/login`, and `/register`. Logout clears the stored authentication state and navigates to `/`.

Direct navigation to these routes requires a rewrite to `index.html`. No `vercel.json` is present in the repository. Add one at the Vercel project root (which is `client/` when Root Directory is `client`):

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

If the Vercel project uses the repository root instead of `client/`, place the equivalent file at the repository root and adjust the project settings consistently.

This rewrite is only for the static SPA. API requests go directly to the Render URL configured in `VITE_API_BASE_URL`.

### 9.3 Environment-variable behavior

- Vercel bakes `VITE_API_BASE_URL` into the build.
- Changing the variable does not update an existing deployment; redeploy.
- The value must not have a trailing slash.
- Do not put database credentials, JWT secrets, or HMAC secrets in Vercel frontend variables. Anything prefixed with `VITE_` is public.
- Vercel preview deployments will use the same configured API base unless overridden, but their origins will not match the production `CLIENT_ORIGIN`. Expect CORS failures from preview URLs under the current single-origin backend configuration.

### 9.4 HTTPS and domains

Use Vercel's automatic HTTPS. After adding a custom domain, update `CLIENT_ORIGIN` on Render to the exact final frontend origin and redeploy/restart the API. Then rebuild Vercel if `VITE_API_BASE_URL` changes.

---

## 10. Database Migration and Bootstrap

### 10.1 Execution model

Run migrations and bootstrap from inside Render, against the database's internal hostname. The current `pg` clients in `db.js`, `migrate.js`, and `bootstrap.js` do not configure TLS, and Render rejects unencrypted external database connections.

Use a **dedicated paid migration base service** and Render one-off jobs. This is required because:

- Render Free web services cannot run one-off jobs.
- A one-off job uses the base service's most recent successful build artifact and a snapshot of all of its configured environment variables at job creation.
- A one-off job can execute any script defined by that base service.
- A one-off job cannot access the base service's persistent disk.
- A one-off job terminates when its start command exits.
- The job uses the base service's compute plan by default and is billed at that plan's per-second rate.

A one-off job does **not** provide an independent repository root, build command, or environment list. Changing the base service's environment later does not change an already-created job's snapshot; create a new job from the updated base service instead.

You may optionally pass a supported `planId` when creating a job to use a different compute plan from the base. If omitted, the job uses the base service's plan. Either way, the base service must be a paid plan; a specific job compute plan is not required.

Official reference: <https://render.com/docs/one-off-jobs>.

Deployment sequence:

1. Render PostgreSQL is available.
2. Run the role preflight from section 6.2.
3. Create the dedicated paid migration base service.
4. Run the migration one-off job.
5. Run the bootstrap one-off job exactly once.
6. Verify the installation.
7. Delete the migration base service and its privileged environment.
8. Deploy the normal Render API with runtime-only environment variables.
9. Deploy the Vercel frontend.

### 10.2 Run the role preflight

Before creating the migration base service, connect as the Render database default user with `psql` through Render's external connection command, or from another approved administrative environment. Use a URL or connection command that includes `sslmode=require`.

Run the SQL from section 6.2 and the verification query. Do not continue if the roles are not created or the grants fail. This is the only step that uses an external database connection; migrations and bootstrap run inside Render.

### 10.3 Create the dedicated migration base service

Create a temporary private service rather than using the production API as the migration base:

1. In Render, choose **New -> Private Service**.
2. Connect the release repository and branch/commit.
3. Set **Root Directory** to `server`.
4. Set **Runtime** to Node.
5. Set **Build Command** to `npm ci`.
6. Set **Start Command** to `npm start`.
7. Select the same region as the database.
8. Choose a paid compute plan.
9. Set `NODE_VERSION=24.22.1`.
10. Add every variable from section 7.2, including the runtime database settings required by `env.js`.
11. Do not add a custom domain.
12. Do not configure a health check for this temporary service. The API may return `503` until migrations and bootstrap are complete; the one-off jobs only require a successful build.
13. Deploy and wait for a successful build. Record the service ID (normally starts with `srv-`).

This private service is the job base. It is never the public API. It holds the migration administrator credentials temporarily so they do not need to be placed on the long-running production API.

The service starts with `npm start`, so it may log a database connection warning before `ledgerline_app` has a password or before migrations exist. That is expected for the temporary base. Do not expose it publicly and do not treat its pre-migration health state as a deployment failure.

### 10.4 Run the migration one-off job

Create the job from the migration base service's **One-off Jobs** page, or with the Render API:

```bash
curl --request POST 'https://api.render.com/v1/services/YOUR_SERVICE_ID/jobs' --header 'Authorization: Bearer YOUR_RENDER_API_KEY' --header 'Content-Type: application/json' --data-raw '{"startCommand": "node scripts/migrate.js"}'
```

Because the base service's root directory is `server`, the start command is `node scripts/migrate.js`. If the job log shows that the command started at the repository root instead, use `cd server && node scripts/migrate.js`. Confirm the working directory from the logs rather than changing paths speculatively.

Run migration and bootstrap as **separate** one-off jobs. Do not combine them with `&&`:

- Migration and bootstrap have different failure semantics.
- Bootstrap must be deliberately run exactly once.
- A failed bootstrap must be investigated before it is retried.

Wait until the migration job status is `succeeded` and inspect its logs. Do not continue if it failed or if the status is unknown.

### 10.5 Run the bootstrap one-off job exactly once

Create a second one-off job from the same migration base service:

```bash
curl --request POST 'https://api.render.com/v1/services/YOUR_SERVICE_ID/jobs' --header 'Authorization: Bearer YOUR_RENDER_API_KEY' --header 'Content-Type: application/json' --data-raw '{"startCommand": "node scripts/bootstrap.js"}'
```

The job inherits the base service's environment snapshot, including `ADMIN_DB_*`, `DB_PASSWORD`, `INITIAL_ADMIN_*`, `IDENTITY_HMAC_SECRET`, and `JWT_SECRET`. Apply the same working-directory rule described for the migration job to bootstrap and verification jobs.

`bootstrap.js` can reset the initial administrator password and HMAC secret if it is rerun. Run it exactly once. If the job result is unclear, inspect the database and logs before retrying; do not repeatedly resubmit it.

### 10.6 What the migration command does

`server/scripts/migrate.js`:

- Connects with `ADMIN_DB_USER` and `ADMIN_DB_PASSWORD`.
- Uses `DB_HOST`, `DB_PORT`, and `DB_NAME`.
- Takes an advisory lock with ID `987654321`.
- Tracks applied files in `public._schema_migrations` (`version`, `applied_at`).
- Applies migrations `001` through `009` in filename order.
- Then runs every SQL file in `database/seed/`.

The production seed file is `database/seed/001_initial_seed.sql`. It inserts the zero-balance `SYSTEM_CASH_VAULT` account (`id = '00000000-0000-0000-0000-000000000001'`, `account_number = 'SYS-VAULT-000000000001'`, `account_type = 'system'`, `system_role_type = 'SYSTEM_CASH_VAULT'`, `currency = 'INR'`, `status = 'active'`, `current_balance = 0`) using `ON CONFLICT (account_number) DO NOTHING`. It is structural seed data, not a demo customer seed. The migration runner executes it unconditionally on every migration run, so confirm the seed remains idempotent before future releases.

Do not add development/demo users, demo balances, or test credentials to production seed data.

### 10.7 What bootstrap does

`server/scripts/bootstrap.js`:

- Connects with the migration administrator credentials.
- Sets the `ledgerline_app` database password when `DB_PASSWORD` is provided.
- Upserts the active HMAC secret in `ledger_secure.auth_secrets`.
- Deactivates other HMAC key versions.
- Upserts the initial administrator user into `public.users` (`id = '00000000-0000-0000-0000-000000000002'`, normalized lowercase email, `role = 'admin'`, `is_active = true`).

Bootstrap is not idempotent in the sense of preserving prior administrator changes. Re-running it can:

- Reset the `ledgerline_app` database password whenever `DB_PASSWORD` is provided.
- Overwrite/reset the initial administrator user's email, password, `role = 'admin'`, and `is_active = true` (`id = '00000000-0000-0000-0000-000000000002'`).
- Reactivate the configured `HMAC_KEY_VERSION` secret in `ledger_secure.auth_secrets` and deactivate all other active key versions.

Run it deliberately once during initial provisioning. Do not leave `ADMIN_DB_*` or `INITIAL_ADMIN_*` on the long-running web service, and do not casually re-run `bootstrap.js`; see section 14.6 if HMAC rotation is ever required.

### 10.8 Verify the installation

Run a third one-off job from the migration base service:

```bash
curl --request POST 'https://api.render.com/v1/services/YOUR_SERVICE_ID/jobs' --header 'Authorization: Bearer YOUR_RENDER_API_KEY' --header 'Content-Type: application/json' --data-raw '{"startCommand": "node scripts/verify_install.js"}'
```

Wait for `succeeded` and inspect the log for the installation/security catalog audit success message. The script uses the administrative connection and checks forced RLS and hardened security-definer functions.

Run these queries as the Render database default user or another authorized administrator:

```sql
SELECT version, applied_at
FROM public._schema_migrations
ORDER BY version;
```

Expect nine migration rows (`001_schemas_roles_extensions.sql` through `009_harden_search_paths_and_schema_privileges.sql`).

```sql
SELECT id, account_number, account_type, system_role_type, currency, status, current_balance
FROM public.accounts
WHERE account_type = 'system'
  AND system_role_type = 'SYSTEM_CASH_VAULT';
```

Expect one zero-balance system vault account (`account_number = 'SYS-VAULT-000000000001'`, `current_balance = 0`) immediately after initial structural seeding and before any posted financial transactions.

```sql
SELECT id, email, role, is_active
FROM public.users
WHERE role = 'admin';
```

Expect only the intended production administrator (`public.users` defines `role` and `is_active`, rather than `system_role` or `status`).

```sql
SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin, rolbypassrls, rolreplication
FROM pg_roles
WHERE rolname IN ('ledgerline_owner', 'ledgerline_app')
ORDER BY rolname;
```

Confirm that among the two LedgerLine application roles, `ledgerline_app` is the login role (`rolcanlogin = true`) and `ledgerline_owner` must be `NOLOGIN` (`rolcanlogin = false`). Both LedgerLine application roles must have `rolsuper = false`, `rolbypassrls = false`, `rolcreatedb = false`, `rolcreaterole = false`, and `rolreplication = false`. The Render database default administrator remains a separate privileged login in the database and must not be used by the application at runtime.

### 10.9 Delete the migration base and deploy the API

After the migration, bootstrap, and verification jobs have succeeded:

1. Delete the temporary migration base service. This removes its admin credentials, bootstrap secrets, and service configuration.
2. Create or deploy the production Render web service from section 8 with only the runtime variables from section 7.1.
3. Confirm the runtime service does not contain `ADMIN_DB_*`, `INITIAL_ADMIN_*`, or any migration-only credential.
4. Deploy the frontend after the API is healthy.

### 10.10 Runtime connection check

The application must connect as `ledgerline_app`, not as the Render default user and not as `ledgerline_owner`. A useful smoke test is to verify that the runtime role cannot create tables. Connect with the application credentials through an approved administrative tool that uses TLS, then run:

```sql
-- Connect as ledgerline_app.
CREATE TABLE public.runtime_should_not_create (id int);
```

This should fail with a permission error. If it succeeds, the runtime role is over-privileged. Remove the test table if it was created accidentally, then correct the grants.

### 10.11 Future migrations after the first deployment

The temporary migration base from section 10.3 is deleted after initial provisioning. For every later release that adds or changes a migration:

1. Confirm the release commit, review the migration diff, and record a database backup or PITR recovery point.
2. Confirm every new or changed `database/seed/*.sql` file is idempotent. `migrate.js` runs all seed files on every migration run, not only once.
3. Create a new temporary paid private migration base service from the new release build, in the same workspace and region as the database. Provide the `NODE_ENV`, `DB_*`, `ADMIN_DB_*`, `IDENTITY_HMAC_SECRET`, and `JWT_SECRET` values that `env.js` validates. Do not add `INITIAL_ADMIN_*`, because bootstrap is not run.
4. Run `node scripts/migrate.js` as a one-off job. Do **not** run `bootstrap.js` for a routine migration; bootstrap can reset the initial administrator password and active HMAC secret.
5. Run `node scripts/verify_install.js` as a separate one-off job and confirm the catalog audit passes.
6. Delete the temporary migration base service and its administrative credentials.
7. Deploy the API and frontend from the same reviewed release commit, then repeat the relevant checks in section 12.

If a migration fails, fix it with a new migration and do not delete or manually edit `_schema_migrations` history. Do not reuse the runtime API service as the migration base.

---

## 11. Domain, HTTPS and CORS Configuration

### 11.1 Frontend origin

Set `CLIENT_ORIGIN` on Render to the exact production frontend origin:

```text
https://ledgerline.vercel.app
```

Rules:

- Include the scheme.
- Do not include a path, query string, or trailing slash.
- Do not use `*`.
- Do not add multiple origins separated by commas; the current code does not support them.
- Vercel preview deployments are not covered by a single production origin.

After changing `CLIENT_ORIGIN`, restart or redeploy the Render service.

### 11.2 API base URL

Set `VITE_API_BASE_URL` on Vercel to the Render API origin:

```text
https://ledgerline-api.onrender.com
```

Do not include `/api`; the frontend appends API paths itself. Do not include a trailing slash. Rebuild and redeploy Vercel after changing it.

### 11.3 HTTPS

- Use Vercel-managed HTTPS for the frontend.
- Use Render-managed HTTPS for the API.
- Add custom domains only after the default Vercel/Render URLs work.
- When custom domains are added, update both `CLIENT_ORIGIN` and `VITE_API_BASE_URL`, then redeploy both sides.
- Do not add an HTTP fallback or disable certificate verification.

### 11.4 CORS expectations

The server allows these request headers:

- `Content-Type`
- `Authorization`
- `Idempotency-Key`
- `x-idempotency-key`

`credentials: true` is configured, but the current application does not use cookie authentication. Do not add cookie-based auth without also adding CSRF protection and revisiting the CORS/cookie design.

Important security properties of CORS:

- CORS is enforced by web **browsers** to control whether browser JavaScript on one origin may read HTTP responses from another origin.
- CORS is **not** authentication, **not** authorization, and **not** a general server-side request-blocking control.
- Some cross-origin requests can still reach the Express server and be processed even when the browser withholds the response from caller JavaScript.
- Non-browser clients (`curl`, scripts, servers, automated tools) bypass browser CORS restrictions completely and hit the API directly.
- Server-side JWT authentication, role/membership authorization, and input validation remain mandatory on every endpoint. Never treat a browser CORS failure as proof that an API endpoint is inaccessible to an attacker.

---

## 12. Staging Acceptance and Safe Production Smoke Verification

Do **not** execute destructive or write-heavy QA scripts against the live production database as routine smoke checks. Separate verification into two tiers:

- **Tier A — Staging Acceptance Verification (before production cutover):** Run the complete functional and adversarial write suite in a dedicated staging environment (migrations, registration, account creation, membership assignment/revocation, deposits, withdrawals, transfers, idempotency replays/conflicts, refused insufficient-funds/frozen flows, administrative reversals, and user status toggles).
- **Tier B — Production Smoke Verification (after production deploy):** Keep live checks minimal and **read-only** using the approved administrator account and read-only queries/probes. Never operate on real customer accounts for testing.

### 12.0 Staging acceptance tests (run in staging, not production)

In staging (using staging PostgreSQL, staging API, and staging frontend):

- Register test customer users, create customer accounts, assign and revoke `auditor` and `account_holder` memberships, and confirm `auditor` accounts are strictly read-only.
- Execute deposits, withdrawals within available balance, account-to-account transfers, insufficient-funds/frozen-account refusals (`422`), idempotency replays, conflicting-payload rejections (`409`), and an administrative reversal (plus duplicate-reversal refusal).
- Toggle a test user's `is_active` status as an administrator and verify deactivated/revoked access cutoffs.
- Verify integer paise handling, PostgreSQL double-entry reconciliation, append-only immutability triggers, and `ledger_secure` assertion non-replayability.

### 12.1 Production API health (read-only smoke check)

```bash
curl -i https://ledgerline-api.onrender.com/api/health
```

Expected: HTTP `200`, `status: "UP"`, database status `CONNECTED`, and no raw database error field.

If the database is unavailable, expect `503` and `DEGRADED`; do not treat a `503` as a successful deployment. Before production approval, confirm the degraded response does not include `database.error` or internal database diagnostics.

### 12.2 Production frontend and SPA fallback (read-only smoke check)

- Open `https://ledgerline.vercel.app/` while logged out and confirm the public landing page renders.
- Open `/login` and `/register` directly; navigate to `/dashboard` while logged out and confirm redirect to `/login`.
- Log in with the approved production administrator account, open `/` again, and confirm the app redirects to `/dashboard`.
- Open `/accounts`, `/operations`, `/health`, and `/admin` directly; verify deep-link refresh (for example `/accounts/<uuid>`) loads the SPA instead of returning a Vercel `404`.
- Open an unknown path and confirm it redirects to `/`.
- Confirm the browser console has no CORS errors on the production origin.

### 12.3 Production authentication (approved account, non-mutating)

- Log in with the approved initial production administrator account (do not register throwaway test users in production).
- Confirm authenticated requests include `Authorization: Bearer <JWT>`.
- Confirm the token is stored in `sessionStorage`, not `localStorage`.
- Confirm logout clears the local authentication state.
- Confirm an expired or invalid token returns `401` and clears the client session.

### 12.4 Production read-only account, audit, and role-boundary checks

- Inspect the `/accounts` list, `/health` UI view, and `/admin` view using the approved administrator account without creating test balances or test customers.
- Using an unauthenticated non-browser client (`curl`), confirm protected account, transaction, and admin endpoints return `401` (not `200`).
- Confirm no real customer accounts are created, debited, credited, frozen, or modified during production verification.

### 12.5 Financial write operations in production (staging-only by default)

Routine production verification must **not** register demo users, create funded accounts, or post deposits, withdrawals, transfers, or reversals in production. Those full write tests belong in staging (section 12.0).

If a live production financial verification transaction is explicitly required by operations sign-off:

- Use designated synthetic test accounts **only** — never real customer accounts or real customer funds.
- Record exact transaction IDs, amounts, and approvals in the deployment change log.
- Acknowledge that **all posted/refused transactions, ledger postings, and audit log entries remain permanently recorded** in PostgreSQL's append-only ledger. Reversing a posted transaction appends a compensating reversal transaction and inverse postings; it does **not** erase, delete, or roll back historical ledger/audit records.

### 12.6 Production administrator readiness (non-mutating)

- Confirm the provisioned initial administrator can log in after temporary migration/bootstrap credentials have been removed from runtime services.
- Verify `/admin` loads cleanly without mutating user statuses or creating test users unless required by an authorized operations change ticket.

### 12.7 CORS behavior (browser enforcement vs. server controls)

- From the exact production frontend origin (`CLIENT_ORIGIN`), confirm login and API calls succeed in browser JS.
- From a different browser origin (including an unlisted Vercel preview URL), confirm browser JS cannot read the cross-origin response due to missing `Access-Control-Allow-Origin` allowance.
- Remember that CORS is browser-side response filtering only: verify with direct `curl` requests (no browser origin restrictions) that unauthenticated or unauthorized calls to protected endpoints are still blocked by server-side JWT authentication (`401`) and authorization (`403`).
- Do not treat a browser CORS failure as proof that an endpoint cannot be invoked by an external attacker, and never set `CLIENT_ORIGIN` to `*`.

### 12.8 Database verification

As an authorized administrator (using read-only `SELECT` queries):

- Confirm all nine migration versions are recorded in `public._schema_migrations` with no failed or partial entries.
- Confirm the structural `SYSTEM_CASH_VAULT` account exists (`account_type = 'system'`, `system_role_type = 'SYSTEM_CASH_VAULT'`).
- Balance expectation distinction:
  - Immediately after initial structural seeding (before any financial transactions), expect `SYSTEM_CASH_VAULT.current_balance = 0`.
  - After any posted financial transactions (such as staging acceptance tests or live production deposits/withdrawals), do **not** assume `SYSTEM_CASH_VAULT.current_balance = 0`, because net deposits debit the vault (making its balance negative) and net withdrawals credit it. Verify double-entry reconciliation instead: for `SYSTEM_CASH_VAULT` and all customer accounts, confirm `accounts.current_balance = COALESCE(SUM(ledger_postings.signed_amount_paise), 0)`, confirm `SYSTEM_CASH_VAULT` matches the expected net deposit/withdrawal flow, and confirm every posted transaction's postings sum strictly to zero (`SUM(signed_amount_paise) = 0`).
- Unless an explicitly approved, documented synthetic production exception was executed (section 12.5), confirm production contains **no demo users or synthetic test balances**.
- Confirm `ledgerline_app` cannot create tables or alter schemas (`rolsuper = false`, `rolbypassrls = false`, no `CREATE` privilege on `public`/`ledger_secure`).
- Confirm RLS is enabled and forced (`FORCE ROW LEVEL SECURITY`) on all seven domain tables, and append-only triggers remain active on `ledger_postings`, `audit_logs`, and finalized `transactions`.

### 12.9 Restart and persistence

- Redeploy/restart the Render API.
- Confirm `/api/health` returns `200`.
- Log in again with the approved administrator account and confirm persisted system/account state remains accessible.
- Confirm secrets still validate cleanly after restart.
- Confirm no secret values appear in Render or Vercel logs.

### 12.10 Security checks

- Confirm HTTPS redirects/served certificates on both domains.
- Confirm `Authorization` is required for protected API routes (verified directly via `curl`, not only via browser CORS).
- Confirm response headers include the expected Helmet protections.
- Confirm request bodies over 10 KB are rejected.
- Confirm stack traces are not returned in production error responses.
- Confirm the degraded health response does not expose raw database errors (`database.error`) or internal diagnostics; if it does, the health information-disclosure blocker remains open.
- Confirm rate limiting covers the public Render API hostname (either via Express application-level rate limiting or a verified edge/WAF/reverse proxy directly in front of Render covering login, registration, and financial endpoints — not merely a firewall on Vercel); if not, the rate-limiting production blocker remains open.
- Confirm the JWT `sessionStorage` XSS blocker has been resolved or formally accepted in writing.

---

## 13. Troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| Render service crashes on boot with configuration error | `IDENTITY_HMAC_SECRET` is missing, not exactly 64 hex characters, or `JWT_SECRET` is shorter than 32 characters | Regenerate and set the exact values. Do not use placeholder values. |
| Render service crashes in production | `DB_PASSWORD` missing or empty | Set the `ledgerline_app` password on the web service. |
| Render uses an unexpected Node version | The service is not pinned to the verified Node 24 patch | Set `NODE_VERSION=24.22.1` (or a deliberate later Node 24 patch) and redeploy; confirm the startup log reports Node 24. |
| Render cannot create a one-off job | The base service is on a Free instance, or the selected plan does not support jobs | Use a paid web/private service as the base. Free web services do not support one-off jobs. |
| One-off job uses stale code or environment | Jobs use the base service's latest successful build and an environment snapshot taken at job creation | Redeploy the base so the desired build is its latest successful build, update the base environment, then create a new job. |
| `/api/health` returns `503` | Database unreachable, wrong internal host, wrong region, wrong credentials, or database paused | Check the internal host/name/user/password, confirm same account/region, and review Render database status. |
| Health response exposes a database error | Public health service currently includes `database.error = error.message` | Treat as a production blocker. Remove raw errors from the response, log them server-side, and expose only safe status fields. |
| API logs cannot connect to database from a local machine | External Render PostgreSQL requires TLS, while the current `pg` clients do not configure SSL | Run migrations/bootstrap inside Render using the internal host. Do not disable TLS. |
| Migration fails: `must be able to SET ROLE "ledgerline_owner"` | Render-specific role preflight was skipped, or roles were created by another administrator | Stop. Run the preflight SQL from section 6.2 on a fresh database or obtain the required admin grants. |
| Migration fails: `permission denied for table accounts` | Migration administrator does not inherit the owner role | Re-run the preflight grants with `INHERIT TRUE`; do not use the runtime `ledgerline_app` account for migrations. |
| Bootstrap fails: `permission denied to alter role` | The migration administrator lacks admin rights on `ledgerline_app`, often because the role was created by another user | Use a fresh database with the preflight role setup, or have an authorized administrator grant the needed role administration. Do not run bootstrap as the runtime app user. |
| Migration reruns do not apply a file | File is already recorded in `_schema_migrations` | Do not delete migration history to force a rerun. Investigate the partial/failed state and restore from backup if needed. |
| Seed data appears duplicated | A custom seed was added or modified without idempotency | The current system-vault seed is idempotent; do not add non-idempotent demo seed data. |
| CORS error in browser | `CLIENT_ORIGIN` does not exactly match the page origin, has a trailing slash, or is a Vercel preview URL | Fix the exact origin on Render and redeploy. Do not use `*`. |
| Frontend calls the wrong API | `VITE_API_BASE_URL` is missing, has a trailing slash, includes `/api`, or was changed without rebuilding | Correct the value and redeploy Vercel. |
| Deep links return 404 on Vercel | SPA rewrite is missing or in the wrong project root | Add the `vercel.json` rewrite in the correct Vercel root and redeploy. |
| Login fails after changing secrets | `JWT_SECRET` changed, invalidating old tokens; or frontend build still points at old API | Log in again after a JWT rotation. Rebuild frontend after API URL changes. |
| Admin password unexpectedly changed | Bootstrap was rerun with a different `INITIAL_ADMIN_PASSWORD` | Restore the intended administrator credentials through the approved bootstrap procedure, then remove bootstrap secrets from runtime. |
| Database connection limit reached | Pool size multiplied by instance count exceeds the Render plan limit | Reduce `DB_POOL_MAX`, review service scaling, and consider connection pooling. |
| Production is still vulnerable to brute force | No Express rate limiter or verified edge/WAF in front of the Render API hostname | Implement Express application rate limiting or place a verified edge/WAF/reverse proxy directly in front of the public Render API hostname (a Vercel-only firewall does not protect Render); this remains a production blocker. |
| XSS could steal tokens | JWT is in `sessionStorage` | Migrate to hardened cookie auth or formally accept the risk; do not label the current design production-safe. |

---

## 14. Rollback and Recovery

### 14.1 Before deployment

- Record the release commit SHA.
- Export/verify a database backup or PITR recovery point.
- Save the current Vercel and Render deployment IDs.
- Document the current environment-variable values in a secret store, not in this document.
- Confirm that the release includes the intended landing page and UI files, and does not include unintended local changes.

### 14.2 Frontend rollback

Use Vercel's deployment promotion/rollback to restore the previous known-good frontend. If the API contract changed, verify that the previous frontend is compatible with the current backend before promoting it.

### 14.3 Backend rollback

Use Render's deploy history to redeploy the previous known-good API build. Keep the database schema compatible with both versions during the rollback window; the migration suite is forward-only.

### 14.4 Database migration failure

- The migration runner wraps each migration file in a transaction and records successful files in `_schema_migrations`.
- A failed migration rolls back its own transaction and is not recorded.
- Do not delete migration history or manually mark a failed migration as applied.
- If the database is in an unknown state, stop writes, take a backup, and restore to a verified recovery point.
- Do not run a destructive reset against production.

### 14.5 Database recovery

If the database is lost or corrupted:

1. Restore from the verified Render backup/PITR point to a new instance.
2. Update the Render API's internal `DB_HOST`, `DB_NAME`, and credentials.
3. Run the role/privilege verification checks.
4. Run `/api/health` and a read-only account/transaction smoke test.
5. Do not point the API at the old damaged database while recovery is underway.

### 14.6 Secret rotation

- **JWT secret rotation:** generate a new high-entropy `JWT_SECRET` (at least 32 characters), update it on the Render API service, and restart/redeploy; all existing JWTs become invalid and users must log in again.
- **Application database password rotation (two mandatory steps):** updating Render's `DB_PASSWORD` environment variable alone does **not** change PostgreSQL's stored password for `ledgerline_app`. Rotate in two steps:
  1. Using an authorized administrator database connection (`sslmode=require` if external), change the `ledgerline_app` role password safely without exposing the password in shell history, CLI command arguments, or logs (for example, using interactive `\password ledgerline_app` inside `psql` or an unlogged secret input channel).
  2. Update `DB_PASSWORD` on the Render API web service to the exact matching value, trigger a restart/redeploy, and verify `/api/health` returns `200` (`UP`).
- **HMAC secret rotation (controlled fallback via `bootstrap.js`):** the repository currently provides **no dedicated HMAC-rotation script**; only `server/scripts/bootstrap.js` writes to `ledger_secure.auth_secrets`. Treat bootstrap-based HMAC rotation strictly as a controlled maintenance fallback — never rerun it casually — because `bootstrap.js` also executes `ALTER ROLE ledgerline_app WITH PASSWORD` (when `DB_PASSWORD` is non-empty, which `env.js` requires in `production`) and upserts `public.users` (`id = '00000000-0000-0000-0000-000000000002'`, `email = LOWER(TRIM(INITIAL_ADMIN_EMAIL))`, overwriting the initial administrator's password, setting `role = 'admin'`, and forcing `is_active = true`):
  1. Create a temporary paid private migration base service matching the deployed release commit with **all** required temporary variables: `NODE_ENV=production`, `DB_HOST`, `DB_PORT=5432`, `DB_NAME`, `DB_USER=ledgerline_app`, `DB_PASSWORD` (must match the **intended active** `ledgerline_app` password), `ADMIN_DB_USER`, `ADMIN_DB_PASSWORD`, `IDENTITY_HMAC_SECRET` (new 64-hex secret), `JWT_SECRET`, `HMAC_KEY_VERSION` (incremented integer version), `INITIAL_ADMIN_EMAIL` (intended initial admin email), `INITIAL_ADMIN_PASSWORD` (deliberately supplied intended active password, >= 12 characters, acknowledging that the initial admin's password will be set to this value and `is_active` forced `true`), and `CLIENT_ORIGIN`.
  2. Execute `node scripts/bootstrap.js` as a one-off job; it activates the new `HMAC_KEY_VERSION` and deactivates older versions in `ledger_secure.auth_secrets`.
  3. Synchronize the exact new `IDENTITY_HMAC_SECRET` and incremented `HMAC_KEY_VERSION` onto the Render API web service (along with any updated `DB_PASSWORD`), perform a controlled restart/redeploy of the Render API (expect brief assertion-verification failures during cutover while the old API process uses the deactivated key version), and delete the temporary migration base service immediately afterward.
  4. Verify afterward: confirm `/api/health` returns `200`, verify approved administrator login and runtime authentication flows work with the new HMAC key, confirm the `ledgerline_app` runtime DB login was preserved as intended, and verify the initial administrator password/status matches your secret store.
- **Render default database password rotation:** rotate in Render, update the temporary migration base environment when privileged jobs are needed, and never store it in the runtime web service.
- If a secret is exposed, rotate it first, then investigate logs and access.

---

## 15. Final Submission Checklist

- [ ] Release commit reviewed; unrelated local UI changes excluded or intentionally included.
- [ ] Release commit includes the intended landing page, UI components, updated `App.jsx`, Node 24 baseline settings, and `client/vercel.json`; the audited `HEAD` (`3c23bad`) is not deployed as-is.
- [ ] No real secrets, `.env` files, test credentials, or database dumps committed.
- [ ] Node 24.x configured on Render (`NODE_VERSION=24.22.1`), Vercel (`24.x`), and `.github/workflows/ci.yml`; remote GitHub Actions CI run completed with `success` for the exact pushed release commit (CI has not run remotely for the newer, unpushed working-tree changes).
- [ ] Render web service uses root `server`, `npm ci`, `npm start`, and `/api/health`.
- [ ] Vercel project uses root `client`, `npm ci`, `npm run build`, and `dist`.
- [ ] Vercel SPA rewrite is configured and deep links work.
- [ ] Server and client production/full dependency audits were run at the release commit; the client Vite/esbuild advisories were upgraded or formally risk-accepted.
- [ ] Render PostgreSQL is on a paid production plan in the same region as the web service.
- [ ] Preliminary `current_user` privilege check and preflight role/privilege SQL completed successfully on the fresh Render PostgreSQL 16 database.
- [ ] Migration and bootstrap one-off jobs ran separately from a paid migration base service with the expected build and environment snapshot.
- [ ] Bootstrap ran deliberately once for initial provisioning and its result was verified.
- [ ] Temporary migration base service was deleted after verification.
- [ ] Migration administrator and initial-admin credentials are absent from the long-running API.
- [ ] Migrations 001-009 applied and recorded in `public._schema_migrations`.
- [ ] Structural `SYSTEM_CASH_VAULT` seed exists with `0` balance immediately after initial seeding (before financial activity), and post-activity balance reconciles with `SUM(signed_amount_paise)`.
- [ ] Production contains no unintended demo users or test balances (unless a specifically approved synthetic smoke ticket is documented).
- [ ] Bootstrap completed; approved administrator login verified cleanly.
- [ ] Bootstrap-only secrets removed from the long-running web service.
- [ ] Runtime `DB_USER` is `ledgerline_app` (`rolcanlogin = true`, `rolsuper = false`, `rolbypassrls = false`), `ledgerline_owner` is `NOLOGIN` (`rolcanlogin = false`, `rolbypassrls = false`), and the Render default administrator is unused at runtime.
- [ ] Runtime role `ledgerline_app` cannot create tables or alter schema.
- [ ] `CLIENT_ORIGIN` exactly matches the production frontend origin.
- [ ] `VITE_API_BASE_URL` exactly matches the Render API origin, with no trailing slash.
- [ ] HTTPS works on both custom/default domains.
- [ ] Health endpoint returns `200` and `UP`.
- [ ] Degraded health response contains no raw database errors or internal diagnostics.
- [ ] Public `/` shows the landing page when logged out and redirects to `/dashboard` when authenticated; protected routes redirect unauthenticated users to `/login`; `/admin` is restricted to admins; unknown paths redirect to `/`.
- [ ] **Staging acceptance tests completed in staging:** registration, account/membership mutations, auditor read-only boundary, deposits, withdrawals, transfers, idempotency, reversals, and admin status toggles verified cleanly outside production.
- [ ] **Safe production read-only smoke checks completed:** read-only health, SPA load, approved admin auth, and read-only views verified without creating demo users or touching real customer accounts.
- [ ] Browser CORS behavior verified for `CLIENT_ORIGIN` vs other origins/previews, AND non-browser `curl` probes verified that server-side `401`/`403` enforcement rejects unauthenticated/unauthorized calls directly (CORS is not treated as server security).
- [ ] Backups/PITR enabled and a recovery point recorded.
- [ ] Logs contain no passwords, JWTs, HMAC values, or database URLs.
- [ ] JWT `sessionStorage` production blocker resolved or formally accepted.
- [ ] Rate limiting production blocker resolved (Express limiter or verified edge/WAF/reverse proxy in front of the public Render API hostname covering login, registration, and financial endpoints — not merely a Vercel frontend firewall).
- [ ] Rollback procedure and previous deployment IDs recorded.
- [ ] Final deployment evidence collected without exposing secrets.

### Final evidence to retain

- Release commit SHA.
- Vercel deployment URL and deployment ID.
- Render web service URL and deployment ID.
- Render database instance name, region, PostgreSQL version, and plan.
- `/api/health` response captured at the time of verification.
- Migration version list.
- Test commands and results.
- Dependency-audit JSON or summarized output for `server/` and `client/`, including both production and full audits at the release commit.
- Screenshots or recordings of the end-to-end flows.
- Record of the three production blockers (JWT storage, rate limiting, and health endpoint information disclosure) and their resolution/risk acceptance.

Do not mark the deployment complete while any production blocker remains unresolved.
