# LedgerLine — Prompt History Log

This document records the genuine prompt history and development requests executed during the lifecycle of the LedgerLine project to preserve architectural intent, auditability, and traceability.

---

## Prompt 1: Initial Project Setup
- **Date**: 2026-11-06
- **Request Summary**: Initialise monorepo structure (`client/`, `server/`, `database/`), setup Express server with `pg` connection pool, Helmet, CORS, centralized error handling, `/api/health` connectivity probe, React/Vite frontend stub, and initial documentation templates.
- **Outcome**: Clean Phase 1 scaffold established, health check verified against local PostgreSQL, no financial logic or fake data implemented.

---

## Prompt 2: Architectural Review — Database Privileges & Row-Level Security
- **Date**: 2026-11-07
- **Request Summary**: Security review addressing runtime database privilege escalation risks in `ledgerline_app`. Replace forgeable session-context settings (`app.current_user_id`) with cryptographically verified identity contexts. Formulate non-recursive RLS helper functions (`is_account_member`, `is_account_holder`) and eliminate recursive membership queries under `FORCE ROW LEVEL SECURITY`.
- **Outcome**: Specified `ledger_secure` schema, `FORCE RLS` on domain tables, owner bypass policies, and non-recursive membership helper functions.

---

## Prompt 3: Architectural Review — Identity Assertion & Nonce Replay Lifecycle
- **Date**: 2026-11-07
- **Request Summary**: Review addressing caller identity spoofing and replay attacks. Reject raw caller-supplied UUIDs. Formulate canonical HMAC-SHA256 signature specification (RFC 8785) with UTC timestamps, lifetime guards ($\le 30\text{s}$), and single-use nonce lifecycle that survives financial transaction rollback.
- **Outcome**: Designed independent assertion consumption table `ledger_secure.consumed_assertions` and PID-bound session establishment procedure.

---

## Prompt 4: Architectural Review — Concurrency, Idempotency & Deferred Integrity
- **Date**: 2026-11-07
- **Request Summary**: Resolve concurrency deadlocks occurring during bidirectional transfers (`KEY SHARE` vs `FOR UPDATE`). Design deterministic ascending UUID locking (`LEAST(src, dest) < GREATEST(src, dest)`). Specify deferred commit validator trigger running at `COMMIT` to inspect live rows and reconcile cached account balances against sum of postings. Formulate idempotency reservation, payload hash validation, and cached replay lifecycle.
- **Outcome**: Established complete procedural engine specifications in `004_integrity_triggers_and_deferred_validator.sql` and `006_financial_engine_procedures.sql`.

---

## Prompt 5: Phase 2 Implementation Authorization & Initial Delivery
- **Date**: 2026-11-07
- **Request Summary**: Authorize implementation of Phase 2: Database Schema, Financial Integrity, Authentication Context, and Transaction Engine. Apply migrations `001` through `007` to local `ledgerline_dev` database, create backend services, controllers, routes, session context management, and build 25-case automated integration test suite.
- **Outcome**: Migrations and seeds executed, backend Express services implemented, and initial 25 integration tests executed.

---

## Prompt 6: Phase 2 Security Remediation and Independent Verification
- **Date**: 2026-11-08
- **Request Summary**: Independent code review remediation:
  1. Remove hardcoded passwords from migrations (`001_schemas_roles_extensions.sql`) and hardcoded secrets/admin users from seeds (`001_initial_seed.sql`).
  2. Eliminate fallback secrets from configuration and hardcoded password bypass from `verifyPassword()`. Validate 64-hex HMAC keys and $\ge 32$-character JWT secrets at startup.
  3. Create explicit, secure bootstrap procedure (`server/scripts/bootstrap.js`) provisioning runtime role passwords, versioned HMAC secrets, and scrypt-hashed admin users.
  4. Redesign assertion lifecycle: independent commit for registration and consumption before financial execution begins; verified session context established inside financial transaction; assertion reuse blocked across both successful commit and financial rollback.
  5. Install database trigger `trg_protect_finalized_transactions` preventing mutation/deletion of posted/refused transactions.
  6. Revoke direct `UPDATE (transaction_id)` privileges on `idempotency_keys` from `ledgerline_app`.
  7. Implement PostgreSQL advisory locking (`pg_advisory_lock(987654321)`) on migration runner.
  8. Implement transaction read endpoint `GET /api/transactions/:id` and paginated account statement endpoint `GET /api/accounts/:id/statement` with running balances and anti-leakage RLS.
  9. Add safe integer / BIGINT string money validation rejecting unsafe numbers, floats, negatives, and non-digits.
  10. Expand automated test suite to 28 comprehensive cases against real PostgreSQL with genuinely parallel connections.
- **Outcome**: Additive migration `008_security_remediations.sql` applied under advisory lock; secure bootstrap executed; all 28 automated integration tests executed and passed (100% pass rate).

---

## Prompt 7: Phase 3 — Frontend Development, API Integration & Phase 2 Security Corrections
- **Date**: 2026-11-08
- **Request Summary**:
  1. Inspect existing project structure, frontend, and backend API contracts.
  2. Mandatory Phase 2 security corrections:
     - Admin action attribution in `auth.service.js` (establish admin session context so DB checks actor's current admin role, audit log records true actor, reject stale/demoted JWTs, prevent caller ID spoofing).
     - Session context cleanup in `sessionContext.js` (capture PID and txid, verify `clear_session_identity`, discard/destroy client connection via `client.release(true)` if cleanup fails, preserve original transaction result/error).
     - Verified identity and role freshness in assertions/procedures (check current DB status and role; stale JWT cannot keep admin role; client cannot choose trusted ID/role).
     - Enforce production constraints in `env.js` and `bootstrap.js` (no silent fallbacks in production).
     - Fix Test 11 (assert winner `isIdempotentReplay === false`) and Test 25 (capture PID and txid, verify context purged on commit and rollback).
     - Add Test 29 (admin action attribution in audit logs) and Test 30 (admin authorization and stale role rejection).
  3. Build complete, responsive React frontend (React 18 + Vite + Tailwind CSS v4 + React Router v7 + Lucide React):
     - Auth: Login, Register, Logout, Protected routes, automatic session expiry handler.
     - Dashboard: KPI cards, total balance in INR (BigInt integer paise conversion), active accounts overview, quick actions.
     - Account Management: List accounts, Open customer account modal, Account detail view with running balance ledger statement pagination, membership assignment/revocation, status change.
     - Money Movement Engine: Deposit (Vault $\to$ Account), Withdraw (Account $\to$ Vault), Transfer (Account $\to$ Account), auto-generated UUID v4 idempotency keys with visible key management and duplicate replay verification.
     - Admin Governance: User status activation/suspension with audit logging, administrative ledger reversals.
     - Transaction Proof: Double-entry postings inspection, zero-sum balance verification ($\sum = 0$), immutable status inspection.
     - Health Monitor: Live auto-polling of Express server and PostgreSQL database latency.
  4. Write comprehensive frontend unit tests (13 tests verifying zero floating-point arithmetic, BigInt paise conversion, Indian currency formatting, UUID v4 compliance).
- **Outcome**: Backend integration tests expanded to 30/30 passed (100%); frontend unit tests 13/13 passed (100%); Vite production build successfully generated (45.56 kB CSS, 285.18 kB JS).

---

## Prompt 8: Phase 3 Security Remediation & Pre-Approval Audit
- **Date**: 2026-11-08
- **Request Summary**:
  1. Remove `localStorage` authentication storage and fallback from `client/src/services/api.js`; restrict browser token persistence strictly to `sessionStorage` with graceful in-memory storage fallback.
  2. Implement null-safe admin authorization in `set_user_status` using `IS DISTINCT FROM 'admin'` and authoritative database checks.
  3. Strengthen `verifyLedgerPostings` on frontend to enforce exactly 2 postings, strictly negative debit and positive credit, zero-sum `BigInt` balance, magnitude equality with transaction amount, currency and account endpoint matching.
  4. Implement immutable reversal operation management (`transitionReversalState`) in UI to preserve idempotency key across network retries, while rotating key upon reason modification, transaction navigation, or settlement success.
  5. Harden test harness and migration runner to strictly verify host (`127.0.0.1` / `::1`), port, and database name (`ledgerline_test`) to guarantee development database preservation.
- **Outcome**: Client tests expanded to 41/41 passing; server tests expanded to 35/35 passing. Development database `ledgerline_dev` preserved.

---

## Prompt 9: Final Security Closure & Phase 3 Completion Authorization
- **Date**: 2026-11-08
- **Request Summary**:
  1. Revoke `EXECUTE` on compatibility wrapper `ledger_secure.claim_session_identity` from both `PUBLIC` and `ledgerline_app`; enforce independent 3-stage lifecycle (`register` $\to$ `consume` committed $\to$ `establish` within financial transaction).
  2. Add backend SQL test (Test 32) proving `ledgerline_app` cannot execute `claim_session_identity`.
  3. Run comprehensive catalog audit of all 26 `SECURITY DEFINER` functions verifying `PUBLIC` cannot execute any, `ledgerline_app` can execute only authorized entry points, and search paths have `pg_temp` last.
  4. Run full test suites: 36 backend tests, 41 frontend tests (77/77 passed).
  5. Confirm production client build succeeds with zero errors.
  6. Stage and commit all verified Phase 3 work with message `feat: complete LedgerLine Phase 3 application`.
- **Outcome**: All security closures verified, 77/77 tests passed, client built in 5.55s, and Phase 3 committed cleanly.
