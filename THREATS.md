# LedgerLine — Threat Model & Security Posture

This document establishes the threat modeling framework, security baseline, mitigation strategies, and residual risks for **LedgerLine**, a secure financial transaction management system.

---

## 1. Scope & Objective

LedgerLine is designed to process and record financial transactions with strict consistency, auditability, and resilience against malicious tampering, concurrency anomalies, or system failure.

The architectural baseline enforces:
- Layered defense: Routing $\to$ Controllers $\to$ Services $\to$ Database-Enforced Security.
- Principle of least privilege across application and database roles.
- Deterministic concurrency control eliminating deadlocks and double spending.
- Non-repudiation and immutable transaction records.
- Complete anti-replay protection surviving transaction rollbacks.
- Zero floating-point arithmetic across frontend and backend tiers.

---

## 2. Threat Modeling Framework: STRIDE Analysis

| Threat Category | Potential Risk in LedgerLine | Implemented Mitigation Strategy |
| :--- | :--- | :--- |
| **Spoofing** | Impersonation of legitimate users or forging database session identity. | Cryptographic HMAC assertions with 30s expiry and single-use nonce; verified database session context bound to `(pg_backend_pid(), txid_current())`; scrypt password hashing; admin action attribution verifying authoritative database role in real time. |
| **Tampering** | Modifying transaction amounts, mutating historical postings, altering account balances. | Double-entry zero-sum ledgering ($\sum \Delta = 0$); integer paise arithmetic (`BIGINT`); append-only triggers on `ledger_postings` and `audit_logs`; `trg_protect_finalized_transactions` preventing update/deletion of posted/refused transactions; deferred balance reconciliation at commit; frontend string-based BigInt parsing preventing floating-point rounding. |
| **Repudiation** | An actor denies executing a financial transaction or administrative action. | Immutable audit log trail with verified actor ID, authoritative role, timestamp, and metadata; cryptographic request payload hashing with RFC 8785 canonicalization. |
| **Information Disclosure** | Leakage of balances, transaction history, credentials, or PII. | PostgreSQL `FORCE ROW LEVEL SECURITY` across all 7 domain tables; non-recursive RLS helpers; posting RLS strictly preventing cross-account leakage; sanitized error handler masking internal errors; automatic token clearance on session expiry. |
| **Denial of Service (DoS)** | Deadlocks on concurrent transfers, replay storms, connection pool exhaustion. | Deterministic ascending UUID account locking; request idempotency reservation with cached replay; 3s database lock timeout; advisory locking on migrations (`pg_advisory_lock`); connection discard (`client.release(true)`) preventing pool contamination on unconfirmed cleanup. |
| **Elevation of Privilege** | Runtime application role modifying permissions, bypassing RLS, or creating admin accounts. | `ledgerline_owner` is `NOLOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`; `ledgerline_app` has strictly read-mostly table grants; direct `UPDATE` on `idempotency_keys` revoked; user registration restricted to `customer` role; demoted/stale JWTs blocked by database assertion checks; `TEMPORARY` privilege revoked from database preventing `pg_temp` object injection; `SECURITY DEFINER` search paths hardened (`pg_catalog, ledger_secure, public, pg_temp`). |

---

## 3. Financial Integrity Principles

1. **Integer Paise Arithmetic (Zero Floating-Point Operations)**:
   - Floating-point representations (IEEE 754) suffer from precision rounding errors (`0.1 + 0.2 !== 0.3` and `10.55 * 100 === 1054.9999999999998`).
   - All financial amounts are strictly represented and calculated in minor currency units (**integer paise**, `BIGINT`, where ₹1.00 = 100 paise).
   - The frontend parses decimal inputs using string-splitting and BigInt math (`rupeesToPaise`), never passing floats over the wire.
   - The backend validates integers within PostgreSQL `BIGINT` range, rejecting negatives, floats, fractions, and unsafe JavaScript integers.
2. **Double-Entry Invariant**:
   - Every posted transaction must produce exactly two balanced postings: one debit and one credit of identical magnitude ($\text{debit} + \text{credit} = 0$).
   - Refused transactions produce exactly zero postings.
3. **Deferred Balance Reconciliation**:
   - A deferred constraint trigger evaluates at `COMMIT` time under exclusive account locks.
   - Re-reads live rows from `public.transactions` and validates that `cached_balance == SUM(signed_amount_paise)` across all postings.

---

## 4. Phase 2 & 3 Remediation Controls

1. **Credential & Secret De-Hardening**:
   - Removed all hardcoded database passwords from migration SQL (`001_schemas_roles_extensions.sql`).
   - Removed hardcoded HMAC secrets and default admin password hashes from seed SQL (`001_initial_seed.sql`).
   - Removed fallback secrets from application configuration (`env.js`); startup validation mandates 64-hex-character HMAC keys and $\ge 32$-character JWT secrets.
   - Production validation prevents empty or defaulted `DB_PASSWORD`, `ADMIN_DB_USER`, `ADMIN_DB_PASSWORD`, and `INITIAL_ADMIN_PASSWORD`.
   - Removed hardcoded password bypasses from `verifyPassword()`.
   - Implemented `server/scripts/bootstrap.js` provisioning runtime role passwords, versioned HMAC secrets, and admin accounts hashed via `scrypt`.
2. **Three-Stage Assertion Replay Protection**:
   - **Phase 1 (Committed Independently)**: Registers HMAC assertion and consumes it (`status = 'CONSUMED'`). This commits immediately.
   - **Phase 2 (Financial Isolation)**: Begins financial transaction on the same client / PID, establishes session context in `active_session_contexts`, marks assertion `BOUND`.
   - **Rollback Resilience**: If Phase 2 aborts and rolls back, Phase 1's consumption remains committed to disk. Replaying the assertion is permanently rejected.
3. **Connection Pool Contamination Defense**:
   - Session context cleanup executes post-commit and post-rollback using dual identifiers: backend PID and financial transaction ID (`ledger_secure.clear_session_identity`).
   - If cleanup throws or cannot be verified, `sessionContext.js` calls `client.release(true)`, which terminates and discards the socket from the pool.
4. **Admin Action Attribution & Role Freshness**:
   - `auth.service.js` executes `setUserStatus` within `executeWithSession(adminUserId, 'admin', ...)`.
   - Assertion registration checks current database status and role against `public.users`. Stale or demoted JWTs are rejected.
   - Audit logs permanently record the verified administrator actor ID, action (`USER_STATUS_CHANGED`), timestamp, and reason metadata.
5. **Finalized Transaction Immutability**:
   - Database trigger `trg_protect_finalized_transactions` blocks any `UPDATE` or `DELETE` on transactions with status `posted` or `refused`.
   - Prevents alteration of amount, currency, endpoints, type, or creator during pending-to-finalized transitions.
6. **Client-Side Idempotency & Replay Resiliency**:
   - Client generates standard UUID v4 idempotency keys per operation.
   - Retries preserve the key to avoid duplicate debits.
   - The UI detects `Idempotent-Replay` HTTP response headers and explicitly notifies the operator.
7. **SECURITY DEFINER Search-Path Hardening & Temporary Object Isolation**:
   - PostgreSQL grants `TEMPORARY` on newly created databases to `PUBLIC` by default, which previously allowed untrusted connections to create temporary tables or functions in `pg_temp`.
   - Migration `009` revoked `TEMPORARY ON DATABASE` from `PUBLIC` and `ledgerline_app`, blocking object creation in temporary schemas.
   - Re-enforced `REVOKE CREATE ON SCHEMA public, ledger_secure FROM PUBLIC, ledgerline_app`.
   - Hardened `search_path` across all 26 `SECURITY DEFINER` functions to prioritize `pg_catalog` and `ledger_secure` before `public`, ending with `pg_temp` (`SET search_path = pg_catalog, ledger_secure, public, pg_temp`), preventing function and operator shadowing.
   - Restricted pure validation trigger functions to minimal search path (`pg_catalog, pg_temp`).
   - Verified that all 26 functions are owned by `ledgerline_owner`, lack dynamic SQL (`EXECUTE '...'`), and utilize fully qualified object names (`public.*`, `ledger_secure.*`).
8. **Adversarial Authorization, RLS Isolation & Concurrency Serialization**:
   - Enforced and verified PostgreSQL `FORCE ROW LEVEL SECURITY` across all seven domain tables (`users`, `accounts`, `account_memberships`, `transactions`, `ledger_postings`, `idempotency_keys`, `audit_logs`).
   - Proved complete zero-row isolation for unauthenticated queries or queries with missing session identity contexts.
   - Verified cross-customer data isolation: customers cannot read other users' accounts, postings, transactions, statement endpoints, or join queries.
   - Verified auditor boundary: auditors are strictly read-only and denied deposits, withdrawals, transfers, reversals, and membership modifications.
   - Verified immediate authorization cutoff: revoked members cannot execute transactions even if holding valid JWTs.
   - Verified cryptographic assertion anti-tampering: database checks reject forged roles, corrupt signatures, and fake user IDs.
   - Verified concurrency race serialization: parent account row-level locking (`FOR UPDATE`) guarantees deterministic ordering between membership revocation and financial operations, preventing stale authorization execution.

---

## 5. Known Limitations and Residual Risks

1. **PostgreSQL Superuser Authority**:
   - Administrative superusers (`postgres`) can bypass RLS via `BYPASSRLS`. Production deployments must enforce IAM authentication, restrict superuser access, and enable audit logging via `pgaudit`.
2. **Application Process Memory / RCE**:
   - The application tier holds active HMAC and JWT secrets in memory. A Remote Code Execution vulnerability in Node.js could allow memory extraction. Production environments should delegate cryptographic signing to cloud KMS or HSM.
3. **Monotonic Table Growth**:
   - As an append-only system, `ledger_postings` and `audit_logs` grow monotonically. Production scaling requires table partitioning by range on `created_at`.
4. **Idempotency Key Retention**:
   - Idempotency records are currently retained indefinitely. A scheduled background cleanup job should prune expired keys older than the idempotency retention window (e.g., 48 hours).
