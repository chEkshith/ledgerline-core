# LedgerLine Core — Financial Transaction Management System

LedgerLine is a secure, resilient financial transaction management platform built on the **PERN** stack (PostgreSQL, Express, React, Node.js). 

This repository contains the foundation architecture designed around high auditability, strict ACID transactional integrity, and defensive security engineering.

---

## Architecture & Monorepo Structure

```text
ledgerline-core/
│
├── client/                     # Frontend Application (React + Vite)
│   ├── src/
│   │   ├── services/           # Isolated API communication layer (api.js)
│   │   ├── App.jsx             # Welcome dashboard & health monitor UI
│   │   ├── App.css             # Dashboard styling
│   │   ├── index.css           # Global theme variables & typography
│   │   └── main.jsx            # React root mount
│   ├── index.html              # HTML5 entrypoint
│   ├── vite.config.js          # Vite configuration & dev proxy
│   ├── package.json            # Client dependencies & scripts
│   └── .env.example            # Client environment template
│
├── server/                     # Backend API (Node.js + Express + pg)
│   ├── src/
│   │   ├── config/             # Central DB pool (db.js) & env loader (env.js)
│   │   ├── routes/             # Route definitions (health.routes.js)
│   │   ├── controllers/        # Request/Response orchestration (health.controller.js)
│   │   ├── services/           # Domain logic & system health checks (health.service.js)
│   │   ├── repositories/       # Parameterized SQL database access layer
│   │   ├── middleware/         # Security headers (Helmet), CORS, Error handling
│   │   ├── validators/         # Zod schemas for input validation
│   │   └── utils/              # Minor-unit currency math & utilities
│   ├── package.json            # Server dependencies & scripts (nodemon)
│   ├── .env.example            # Backend environment template
│   └── .env                    # Local environment config (git-ignored)
│
├── database/                   # Database Evolution & Seeding
│   ├── migrations/             # Versioned SQL migration scripts
│   └── seed/                   # Deterministic test & development fixtures
│
├── docs/                       # Architectural specifications & compliance logs
│
├── PROMPTS.md                  # Comprehensive prompt history & intent tracking
├── THREATS.md                  # STRIDE threat model & security controls baseline
├── README.md                   # Installation & operational guide
└── .gitignore                  # Exclusion list for secrets, build artifacts, & dependencies
```

---

## Technology Stack & Core Packages

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | React 18 + Vite | Fast, reactive user interface with hot module replacement. |
| **Backend** | Node.js (v24+) + Express | Robust HTTP application server and REST routing engine. |
| **Database** | PostgreSQL | Enterprise relational database with full ACID compliance. |
| **DB Driver** | `pg` (node-postgres) | High-performance PostgreSQL connection pool with parameterized query support. |
| **Security** | `helmet` | Sets hardened HTTP security response headers (CSP, HSTS, X-Frame-Options). |
| **CORS** | `cors` | Restricts API access exclusively to trusted client origins (`http://localhost:5173`). |
| **Validation**| `zod` | Declarative, runtime type validation at API boundaries. |
| **Dev Tools** | `nodemon` | File-watcher for auto-reloading the backend during local development. |

---

## Core Financial Design Principles

1. **Zero Floating-Point Arithmetic**:
   - Standard floating-point math suffers from precision drift (`0.1 + 0.2 !== 0.3`).
   - All financial amounts are processed and stored as **integer cents** (minor currency units) or PostgreSQL `NUMERIC` types.
2. **Defensive Parameterization**:
   - Dynamic SQL string concatenation is strictly prohibited to prevent SQL injection vulnerabilities. All queries use node-postgres parameter placeholders (`$1, $2, ...`).
3. **Information Disclosure Prevention**:
   - Central error middleware captures unexpected exceptions, logs details internally, and returns sanitized errors without leaking stack traces in production.

---

## Installation & Setup

### 1. Prerequisites
- **Node.js** (v20 or higher recommended, tested on v24)
- **PostgreSQL** (v14 or higher, running locally on port 5432)
- **Git**

### 2. Install Dependencies

You can install dependencies for both `server` and `client` from the project root:

```bash
# On Windows PowerShell:
npm.cmd run install:all

# Or individually:
cd server && npm.cmd install
cd ../client && npm.cmd install
```

### 3. Configure Environment Variables

Create `.env` inside `server/` using the provided template:

```bash
# Copy template to .env
cp server/.env.example server/.env
```

Ensure the database credentials match your local PostgreSQL installation:
```env
PORT=5000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=your_actual_password
DB_POOL_MAX=20
DB_IDLE_TIMEOUT_MS=30000
DB_CONNECTION_TIMEOUT_MS=2000

CLIENT_ORIGIN=http://localhost:5173
```

---

---

## Database Migrations & Seeding (Phase 2)

LedgerLine uses ordered, version-controlled SQL migration scripts located in `database/migrations/`:

| Migration | Purpose |
| :--- | :--- |
| `001_schemas_roles_extensions.sql` | Establishes `ledgerline_owner`, schemas (`public`, `ledger_secure`), and `pgcrypto`. |
| `002_core_tables_and_indexes.sql` | Core schema (users, accounts, memberships, transactions, postings, idempotency, audit). |
| `003_rls_helpers_and_policies.sql` | Non-recursive security helpers, FORCE RLS, and explicit application policies. |
| `004_integrity_triggers_and_deferred_validator.sql` | Balance maintenance, append-only triggers, and deferred commit validator with balance reconciliation. |
| `005_auth_session_and_membership_procedures.sql` | Two-phase assertion lifecycle, user auth, account creation, and serialized membership management. |
| `006_financial_engine_procedures.sql` | Deterministic account locking, deposit/withdrawal/transfer/reversal posting engine, and business refusals. |
| `007_permissions_and_grants.sql` | Explicit least-privilege grants to `ledgerline_app` and function owner assignments. |

### Run Migrations & Seed Data
```bash
# From project root:
node server/scripts/migrate.js

# Or from server directory:
npm.cmd --prefix server run migrate
```

---

## Automated Verification Suite

Phase 2 includes a comprehensive 25-scenario automated test suite executing against the actual local PostgreSQL database:

```bash
# Execute Phase 2 test suite:
npm.cmd --prefix server test
```

### Verified Scenarios:
1. Successful deposit (Vault -> Customer Account).
2. Successful withdrawal (Customer Account -> Vault).
3. Successful transfer (Customer Account -> Customer Account).
4. Insufficient-funds refusal (status=refused, 0 postings, HTTP 422).
5. Frozen account refusal (refusal on frozen accounts).
6. Unauthorized source account rejection.
7. Unauthorized deposit destination rejection.
8. Auditor role financial operation block.
9. Exact idempotency replay (cached response + header).
10. Idempotency payload mismatch (HTTP 409).
11. Concurrent duplicate requests (exactly one transaction created).
12. Concurrent withdrawals overdraw protection (balance non-negative).
13. Opposite-direction transfers (deadlock-free via ascending UUID locking).
14. Assertion replay rejection after commit.
15. Assertion replay rejection after financial rollback.
16. Stale or suspended user assertion rejection.
17. Concurrent final account-holder revocation protection.
18. Ledger posting append-only trigger protection.
19. Finalized transaction posting immutability.
20. Balance reconciliation verification across all accounts.
21. Invalid reversal rejection (endpoint/amount tampering).
22. Duplicate reversal rejection (single-reversal invariant).
23. Pending transaction commit rejection (deferred trigger).
24. Refused transaction zero postings verification.
25. Session context cleanup after commit and rollback.

---

## API Endpoints Implemented

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Service vitality and DB connection latency | No |
| `POST`| `/api/auth/register` | Register customer account | No |
| `POST`| `/api/auth/login` | Authenticate and obtain JWT | No |
| `PATCH`| `/api/auth/status` | Suspend or reactivate user | Admin |
| `POST`| `/api/accounts` | Create customer account (atomic with holder) | Bearer Token |
| `GET` | `/api/accounts` | List caller's authorized accounts | Bearer Token |
| `GET` | `/api/accounts/:id`| Get account balance and details | Bearer Token |
| `PATCH`| `/api/accounts/:id/status` | Freeze (holder/admin), unfreeze or close (admin) | Bearer Token |
| `POST`| `/api/accounts/:id/memberships` | Assign account holder (admin) or auditor (holder) | Bearer Token |
| `DELETE`| `/api/accounts/:id/memberships/:userId` | Revoke membership (prevents last holder removal) | Bearer Token |
| `POST`| `/api/transactions` | Execute deposit, withdrawal, transfer, or reversal | Bearer Token + Idempotency-Key |

---

## Running the Application

### Start Backend Server (with Nodemon)
```bash
cd server
npm.cmd run dev
```
The server will start at `http://localhost:5000`.

### Start Frontend Client (with Vite)
In a separate terminal:
```bash
cd client
npm.cmd run dev
```
The frontend will start at `http://localhost:5173`.

---

## Verification & Health Check

The backend exposes a health check endpoint at `GET /api/health` that runs a `SELECT 1` query to verify that PostgreSQL is actively reachable:

```bash
curl http://localhost:5000/api/health
```

**Sample Healthy Response (`200 OK`):**
```json
{
  "status": "UP",
  "service": "ledgerline-server",
  "version": "1.0.0",
  "uptimeSeconds": 42,
  "timestamp": "2026-11-06T14:20:00.000Z",
  "database": {
    "status": "CONNECTED",
    "driver": "node-postgres (pg)",
    "latencyMs": 4,
    "serverTime": "2026-11-06T19:50:00.000+05:30"
  }
}
```

If the database is unreachable or credentials are incorrect, the endpoint responds with `503 Service Unavailable` detailing the error without crashing the server.

