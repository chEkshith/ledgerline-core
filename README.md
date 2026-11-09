# LedgerLine Core — Financial Transaction Management System

LedgerLine is an enterprise-grade, secure financial transaction management platform and double-entry ledger built on the **PERN** stack (PostgreSQL 16, Express, React 18, Node.js 20+ LTS).

Designed for mission-critical money movement, LedgerLine enforces strict ACID transactional integrity, immutable double-entry bookkeeping, Row-Level Security, integer paise arithmetic (avoiding binary floating-point rounding errors in core monetary calculations), defensive cryptographic session contexts, and transactional idempotency.

---

## Architecture & Monorepo Structure

```text
ledgerline-core/
│
├── client/                     # Frontend Application (React 18 + Vite + Tailwind CSS v4)
│   ├── src/
│   │   ├── components/         # Reusable UI (Navbar, ProtectedRoute, Alert, Modal)
│   │   ├── context/            # AuthContext (JWT, session lifecycle, role state)
│   │   ├── pages/              # Dashboard, Accounts, AccountDetail, Operations, Admin, Health
│   │   ├── services/           # Centralized API client (token injection, error normalization)
│   │   ├── utils/              # formatters.js (rupeesToPaise, paiseToRupees, generateIdempotencyKey)
│   │   ├── App.jsx             # React Router routing & layout root
│   │   └── main.jsx            # React root mount
│   ├── test/                   # Frontend Unit & Precision Test Suite (41 tests)
│   │   └── frontend.test.js    # Financial precision, BigInt paise, and UUID tests
│   ├── package.json            # Client dependencies & scripts
│   └── vite.config.js          # Vite config with @tailwindcss/vite and /api proxy
│
├── server/                     # Backend API (Node.js 20+ + Express + pg)
│   ├── scripts/                # Database migration and bootstrap scripts
│   │   ├── migrate.js          # Advisory-locked sequential migration runner
│   │   ├── bootstrap.js        # Secure role, HMAC secret & admin provisioner
│   │   └── verify_install.js   # DB security catalog verification utility
│   ├── src/
│   │   ├── config/             # DB pool (db.js) & validated env loader (env.js)
│   │   ├── routes/             # Auth, Account, Transaction, and Health routers
│   │   ├── controllers/        # Request/Response orchestration
│   │   ├── services/           # Business logic, idempotency, session contexts
│   │   ├── middleware/         # Auth verification, Helmet, CORS, Error handling
│   │   └── utils/              # Deterministic JSON canonicalizer, HMAC, scrypt, sessionContext
│   ├── test/                   # Automated integration test suite (62 tests)
│   │   └── phase2.test.js      # 62-scenario comprehensive integration test suite
│   ├── package.json            # Server dependencies & npm scripts
│   └── .env.example            # Server environment configuration template
│
├── database/                   # Database Evolution & Seeding
│   ├── migrations/             # Versioned SQL migrations (001 - 009)
│   └── seed/                   # Structural System Vault seed (001_initial_seed.sql)
│
├── docs/                       # Comprehensive Architecture & Operations Documentation
│   ├── API.md                  # RESTful API Reference Manual & Integer Paise Specifications
│   ├── ARCHITECTURE.md         # System Architecture, Mermaid Diagrams & Data Model
│   ├── DEPLOYMENT.md           # Production Hardening, Managed PostgreSQL & Deployment Guide
│   └── DEMO.md                 # 5-Minute Hackathon Demo Runbook & Project Write-Up
│
├── .github/                    # CI/CD Automation
│   └── workflows/ci.yml        # GitHub Actions CI Workflow (PostgreSQL service + tests)
│
├── PROMPTS.md                  # Comprehensive prompt history & intent tracking (Prompts 1-14)
├── THREATS.md                  # STRIDE threat model & 17-Scenario Adversarial Threat Analysis
├── SUBMISSION.md               # Hackathon deliverable & requirements compliance checklist
├── README.md                   # Project overview & quick start
└── .gitignore                  # Exclusion list for secrets, build artifacts, & dumps
```

---

## Core Financial & Security Principles

1. **Integer Paise Arithmetic (Avoiding Binary Floating-Point Drift)**:
   - Binary floating-point representations (IEEE 754) suffer from precision rounding errors (`0.1 + 0.2 !== 0.3` and `10.55 * 100 === 1054.9999999999998`).
   - All financial amounts are strictly processed and stored as **integer paise** (`BIGINT`, where ₹1.00 = 100 paise), avoiding binary floating-point arithmetic in core monetary calculations (without promising that this eliminates every possible financial calculation defect).
   - On the frontend, `rupeesToPaise` uses string splitting and BigInt arithmetic to avoid float contamination before transmission.
   - The backend validates amounts within PostgreSQL `BIGINT` range, rejecting negatives, fractions, floats, and unsafe JavaScript integers.
2. **Double-Entry Zero-Sum Ledger**:
   - Every posted transaction produces exactly two balanced postings: one debit and one credit of equal magnitude ($\text{debit} + \text{credit} = 0$).
   - Refused transactions produce exactly zero postings. Postings and audit logs are append-only.
3. **Three-Stage Assertion Replay Protection**:
   - **Phase 1 (Committed Independently)**: Registers HMAC-SHA256 assertion and consumes it (`status = 'CONSUMED'`). This commits immediately.
   - **Phase 2 (Financial Isolation)**: Begins financial transaction on the same checked-out connection client, establishes verified session context in `ledger_secure.active_session_contexts`, marks assertion `BOUND`.
   - **Rollback Resilience**: If the financial transaction rolls back, Phase 1's consumption remains committed to PostgreSQL. The same assertion can never be reused.
4. **Connection Pool Contamination Defense**:
   - Post-commit and post-rollback cleanup executes `clear_session_identity`. If cleanup fails or cannot be verified, `sessionContext.js` calls `client.release(true)` which discards and terminates the socket from the pool.
5. **Finalized Transaction Immutability**:
   - Database trigger `trg_protect_finalized_transactions` blocks mutation or deletion of transactions in `posted` or `refused` status.
   - Enforces that financial identity fields (amount, currency, accounts, type, creator) cannot be altered during pending-to-finalized transitions.
6. **Deadlock Elimination**:
   - Deterministic ascending UUID locking (`LEAST(src, dest) < GREATEST(src, dest)`) acquires account row locks before transaction insertion, eliminating deadlocks on concurrent opposite-direction transfers.
7. **PostgreSQL FORCE Row-Level Security**:
   - Enforced on all domain tables (`users`, `accounts`, `account_memberships`, `transactions`, `ledger_postings`, `idempotency_keys`, `audit_logs`).
   - Private schema `ledger_secure` is completely inaccessible to `ledgerline_app`.
8. **SECURITY DEFINER Search-Path Hardening**:
   - All 26 privileged functions enforce explicit, safe search paths with `pg_catalog` prioritized and `pg_temp` last.
   - `TEMPORARY` revoked from database, preventing object shadowing in temporary schemas.
9. **Reverse-Proxy Rate Limiting**:
   - Bounded request body parsing (`10kb`). Volumetric rate limiting is placed at the reverse proxy (Nginx/Cloudflare) rather than in-app.
10. **Browser Token Isolation**:
    - Tokens stored in `sessionStorage` (tab-scoped) with memory fallback, avoiding persistent `localStorage`. Enterprise deployments should consider `HttpOnly` cookies.

---

## Setup & Execution Guide

### 1. Configure Environment Variables

Copy template to create local config:
```bash
cp .env.example server/.env
```

Ensure `server/.env` contains your local PostgreSQL credentials:
```env
PORT=5000
NODE_ENV=development
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=ledgerline_dev
DB_USER=ledgerline_app
DB_PASSWORD=your_secure_password
ADMIN_DB_USER=postgres
ADMIN_DB_PASSWORD=your_admin_password
IDENTITY_HMAC_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
JWT_SECRET=super_secure_jwt_secret_min_32_characters_long!
INITIAL_ADMIN_EMAIL=admin@ledgerline.local
INITIAL_ADMIN_PASSWORD=AdminPassword123!
CLIENT_ORIGIN=http://localhost:5173
```

### 2. Run Database Migrations

LedgerLine uses sequential SQL migrations protected by a persistent PostgreSQL advisory lock (`lock_id = 987654321`):

```bash
npm --prefix server run migrate
```

Migrations applied:
- `001_schemas_roles_extensions.sql` — Schema `ledger_secure`, role `ledgerline_owner`, role `ledgerline_app`, `pgcrypto`.
- `002_domain_tables.sql` — 7 core domain tables, constraints, foreign keys, and indexes.
- `003_row_level_security.sql` — `FORCE RLS` on domain tables and non-recursive security helpers.
- `004_integrity_triggers_and_deferred_validator.sql` — Balance triggers, append-only constraints, and commit validator.
- `005_identity_assertions_and_session_context.sql` — HMAC assertion lifecycle and PID-bound session contexts.
- `006_financial_engine_procedures.sql` — Ascending UUID account locking and transaction execution.
- `007_audit_logging.sql` — Append-only audit log triggers and attribution procedures.
- `008_security_remediations.sql` — Hardened finalized transaction immutability and credential de-hardening.
- `009_harden_search_paths_and_schema_privileges.sql` — Revoke `TEMPORARY` on database and harden `search_path` on all 26 functions.

### 3. Secure Bootstrap & Secret Provisioning

```bash
npm --prefix server run bootstrap
```

Provisions runtime role passwords, versioned HMAC authentication secrets, and the initial administrator account (hashed via `scrypt`).

---

## Automated Verification Suites (103 Tests Passing)

### Run Entire Monorepo Test Suite
```bash
npm test
```

### Backend Integration Test Suite (62/62 Passing)
```bash
npm --prefix server test
```
- Tests 1–10: Financial operations (deposit, withdraw, transfer, refusals, idempotency replays).
- Tests 11–17: Concurrency, deadlocks, assertion lifecycles, and user deactivation.
- Tests 18–25: Ledger immutability, balance reconciliation, reversal rules, and context cleanup.
- Tests 26–32: Input sanitization, statements, admin attribution, and session wrapper security.
- Tests 33–35: Search-path hardening, schema privilege locks, and trigger execution denial.
- Tests 36–48: Adversarial RLS isolation, multi-tenant boundaries, and admin resolution.
- Tests 49–55: High-concurrency 10-storm idempotency, reversal races, failure injection, and precision matrices.
- Tests 56–58: Runtime role immutability grants, database BIGINT overflow rollback & retry, and database reconciliation.

### Frontend Unit & Precision Test Suite (41/41 Passing)
```bash
npm --prefix client test
```
- Financial Precision & Conversion (5 tests): String-based paise math, IEEE 754 precision trap prevention.
- Display Formatting (4 tests): Indian numbering formatting (`₹1,00,000.00`).
- Idempotency Key Compliance (2 tests): UUID v4 uniqueness and RFC conformance.
- API Client & Error Normalization (5 tests): Session expiry, 403 handling, 422 refusal preservation.
- Role Boundaries & Idempotency Lifecycle (6 tests): Client role guards, key preservation on failure.
- Ledger Verification (14 tests): Balance and cardinality verification on transaction postings.
- Reversal State Machine (3 tests): Reversal key management across network errors.

---

## Starting the Application

### Development Servers
1. **Backend Server**:
   ```bash
   npm --prefix server run dev
   ```
   Runs Express API on `http://127.0.0.1:5000`.

2. **Frontend Client**:
   ```bash
   npm --prefix client run dev
   ```
   Runs Vite dev server on `http://localhost:5173`.

### Production Build
```bash
npm --prefix client run build
```
Generates production-optimized static assets in `client/dist/`.

---

## Documentation Quick Links

- [RESTful API Reference](docs/API.md)
- [System Architecture & Data Model](docs/ARCHITECTURE.md)
- [Production Deployment Guide](docs/DEPLOYMENT.md)
- [5-Minute Demo Runbook & Hackathon Showcase](docs/DEMO.md)
- [Threat Model & 17 Adversarial Scenarios](THREATS.md)
- [Prompt History Log](PROMPTS.md)
- [Hackathon Submission Checklist](SUBMISSION.md)
