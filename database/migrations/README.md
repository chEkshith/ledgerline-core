# Database Migrations

This directory holds SQL migration scripts for establishing and evolving the LedgerLine PostgreSQL schema.

## Guidelines
- Use sequential versioning (e.g., `001_initial_schema.sql`, `002_add_audit_log.sql`).
- All financial monetary amounts must be stored as integer cents (minor currency units) or fixed-precision `NUMERIC(15, 2)`.
- Never use floating point types (`FLOAT`, `REAL`, `DOUBLE PRECISION`) for balances or monetary quantities.

