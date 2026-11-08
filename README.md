# LedgerLine Core — Financial Transaction Management System

LedgerLine is a secure, resilient financial transaction management platform built on the **PERN** stack (PostgreSQL, Express, React, Node.js). 

Designed for mission-critical money movement, LedgerLine enforces strict ACID transactional integrity, immutable double-entry bookkeeping, Row-Level Security, zero floating-point arithmetic, and defensive cryptographic session contexts.

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
│   │   ├── services/           # Centralized API client (api.js with token injection & error normalization)
│   │   ├── utils/              # formatters.js (rupeesToPaise, paiseToRupees, generateIdempotencyKey)
│   │   ├── App.jsx             # React Router routing & layout root
│   │   ├── index.css           # Tailwind v4 import & custom styling
│   │   └── main.jsx            # React root mount
│   ├── test/                   # Frontend Unit Tests (node:test)
│   │   └── frontend.test.js    # Financial precision, BigInt paise, and UUID tests
│   ├── package.json            # Client dependencies & scripts
│   └── vite.config.js          # Vite config with @tailwindcss/vite and /api proxy
│
├── server/                     # Backend API (Node.js + Express + pg)
│   ├── scripts/                # Database migration and bootstrap scripts
│   │   ├── migrate.js          # Advisory-locked sequential migration runner
│   │   └── bootstrap.js        # Secure role, HMAC secret & admin provisioner
│   ├── src/
│   │   ├── config/             # DB pool (db.js) & validated env loader (env.js)
│   │   ├── routes/             # Auth, Account, Transaction, and Health routers
│   │   ├── controllers/        # Request/Response orchestration
│   │   ├── services/           # Business logic, idempotency, session contexts
│   │   ├── middleware/         # Auth verification, Helmet, CORS, Error handling
│   │   └── utils/              # RFC 8785 JSON canonicalizer, HMAC, scrypt, sessionContext
│   ├── test/                   # Automated integration test suite
│   │   └── phase2.test.js      # 30-scenario comprehensive integration test suite
│   ├── package.json            # Server dependencies & npm scripts
│   └── .env.example            # Server environment configuration template
│
├── database/                   # Database Evolution & Seeding
│   ├── migrations/             # Versioned SQL migrations (001 - 008)
│   ├── seed/                   # Structural System Vault seed (001_initial_seed.sql)
│   └── backups/                # Local database dumps (git-ignored)
│
├── PROMPTS.md                  # Comprehensive prompt history & intent tracking
├── THREATS.md                  # STRIDE threat model & security controls baseline
├── README.md                   # Installation & operational guide
└── .gitignore                  # Exclusion list for secrets, build artifacts, & dumps
```

---

## Core Financial & Security Principles

1. **Integer Paise Arithmetic (Zero Floating-Point Operations)**:
   - Floating-point representations (IEEE 754) suffer from precision rounding errors (`0.1 + 0.2 !== 0.3` and `10.55 * 100 === 1054.9999999999998`).
   - All financial amounts are strictly processed and stored as **integer paise** (`BIGINT`, where ₹1.00 = 100 paise).
   - On the frontend, `rupeesToPaise` uses string splitting and BigInt arithmetic to eliminate float contamination before transmission.
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
7. **FORCE Row-Level Security**:
   - Enforced on all domain tables (`users`, `accounts`, `account_memberships`, `transactions`, `ledger_postings`, `idempotency_keys`, `audit_logs`).
   - Private schema `ledger_secure` is completely inaccessible to `ledgerline_app`.

8. **Mandatory Test Database Isolation**:
   - Integration tests execute strictly against a dedicated `ledgerline_test` database.
   - An environment guard in `server/test/phase2.test.js` halts test execution if `DB_NAME` is `ledgerline_dev` or production, protecting development and live data from accidental mutation or truncation.

---

## Setup & Execution Guide

### 1. Configure Environment Variables

Configure `server/.env` (development):

```env
PORT=5000
NODE_ENV=development

# Database connection settings (Runtime app role)
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=ledgerline_dev
DB_USER=ledgerline_app
DB_PASSWORD=postgres123
DB_POOL_MAX=20
DB_IDLE_TIMEOUT_MS=30000
DB_CONNECTION_TIMEOUT_MS=2000

# Administrative / Migration connection settings (Bootstrap only)
ADMIN_DB_USER=postgres
ADMIN_DB_PASSWORD=postgres123

# Security Secrets
IDENTITY_HMAC_SECRET=c3f9a7810b42c65893a2e1d0f59b6742819e64d7c0f1e8a3b59247610dc85a91
JWT_SECRET=super_secure_jwt_secret_ledgerline_2026_dev_key_only
HMAC_KEY_VERSION=1

# Initial Administrator Credentials (Bootstrap only)
INITIAL_ADMIN_EMAIL=admin@ledgerline.local
INITIAL_ADMIN_PASSWORD=Admin@123!

# Client origin for CORS
CLIENT_ORIGIN=http://localhost:5173
```

For testing, `server/.env.test` is provided and pre-configured for `DB_NAME=ledgerline_test`.

### 2. Run Database Migrations

LedgerLine uses sequential SQL migrations protected by a persistent PostgreSQL advisory lock (`lock_id = 987654321`):

```bash
npm --prefix server run migrate
```

Migrations applied:
- `001_schemas_roles_extensions.sql` — Establishes `ledgerline_owner` role, schemas `public` and `ledger_secure`, and `pgcrypto`.
- `002_core_tables_and_indexes.sql` — Domain tables, constraints, foreign keys (`ON DELETE RESTRICT`), and unique indexes.
- `003_rls_helpers_and_policies.sql` — Non-recursive security helpers and `FORCE RLS` policies.
- `004_integrity_triggers_and_deferred_validator.sql` — Balance maintenance, append-only triggers, and deferred commit validator.
- `005_auth_session_and_membership_procedures.sql` — Auth lifecycle, assertion management, account creation, and membership logic.
- `006_financial_engine_procedures.sql` — Ascending UUID account locking, transaction execution, and business refusals.
- `007_permissions_and_grants.sql` — Explicit least-privilege grants to `ledgerline_app`.
- `008_security_remediations.sql` — Additive migration installing independent assertion consumption, finalized transaction immutability triggers, and least-privilege revokes.
- `seed/001_initial_seed.sql` — Seeds `SYSTEM_CASH_VAULT` account (0 paise initial balance).

### 3. Secure Bootstrap & Secret Provisioning

Run the secure bootstrap script to provision runtime role credentials, versioned HMAC authentication secrets, and the initial administrator account (hashed via `scrypt`):

```bash
npm --prefix server run bootstrap
```

---

## Automated Verification Suites

### Run All Tests Across Monorepo
```bash
npm test
```

### Backend Integration Test Suite (30/30 Passing)
```bash
npm --prefix server test
```
1. **Successful deposit**: Transfers from Vault to Customer Account.
2. **Successful withdrawal**: Transfers from Customer Account to Vault.
3. **Successful transfer**: Transfers between two customer accounts.
4. **Insufficient-funds refusal**: Records status=refused, 0 postings, HTTP 422.
5. **Frozen account refusal**: Refuses operations involving frozen accounts.
6. **Unauthorized source account**: Rejects customer debiting another user account.
7. **Unauthorized deposit destination**: Rejects deposit into another customer account.
8. **Auditor role financial operation block**: Auditor role cannot initiate transfers.
9. **Exact idempotency replay**: Returns cached response without duplicate execution.
10. **Idempotency payload mismatch**: Re-using key with different amount returns HTTP 409.
11. **Concurrent duplicate requests**: Exactly one transaction processed (`isIdempotentReplay === false`) and 2 postings exist.
12. **Concurrent withdrawals**: Account balance cannot become negative.
13. **Opposite-direction transfers**: Concurrent A->B and B->A succeed without deadlock.
14. **Assertion replay after successful commit**: Assertion cannot be reused in another transaction.
15. **Assertion replay after financial rollback**: Nonce consumption survives rollback.
16. **Stale or suspended user assertion**: Deactivating user rejects assertion immediately.
17. **Concurrent final account-holder revocation**: Serialized check prevents 0 holders.
18. **Ledger posting mutation attempt**: Distinguishes grant denial from trigger enforcement.
19. **Finalized transaction immutability**: Trigger blocks update or deletion of finalized transactions.
20. **Balance reconciliation**: Commit validator detects corrupted balance and aborts commit.
21. **Invalid reversal**: Endpoint tampering or mismatched amount is rejected.
22. **Duplicate reversal**: An already reversed transaction cannot be reversed again.
23. **Pending transaction at commit**: Deferred trigger aborts commit if still pending.
24. **Refused transaction zero postings**: Validator verifies exactly 0 postings exist.
25. **Session context cleanup**: Captures backend PID and txid, proves context deleted post-commit and post-rollback.
26. **Input validation**: Rejects unsafe integers, floats, negatives, and non-digits.
27. **Transaction read API**: Retrieves transaction details and dual postings with authorization.
28. **Account statement API**: Returns postings, running balance, and pagination.
29. **Admin action attribution**: Records verified admin actor ID, role, and metadata in `audit_logs`.
30. **Admin authorization enforcement**: Blocks non-admin callers and rejects stale/demoted roles.

### Frontend Unit, Auth & Error Handling Suite (21/21 Passing)
```bash
npm --prefix client test
```
- **Financial Precision & Conversion (5 tests)**:
  - Exact whole rupee to integer paise conversion (`rupeesToPaise`).
  - Two-decimal rupee string conversion with IEEE-754 floating-point trap verification (`10.55` $\to$ `1055`).
  - One-decimal rupee string padding (`5.5` $\to$ `550`).
  - Safe numeric input handling.
  - Strict rejection of zeroes, negative values, extra decimals, and non-digit strings.
- **Display Formatting (4 tests)**:
  - Positive paise to Indian Rupee string formatting (`paiseToRupees`).
  - Indian numbering system comma placement (`10000000` paise $\to$ `₹1,00,000.00`).
  - Negative paise currency rendering (`-1000` paise $\to$ `-₹10.00`).
  - Graceful handling of zero and empty inputs.
- **Idempotency Key Generation (2 tests)**:
  - UUID v4 regular expression conformance (`generateIdempotencyKey`).
  - Uniqueness and collision prevention across successive calls.
- **Timestamp Formatting (2 tests)**:
  - ISO timestamp to localized display string.
  - Null/undefined placeholder fallback.
- **API Client & HTTP Error Normalization (5 tests)**:
  - 401 Unauthorized handling: purges session storage and dispatches `ledgerline:session_expired` event.
  - 403 Forbidden handling: extracts backend privilege error without prematurely purging authentication.
  - 422 Transaction Refusal: preserves refused business status and reason payload.
  - Header injection: verifies `Authorization: Bearer <token>` and `Idempotency-Key` headers.
  - Replay header detection: identifies server `Idempotent-Replay: true` response header.
- **Role Boundaries & Storage Security (3 tests)**:
  - Role authorization matrix (customer vs auditor vs admin).
  - Idempotency key preservation on network failure and key rotation on successful transaction.
  - Secure session storage lifecycle (store, retrieve, purge).

---

## API Endpoints Implemented

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Service vitality and DB connection latency | Public |
| `POST`| `/api/auth/register` | Register customer account | Public |
| `POST`| `/api/auth/login` | Authenticate and obtain JWT | Public |
| `PATCH`| `/api/auth/status` | Suspend or reactivate user (admin-only, audit-tracked) | `admin` |
| `GET` | `/api/accounts` | List caller's authorized accounts | Bearer Token |
| `POST`| `/api/accounts` | Create customer account (atomic with holder) | Bearer Token |
| `GET` | `/api/accounts/:id`| Get account balance and details | Bearer Token |
| `PATCH`| `/api/accounts/:id/status` | Update account status (`active`, `frozen`, `closed`) | Bearer Token |
| `POST`| `/api/accounts/:id/memberships` | Assign account membership (`account_holder`, `auditor`) | Bearer Token |
| `DELETE`| `/api/accounts/:id/memberships/:userId` | Revoke membership (enforces $\ge 1$ active holder) | Bearer Token |
| `GET` | `/api/accounts/:id/statement` | Paginated account statement with running balances | Account Member / Auditor / Admin |
| `POST`| `/api/transactions` | Core financial transaction processor | Bearer Token + Idempotency-Key |
| `POST`| `/api/transactions/deposit` | Deposit from System Vault to Account | Account Member + Idempotency-Key |
| `POST`| `/api/transactions/withdraw` | Withdraw from Account to System Vault | Account Holder + Idempotency-Key |
| `POST`| `/api/transactions/transfer` | Transfer between two accounts | Account Holder + Idempotency-Key |
| `POST`| `/api/transactions/:id/reverse` | Reverse a posted transaction | `admin` + Idempotency-Key |
| `GET` | `/api/transactions/:id` | Get transaction details and postings | Participant / Auditor / Admin |

---

## Starting the Application

### Development Servers

1. **Backend Server**:
   ```bash
   npm run dev:server
   ```
   Runs Express on `http://127.0.0.1:5000`.

2. **Frontend Client**:
   ```bash
   npm run dev:client
   ```
   Runs Vite dev server on `http://localhost:5173`.

### Production Build
```bash
npm run build:client
```
Generates production-optimized static assets in `client/dist/`.
