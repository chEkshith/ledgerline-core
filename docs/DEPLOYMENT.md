# LedgerLine Core — Production Deployment & Hardening Guide

Version: 1.0.0  
Status: Production Ready  
Target Platform: Linux (Ubuntu 22.04 LTS / Debian 12 / Containerized) or Managed Cloud (AWS RDS, Google Cloud SQL, Supabase, Railway)

---

## 1. Production Prerequisites

| Component | Minimum Version | Recommended | Notes |
| :--- | :--- | :--- | :--- |
| **Operating System** | Linux Kernel 5.15+ | Ubuntu 22.04 LTS | Container host (Docker/Kubernetes) |
| **Node.js Runtime** | Node.js 20.x LTS | Node.js 20.18+ LTS | Native `crypto`, `fetch`, `--env-file` |
| **PostgreSQL Database** | PostgreSQL 15.0+ | PostgreSQL 16.x | Requires `pgcrypto` extension |
| **Reverse Proxy / TLS** | Nginx / Caddy / Cloudflare | Caddy or AWS ALB | TLS 1.3 termination, rate limiting |
| **Memory / CPU** | 2 vCPU, 2 GB RAM | 4 vCPU, 8 GB RAM | Per server node |

---

## 2. Managed PostgreSQL Hardening & Configuration

### 2.1 Connection Pooling & PgBouncer Strategy
LedgerLine uses `active_session_contexts` bound to `pg_backend_pid()` and PostgreSQL `SET LOCAL` commands within explicit `BEGIN ... COMMIT` transaction blocks.

> [!IMPORTANT]
> **PgBouncer Pooling Mode**:
> - If utilizing **PgBouncer**, you MUST run in **Transaction Pooling Mode** (`pool_mode = transaction`).
> - LedgerLine cleans up all session context rows inside `clear_session_identity()` before transaction commit or rollback, and does not leak session-level state outside the transaction boundary.
> - Ensure `server_reset_query = DISCARD ALL` is configured on PgBouncer connections to guarantee clean state.

### 2.2 SSL / TLS Enforcement
In production, enforce encrypted database transport:
```ini
sslmode=require
```
Add `ssl: { rejectUnauthorized: true, ca: ... }` to your pool configuration when connecting to managed RDS/Cloud SQL instances.

### 2.3 Role Separation Architecture
LedgerLine strictly separates administrative provisioning from runtime execution:

1. **`postgres` (Superuser / Cloud Admin)**:
   - Used ONLY during initial bootstrapping and running migration scripts.
   - Never used by the running web application.
2. **`ledgerline_owner` (Database Owner)**:
   - Configured with `NOLOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`.
   - Owns all tables, schemas, and `SECURITY DEFINER` procedures.
3. **`ledgerline_app` (Application Runtime Role)**:
   - Configured with `LOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`.
   - Has read-mostly access (`SELECT, INSERT` on transactions, `SELECT` on postings, `SELECT, INSERT, UPDATE` on idempotency keys).
   - Direct `UPDATE` and `DELETE` on finalized transactions and ledger postings are permanently denied at the grant level.
   - Cannot create tables or temporary objects (`TEMPORARY` revoked from database).

---

## 3. Environment Variables Reference

| Variable Name | Required? | Sensitive? | Default / Example | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `PORT` | Optional | No | `5000` | Port for Express HTTP listener |
| `HOST` | Optional | No | `0.0.0.0` | Bind host address |
| `NODE_ENV` | **Required** | No | `production` | Set to `production` to enforce strict validation |
| `DB_HOST` | **Required** | No | `postgres.internal` | PostgreSQL host address |
| `DB_PORT` | Optional | No | `5432` | PostgreSQL port |
| `DB_NAME` | **Required** | No | `ledgerline_prod` | Production database name |
| `DB_USER` | **Required** | No | `ledgerline_app` | Runtime application role |
| `DB_PASSWORD` | **Required** | **YES** | `[SECURE_RANDOM_PW]` | Runtime application password |
| `DB_POOL_MAX` | Optional | No | `20` | Max concurrent pool connections per node |
| `DB_IDLE_TIMEOUT_MS`| Optional | No | `30000` | Idle connection reclamation timeout |
| `ADMIN_DB_USER`| Bootstrap | No | `postgres` | Superuser for running migrations |
| `ADMIN_DB_PASSWORD`| Bootstrap | **YES** | `[SECURE_ADMIN_PW]` | Superuser password for migrations |
| `IDENTITY_HMAC_SECRET`| **Required** | **YES** | 64 hex characters | 32 cryptographically random bytes |
| `JWT_SECRET` | **Required** | **YES** | Min 32 characters | Cryptographic secret for signing JWTs |
| `HMAC_KEY_VERSION` | Optional | No | `1` | Key version index for rotation |
| `INITIAL_ADMIN_EMAIL`| Bootstrap | No | `admin@ledgerline.local`| Email for seeded admin |
| `INITIAL_ADMIN_PASSWORD`| Bootstrap | **YES** | `[SECURE_ADMIN_PW]` | Initial admin password (hashed with scrypt) |
| `CLIENT_ORIGIN`| **Required** | No | `https://ledgerline.com` | Allowed CORS origin for browser requests |

---

## 4. Cryptographic Secret Generation

Never use default or fallback secrets in staging or production. Generate secrets using Node.js or OpenSSL:

```bash
# 1. Generate 32-byte (64 hex characters) HMAC Secret:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. Generate 64-character JWT Secret:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 3. Generate Strong Database Passwords (at least 32 characters):
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

---

## 5. Step-by-Step Production Installation Procedure

### Step 1: Provision Clean PostgreSQL Database
Connect to your PostgreSQL cluster as superuser (`postgres`):
```sql
CREATE DATABASE ledgerline_prod WITH ENCODING 'UTF8';
```

### Step 2: Configure Production Environment Variables
Create `/opt/ledgerline/server/.env` containing production values (restricted to `chmod 600`):
```bash
NODE_ENV=production
PORT=5000
HOST=0.0.0.0
DB_HOST=postgres.internal
DB_PORT=5432
DB_NAME=ledgerline_prod
DB_USER=ledgerline_app
DB_PASSWORD=<generated-app-role-password>
ADMIN_DB_USER=postgres
ADMIN_DB_PASSWORD=<generated-postgres-password>
IDENTITY_HMAC_SECRET=<64-hex-generated-secret>
JWT_SECRET=<generated-jwt-secret>
HMAC_KEY_VERSION=1
INITIAL_ADMIN_EMAIL=admin@ledgerline.corp
INITIAL_ADMIN_PASSWORD=<generated-strong-admin-password>
CLIENT_ORIGIN=https://app.ledgerline.corp
```

### Step 3: Run Database Migrations & Initial Bootstrap
LedgerLine's migration runner uses PostgreSQL advisory locks (`pg_advisory_lock(987654321)`) to ensure migrations execute safely even in multi-instance environments:

```bash
cd /opt/ledgerline/server
# Run migrations 001 through 009 sequentially
node scripts/migrate.js

# Bootstrap runtime role credentials, permissions, and initial admin account
node scripts/bootstrap.js
```

### Step 4: Build Frontend Assets
Build optimized production static bundles:
```bash
cd /opt/ledgerline/client
npm ci
npm run build
# Built files output to client/dist/
```

### Step 5: Start Backend Service
Start the server using a process manager such as `pm2` or systemd:
```bash
cd /opt/ledgerline/server
pm2 start src/index.js --name "ledgerline-api" -i max
```

---

## 6. Migration Execution Order & Verification

All migrations are located in `database/migrations/` and must be applied in ascending numerical order:

1. `001_schemas_roles_extensions.sql`: Creates `ledger_secure` schema, `ledgerline_owner` role, `ledgerline_app` role, and enables `pgcrypto`.
2. `002_domain_tables.sql`: Provisions the 7 core domain tables, constraints, foreign keys, and indexes.
3. `003_row_level_security.sql`: Activates `ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` across all domain tables.
4. `004_integrity_triggers_and_deferred_validator.sql`: Installs balance recalculation triggers, immutability constraints, and deferred commit validators.
5. `005_identity_assertions_and_session_context.sql`: Implements independent assertion consumption and PID-bound session contexts.
6. `006_financial_engine_procedures.sql`: Implements `deposit`, `withdrawal`, `transfer`, and `reversal` `SECURITY DEFINER` procedures.
7. `007_audit_logging.sql`: Installs append-only audit log triggers and attribution procedures.
8. `008_security_remediations.sql`: Hardens `trg_protect_finalized_transactions`, removes hardcoded credentials, and adjusts table grants.
9. `009_harden_search_paths_and_schema_privileges.sql`: Revokes `TEMPORARY` on database from `PUBLIC`, hardens search paths across all 26 `SECURITY DEFINER` functions to explicitly qualify system catalogs (`pg_catalog` first) and place `pg_temp` last (16 functions use `pg_catalog, ledger_secure, public, pg_temp`; 4 use `pg_catalog, public, pg_temp`; 3 use `pg_catalog, ledger_secure, pg_temp`; 3 pure validation triggers use `pg_catalog, pg_temp`).

### Verification Command:
```bash
node server/scripts/verify_install.js
```
Confirms that all 7 tables have `relforcerowsecurity = true` and all 26 `SECURITY DEFINER` functions have hardened search paths and correct grants.

---

## 7. Operational Security Architecture & Controls

### 7.1 Reverse-Proxy Rate Limiting Requirement
> [!IMPORTANT]
> **Rate Limiting Architecture**:
> In-application rate limiting is intentionally not implemented in the Express Node.js layer to avoid single-process memory bottlenecks under volumetric floods.
> Production deployments MUST enforce rate limiting at the ingress/reverse-proxy layer (e.g. Nginx `limit_req_zone`, Cloudflare Rate Limiting Rules, or AWS WAF):
> - **Public Auth Endpoints** (`POST /api/auth/login`, `POST /api/auth/register`): Bounded to 5-10 requests/minute per IP.
> - **Financial Transaction Endpoints** (`POST /api/transactions/*`): Bounded to 30 requests/minute per authenticated user.
> - **General Read Endpoints** (`GET /api/*`): Bounded to 120 requests/minute per IP/token.

### 7.2 Browser Token Storage Model & Residual XSS Risk
> [!WARNING]
> **SessionStorage vs. HttpOnly Cookie Security Trade-Off**:
> LedgerLine stores JWT authentication tokens in browser `sessionStorage` (with in-memory fallback), strictly rejecting persistent `localStorage`.
> - **Security Benefit**: Isolates authentication state to the single browser tab/session; closing the tab immediately purges credentials and prevents cross-tab session leakage.
> - **Residual Risk**: Unlike `HttpOnly` cookies, `sessionStorage` is accessible to JavaScript executing in the same origin. If a Cross-Site Scripting (XSS) vulnerability were introduced into client-rendered content, a malicious script could read `sessionStorage.getItem('ledgerline_auth')`.
> - **Production Recommendation**: High-assurance financial production deployments should migrate token transmission to `HttpOnly; SameSite=Strict; Secure` session cookies paired with anti-CSRF tokens.

### 7.3 CI/CD Automation Status
A GitHub Actions workflow is authored at `.github/workflows/ci.yml`. It spins up a PostgreSQL 16 container, applies migrations 001–009, runs the full test suite (62 server + 41 client = 103 total tests), and compiles the Vite client bundle. Remote GitHub execution has not yet run because the repository commits are preserved locally pending placement approval before push.

---

## 8. Health Checks, Monitoring & Alerting

- **Liveness Probe**: `GET /api/health`
  - Expected: HTTP 200 with `status: "ok"`, `database: "connected"`
  - Alert trigger: HTTP status $\ne 200$ or latency $> 500\text{ms}$ for 3 consecutive probes.
- **Audit Logs Monitoring**:
  - Periodically monitor `public.audit_logs` for `USER_STATUS_CHANGED`, `MEMBERSHIP_REVOKED`, and failed assertion attempts.
- **Connection Pool Monitoring**:
  - Monitor `pg_stat_activity` for connection saturation or blocked queries.

---

## 8. Backup, Restore & Disaster Recovery

### 8.1 Logical Backup Procedure
Execute daily or hourly automated logical backups using `pg_dump`:
```bash
pg_dump -h postgres.internal -U postgres -d ledgerline_prod \
  --format=custom \
  --clean \
  --if-exists \
  --file=/var/backups/ledgerline_$(date +%Y%m%d_%H%M%S).dump
```

### 8.2 Restore Procedure
To restore into an empty database:
```bash
pg_restore -h postgres.internal -U postgres -d ledgerline_prod \
  --clean \
  --if-exists \
  /var/backups/ledgerline_20261109_100000.dump
```

### 8.3 Point-In-Time Recovery (PITR)
For enterprise zero-RPO disaster recovery, enable Continuous WAL Archiving (`archive_mode = on`, `archive_command = '...'`) to cloud storage (e.g., AWS S3).

---

## 9. Rollback & Disaster Recovery Strategy

1. **Additive Migrations**: LedgerLine migrations are strictly additive; schema changes do not drop tables or columns destructively.
2. **Atomic Procedure Updates**: Procedural fixes can be deployed by re-applying `CREATE OR REPLACE FUNCTION` under `pg_advisory_lock` without database downtime.
3. **Emergency Account Freezing**: If suspicious activity is detected on a tenant account, an administrator can immediately set `status = 'frozen'` via `POST /api/accounts/:id`, immediately blocking all further debits and credits via database triggers.

---

## 10. Post-Deployment Smoke Test Procedure

Run this smoke test sequence immediately following production deployment:

1. **Health Check**:
   ```bash
   curl -s -f https://api.ledgerline.corp/api/health | grep '"status":"ok"'
   ```
2. **Admin Authentication**:
   Authenticate using `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` to obtain a JWT.
3. **Database Security Invariant Check**:
   Confirm zero un-reconciled postings:
   ```sql
   SELECT count(*) FROM public.accounts a
   WHERE a.cached_balance_paise != COALESCE((
     SELECT SUM(p.amount_paise) FROM public.ledger_postings p WHERE p.account_id = a.id
   ), 0);
   -- Must return 0!
   ```
4. **Idempotency Lifecycle Check**:
   Confirm zero stale in-progress keys:
   ```sql
   SELECT count(*) FROM public.idempotency_keys WHERE status = 'in_progress';
   -- Must return 0!
   ```
