# LedgerLine — Threat Model & Security Posture

This document establishes the threat modeling framework, security baseline, and mitigation strategies for **LedgerLine**, a secure financial transaction management system.

---

## 1. Scope & Objective

LedgerLine is designed to process and record financial transactions with strict consistency, auditability, and resilience against malicious tampering or system failure.

The initial baseline establishes:
- Strict separation of layers (Routing, Controllers, Services, Repositories, Validators).
- Transport-level and HTTP-header security.
- Controlled database access with connection pooling.
- Input validation and sanitization.
- Non-repudiation and immutable transaction records (future implementation).

---

## 2. Threat Modeling Framework: STRIDE Analysis

| Threat Category | Potential Risk in LedgerLine | Baseline Mitigation Strategy |
| :--- | :--- | :--- |
| **Spoofing** | Impersonation of legitimate users or services attempting unauthorized operations. | Multi-factor authentication, secure session/token handling, cryptographic identity verification (*to be implemented in Auth phase*). |
| **Tampering** | Modification of financial transaction data, account balances, or audit trails. | Double-entry bookkeeping invariants, parameterized SQL queries via `pg`, row-level immutability, cryptographic checksums. |
| **Repudiation** | An actor denies executing a financial transaction or system transfer. | Append-only audit logs, transactional event history, signed audit trails. |
| **Information Disclosure** | Leakage of account numbers, balances, PII, internal stack traces, or credentials. | Sanitized central error handler (stack traces hidden from clients in production), Helmet security headers, strict `.env` segregation. |
| **Denial of Service (DoS)** | Exhaustion of database connection pools, memory exhaustion via unbounded payload sizes. | Express JSON payload limits (`limit: '10kb'`), PostgreSQL connection pool limits (`max: 20`), timeout guards, rate limiting middleware (*future*). |
| **Elevation of Privilege** | An unauthorized actor escalating roles to perform administrative or cross-account transfers. | Role-based access control (RBAC), principle of least privilege in PostgreSQL database user permissions. |

---

## 3. Financial Integrity Principles

1. **No Floating-Point Arithmetic**:
   - Floating-point representations (e.g., IEEE 754 standard floats/doubles) suffer from precision rounding errors (`0.1 + 0.2 !== 0.3`).
   - All financial amounts must strictly be represented as **integer cents / minor currency units** (e.g., `1000` cents = `$10.00`) or PostgreSQL `NUMERIC` / `DECIMAL` types with fixed decimal precision.
2. **ACID Transaction Guarantees**:
   - Every financial state change must execute within explicit database transactions (`BEGIN ... COMMIT / ROLLBACK`) with isolation level guards to prevent race conditions (e.g., Double Spending).
3. **Defense in Depth**:
   - Every incoming request must be validated at the boundary via schemas (Zod).
   - Strict parameterized SQL statements must be used across all repositories—no string interpolation or dynamic SQL concatenation.

---

## 4. Current Foundation Controls

- [x] **Environment Secrets Management**: Credentials stored strictly in `.env` files; excluded from Git via `.gitignore`.
- [x] **HTTP Header Hardening**: Helmet middleware integrated to enforce CSP, HSTS, X-Content-Type-Options, etc.
- [x] **CORS Isolation**: Explicit origin configuration restricting frontend API access to authorized origin (`CLIENT_ORIGIN`).
- [x] **Sanitized Error Responses**: Central error middleware captures unexpected exceptions, logs internally, and returns uniform non-leaking JSON responses.
- [x] **Parameterized Database Queries**: Node PostgreSQL driver (`pg`) connection pool with query parameterization.

---

## 5. Security Checklist for Subsequent Iterations

- [ ] Rate limiting on API routes (`express-rate-limit`).
- [ ] User authentication with hardened password hashing (Argon2id or bcrypt) and secure session/JWT management.
- [ ] Role-Based Access Control (RBAC) middleware.
- [ ] Double-entry ledger schema with balance invariants and audit trails.
- [ ] CSRF protection for state-changing endpoints.

