# LedgerLine — Threat Model & Security Architecture

Version: 1.0.0
Status: Production Baseline
Classification: Enterprise Financial Security

---

## 1. Scope & Security Objective

LedgerLine processes and records multi-tenant financial movements with strict mathematical consistency, non-repudiation, and defense-in-depth isolation.

The security architecture enforces:
- **Zero Floating-Point Drift**: Integer minor currency units (`BIGINT` paise).
- **Layered Defense**: Route Validation $\to$ Controller Checks $\to$ Service HMAC Assertions $\to$ PostgreSQL `FORCE RLS` $\to$ Database Triggers & Constraints.
- **Principle of Least Privilege**: Explicit separation between `ledgerline_owner` (`NOLOGIN`, `NOSUPERUSER`) and `ledgerline_app` (read-mostly runtime role).
- **Non-Replayable Session Contexts**: HMAC-SHA256 assertions with 30s lifetime and single-use nonces consumed in independently committed transactions.
- **Append-Only Immutability**: Posted transactions, ledger postings, and audit logs cannot be updated or deleted by any application role or trigger.

---

## 2. Threat Modeling Framework: STRIDE Matrix

| Threat Category | Potential Risk in LedgerLine | Implemented Mitigation Strategy |
| :--- | :--- | :--- |
| **Spoofing** | Impersonation of legitimate users or forging database session identity. | Cryptographic HMAC assertions with 30s expiry and single-use nonce; verified database session context bound to `(pg_backend_pid(), txid_current())`; scrypt password hashing; admin action attribution verifying authoritative database role in real time. |
| **Tampering** | Modifying transaction amounts, mutating historical postings, altering account balances. | Double-entry zero-sum ledgering ($\sum \Delta = 0$); integer paise arithmetic (`BIGINT`); append-only triggers on `ledger_postings` and `audit_logs`; `trg_protect_finalized_transactions` preventing update/deletion of posted/refused transactions; deferred balance reconciliation at commit; frontend string-based BigInt parsing preventing floating-point rounding. |
| **Repudiation** | An actor denies executing a financial transaction or administrative action. | Immutable audit log trail with verified actor ID, authoritative role, timestamp, and metadata; cryptographic request payload hashing with RFC 8785 canonicalization. |
| **Information Disclosure** | Leakage of balances, transaction history, credentials, or PII. | PostgreSQL `FORCE ROW LEVEL SECURITY` across all 7 domain tables; non-recursive RLS helpers; posting RLS strictly preventing cross-account leakage; sanitized error handler masking internal errors; automatic token clearance on session expiry. |
| **Denial of Service (DoS)** | Deadlocks on concurrent transfers, replay storms, connection pool exhaustion. | Deterministic ascending UUID account locking; request idempotency reservation with cached replay; 3s database lock timeout; advisory locking on migrations (`pg_advisory_lock`); connection discard (`client.release(true)`) preventing pool contamination on unconfirmed cleanup. |
| **Elevation of Privilege** | Runtime application role modifying permissions, bypassing RLS, or creating admin accounts. | `ledgerline_owner` is `NOLOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`; `ledgerline_app` has strictly read-mostly table grants; direct `UPDATE` on `idempotency_keys` revoked; user registration restricted to `customer` role; demoted/stale JWTs blocked by database assertion checks; `TEMPORARY` privilege revoked from database preventing `pg_temp` object injection; `SECURITY DEFINER` search paths hardened (`pg_catalog, ledger_secure, public, pg_temp`). |

---

## 3. Financial Integrity Invariants

1. **Integer Paise Arithmetic (Zero Floating-Point Operations)**:
   - All financial amounts are represented and calculated in minor currency units (**integer paise**, `BIGINT`, where ₹1.00 = 100 paise).
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

### Scenario 1: Transaction Mutation Attempt
- **Threat**: Attacker attempts to modify an already finalized transaction (e.g. altering `amount_paise`, changing destination account, or updating status from `refused` to `posted`).
- **Attacker Profile**: Malicious insider, compromised application tier, or attacker executing arbitrary SQL.
- **Attack Vector**: Direct `UPDATE public.transactions SET amount_paise = 1 WHERE id = ...` or calling an update procedure.
- **Defensive Mechanism**:
  1. PostgreSQL grants: `ledgerline_app` has strictly `SELECT, INSERT` on `public.transactions` (no `UPDATE` grant).
  2. Database trigger `trg_protect_finalized_transactions`: Fires `BEFORE UPDATE OR DELETE`, inspects `OLD.status`, and raises exception `23514` if status is `posted` or `refused`.
- **Verification Test**: Test 19 (`Finalized transaction immutability: trigger blocks update or deletion`) and Test 56 (`Posted Transaction & Ledger Immutability: Runtime Privileges and Trigger Enforcement`).
- **Residual Risk**: Direct superuser (`postgres`) modification with `ALTER TABLE DISABLE TRIGGER`. Mitigated by restricting superuser access in production.

---

### Scenario 2: Posting Mutation Attempt
- **Threat**: Attacker attempts to alter or delete an existing ledger posting to alter historical debit/credit amounts or change account balance attribution.
- **Attacker Profile**: Malicious insider or rogue database administrator.
- **Attack Vector**: Direct SQL `UPDATE public.ledger_postings SET amount_paise = ...` or `DELETE FROM public.ledger_postings`.
- **Defensive Mechanism**:
  1. Privilege grant: `ledgerline_app` has strictly `SELECT` on `public.ledger_postings` (no `INSERT, UPDATE, DELETE`).
  2. Database trigger `trg_append_only_postings`: Fires `BEFORE UPDATE OR DELETE` and unconditionally raises exception `23514` (`Ledger postings are strictly append-only`).
- **Verification Test**: Test 18 (`Ledger posting mutation attempt`) and Test 56 (`Trigger trg_append_only_postings must block UPDATE/DELETE on ledger_postings`).
- **Residual Risk**: Superuser trigger bypass. Production requires table write-once storage and WAL shipping.

---

### Scenario 3: Direct Ledger Bypass
- **Threat**: Attacker attempts to directly update `accounts.cached_balance_paise` without creating corresponding ledger postings.
- **Attacker Profile**: Compromised application service attempting out-of-band balance manipulation.
- **Attack Vector**: `UPDATE public.accounts SET cached_balance_paise = cached_balance_paise + 1000000 WHERE id = ...`.
- **Defensive Mechanism**:
  1. Privilege grant: `ledgerline_app` has no direct `UPDATE` on `accounts.cached_balance_paise`.
  2. Deferred constraint trigger `validate_account_balance_at_commit()`: Evaluates at `COMMIT` time, recalculates `SUM(amount_paise)` from `ledger_postings`, and aborts transaction with `23514` if balance does not match postings.
- **Verification Test**: Test 20 (`Balance reconciliation: commit validator detects corrupted balance and aborts commit`) and Test 55 (`Independent Database Reconciliation`).
- **Residual Risk**: None for application role. Superuser manual balance editing without commit triggers.

---

### Scenario 4: Balance Manipulation (Double Spending / Overdraft)
- **Threat**: Customer attempts to withdraw or transfer more money than available in their account.
- **Attacker Profile**: Malicious customer initiating high-velocity concurrent transfers.
- **Attack Vector**: Parallel transfer requests aiming to exploit non-atomic balance checks.
- **Defensive Mechanism**:
  1. Two-phase row-level account locking: `SELECT ... FOR UPDATE` locks source account before balance verification.
  2. Database check constraint: `CHECK (cached_balance_paise >= 0)` on customer accounts prevents negative balances.
  3. Insufficient funds refusal: Automatically records status `refused` with 0 postings.
- **Verification Test**: Test 4 (`Insufficient-funds refusal: records status=refused, 0 postings, HTTP 422`) and Test 12 (`Concurrent withdrawals: account balance cannot become negative`).
- **Residual Risk**: None; database check constraint provides mathematical enforcement.

---

### Scenario 5: Nonce Replay
- **Threat**: Attacker captures a valid cryptographic identity assertion and replays it to authorize unauthorized financial operations.
- **Attacker Profile**: Man-in-the-middle attacker or rogue consumer of intercepted API calls.
- **Attack Vector**: Resubmitting the same signed HMAC assertion in a second transaction.
- **Defensive Mechanism**:
  1. Three-stage assertion lifecycle: Nonce registration and consumption commit independently in Phase 1 before financial transaction begins.
  2. Database table `ledger_secure.consumed_assertions`: Nonce is marked `CONSUMED` with a unique constraint.
  3. Replay surviving rollback: Even if the financial transaction rolls back, Phase 1's consumption remains committed to disk; subsequent execution with the same nonce fails.
  4. Lifetime enforcement: Assertion timestamp must be within 30 seconds of `clock_timestamp()`.
- **Verification Test**: Test 14 (`Assertion replay after successful commit`) and Test 15 (`Assertion replay after financial rollback: nonce consumption survives rollback`).
- **Residual Risk**: Assertion stolen and executed within the 30-second window before original caller. Mitigated by TLS 1.3 encryption.

---

### Scenario 6: Stale / Suspended Session Elevation
- **Threat**: A suspended user or demoted administrator attempts to use a previously issued valid JWT to perform privileged or financial operations.
- **Attacker Profile**: Suspended customer or demoted employee retaining valid unexpired JWT.
- **Attack Vector**: Sending requests with unexpired JWT token.
- **Defensive Mechanism**:
  1. Dynamic database validation: Before generating an assertion, `auth.service.js` queries `public.users` to confirm current active status and authoritative role.
  2. Database procedure check: `ledger_secure.register_identity_assertion()` validates user status against `public.users` directly; if status is `suspended`, it rejects with SQL exception.
  3. Real-time admin role verification: `setUserStatus` verifies authoritative role inside `executeWithSession(adminUserId, 'admin', ...)`.
- **Verification Test**: Test 16 (`Stale or suspended user assertion: deactivating user rejects assertion immediately`) and Test 30 (`Null-safe admin authorization matrix for set_user_status`).
- **Residual Risk**: None; authentication checks are dynamic against the database rather than trusting static JWT claims.

---

### Scenario 7: Cross-Tenant Account Access
- **Threat**: Customer A attempts to view account details or balances belonging to Customer B.
- **Attacker Profile**: Authenticated malicious customer.
- **Attack Vector**: Calling `GET /api/accounts/:id` with Customer B's account ID.
- **Defensive Mechanism**:
  1. PostgreSQL `FORCE ROW LEVEL SECURITY` on `public.accounts`.
  2. Policy: `is_account_member(id)` or `type = 'vault' AND current_verified_user_role() = 'admin'`.
  3. Non-recursive security definer function `ledger_secure.is_account_member()` verifies active membership in `account_memberships`.
- **Verification Test**: Test 36 (`Adversarial RLS isolation: Customer A cannot read Customer B account`).
- **Residual Risk**: Customer mistakenly added as member by admin. Mitigated by membership audit logging.

---

### Scenario 8: Cross-Tenant Posting Access
- **Threat**: Customer A attempts to inspect the raw debit/credit postings of Customer B's account.
- **Attacker Profile**: Authenticated malicious customer.
- **Attack Vector**: Direct SQL query or `GET /api/transactions/:id` where Customer A is not a party.
- **Defensive Mechanism**:
  1. PostgreSQL `FORCE ROW LEVEL SECURITY` on `public.ledger_postings`.
  2. Policy: `ledger_secure.is_account_member(account_id)`.
  3. Unauthenticated or non-member queries return 0 rows.
- **Verification Test**: Test 37 (`Adversarial Transaction & Posting Isolation: Customer A cannot read Customer B transactions or postings`).
- **Residual Risk**: None; database engine strips non-member rows unconditionally.

---

### Scenario 9: Cross-Tenant Statement Enumeration
- **Threat**: Customer A attempts to paginate through Customer B's ledger statements or infer balances via multi-table joins.
- **Attacker Profile**: Authenticated customer attempting information disclosure.
- **Attack Vector**: Requesting `GET /api/accounts/:customerB_id/statement` or executing join queries on postings and accounts.
- **Defensive Mechanism**:
  1. Statement controller enforces account ownership check before query execution.
  2. PostgreSQL RLS on `ledger_postings` ensures join results return 0 rows.
- **Verification Test**: Test 38 (`Statement & Join Indirect Leakage Resistance: Customer A cannot access Customer B statement or join data`).
- **Residual Risk**: None.

---

### Scenario 10: Auditor Financial Execution
- **Threat**: A compliance auditor attempts to initiate money movements (deposits, withdrawals, transfers) or execute reversals.
- **Attacker Profile**: Malicious or compromised auditor account.
- **Attack Vector**: Calling `POST /api/transactions/transfer` or `POST /api/transactions/:id/reverse`.
- **Defensive Mechanism**:
  1. Application middleware restricts financial routes to `account_holder` or `admin`.
  2. Database function `ledger_secure.is_account_holder(account_id)` checks `role = 'account_holder'`; auditor membership (`role = 'auditor'`) returns `FALSE`.
  3. Procedures `process_deposit`, `process_withdrawal`, and `process_transfer` enforce `is_account_holder()`.
- **Verification Test**: Test 8 (`Auditor attempting financial operation: auditor role cannot initiate transfers`) and Test 41 (`Auditor Role Boundary Matrix: Auditor denied all financial writes and mutations`).
- **Residual Risk**: None.

---

### Scenario 11: Revoked Member Race Condition
- **Threat**: An account holder whose membership is being revoked attempts to rush a transfer before revocation commits.
- **Attacker Profile**: Disgruntled employee or former account holder.
- **Attack Vector**: Concurrent submission of membership revocation and transfer request.
- **Defensive Mechanism**:
  1. `revoke_account_membership` acquires row-level lock on `public.accounts` row (`FOR UPDATE`).
  2. Financial procedures acquire `FOR UPDATE` lock on the same `public.accounts` row.
  3. PostgreSQL serializes the operations: if revocation commits first, the transfer immediately encounters non-membership and aborts.
- **Verification Test**: Test 42 (`Revoked Member Immediate Cutoff`) and Test 47 (`Authorization Race Condition: Concurrent membership revocation and financial transaction serialized deterministically`).
- **Residual Risk**: Transfer commits fractions of a millisecond before revocation request begins. Mitigated by audit trail and admin reversal.

---

### Scenario 12: Idempotency Payload Tampering
- **Threat**: Attacker intercepts an idempotency key from a legitimate transaction and attempts to replay it with altered values (e.g. changing amount or recipient).
- **Attacker Profile**: Malicious actor attempting to hijack existing idempotency key.
- **Attack Vector**: Re-submitting `POST /api/transactions/transfer` with existing key but altered payload.
- **Defensive Mechanism**:
  1. Canonical request hashing: Generates SHA-256 of RFC 8785 canonical JSON payload.
  2. Database procedure `bind_transaction_to_idempotency_key()` compares incoming hash against stored `request_hash`.
  3. If hash differs, it raises exception `409 Conflict` (`IDEMPOTENCY_PAYLOAD_MISMATCH`).
- **Verification Test**: Test 10 (`Idempotency payload mismatch: re-using key with different amount returns HTTP 409`) and Test 50 (`Simultaneous Key Race with Conflicting Payloads Rejects Loser with HTTP 409`).
- **Residual Risk**: None; hash comparison is cryptographic.

---

### Scenario 13: Idempotency Race Condition (Replay Storm)
- **Threat**: High-concurrency automated script fires 10+ identical requests with the same idempotency key simultaneously to trigger duplicate debits.
- **Attacker Profile**: Network glitch, automated retry storm, or adversarial bot.
- **Attack Vector**: Parallel HTTP requests arriving at the exact same millisecond.
- **Defensive Mechanism**:
  1. PostgreSQL unique constraint `UNIQUE (user_id, key)` on `public.idempotency_keys`.
  2. The first request successfully reserves the key (`status = 'in_progress'`).
  3. Concurrent contenders are blocked at the database row lock. When the winner commits, contenders detect `status = 'resolved'` and return the cached response with `Idempotent-Replay: true`.
- **Verification Test**: Test 11 (`Concurrent duplicate requests: exactly one transaction processed`) and Test 49 (`Adversarial Idempotency: 10 Simultaneous Identical Requests Produce Exactly One Execution and 9 Replays`).
- **Residual Risk**: None; exactly one execution is mathematically guaranteed by unique index.

---

### Scenario 14: Partial Failure State Corruption
- **Threat**: Hardware failure, process crash, or database error occurs halfway through financial processing (e.g. after postings inserted but before balance update).
- **Attacker Profile**: System crash or network partition.
- **Attack Vector**: Mid-flight connection drops or injected SQL exceptions.
- **Defensive Mechanism**:
  1. Single ACID transaction boundary: All operations (transaction insert, postings insert, balance maintenance trigger, idempotency resolution) occur within an explicit `BEGIN ... COMMIT` block.
  2. PostgreSQL atomic rollback: Any exception aborts the transaction, reverting all uncommitted rows.
  3. Idempotency cleanup: Pre-commit failure rolls back the in-progress key reservation, allowing safe retries.
- **Verification Test**: Test 51 (`Adversarial Idempotency: Failed Pre-Commit Operation Leaves No Residue and Retries Cleanly`) and Test 53 (`Failure Injection & Atomic Rollback: Injected Database Errors Guarantee Zero Financial Residue`).
- **Residual Risk**: None; guaranteed by PostgreSQL Write-Ahead Log (WAL).

---

### Scenario 15: Reversal Race Condition
- **Threat**: Two administrators simultaneously attempt to reverse the same fraudulent transfer, risking double refunding.
- **Attacker Profile**: Concurrent administrative operations or race condition.
- **Attack Vector**: Two parallel calls to `POST /api/transactions/:id/reverse`.
- **Defensive Mechanism**:
  1. `process_reversal()` acquires row-level lock on the target transaction row (`SELECT ... FOR UPDATE`).
  2. Inspects `status` and verifies no existing reversal transaction references this ID.
  3. Winner posts compensating transaction; loser reads committed state and raises `ALREADY_REVERSED` (HTTP 422).
- **Verification Test**: Test 22 (`Duplicate reversal: an already reversed transaction cannot be reversed again`) and Test 52 (`Concurrent Reversal Protection: Dual Administrator Race Yields Exactly One Compensating Reversal`).
- **Residual Risk**: None; serialized by row-level lock.

---

### Scenario 16: Database Function Search-Path Hijacking
- **Threat**: Untrusted role creates malicious objects or functions in `public` or `pg_temp` that shadow system functions called by `SECURITY DEFINER` procedures.
- **Attacker Profile**: Adversary with SQL execution privileges as `ledgerline_app` or `PUBLIC`.
- **Attack Vector**: Creating fake functions (e.g. `pg_temp.current_setting`) to hijack execution context when an admin procedure executes.
- **Defensive Mechanism**:
  1. Revoked `TEMPORARY`: Migration `009` revoked `TEMPORARY ON DATABASE` from `PUBLIC` and `ledgerline_app`.
  2. Hardened `search_path`: All 26 `SECURITY DEFINER` functions specify:
     ```sql
     SET search_path = pg_catalog, ledger_secure, public, pg_temp
     ```
  3. `pg_catalog` precedes `public`, preventing shadowing of core operators and functions. `pg_temp` is explicitly listed last.
  4. Fully qualified object names: All SQL inside functions references `public.<table>` and `ledger_secure.<function>`.
- **Verification Test**: Test 33 (`Schema & database creation restrictions: ledgerline_app and PUBLIC cannot create objects in protected or temporary schemas`) and Test 34 (`Search-path shadow resistance: privileged functions prioritize pg_catalog and ledger_secure`).
- **Residual Risk**: Untrusted superuser adding insecure extensions. Mitigated by superuser restriction.

---

### Scenario 17: Monetary Overflow / Negative Amounts
- **Threat**: Attacker sends extreme monetary values (e.g. `9223372036854775807`, negative values, or floating numbers) to trigger integer overflow or bypass balance checks.
- **Attacker Profile**: Adversarial client exploiting arithmetic boundaries.
- **Attack Vector**: Submitting `amountPaise: "-500"` or `amountPaise: "9223372036854775800"` on an account already holding funds.
- **Defensive Mechanism**:
  1. Zod input validation: Rejects non-digits, negatives, decimals, exponential notation, and unsafe numbers.
  2. PostgreSQL `BIGINT` checks: Table CHECK constraint enforces `amount_paise > 0`.
  3. Database overflow trigger defense: Adding postings to an account balance near `MAX_BIGINT` triggers PostgreSQL SQLSTATE `22003` (`bigint out of range`), rolling back the entire transaction buffer atomically with zero postings and unchanged balances.
- **Verification Test**: Test 26 (`Input validation: rejects unsafe integers, floats, negatives, and non-digits`), Test 54 (`Monetary Precision & Boundary Enforcement Matrix`), and Test 57 (`Actual Monetary Overflow: Database BIGINT Balance Arithmetic Exceedance and Atomic Rollback`).
- **Residual Risk**: None; integer math wraps into exceptions rather than silent truncation.

---

## 5. Security Posture Summary & Verification Audit

| Metric | Measured Status | Verification Reference |
| :--- | :--- | :--- |
| **Total Automated Tests** | 103 Passed (0 Failed) | 62 Server Tests + 41 Client Tests |
| **Domain Tables Protected by `FORCE RLS`** | 7 of 7 tables (100%) | `verify_install.js` catalog audit |
| **`SECURITY DEFINER` Functions Hardened** | 26 of 26 functions (100%) | `009_harden_search_paths.sql` |
| **Floating-Point Operations in Money Math** | 0 (Zero) | `rupeesToPaise` string-based `BigInt` parsing |
| **Financial Consistency Invariants Verified** | 9 of 9 (100%) | Test 55 & Test 58 Database Reconciliation |
| **Committed In-Progress Idempotency Records** | 0 (Zero) | Test 58 live database assertion |
