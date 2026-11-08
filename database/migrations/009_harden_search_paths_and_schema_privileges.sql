-- ==============================================================================
-- Migration: 009_harden_search_paths_and_schema_privileges.sql
-- Description: Hardens search paths and schema/database privileges against
--              untrusted object shadowing and unauthorized temporary creations.
-- ==============================================================================

-- 1. Revoke TEMPORARY privilege on the current database from untrusted roles
DO $$
BEGIN
    EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC;', current_database());
    EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM ledgerline_app;', current_database());
END $$;

-- 2. Strictly enforce schema privileges
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA ledger_secure FROM PUBLIC;

REVOKE CREATE ON SCHEMA public FROM PUBLIC, ledgerline_app;
REVOKE CREATE ON SCHEMA ledger_secure FROM PUBLIC, ledgerline_app;

GRANT USAGE ON SCHEMA public TO ledgerline_owner, ledgerline_app;
GRANT USAGE ON SCHEMA ledger_secure TO ledgerline_owner, ledgerline_app;

GRANT CREATE ON SCHEMA public, ledger_secure TO ledgerline_owner;

-- 3. Harden search paths for ledger_secure SECURITY DEFINER functions
-- Prioritize ledger_secure over public and ensure pg_temp is last
ALTER FUNCTION ledger_secure.claim_session_identity(UUID, BYTEA)
    SET search_path = pg_catalog, ledger_secure, public, pg_temp;

ALTER FUNCTION ledger_secure.consume_identity_assertion(UUID, BYTEA)
    SET search_path = pg_catalog, ledger_secure, public, pg_temp;

ALTER FUNCTION ledger_secure.establish_session_identity(UUID, BYTEA)
    SET search_path = pg_catalog, ledger_secure, public, pg_temp;

ALTER FUNCTION ledger_secure.get_auth_credentials(VARCHAR)
    SET search_path = pg_catalog, ledger_secure, public, pg_temp;

ALTER FUNCTION ledger_secure.is_account_holder(UUID)
    SET search_path = pg_catalog, ledger_secure, public, pg_temp;

ALTER FUNCTION ledger_secure.is_account_member(UUID)
    SET search_path = pg_catalog, ledger_secure, public, pg_temp;

ALTER FUNCTION ledger_secure.register_identity_assertion(UUID, VARCHAR, TIMESTAMPTZ, UUID, BYTEA)
    SET search_path = pg_catalog, ledger_secure, public, pg_temp;

ALTER FUNCTION ledger_secure.clear_session_identity(BIGINT)
    SET search_path = pg_catalog, ledger_secure, pg_temp;

ALTER FUNCTION ledger_secure.current_verified_user_id()
    SET search_path = pg_catalog, ledger_secure, pg_temp;

ALTER FUNCTION ledger_secure.current_verified_user_role()
    SET search_path = pg_catalog, ledger_secure, pg_temp;

-- 4. Harden search paths for public domain SECURITY DEFINER functions
-- Prioritize ledger_secure over public so verified session calls cannot be shadowed
ALTER FUNCTION public.assign_account_membership(UUID, UUID, VARCHAR)
    SET search_path = pg_catalog, ledger_secure, public, pg_temp;

ALTER FUNCTION public.bind_transaction_to_idempotency_key(VARCHAR, UUID)
    SET search_path = pg_catalog, ledger_secure, public, pg_temp;

ALTER FUNCTION public.create_customer_account(VARCHAR, VARCHAR)
    SET search_path = pg_catalog, ledger_secure, public, pg_temp;

ALTER FUNCTION public.create_pending_financial_transaction(VARCHAR, VARCHAR, BIGINT, UUID, UUID, UUID)
    SET search_path = pg_catalog, ledger_secure, public, pg_temp;

ALTER FUNCTION public.process_financial_transaction(UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR)
    SET search_path = pg_catalog, ledger_secure, public, pg_temp;

ALTER FUNCTION public.record_business_refusal(UUID, VARCHAR)
    SET search_path = pg_catalog, ledger_secure, public, pg_temp;

ALTER FUNCTION public.revoke_account_membership(UUID, UUID)
    SET search_path = pg_catalog, ledger_secure, public, pg_temp;

ALTER FUNCTION public.set_user_status(UUID, BOOLEAN, VARCHAR)
    SET search_path = pg_catalog, ledger_secure, public, pg_temp;

ALTER FUNCTION public.update_account_status(UUID, VARCHAR, VARCHAR)
    SET search_path = pg_catalog, ledger_secure, public, pg_temp;

-- 5. Harden search paths for public triggers and utility functions
-- Pure logic triggers do not require public in search path
ALTER FUNCTION public.enforce_append_only_record()
    SET search_path = pg_catalog, pg_temp;

ALTER FUNCTION public.enforce_idempotency_lifecycle()
    SET search_path = pg_catalog, pg_temp;

ALTER FUNCTION public.enforce_transaction_immutability()
    SET search_path = pg_catalog, pg_temp;

-- Triggers and procedures accessing public domain tables
ALTER FUNCTION public.maintain_account_balance_from_posting()
    SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.prevent_extra_postings_on_finalized_tx()
    SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.register_customer_user(VARCHAR, VARCHAR)
    SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION public.validate_ledger_transaction_at_commit()
    SET search_path = pg_catalog, public, pg_temp;

-- 6. Guarantee function ownership and least-privilege execution
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ledger_secure FROM PUBLIC;

REVOKE ALL ON FUNCTION ledger_secure.claim_session_identity(UUID, BYTEA) FROM PUBLIC, ledgerline_app;
REVOKE ALL ON FUNCTION public.record_business_refusal(UUID, VARCHAR) FROM PUBLIC, ledgerline_app;

GRANT EXECUTE ON FUNCTION ledger_secure.claim_session_identity(UUID, BYTEA) TO ledgerline_owner;
GRANT EXECUTE ON FUNCTION public.record_business_refusal(UUID, VARCHAR) TO ledgerline_owner;
