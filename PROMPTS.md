# LedgerLine — Prompt History Log

This document records prompts and development requests executed during the lifecycle of the LedgerLine project to preserve architectural intent, auditability, and traceability.

---

## Prompt 1: Initial Project Setup
- **Date**: 2026-11-06
- **Request**:
```markdown
# LedgerLine — Initial Project Setup

You are my senior full-stack development agent. Help me establish the foundation of LedgerLine, a secure financial transaction management system.

## Technology stack

- Frontend: React + Vite
- Backend: Node.js + Express.js
- Database: PostgreSQL
- Database driver: `pg` (node-postgres)
- Validation: Zod
- Security middleware: Helmet
- Development environment: Windows
- Version control: Git

## Your task

First, inspect the current project directory. Then create a clean, maintainable PERN monorepo structure.

```text
ledgerline-core/
│
├── client/
│   └── src/
│
├── server/
│   └── src/
│       ├── config/
│       ├── routes/
│       ├── controllers/
│       ├── services/
│       ├── repositories/
│       ├── middleware/
│       ├── validators/
│       └── utils/
│
├── database/
│   ├── migrations/
│   └── seed/
│
├── docs/
│
├── PROMPTS.md
├── THREATS.md
├── README.md
└── .gitignore
```

## Backend requirements

1. Initialise an Express application.
2. Configure a PostgreSQL connection pool using `pg`.
3. Read database credentials from environment variables.
4. Create a central database configuration file.
5. Create a basic `/api/health` endpoint.
6. The health endpoint should verify that PostgreSQL is reachable using a simple `SELECT 1` query.
7. Add central error-handling middleware.
8. Add JSON request parsing and Helmet.
9. Configure CORS for the local React frontend.
10. Add a development script using nodemon.

## Frontend requirements

1. Initialise React using Vite.
2. Create a simple LedgerLine welcome page.
3. Display backend connection status using the health endpoint.
4. Keep frontend API calls in a separate service file.

## Configuration requirements

Create:

- `.env.example` with placeholder configuration.
- `.gitignore` that excludes `.env`, `node_modules`, build output and other sensitive/generated files.
- A README explaining installation and startup.

Do not put actual passwords or API keys in tracked files.

## Documentation

Create initial `PROMPTS.md` and `THREATS.md` templates.

Record this actual setup request in PROMPTS.md with its date. Do not invent future prompts, errors, corrections, commits or test results.

## Important restrictions

- Do not implement authentication yet.
- Do not implement money transfers yet.
- Do not create the final financial schema yet.
- Do not generate fake transaction data.
- Do not use MongoDB.
- Do not use floating-point values for money.
- Do not automatically commit or push changes.
- Do not overwrite existing files without showing me first.

## Before finishing

1. Explain the folder structure.
2. Show the packages installed and why.
3. Show the environment variables required.
4. Explain how to start the backend and frontend.
5. Run the relevant installation and startup checks.
6. Verify that Express can successfully connect to my local PostgreSQL database.
7. Report any errors honestly.

Work incrementally and explain important decisions in beginner-friendly language. Do not move to the financial implementation until I review and approve this foundation.
```

---

## Prompt 2: Phase 2 Implementation Authorization & Delivery
- **Date**: 2026-11-07
- **Request**:
```markdown
# LedgerLine — Phase 2 Implementation Authorization

You are now authorized to implement **Phase 2: Database Schema, Financial Integrity, Authentication Context, and Transaction Engine** for LedgerLine.

The latest architectural specification is a starting point, NOT an unquestionable source of truth. Your first responsibility is to correct the remaining defects identified below. Do not blindly copy the SQL.

## Mandatory architectural corrections
- Assertion replay protection (two-phase committed registration + financial claim).
- Complete RLS and ownership design (FORCE RLS, owner bypass, least-privileged ledgerline_app).
- Correct account authorization (deposit destination holder/admin check, withdrawal source holder/admin, transfer source holder/admin, auditor read-only).
- Complete idempotency and duplicate handling (unique tx binding, method/path/payload verification, exact cached replay).
- Correct session-context cleanup (capture txid while active, delete by txid/pid post-commit/rollback).
- Complete financial integrity (integer paise BIGINT, 2 balanced postings, append-only, deferred commit validator with balance reconciliation).
- Complete missing definitions and executable automated test suite covering 25 test cases.
```
- **Implementation Status**: Completed and verified. All 7 migrations applied, System Vault and admin seeded, all 25 automated tests passed.


