-- ==============================================================================
-- Migration: 002_core_tables_and_indexes.sql
-- Description: Creates private security tables and public financial core tables.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Private Security Schema Tables
-- ------------------------------------------------------------------------------

-- Auth Secrets (Signing secrets for HMAC identity verification)
CREATE TABLE IF NOT EXISTS ledger_secure.auth_secrets (
    key_version INT PRIMARY KEY,
    secret_bytes BYTEA NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE ledger_secure.auth_secrets OWNER TO ledgerline_owner;

-- Consumed Assertions Registry (Survives Financial Rollback)
CREATE TABLE IF NOT EXISTS ledger_secure.consumed_assertions (
    nonce UUID PRIMARY KEY,
    signature BYTEA NOT NULL UNIQUE,
    user_id UUID NOT NULL,
    role VARCHAR(20) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    registered_pid INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'REGISTERED',
    claimed_at TIMESTAMPTZ,
    claimed_txid BIGINT,
    CONSTRAINT chk_assertion_status CHECK (status IN ('REGISTERED', 'CONSUMED', 'BOUND'))
);
CREATE INDEX IF NOT EXISTS idx_consumed_assertions_expiry 
    ON ledger_secure.consumed_assertions (expires_at);
ALTER TABLE ledger_secure.consumed_assertions OWNER TO ledgerline_owner;

-- Active Session Contexts (Bound to Backend PID and Current TXID)
CREATE TABLE IF NOT EXISTS ledger_secure.active_session_contexts (
    backend_pid INT NOT NULL,
    txid BIGINT NOT NULL,
    user_id UUID NOT NULL,
    role VARCHAR(20) NOT NULL,
    nonce UUID NOT NULL,
    established_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (backend_pid, txid)
);
ALTER TABLE ledger_secure.active_session_contexts OWNER TO ledgerline_owner;

-- ------------------------------------------------------------------------------
-- 2. Public Financial Domain Tables
-- ------------------------------------------------------------------------------

-- Users Table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'customer',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT chk_users_role CHECK (role IN ('customer', 'admin'))
);
ALTER TABLE public.users OWNER TO ledgerline_owner;

-- Accounts Table
CREATE TABLE IF NOT EXISTS public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_number VARCHAR(34) NOT NULL,
    account_type VARCHAR(20) NOT NULL,
    system_role_type VARCHAR(50),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    current_balance BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_accounts_number UNIQUE (account_number),
    CONSTRAINT chk_accounts_type CHECK (account_type IN ('customer', 'system')),
    CONSTRAINT chk_accounts_currency CHECK (currency = 'INR'),
    CONSTRAINT chk_accounts_status CHECK (status IN ('active', 'frozen', 'closed')),
    CONSTRAINT chk_accounts_system_role CHECK (
        (account_type = 'customer' AND system_role_type IS NULL) OR
        (account_type = 'system' AND system_role_type = 'SYSTEM_CASH_VAULT' AND system_role_type IS NOT NULL)
    ),
    CONSTRAINT chk_accounts_balance_non_negative CHECK (
        account_type = 'system' OR current_balance >= 0
    )
);
ALTER TABLE public.accounts OWNER TO ledgerline_owner;

-- Account Memberships Table
CREATE TABLE IF NOT EXISTS public.account_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    role VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_account_memberships UNIQUE (account_id, user_id),
    CONSTRAINT chk_account_memberships_role CHECK (role IN ('account_holder', 'auditor'))
);
CREATE INDEX IF NOT EXISTS idx_account_memberships_user ON public.account_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_account_memberships_account ON public.account_memberships (account_id);
ALTER TABLE public.account_memberships OWNER TO ledgerline_owner;

-- Transactions Table
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    amount_paise BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    source_account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
    destination_account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
    original_transaction_id UUID REFERENCES public.transactions(id) ON DELETE RESTRICT,
    refusal_reason VARCHAR(255),
    created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_transactions_type CHECK (type IN ('deposit', 'withdrawal', 'transfer', 'reversal')),
    CONSTRAINT chk_transactions_status CHECK (status IN ('pending', 'posted', 'refused')),
    CONSTRAINT chk_transactions_amount_positive CHECK (amount_paise > 0),
    CONSTRAINT chk_transactions_currency CHECK (currency = 'INR'),
    CONSTRAINT chk_transactions_distinct_accounts CHECK (source_account_id != destination_account_id),
    CONSTRAINT chk_transactions_reversal_structure CHECK (
        (type = 'reversal' AND original_transaction_id IS NOT NULL) OR
        (type != 'reversal' AND original_transaction_id IS NULL)
    ),
    CONSTRAINT chk_transactions_refusal_reason CHECK (
        (status = 'refused' AND refusal_reason IS NOT NULL) OR
        (status != 'refused' AND refusal_reason IS NULL)
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_single_posted_reversal
    ON public.transactions (original_transaction_id)
 WHERE type = 'reversal' AND status = 'posted';
ALTER TABLE public.transactions OWNER TO ledgerline_owner;

-- Ledger Postings Table (Strictly Append-Only)
CREATE TABLE IF NOT EXISTS public.ledger_postings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
    entry_type VARCHAR(10) NOT NULL,
    amount_paise BIGINT NOT NULL,
    signed_amount_paise BIGINT NOT NULL,
    sequence_number INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_postings_entry_type CHECK (entry_type IN ('DEBIT', 'CREDIT')),
    CONSTRAINT chk_postings_amount_positive CHECK (amount_paise > 0),
    CONSTRAINT chk_postings_sequence_range CHECK (sequence_number IN (1, 2)),
    CONSTRAINT uq_postings_tx_sequence UNIQUE (transaction_id, sequence_number),
    CONSTRAINT chk_postings_signed_balance CHECK (
        (entry_type = 'DEBIT' AND signed_amount_paise = -amount_paise) OR
        (entry_type = 'CREDIT' AND signed_amount_paise = amount_paise)
    )
);
CREATE INDEX IF NOT EXISTS idx_ledger_postings_account_time 
    ON public.ledger_postings (account_id, created_at DESC);
ALTER TABLE public.ledger_postings OWNER TO ledgerline_owner;

-- Idempotency Keys Table
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    idempotency_key VARCHAR(255) NOT NULL,
    request_method VARCHAR(10) NOT NULL,
    request_path VARCHAR(255) NOT NULL,
    request_payload_hash VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    response_code INT,
    response_body JSONB,
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_idempotency_user_key UNIQUE (user_id, idempotency_key),
    CONSTRAINT uq_idempotency_transaction_id UNIQUE (transaction_id),
    CONSTRAINT chk_idempotency_status CHECK (status IN ('in_progress', 'resolved')),
    CONSTRAINT chk_idempotency_resolution CHECK (
        (status = 'in_progress' AND response_code IS NULL AND response_body IS NULL) OR
        (status = 'resolved' AND response_code IS NOT NULL AND response_body IS NOT NULL)
    )
);
ALTER TABLE public.idempotency_keys OWNER TO ledgerline_owner;

-- Audit Logs Table (Strictly Append-Only)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.users(id) ON DELETE RESTRICT,
    actor_role VARCHAR(20) NOT NULL,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_time ON public.audit_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);
ALTER TABLE public.audit_logs OWNER TO ledgerline_owner;

