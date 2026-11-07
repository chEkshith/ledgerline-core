-- ==============================================================================
-- Migration: 003_rls_helpers_and_policies.sql
-- Description: Non-recursive security helpers, FORCE RLS, and explicit policies.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Non-Recursive Security Helper Functions
-- ------------------------------------------------------------------------------

-- Helper 1: Current Verified User ID
CREATE OR REPLACE FUNCTION ledger_secure.current_verified_user_id()
RETURNS UUID AS $$
    SELECT user_id 
      FROM ledger_secure.active_session_contexts
     WHERE backend_pid = pg_backend_pid()
       AND txid = txid_current();
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, ledger_secure, pg_temp;
ALTER FUNCTION ledger_secure.current_verified_user_id() OWNER TO ledgerline_owner;

-- Helper 2: Current Verified User Role
CREATE OR REPLACE FUNCTION ledger_secure.current_verified_user_role()
RETURNS VARCHAR AS $$
    SELECT role 
      FROM ledger_secure.active_session_contexts
     WHERE backend_pid = pg_backend_pid()
       AND txid = txid_current();
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, ledger_secure, pg_temp;
ALTER FUNCTION ledger_secure.current_verified_user_role() OWNER TO ledgerline_owner;

-- Helper 3: Non-Recursive Account Membership Inspector
CREATE OR REPLACE FUNCTION ledger_secure.is_account_member(p_account_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID;
    v_role VARCHAR;
BEGIN
    v_user_id := ledger_secure.current_verified_user_id();
    v_role := ledger_secure.current_verified_user_role();
    
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    IF v_role = 'admin' THEN
        RETURN TRUE;
    END IF;
    
    RETURN EXISTS (
        SELECT 1 
          FROM public.account_memberships
         WHERE account_id = p_account_id
           AND user_id = v_user_id
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, ledger_secure, pg_temp;
ALTER FUNCTION ledger_secure.is_account_member(UUID) OWNER TO ledgerline_owner;

-- Helper 4: Non-Recursive Account Holder Inspector
CREATE OR REPLACE FUNCTION ledger_secure.is_account_holder(p_account_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID;
    v_role VARCHAR;
BEGIN
    v_user_id := ledger_secure.current_verified_user_id();
    v_role := ledger_secure.current_verified_user_role();
    
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    IF v_role = 'admin' THEN
        RETURN TRUE;
    END IF;
    
    RETURN EXISTS (
        SELECT 1 
          FROM public.account_memberships
         WHERE account_id = p_account_id
           AND user_id = v_user_id
           AND role = 'account_holder'
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, ledger_secure, pg_temp;
ALTER FUNCTION ledger_secure.is_account_holder(UUID) OWNER TO ledgerline_owner;

-- ------------------------------------------------------------------------------
-- 2. Enable & Force Row-Level Security
-- ------------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts FORCE ROW LEVEL SECURITY;

ALTER TABLE public.account_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_memberships FORCE ROW LEVEL SECURITY;

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.ledger_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_postings FORCE ROW LEVEL SECURITY;

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys FORCE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 3. Owner Bypass Policies (Required under FORCE RLS for SECURITY DEFINER execution)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS p_owner_bypass_users ON public.users;
CREATE POLICY p_owner_bypass_users ON public.users FOR ALL TO ledgerline_owner USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_owner_bypass_accounts ON public.accounts;
CREATE POLICY p_owner_bypass_accounts ON public.accounts FOR ALL TO ledgerline_owner USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_owner_bypass_memberships ON public.account_memberships;
CREATE POLICY p_owner_bypass_memberships ON public.account_memberships FOR ALL TO ledgerline_owner USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_owner_bypass_transactions ON public.transactions;
CREATE POLICY p_owner_bypass_transactions ON public.transactions FOR ALL TO ledgerline_owner USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_owner_bypass_postings ON public.ledger_postings;
CREATE POLICY p_owner_bypass_postings ON public.ledger_postings FOR ALL TO ledgerline_owner USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_owner_bypass_idempotency ON public.idempotency_keys;
CREATE POLICY p_owner_bypass_idempotency ON public.idempotency_keys FOR ALL TO ledgerline_owner USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_owner_bypass_audit ON public.audit_logs;
CREATE POLICY p_owner_bypass_audit ON public.audit_logs FOR ALL TO ledgerline_owner USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 4. Application Policies for ledgerline_app
-- ------------------------------------------------------------------------------

-- USERS
DROP POLICY IF EXISTS p_app_select_users ON public.users;
CREATE POLICY p_app_select_users ON public.users FOR SELECT TO ledgerline_app
    USING (id = ledger_secure.current_verified_user_id() OR ledger_secure.current_verified_user_role() = 'admin');

-- ACCOUNTS
DROP POLICY IF EXISTS p_app_select_accounts ON public.accounts;
CREATE POLICY p_app_select_accounts ON public.accounts FOR SELECT TO ledgerline_app
    USING (
        account_type = 'system' OR 
        ledger_secure.is_account_member(id)
    );

-- ACCOUNT MEMBERSHIPS
DROP POLICY IF EXISTS p_app_select_memberships ON public.account_memberships;
CREATE POLICY p_app_select_memberships ON public.account_memberships FOR SELECT TO ledgerline_app
    USING (
        user_id = ledger_secure.current_verified_user_id() OR 
        ledger_secure.is_account_member(account_id)
    );

-- TRANSACTIONS
DROP POLICY IF EXISTS p_app_select_transactions ON public.transactions;
CREATE POLICY p_app_select_transactions ON public.transactions FOR SELECT TO ledgerline_app
    USING (
        created_by = ledger_secure.current_verified_user_id() OR
        ledger_secure.is_account_member(source_account_id) OR
        ledger_secure.is_account_member(destination_account_id)
    );

DROP POLICY IF EXISTS p_app_insert_transactions ON public.transactions;
CREATE POLICY p_app_insert_transactions ON public.transactions FOR INSERT TO ledgerline_app
    WITH CHECK (
        created_by = ledger_secure.current_verified_user_id() AND
        status = 'pending'
    );

-- LEDGER POSTINGS
DROP POLICY IF EXISTS p_app_select_postings ON public.ledger_postings;
CREATE POLICY p_app_select_postings ON public.ledger_postings FOR SELECT TO ledgerline_app
    USING (
        ledger_secure.is_account_member(account_id)
    );

-- IDEMPOTENCY KEYS
DROP POLICY IF EXISTS p_app_select_idempotency ON public.idempotency_keys;
CREATE POLICY p_app_select_idempotency ON public.idempotency_keys FOR SELECT TO ledgerline_app
    USING (user_id = ledger_secure.current_verified_user_id());

DROP POLICY IF EXISTS p_app_insert_idempotency ON public.idempotency_keys;
CREATE POLICY p_app_insert_idempotency ON public.idempotency_keys FOR INSERT TO ledgerline_app
    WITH CHECK (
        user_id = ledger_secure.current_verified_user_id() AND
        status = 'in_progress' AND
        response_code IS NULL AND
        response_body IS NULL
    );

DROP POLICY IF EXISTS p_app_update_idempotency ON public.idempotency_keys;
CREATE POLICY p_app_update_idempotency ON public.idempotency_keys FOR UPDATE TO ledgerline_app
    USING (
        user_id = ledger_secure.current_verified_user_id() AND
        status = 'in_progress'
    )
    WITH CHECK (
        user_id = ledger_secure.current_verified_user_id() AND
        status = 'in_progress'
    );

-- AUDIT LOGS
DROP POLICY IF EXISTS p_app_select_audit ON public.audit_logs;
CREATE POLICY p_app_select_audit ON public.audit_logs FOR SELECT TO ledgerline_app
    USING (
        actor_id = ledger_secure.current_verified_user_id() OR
        ledger_secure.current_verified_user_role() = 'admin'
    );

