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

---

## Prompt 10: Phase 4, Task 1 — SECURITY DEFINER Search-Path Audit and Hardening
- **Date**: 2026-11-08
- **Request Summary**:
  1. Audit schema privileges on `ledgerline_test` for `public`, `ledger_secure`, and `pg_temp`.
  2. Audit all 26 `SECURITY DEFINER` functions: verify ownership by `ledgerline_owner`, explicit schema qualification, dynamic SQL absence, and search path safety.
  3. Resolve writable schema and search path risks via additive migration `009_harden_search_paths_and_schema_privileges.sql`:
     - Revoke `TEMPORARY` on database from `PUBLIC` and `ledgerline_app`.
     - Re-enforce `REVOKE CREATE ON SCHEMA public, ledger_secure FROM PUBLIC, ledgerline_app`.
     - Order `ledger_secure` before `public` in function search paths (`SET search_path = pg_catalog, ledger_secure, public, pg_temp`) so security-critical procedures cannot be shadowed by `public`.
     - Set pure logic trigger search paths to `pg_catalog, pg_temp`.
     - Re-enforce execution revokes on `claim_session_identity` and `record_business_refusal` from `PUBLIC` and `ledgerline_app`.
  4. Add automated regression tests (Tests 33, 34, 35) in `server/test/phase2.test.js` validating schema creation locks, temp object prohibition, search-path shadow resistance, and trigger function execution denial.
- **Outcome**: Additive migration `009` applied successfully under advisory lock; server tests expanded to 39/39 passed; client tests 41/41 passed (80/80 total). Development database `ledgerline_dev` preserved.

---

## Prompt 11: Phase 4, Task 2 — Adversarial Authorization & RLS Verification
- **Date**: 2026-11-08
- **Request Summary**:
  1. Build complete authorization matrix across routes, controllers, services, database procedures, and RLS policies for `customer`, `account_holder`, `auditor`, and `admin` roles.
  2. Verify database-level RLS isolation and `FORCE ROW LEVEL SECURITY` across all seven domain tables (`users`, `accounts`, `account_memberships`, `transactions`, `ledger_postings`, `idempotency_keys`, `audit_logs`).
  3. Formulate and implement comprehensive adversarial negative regression test suite (Tests 36 through 46 in `server/test/phase2.test.js`) verifying:
     - Cross-customer account, transaction, and ledger posting read denial under RLS.
     - Indirect leakage defense across statement endpoints and multi-table joins.
     - Cross-account financial operation rejection (deposit, withdraw, transfer).
     - Unauthorized membership assignment and revocation denial.
     - Auditor write operation denial across all financial types and admin-only reversals.
     - Immediate authorization cutoff for revoked members using active sessions.
     - Zero-row isolation on queries with missing or unauthenticated session context.
     - Cryptographic assertion tampering defense (forged roles, corrupt signatures, fake user IDs).
     - Idempotency key namespace isolation preventing cross-user response hijacking.
     - Authentic admin action attribution in immutable audit logs.
  4. Verify authorization concurrency serialization (Test 47): proving determinism when membership revocation races with a financial transaction using parent account row-level locking (`FOR UPDATE`).
- **Outcome**: Server test suite expanded from 39 to 51 passing tests; client test suite 41/41 passing (92/92 total tests passing); production client build verified; development database `ledgerline_dev` preserved.


---

## Prompt 12: Phase 4, Task 2 — Final Authorization Gap Verification (Administrator RLS Clarification)
- **Date**: 2026-11-09
- **Request Summary**:
  1. Investigate reported discrepancy between administrator read privileges in the authorization matrix and domain table RLS policies (`system OR is_account_member(id)`, `creator OR is_account_member(src) OR is_account_member(dest)`, `is_account_member(account_id)`, `own OR is_account_member(account_id)`).
  2. Inspect catalog definitions of `ledger_secure.is_account_member()`, `ledger_secure.is_account_holder()`, `ledger_secure.current_verified_user_id()`, and `ledger_secure.current_verified_user_role()`.
  3. Execute direct SQL queries as `ledgerline_app` with admin session context comparing returned row IDs against ground truth across all tables.
  4. Verify API route consistency across `GET /api/accounts`, `GET /api/accounts/:id`, `GET /api/accounts/:id/statement`, and `GET /api/transactions/:id`.
  5. Add automated regression test (Test 48 in `server/test/phase2.test.js`) verifying:
     - Authenticated administrator matches 100% of rows across accounts, transactions, ledger postings, and memberships.
     - Customer session is strictly isolated to own memberships and accounts.
     - Auditor session is strictly isolated to explicitly granted memberships.
     - Tampering attempts by customer/auditor asserting `admin` role are rejected with `28000` (invalid authorization specification).
- **Outcome**: Confirmed no architectural defect or gap exists—`is_account_member()` explicitly short-circuits to `RETURN TRUE;` when `v_role = 'admin'`, resolving the policy globally without recursion. Added Test 48; server tests expanded to 52/52 passing; client tests 41/41 passing (93/93 total tests passing). Development database `ledgerline_dev` preserved.

---

## Prompt 13: Phase 4, Task 3 — Adversarial Financial Integrity, Idempotency, Concurrency and Failure Testing
- **Date**: 2026-11-09
- **Request Summary**:
  1. Inspect financial engine, idempotency lifecycle, and reversal procedures; establish test coverage matrix.
  2. Implement adversarial idempotency race tests:
     - 10 simultaneous identical requests with identical keys and payloads proving exactly one transaction posts, 9 return idempotent replays, and no duplicate debits/credits occur.
     - Simultaneous key race with conflicting payloads proving exact owner reservation and HTTP 409 conflict rejection on the loser.
     - Pre-commit failure rollback verification proving no stale in-progress idempotency key remains and legitimate retry succeeds.
  3. Implement concurrent reversal race testing two administrators simultaneously reversing the same transaction with different keys, proving exactly one reversal posts, the second receives `ALREADY_REVERSED` (422), balances are restored, and retry with the winning key returns cached response.
  4. Implement failure injection testing atomic rollback across three critical boundaries: during ledger posting insertion, after postings inserted but before commit, and during audit log insertion, verifying zero financial residue and successful retry.
  5. Implement monetary precision and boundary tests verifying rejection of zeros, negatives, decimals, exponential notation, non-numeric strings, NaN, Infinity, and unsafe JS floats (`> MAX_SAFE_INTEGER`), while accepting valid minor currency and large BIGINT strings.
  6. Execute independent database reconciliation verifying all 9 financial consistency invariants return zero violations.
- **Outcome**: Added Tests 49 through 55 in `server/test/phase2.test.js`; server test suite expanded from 52 to 59 passing tests; client test suite 41/41 passing (100/100 total tests passing); production client build clean (6.96s); development database `ledgerline_dev` preserved.

---

## Prompt 14: Phase 4, Task 4 — Final Security Audit, Production Readiness, Documentation and Hackathon Submission Preparation
- **Date**: 2026-11-09
- **Request Summary**:
  1. Complete final Task 4 of Phase 4 and preserve all existing commits (`5d80f1a`, `32b8bee`, `6e82ea6`, `8d6a092`, `dfe8a66`). Preserve `ledgerline_dev` untouched.
  2. Verify clean database installation from empty state on disposable database (`ledgerline_migration_check`): sequentially run migrations 001–009 and bootstrap, verify all 7 tables have `relforcerowsecurity = true`, verify all 26 `SECURITY DEFINER` functions created, then cleanly drop disposable database.
  3. Address Task 3 evidence gaps with automated tests in `server/test/phase2.test.js`:
     - Test 56: Posted transaction and ledger posting immutability under runtime role `ledgerline_app` (permission denied 42501) and owner triggers (trigger enforcement 23514).
     - Test 57: Actual monetary overflow near `MAX_BIGINT` (`9223372036854775800` paise) proving PostgreSQL arithmetic exception `22003`, atomic rollback, and subsequent retry.
     - Test 58: Zero committed in-progress idempotency keys and full reconciliation.
  4. Perform production security audit across auth, API security, secrets, logging/health, and dependencies.
  5. Author comprehensive documentation suite:
     - `docs/API.md`: Complete REST API reference with integer paise examples, status codes, and idempotency replay/conflict behaviors.
     - `docs/ARCHITECTURE.md`: Monorepo layout, Mermaid architecture and transaction lifecycle sequence diagrams, 7-table data model reference, and the 9 financial invariants.
     - `docs/DEPLOYMENT.md`: Production deployment guide, managed PostgreSQL requirements, connection pooling, SSL, secrets generation, health checks, backup/restore runbooks.
     - `docs/DEMO.md`: 5-minute hackathon demo runbook with timestamped steps using safe local data and concise project write-up.
     - `THREATS.md`: Updated STRIDE matrix and exhaustive analysis of all 17 adversarial threat scenarios.
     - `SUBMISSION.md`: Hackathon submission checklist covering all deliverables.
     - `.github/workflows/ci.yml`: GitHub Actions CI pipeline running tests and client build against PostgreSQL 16 container.
  6. Verify all test suites (62 server + 41 client = 103 total passed), verify production client build, commit as `chore: complete Phase 4 release readiness`.
- **Outcome**: Added Tests 56, 57, 58; server test suite expanded from 59 to 62 passing tests; client test suite 41/41 passing (103/103 total tests passing); fresh migration verified on disposable database; production Vite build clean; all documentation deliverables and CI workflow created; development database `ledgerline_dev` preserved; committed cleanly as `f7674b4`.

---

## Prompt 15: Phase 4 Final Closure Verification, Corrections & GitHub Push
- **Date**: 2026-11-09
- **Request Summary**:
  1. Audit and reconcile final Phase 4 baseline without resetting, rebasing, amending, or squashing existing commits (`f7674b4` and `330a34a` preserved).
  2. Correct Test 57 to eliminate artificial direct balance update:
     - Set up an isolated customer account.
     - Execute legitimate financial transaction depositing `9223372036854775800` paise from an isolated system clearing account.
     - Verify customer balance matches sum of postings, clearing account has matching negative debit, and postings sum strictly to zero.
     - Attempt overflow deposit of 100 paise; verify PostgreSQL raises `22003`, leaves no postings, no balance change, and no committed idempotency record.
     - Restore account balance via a legitimate withdrawal operation back to the clearing account.
     - Retry the previously failed idempotency key with a safe balance and verify success.
     - Reconcile both accounts against their ledger postings at the end.
  3. Reassess Zod production dependency advisory (GHSA-mrhx-c7xc-m3w5):
     - Search entire codebase for `z.array`, `z.set`, `z.record`, or dynamic collection validation.
     - Document that Zod is never imported or invoked in any active route, controller, or service.
     - Mark 10 KB Express body limit as defense-in-depth and record advisory as residual dependency risk until upgraded.
  4. Verify PostgreSQL SECURITY DEFINER PUBLIC execution using `aclexplode` with `grantee = 0` across all 26 functions, confirming 0 of 26 executable by PUBLIC and search paths prioritize `pg_catalog` first and `pg_temp` last.
  5. Correct security documentation:
     - Note that Scrypt protects password hashes at rest, not online login brute force; ingress rate limiting is a mandatory deployment gate.
     - Remove absolute "None" residual risk claims and qualify with operational realities.
     - Replace RFC 8785 claims with deterministic JSON canonicalization.
     - Remove unmeasured `~1-5ms` latency claim from `DEMO.md` (to be measured live).
  6. Reconcile remote history: confirm `origin` points to `https://github.com/chEkshith/ledgerline-core.git`, verify Phase 3 commit `5d80f1a` is an ancestor (`git merge-base --is-ancestor origin/main HEAD`), and push all verified commits without force flags.
- **Outcome**: Test 57 rewritten to use 100% balanced financial engine flow; all 62 server tests and 41 client tests (103 total) passed cleanly; documentation reconciled; committed as `test: close final LedgerLine verification gaps`; pushed cleanly to `origin/main`.

---

### Prompt 16 (Phase 4 Final Database Provenance, CI and Dependency Verification)
- **Timestamp**: 2026-11-09T13:01:18+05:30
- **Request Summary**: Investigate `ledgerline_dev` count discrepancy (274 vs 0) using strictly read-only checks; verify Test 57 boundary assertions and clarify dual-boundary exceedance; remove unused `zod` dependency and update lockfile; verify GitHub Actions CI run status and logs; confirm test isolation guards and development database row counts; create single follow-up commit `chore: finalize LedgerLine verification` and push normally without force flags.
- **Outcome**: Read-only investigation proved `ledgerline_dev` was never modified: superuser `postgres` queries see all 274 transactions, 36 accounts, 67 users, 406 postings, while unauthenticated `ledgerline_app` queries are filtered by PostgreSQL Row-Level Security (`FORCE RLS`) to 0/1/0/0. Removed unused `zod` direct dependency (0 production vulnerabilities remaining). Clarified Test 57 double-entry debit underflow / credit overflow boundary mechanics. Updated test isolation host guard to allow Docker container network in CI while strictly requiring `ledgerline_test` database. All 103 tests passing; production client build clean; committed as `chore: finalize LedgerLine verification`; pushed to `origin/main`.
