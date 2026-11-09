# LedgerLine — Threat Model & Security Posture

Version: 1.0.0
Status: Production Baseline
Classification: Enterprise Financial Security

---

## 1. Scope & Security Objective

LedgerLine processes and records multi-tenant financial movements with strict mathematical consistency, non-repudiation, and defense-in-depth isolation.

The security architecture enforces:
- **Minor-Currency Arithmetic**: Integer minor currency units (`BIGINT` paise) avoiding binary floating-point rounding in core money math.
- **Layered Defense**: Route Validation $\to$ Controller Checks $\to$ Service HMAC Assertions $\to$ PostgreSQL `FORCE RLS` $\to$ Database Triggers & Constraints.
- **Principle of Least Privilege**: Explicit separation between `ledgerline_owner` (`NOLOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`) and `ledgerline_app` (read-mostly runtime role).
- **Non-Replayable Session Contexts**: HMAC-SHA256 assertions with 30s lifetime and single-use nonces consumed in independently committed transactions.
- **Append-Only Immutability**: Posted transactions, ledger postings, and audit logs cannot be updated or deleted by any application role or trigger.

---

## 2. Threat Modeling Framework: STRIDE Matrix

| Threat Category | Potential Risk in LedgerLine | Implemented Mitigation Strategy | Primary Enforcement Tier |
| :--- | :--- | :--- | :--- |
| **Spoofing** | Impersonation of legitimate users or forging database session identity. | Cryptographic HMAC assertions with 30s expiry and single-use nonce; verified database session context bound to `(pg_backend_pid(), txid_current())`; scrypt password hashing; admin action attribution verifying authoritative database role in real time. | Database & Backend |
| **Tampering** | Modifying transaction amounts, mutating historical postings, altering account balances. | Double-entry zero-sum ledgering ($\sum \Delta = 0$); integer paise arithmetic (`BIGINT`); append-only triggers on `ledger_postings` and `audit_logs`; `trg_protect_finalized_transactions` preventing update/deletion of posted/refused transactions; deferred balance reconciliation at commit; frontend string-based BigInt parsing avoiding binary floating-point rounding. | Database Triggers |
| **Repudiation** | An actor denies executing a financial transaction or administrative action. | Immutable audit log trail with verified actor ID, authoritative role, timestamp, and metadata; cryptographic request payload hashing with deterministic JSON canonicalization. | Database & Triggers |
| **Information Disclosure** | Leakage of balances, transaction history, credentials, or PII. | PostgreSQL `FORCE ROW LEVEL SECURITY` across all 7 domain tables; non-recursive RLS helpers; posting RLS strictly preventing cross-account leakage; sanitized error handler masking internal errors; automatic token clearance on session expiry. | Database (RLS) |
| **Denial of Service (DoS)** | Deadlocks on concurrent transfers, replay storms, connection pool exhaustion. | Deterministic ascending UUID account locking; request idempotency reservation with cached replay; 3s database lock timeout; advisory locking on migrations (`pg_advisory_lock`); connection discard (`client.release(true)`) preventing pool contamination on unconfirmed cleanup; 10 KB request body limit. | Database & Express |
| **Elevation of Privilege** | Runtime application role modifying permissions, bypassing RLS, or creating admin accounts. | `ledgerline_owner` is `NOLOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`; `ledgerline_app` has strictly read-mostly table grants; direct `UPDATE` on `idempotency_keys` revoked; user registration restricted to `customer` role; demoted/stale JWTs blocked by database assertion checks; `TEMPORARY` privilege revoked from database preventing `pg_temp` object injection; `SECURITY DEFINER` search paths hardened (`pg_catalog, ledger_secure, public, pg_temp`). | Database Grants |

---

## 3. Financial Integrity Invariants

1. **Integer Paise Arithmetic (Avoiding Binary Floating-Point Math)**:
   - All financial amounts are represented and calculated in minor currency units (**integer paise**, `BIGINT`, where ₹1.00 = 100 paise), avoiding IEEE 754 binary floating-point rounding in core money movement calculations (without claiming this alone eliminates every potential financial calculation defect).
   - Frontend parses decimal inputs using string splitting and native `BigInt` math (`rupeesToPaise`), never passing floats over the wire.
   - Backend validates integers within PostgreSQL `BIGINT` range, rejecting negatives, floats, fractions, and unsafe JavaScript integers.
2. **Double-Entry Invariant**:
   - Every posted transaction must produce exactly two balanced postings: one debit and one credit of identical magnitude ($\text{debit} + \text{credit} = 0$).
   - Refused transactions produce exactly zero postings.
3. **Deferred Balance Reconciliation**:
   - A deferred constraint trigger evaluates at `COMMIT` time under exclusive account locks.
   - Re-reads live rows from `public.transactions` and validates that `cached_balance == SUM(signed_amount_paise)` across all postings.

---

## 4. Comprehensive 17-Scenario Adversarial Threat Analysis

### 1. Unauthorized Account Access and IDOR
- **Threat**: Attacker tampers with account UUID parameters in URLs (`GET /api/accounts/:id` or statement queries) to inspect balances and transactions of accounts they do not own.
- **Attacker Profile**: Authenticated customer or external attacker with valid credentials.
- **Attack Vector**: Insecure Direct Object Reference (IDOR) parameter tampering.
- **Defensive Mechanism**:
  - **Database-Enforced**: PostgreSQL `FORCE ROW LEVEL SECURITY` on `public.accounts` evaluates `ledger_secure.is_account_member(id)`. Non-members receive 0 rows.
  - **Backend-Enforced**: Express controller checks route authorization before executing downstream logic.
- **Verification Test**: Test 36 (`Adversarial RLS isolation: Customer A cannot read Customer B account`) and Test 38 (`Statement & Join Indirect Leakage Resistance`).
- **Residual Risk**: Administrator account compromise allows global reading (administrators have global read per design).

---

### 2. Membership Abuse and Privilege Escalation
- **Threat**: Customer attempts to assign themselves or other users as `account_holder` or `admin` on unauthorized accounts, or an auditor attempts to grant themselves transfer privileges.
- **Attacker Profile**: Authenticated customer or compliance auditor.
- **Attack Vector**: Submitting `POST /api/accounts/:id/memberships` with elevated roles.
- **Defensive Mechanism**:
  - **Database-Enforced**: `assign_account_membership()` procedure verifies that caller is a verified `account_holder` of the target account or an `admin`. Role assignment CHECK constraint restricts membership roles strictly to `account_holder` or `auditor`.
  - **Backend-Enforced**: User registration endpoint `/api/auth/register` hardcodes `role = 'customer'`, preventing self-registration of administrative or auditor accounts.
- **Verification Test**: Test 40 (`Unauthorized Membership Modification Denial`) and Test 44 (`Identity & Role Anti-Tampering`).
- **Residual Risk**: Legitimate account holder accidentally assigning an untrusted user as co-holder.

---

### 3. Session Assertion Forgery and Replay
- **Threat**: Attacker intercepts or fabricates an identity assertion to establish an arbitrary database session context, or replays an assertion after an operation aborts.
- **Attacker Profile**: Network interceptor or rogue actor with access to API logs.
- **Attack Vector**: Submitting a previously used HMAC assertion or forging signature with guessable key.
- **Defensive Mechanism**:
  - **Database-Enforced**:
    - **Independent Nonce Lifecycle**: Nonce consumption commits independently in Phase 1 before financial transaction begins. If financial execution rolls back, the nonce remains committed as `CONSUMED` in `ledger_secure.consumed_assertions`.
    - **Lifetime Window**: Assertions must be timestamped within 30 seconds of `clock_timestamp()`.
  - **Backend-Enforced**: HMAC-SHA256 generated using high-entropy 32-byte secret (`IDENTITY_HMAC_SECRET`).
- **Verification Test**: Test 14 (`Assertion replay after successful commit`), Test 15 (`Assertion replay after financial rollback`), and Test 44 (`Identity & Role Anti-Tampering`).
- **Residual Risk**: Assertion intercepted and replayed within the 30-second window before original caller completes Phase 1 consumption. Mitigated by TLS 1.3 transport encryption.

---

### 4. Stale Role and Suspended-User Abuse
- **Threat**: A user deactivated or demoted by an administrator continues to perform operations using an unexpired JWT token.
- **Attacker Profile**: Suspended customer or demoted administrator holding active JWT.
- **Attack Vector**: Making API calls with unexpired JWT before token natural expiration.
- **Defensive Mechanism**:
  - **Database-Enforced**: `ledger_secure.register_identity_assertion()` queries `public.users` live at assertion creation time; rejects with SQL exception if `status != 'active'`. Demoted role in token rejected if database role differs.
  - **Backend-Enforced**: `setUserStatus()` executes within verified admin session context, attributing change in `audit_logs`.
- **Verification Test**: Test 16 (`Stale or suspended user assertion`), Test 30 (`Null-safe admin authorization matrix for set_user_status`), and Test 42 (`Revoked Member Immediate Cutoff`).
- **Residual Risk**: Read operations cached at an edge proxy layer (mitigated by `Cache-Control: no-store` on private endpoints).

---

### 5. RLS Bypass
- **Threat**: Attacker crafts malicious queries or joins that attempt to circumvent Row-Level Security policies.
- **Attacker Profile**: Malicious user exploiting multi-table joins, subqueries, or views.
- **Attack Vector**: Querying via indirect join paths (`JOIN ledger_postings ON ...`) or exploiting recursive policy lookups.
- **Defensive Mechanism**:
  - **Database-Enforced**:
    - `FORCE ROW LEVEL SECURITY` enabled on all 7 domain tables (`relforcerowsecurity = true`), ensuring policies apply unconditionally to table owners and application roles alike.
    - Security definer helper functions (`is_account_member`, `is_account_holder`) use non-recursive lookups.
    - Table grants to `ledgerline_app` strictly limited to read-mostly privileges.
- **Verification Test**: Test 37 (`Adversarial Transaction & Posting Isolation`), Test 38 (`Statement & Join Indirect Leakage Resistance`), and Test 43 (`Unauthenticated / Missing Session Identity Query Denial`).
- **Residual Risk**: Superuser connection (`postgres`) bypasses RLS (`BYPASSRLS`). Mitigated by never using superuser credentials for application connections.

---

### 6. SQL Injection
- **Threat**: Attacker injects SQL fragments into request parameters, bodies, or headers to execute unauthorized database statements.
- **Attacker Profile**: External attacker probing API endpoints.
- **Attack Vector**: Submitting SQL payloads (e.g. `' OR 1=1; --`) in user input fields.
- **Defensive Mechanism**:
  - **Backend-Enforced**: 100% of database queries across controllers, services, and tests use parameterized queries with positional parameters (`$1, $2, ...`) via `pg` driver. Zero dynamic SQL string concatenation.
  - **Database-Enforced**: `SECURITY DEFINER` functions use static SQL and explicit schema-qualified references (`public.accounts`, `ledger_secure.active_session_contexts`). Zero dynamic `EXECUTE '...'` blocks.
  - **Input Validation**: Zod schemas enforce strict data types (UUID v4, integer strings `/^\d+$/`, strict enums).
- **Verification Test**: Test 26 (`Input validation: rejects unsafe integers, floats, negatives, and non-digits`) and Test 34 (`Search-path shadow resistance`).
- **Residual Risk**: Zero risk in current static queries; residual exposure exists if future raw SQL concatenation is introduced without peer review or if underlying `pg` driver parser has an unpatched flaw.

---

### 7. Duplicate Financial Requests (Replay Storm)
- **Threat**: Concurrent network retries or adversarial clients fire duplicate deposit/withdrawal/transfer requests to cause duplicate credits or debits.
- **Attacker Profile**: Malicious customer or automated retry storm.
- **Attack Vector**: Firing parallel HTTP requests with the same idempotency key or rapid successive submissions.
- **Defensive Mechanism**:
  - **Database-Enforced**: Unique index `UNIQUE (user_id, key)` on `public.idempotency_keys`. The first request atomically reserves the key (`in_progress`); concurrent contenders wait on row lock and receive cached response upon resolution.
  - **Backend-Enforced**: Deterministic JSON canonical payload hashing. If payload differs on key reuse, raises `HTTP 409 Conflict`.
  - **Frontend-Enforced**: `transitionReversalState` and API client lock submit buttons and preserve idempotency key across network failures.
- **Verification Test**: Test 9 (`Exact idempotency replay`), Test 10 (`Payload mismatch 409`), Test 11 (`Concurrent duplicate requests`), and Test 49 (`10 Simultaneous Identical Requests`).
- **Residual Risk**: Duplicate execution is blocked by the unique index constraint; residual exposure exists if the index is dropped during migration maintenance.

---

### 8. Concurrent Overdraw (Double Spending)
- **Threat**: Customer fires concurrent transfer or withdrawal requests across multiple browser sessions to spend the same account balance multiple times.
- **Attacker Profile**: Malicious customer attempting high-velocity race conditions.
- **Attack Vector**: Simultaneous parallel requests aiming to exploit non-atomic balance verification.
- **Defensive Mechanism**:
  - **Database-Enforced**:
    - **Row-Level Locking**: Account balance checked under exclusive row lock (`SELECT ... FOR UPDATE`).
    - **Deterministic Lock Ordering**: Multi-account transfers acquire locks in ascending UUID order: `LEAST(src, dest)` followed by `GREATEST(src, dest)`, preventing deadlocks.
    - **Check Constraint**: `CHECK (cached_balance_paise >= 0)` on customer accounts prevents negative balances.
- **Verification Test**: Test 12 (`Concurrent withdrawals: account balance cannot become negative`) and Test 13 (`Opposite-direction transfers: concurrent A->B and B->A succeed without deadlock`).
- **Residual Risk**: Enforced mathematically by database CHECK constraint; residual exposure exists only if CHECK constraint is dropped or altered.

---

### 9. Concurrent Reversal
- **Threat**: Two administrators simultaneously attempt to reverse the same fraudulent transaction, causing duplicate refunds.
- **Attacker Profile**: Concurrent administrative operations or race condition.
- **Attack Vector**: Parallel execution of `POST /api/transactions/:id/reverse`.
- **Defensive Mechanism**:
  - **Database-Enforced**: `process_reversal()` acquires row-level lock on the target transaction (`SELECT ... FOR UPDATE`). Checks if a reversal transaction already exists. The second concurrent attempt detects `ALREADY_REVERSED` and raises HTTP 422.
- **Verification Test**: Test 22 (`Duplicate reversal`), Test 52 (`Concurrent Reversal Protection: Dual Administrator Race`), and client reversal state machine tests.
- **Residual Risk**: Serialized by transaction row lock; residual risk exists if administrative reversal logic is bypassed via direct SQL manipulation.

---

### 10. Ledger Modification and Deletion
- **Threat**: Malicious insider or compromised application process attempts to modify or delete historical transactions or ledger postings.
- **Attacker Profile**: Compromised application server or malicious insider with database access.
- **Attack Vector**: Executing `UPDATE` or `DELETE` on `transactions` or `ledger_postings`.
- **Defensive Mechanism**:
  - **Database Grants**: Runtime role `ledgerline_app` is denied `UPDATE` and `DELETE` grants on `transactions` and `ledger_postings` (`42501 permission denied`).
  - **Database Triggers**:
    - `trg_protect_finalized_transactions`: Raises `23514` on `UPDATE`/`DELETE` of posted/refused transactions.
    - `trg_append_only_postings`: Raises `23514` unconditionally on `UPDATE`/`DELETE` of ledger postings.
- **Verification Test**: Test 18 (`Ledger posting mutation attempt`), Test 19 (`Finalized transaction immutability`), and Test 56 (`Posted Transaction & Ledger Immutability: Runtime Privileges and Trigger Enforcement`).
- **Residual Risk**: PostgreSQL superuser disabling triggers via `ALTER TABLE DISABLE TRIGGER`. Mitigated by operational access controls.

---

### 11. Cached Balance Corruption
- **Threat**: Direct out-of-band balance manipulation without corresponding postings, or bug in balance trigger calculation.
- **Attacker Profile**: Software defect or rogue direct SQL update to `accounts.cached_balance_paise`.
- **Attack Vector**: `UPDATE public.accounts SET cached_balance_paise = ...`.
- **Defensive Mechanism**:
  - **Database-Enforced**:
    - `ledgerline_app` has no direct `UPDATE` grant on `accounts.cached_balance_paise`.
    - **Deferred Constraint Trigger**: `validate_account_balance_at_commit()` runs at `COMMIT` time, recalculates `SUM(signed_amount_paise)` from `ledger_postings`, and aborts transaction with `23514` if cached balance differs.
- **Verification Test**: Test 20 (`Balance reconciliation commit validator detects corrupted balance`) and Test 55 (`Independent Database Reconciliation: 9 Financial Invariants`).
- **Residual Risk**: Superuser manual modification without commit trigger evaluation.

---

### 12. Monetary Overflow and Precision Loss
- **Threat**: Submitting extreme integer values (e.g. `9223372036854775807`, negative values, or IEEE 754 floats) to cause integer overflow, underflow, or fractional rounding drift.
- **Attacker Profile**: Adversarial client testing boundary conditions.
- **Attack Vector**: Submitting negative numbers, decimals, or extreme `BIGINT` values.
- **Defensive Mechanism**:
  - **Database-Enforced**:
    - Table constraint `CHECK (amount_paise > 0)`.
    - PostgreSQL `BIGINT` arithmetic: Exceeding `9223372036854775807` raises SQLSTATE `22003` (`bigint out of range`), triggering complete atomic transaction rollback with zero postings.
  - **Backend-Enforced**: Explicit regex `/^\d+$/` and `validateAmountPaise` strictly validate integer paise strings without floats, negatives, exponents, or non-digits.
  - **Frontend-Enforced**: `rupeesToPaise` uses string splitting and native `BigInt` parsing, prohibiting floating-point math.
- **Verification Test**: Test 26 (`Input validation`), Test 54 (`Monetary Precision & Boundary Enforcement Matrix`), and Test 57 (`64-bit Integer Arithmetic Boundary: Rejects BIGINT Exceedance During Double-Entry Posting and Rolls Back Atomically`).
- **Residual Risk**: Exceeding 64-bit integer limits triggers SQLSTATE `22003` and complete transaction rollback. In double-entry posting, the debit leg underflows before credit execution; both accounts remain unmutated with zero partial postings. Residual risk exists if input exceeds string length limits before validation.

---

### 13. Credential Theft and Brute Force
- **Threat**: Attacker attempts credential stuffing or brute-force attacks against user passwords, or steals password hashes from database backups.
- **Attacker Profile**: External attacker with automated dictionary tools or attacker with database dump access.
- **Attack Vector**: Automated high-frequency login attempts or offline hash cracking.
- **Defensive Mechanism**:
  - **Backend-Enforced**:
    - Passwords hashed using `scrypt` with 16-byte cryptographically random salt and 64-byte derived key.
    - Constant-time verification via `crypto.timingSafeEqual` prevents timing attacks.
  - **Residual Risk & Mandatory Deployment Gate**: Scrypt protects password hashes at rest; it does NOT prevent online credential guessing or brute force attacks against active endpoints. In-application rate limiting is not implemented in Express. Ingress rate limiting (via Nginx or Cloudflare) is a **mandatory deployment gate** before exposing the service to public traffic.

---

### 14. XSS and Token Theft
- **Threat**: Cross-Site Scripting (XSS) in frontend allows injected scripts to exfiltrate session tokens and impersonate users.
- **Attacker Profile**: Adversary exploiting potential DOM injection.
- **Attack Vector**: Stored or reflected XSS stealing tokens from browser storage.
- **Defensive Mechanism**:
  - **Frontend Storage Model**: Tokens stored strictly in browser `sessionStorage` (with in-memory fallback), never `localStorage`. Restricts token lifetime to the single browser tab.
  - **Backend Headers**: Express uses `helmet()` to set `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and CSP defaults.
  - **Residual Risk**: `sessionStorage` is accessible to JavaScript executing in the same origin. It does NOT provide the script-inaccessibility of an `HttpOnly` cookie. If an XSS vulnerability exists, a malicious script could read `sessionStorage.getItem('ledgerline_auth')`. An enterprise deployment should consider `HttpOnly; SameSite=Strict; Secure` cookies paired with CSRF tokens.

---

### 15. Database Owner / Superuser Compromise
- **Threat**: Adversary compromises database credentials and attempts to disable RLS, alter schemas, or tamper with financial tables.
- **Attacker Profile**: Malicious DBA or compromised server host.
- **Attack Vector**: Connecting as `postgres` or `ledgerline_owner` to bypass application constraints.
- **Defensive Mechanism**:
  - **Database-Enforced**:
    - `ledgerline_owner` configured with `NOLOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`.
    - Triggers `trg_protect_finalized_transactions` and `trg_append_only_postings` enforce immutability even when executed by table owners.
    - `TEMPORARY` privilege revoked from database, preventing `pg_temp` object injection.
    - Hardened `search_path = pg_catalog, ledger_secure, public, pg_temp` on all 26 `SECURITY DEFINER` functions.
- **Verification Test**: Test 33 (`Schema & database creation restrictions`), Test 34 (`Search-path shadow resistance`), and Test 56 (`Trigger enforcement even under privileged owner role`).
- **Residual Risk**: Cloud superuser (`postgres`) can issue `ALTER TABLE ... DISABLE TRIGGER`. Production deployments must enforce external database auditing (`pgaudit`) and IAM-based access control.

---

### 16. Denial of Service (DoS)
- **Threat**: Attacker floods the API with oversized payloads, slow HTTP requests, or complex queries to exhaust CPU, memory, or connection pools.
- **Attacker Profile**: External botnet or malicious caller.
- **Attack Vector**: Sending massive JSON payloads or holding open connection pools.
- **Defensive Mechanism**:
  - **Backend-Enforced**: Express body parser enforces strict payload bounds: `express.json({ limit: '10kb' })`.
  - **Database-Enforced**: Database connection timeout (2000ms) and statement timeout. Failed session cleanups trigger `client.release(true)` to discard bad sockets.
- **Residual Risk**: Application-level volumetric DDoS must be absorbed by an upstream CDN/WAF (Cloudflare/AWS CloudFront) as documented in `docs/DEPLOYMENT.md`.

---

### 17. Secrets Leakage
- **Threat**: Cryptographic keys (`IDENTITY_HMAC_SECRET`, `JWT_SECRET`) or database passwords leaked in source code, logs, or client bundles.
- **Attacker Profile**: External observer viewing source repository, build artifacts, or application logs.
- **Attack Vector**: Inspecting public git history, reading client bundle JS, or inspecting error response traces.
- **Defensive Mechanism**:
  - **Repository Hardening**: `.gitignore` excludes all `.env` files, `.env.*`, and logs.
  - **Configuration Validation**: `env.js` validates 64-hex HMAC secret and $\ge 32$-character JWT secret at startup with zero insecure fallback defaults in production.
  - **Client Isolation**: Client bundle only receives `VITE_API_BASE_URL`; zero database credentials or HMAC secrets exist in client code.
  - **Error Sanitization**: Express central error handler logs stack traces to server logs but returns generic, sanitized error responses to callers.
- **Verification Test**: `git status` check, `env.js` startup validation tests, and client bundle source inspection.
- **Residual Risk**: Compromised server host filesystem where `.env` is stored. Production should delegate secrets to cloud secret managers (AWS Secrets Manager / GCP Secret Manager).

---

## 5. Security Posture Summary & Verification Audit

| Metric | Measured Status | Verification Reference |
| :--- | :--- | :--- |
| **Total Automated Tests** | 103 Passed (0 Failed) | 62 Server Tests + 41 Client Tests |
| **Domain Tables Protected by `FORCE RLS`** | 7 of 7 tables (100%) | `verify_install.js` catalog audit |
| **`SECURITY DEFINER` Functions Hardened** | 26 of 26 functions (100%) | `verify_install.js` catalog audit |
| **Floating-Point Operations in Core Money Math** | Avoided (Integer Paise) | `rupeesToPaise` string-based `BigInt` parsing and DB `BIGINT` |
| **Financial Consistency Invariants Verified** | 9 of 9 (100%) | Test 55 & Test 58 Database Reconciliation |
| **Committed In-Progress Idempotency Records** | 0 (Zero) | Test 58 live database assertion |
