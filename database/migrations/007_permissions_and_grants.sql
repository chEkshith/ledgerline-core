-- ==============================================================================
-- Migration: 007_permissions_and_grants.sql
-- Description: Explicit table DML permissions, ownership verification & function grants.
-- ==============================================================================

-- 1. Table Grants for runtime role ledgerline_app
REVOKE ALL ON TABLE public.users FROM ledgerline_app;
GRANT SELECT ON TABLE public.users TO ledgerline_app;

REVOKE ALL ON TABLE public.accounts FROM ledgerline_app;
GRANT SELECT ON TABLE public.accounts TO ledgerline_app;

REVOKE ALL ON TABLE public.account_memberships FROM ledgerline_app;
GRANT SELECT ON TABLE public.account_memberships TO ledgerline_app;

REVOKE ALL ON TABLE public.transactions FROM ledgerline_app;
GRANT SELECT, INSERT ON TABLE public.transactions TO ledgerline_app;

REVOKE ALL ON TABLE public.ledger_postings FROM ledgerline_app;
GRANT SELECT ON TABLE public.ledger_postings TO ledgerline_app;

REVOKE ALL ON TABLE public.idempotency_keys FROM ledgerline_app;
GRANT SELECT, INSERT ON TABLE public.idempotency_keys TO ledgerline_app;

REVOKE ALL ON TABLE public.audit_logs FROM ledgerline_app;
GRANT SELECT ON TABLE public.audit_logs TO ledgerline_app;

-- 2. Revoke all execution privileges from PUBLIC across all schemas
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ledger_secure FROM PUBLIC;

-- Grant function execution on all schema functions to owner role
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ledgerline_owner;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ledger_secure TO ledgerline_owner;

-- 3. Grant Execution on Controlled Functions to ledgerline_app
GRANT EXECUTE ON FUNCTION public.register_customer_user(VARCHAR, VARCHAR) TO ledgerline_app;
GRANT EXECUTE ON FUNCTION ledger_secure.get_auth_credentials(VARCHAR) TO ledgerline_app;
GRANT EXECUTE ON FUNCTION public.set_user_status(UUID, BOOLEAN, VARCHAR) TO ledgerline_app;

GRANT EXECUTE ON FUNCTION ledger_secure.register_identity_assertion(UUID, VARCHAR, TIMESTAMPTZ, UUID, BYTEA) TO ledgerline_app;
GRANT EXECUTE ON FUNCTION ledger_secure.consume_identity_assertion(UUID, BYTEA) TO ledgerline_app;
GRANT EXECUTE ON FUNCTION ledger_secure.establish_session_identity(UUID, BYTEA) TO ledgerline_app;
-- Note: claim_session_identity is revoked from ledgerline_app and PUBLIC; apps must use the independent lifecycle
REVOKE ALL ON FUNCTION ledger_secure.claim_session_identity(UUID, BYTEA) FROM PUBLIC;
REVOKE ALL ON FUNCTION ledger_secure.claim_session_identity(UUID, BYTEA) FROM ledgerline_app;
GRANT EXECUTE ON FUNCTION ledger_secure.claim_session_identity(UUID, BYTEA) TO ledgerline_owner;
GRANT EXECUTE ON FUNCTION ledger_secure.clear_session_identity(BIGINT) TO ledgerline_app;

GRANT EXECUTE ON FUNCTION public.create_customer_account(VARCHAR, VARCHAR) TO ledgerline_app;
GRANT EXECUTE ON FUNCTION public.update_account_status(UUID, VARCHAR, VARCHAR) TO ledgerline_app;
GRANT EXECUTE ON FUNCTION public.assign_account_membership(UUID, UUID, VARCHAR) TO ledgerline_app;
GRANT EXECUTE ON FUNCTION public.revoke_account_membership(UUID, UUID) TO ledgerline_app;

GRANT EXECUTE ON FUNCTION public.bind_transaction_to_idempotency_key(VARCHAR, UUID) TO ledgerline_app;
GRANT EXECUTE ON FUNCTION public.create_pending_financial_transaction(VARCHAR, VARCHAR, BIGINT, UUID, UUID, UUID) TO ledgerline_app;
GRANT EXECUTE ON FUNCTION public.process_financial_transaction(UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR) TO ledgerline_app;

GRANT EXECUTE ON FUNCTION ledger_secure.current_verified_user_id() TO ledgerline_app;
GRANT EXECUTE ON FUNCTION ledger_secure.current_verified_user_role() TO ledgerline_app;
GRANT EXECUTE ON FUNCTION ledger_secure.is_account_member(UUID) TO ledgerline_app;
GRANT EXECUTE ON FUNCTION ledger_secure.is_account_holder(UUID) TO ledgerline_app;
