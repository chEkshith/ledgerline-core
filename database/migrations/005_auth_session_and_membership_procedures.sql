-- ==============================================================================
-- Migration: 005_auth_session_and_membership_procedures.sql
-- Description: Auth lifecycle, identity assertion, account creation & memberships.
-- ==============================================================================

-- 1. Register Customer User
CREATE OR REPLACE FUNCTION public.register_customer_user(
    p_email VARCHAR(255),
    p_password_hash VARCHAR(255)
) RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
BEGIN
    INSERT INTO public.users (
        email,
        password_hash,
        role,
        is_active
    ) VALUES (
        LOWER(TRIM(p_email)),
        p_password_hash,
        'customer',
        true
    ) RETURNING id INTO v_user_id;

    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        v_user_id,
        'customer',
        'USER_REGISTERED',
        'user',
        v_user_id,
        jsonb_build_object('email', LOWER(TRIM(p_email)))
    );

    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.register_customer_user(VARCHAR, VARCHAR) OWNER TO ledgerline_owner;

-- 2. Fetch User Credentials for Login (Restricted)
CREATE OR REPLACE FUNCTION ledger_secure.get_auth_credentials(
    p_email VARCHAR(255)
) RETURNS TABLE (
    user_id UUID,
    role VARCHAR(20),
    is_active BOOLEAN,
    password_hash VARCHAR(255)
) AS $$
BEGIN
    RETURN QUERY
    SELECT u.id, u.role, u.is_active, u.password_hash
      FROM public.users u
     WHERE u.email = LOWER(TRIM(p_email));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, ledger_secure, pg_temp;
ALTER FUNCTION ledger_secure.get_auth_credentials(VARCHAR) OWNER TO ledgerline_owner;

-- 3. Set User Active Status (Admin Only)
CREATE OR REPLACE FUNCTION public.set_user_status(
    p_target_user_id UUID,
    p_is_active BOOLEAN,
    p_reason VARCHAR(255)
) RETURNS VOID AS $$
DECLARE
    v_current_user_id UUID;
    v_current_role VARCHAR;
    v_old_status BOOLEAN;
BEGIN
    v_current_user_id := ledger_secure.current_verified_user_id();
    v_current_role := ledger_secure.current_verified_user_role();

    IF v_current_role != 'admin' THEN
        RAISE EXCEPTION 'Only an administrator can modify user status'
            USING ERRCODE = '42501';
    END IF;

    SELECT is_active INTO v_old_status
      FROM public.users
     WHERE id = p_target_user_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target user % does not exist', p_target_user_id
            USING ERRCODE = '02000';
    END IF;

    IF v_old_status = p_is_active THEN
        RAISE EXCEPTION 'User active status is already %', p_is_active
            USING ERRCODE = '25000';
    END IF;

    UPDATE public.users
       SET is_active = p_is_active,
           updated_at = clock_timestamp()
     WHERE id = p_target_user_id;

    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        v_current_user_id,
        v_current_role,
        'USER_STATUS_CHANGED',
        'user',
        p_target_user_id,
        jsonb_build_object('old_is_active', v_old_status, 'new_is_active', p_is_active, 'reason', p_reason)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, ledger_secure, pg_temp;
ALTER FUNCTION public.set_user_status(UUID, BOOLEAN, VARCHAR) OWNER TO ledgerline_owner;

-- 4. Register and Consume Identity Assertion (Committed Before Financial Execution)
CREATE OR REPLACE FUNCTION ledger_secure.register_identity_assertion(
    p_user_id UUID,
    p_role VARCHAR(20),
    p_expires_at TIMESTAMPTZ,
    p_nonce UUID,
    p_signature BYTEA
) RETURNS VOID AS $$
DECLARE
    v_user RECORD;
    v_canonical TEXT;
    v_computed_hmac BYTEA;
    v_secret BYTEA;
BEGIN
    -- 1. Expiry & Lifetime Invariants
    IF p_expires_at <= clock_timestamp() THEN
        RAISE EXCEPTION 'Identity assertion has expired'
            USING ERRCODE = '28000';
    END IF;
    IF p_expires_at > clock_timestamp() + INTERVAL '30 seconds' THEN
        RAISE EXCEPTION 'Identity assertion lifetime exceeds maximum permitted (30s)'
            USING ERRCODE = '28000';
    END IF;

    -- 2. Real-time authoritative check against database users table
    SELECT id, role, is_active INTO v_user
      FROM public.users
     WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assertion user % does not exist in database', p_user_id
            USING ERRCODE = '28000';
    END IF;

    IF NOT v_user.is_active THEN
        RAISE EXCEPTION 'Assertion user % is inactive or suspended', p_user_id
            USING ERRCODE = '28000';
    END IF;

    IF v_user.role != p_role THEN
        RAISE EXCEPTION 'Assertion role % does not match authoritative database role %', p_role, v_user.role
            USING ERRCODE = '28000';
    END IF;

    -- 3. Fetch Active Signing Secret
    SELECT secret_bytes INTO v_secret
      FROM ledger_secure.auth_secrets
     WHERE is_active = true
     ORDER BY key_version DESC
     LIMIT 1;

    IF v_secret IS NULL THEN
        RAISE EXCEPTION 'Database authentication secret not configured'
            USING ERRCODE = '55000';
    END IF;

    -- 4. Compute Canonical HMAC-SHA256
    v_canonical := 'IDENTITY|' || 
                   p_user_id::text || '|' || 
                   p_role || '|' || 
                   to_char(p_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || '|' || 
                   p_nonce::text;

    v_computed_hmac := ledger_secure.hmac(
        convert_to(v_canonical, 'UTF8'),
        v_secret,
        'sha256'
    );

    IF v_computed_hmac IS DISTINCT FROM p_signature THEN
        RAISE EXCEPTION 'Cryptographic signature verification failed'
            USING ERRCODE = '28000';
    END IF;

    -- 5. Atomically Record Assertion (Unique constraints enforce single-use)
    INSERT INTO ledger_secure.consumed_assertions (
        nonce,
        signature,
        user_id,
        role,
        expires_at,
        registered_at,
        registered_pid,
        status
    ) VALUES (
        p_nonce,
        p_signature,
        p_user_id,
        p_role,
        p_expires_at,
        clock_timestamp(),
        pg_backend_pid(),
        'REGISTERED'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, ledger_secure, pg_temp;
ALTER FUNCTION ledger_secure.register_identity_assertion(UUID, VARCHAR, TIMESTAMPTZ, UUID, BYTEA) OWNER TO ledgerline_owner;

-- 5a. Consume Identity Assertion (Committed Independently Before Financial Execution)
CREATE OR REPLACE FUNCTION ledger_secure.consume_identity_assertion(
    p_nonce UUID,
    p_signature BYTEA
) RETURNS VOID AS $$
DECLARE
    v_assertion RECORD;
    v_user RECORD;
BEGIN
    SELECT * INTO v_assertion
      FROM ledger_secure.consumed_assertions
     WHERE nonce = p_nonce
       AND signature = p_signature
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No matching registered assertion found for nonce %', p_nonce
            USING ERRCODE = '28000';
    END IF;

    IF v_assertion.status != 'REGISTERED' THEN
        RAISE EXCEPTION 'Assertion % has already been claimed and cannot be reused', p_nonce
            USING ERRCODE = '28000';
    END IF;

    IF v_assertion.registered_pid != pg_backend_pid() THEN
        RAISE EXCEPTION 'Assertion registered by PID %, cannot claim on PID %',
            v_assertion.registered_pid, pg_backend_pid()
            USING ERRCODE = '28000';
    END IF;

    IF v_assertion.registered_at < clock_timestamp() - INTERVAL '10 seconds' THEN
        RAISE EXCEPTION 'Assertion claim window expired (must be claimed within 10s of registration)'
            USING ERRCODE = '28000';
    END IF;

    IF v_assertion.expires_at <= clock_timestamp() THEN
        RAISE EXCEPTION 'Assertion has expired'
            USING ERRCODE = '28000';
    END IF;

    -- Re-verify user is still active in database
    SELECT id, role, is_active INTO v_user
      FROM public.users
     WHERE id = v_assertion.user_id;

    IF NOT FOUND OR NOT v_user.is_active OR v_user.role != v_assertion.role THEN
        RAISE EXCEPTION 'User status or role has changed since assertion registration'
            USING ERRCODE = '28000';
    END IF;

    -- Atomically transition status to CONSUMED
    UPDATE ledger_secure.consumed_assertions
       SET status = 'CONSUMED',
           claimed_at = clock_timestamp()
     WHERE nonce = p_nonce;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, ledger_secure, pg_temp;
ALTER FUNCTION ledger_secure.consume_identity_assertion(UUID, BYTEA) OWNER TO ledgerline_owner;

-- 5b. Establish Verified Session Context (Inside Financial Transaction)
CREATE OR REPLACE FUNCTION ledger_secure.establish_session_identity(
    p_nonce UUID,
    p_signature BYTEA
) RETURNS VOID AS $$
DECLARE
    v_assertion RECORD;
    v_user RECORD;
BEGIN
    -- 1. Opportunistic Cleanup of Stale Contexts
    DELETE FROM ledger_secure.active_session_contexts
     WHERE backend_pid = pg_backend_pid()
        OR established_at < clock_timestamp() - INTERVAL '2 minutes';

    -- 2. Verify Consumed Assertion
    SELECT * INTO v_assertion
      FROM ledger_secure.consumed_assertions
     WHERE nonce = p_nonce
       AND signature = p_signature
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No matching assertion found for nonce %', p_nonce
            USING ERRCODE = '28000';
    END IF;

    IF v_assertion.status != 'CONSUMED' THEN
        IF v_assertion.status = 'REGISTERED' THEN
            RAISE EXCEPTION 'Assertion % has not been consumed; consumption must commit before establishing session context', p_nonce
                USING ERRCODE = '28000';
        ELSE
            RAISE EXCEPTION 'Assertion % has already been bound or is invalid (status: %)', p_nonce, v_assertion.status
                USING ERRCODE = '28000';
        END IF;
    END IF;

    IF v_assertion.registered_pid != pg_backend_pid() THEN
        RAISE EXCEPTION 'Assertion registered by PID %, cannot establish on PID %',
            v_assertion.registered_pid, pg_backend_pid()
            USING ERRCODE = '28000';
    END IF;

    IF v_assertion.expires_at <= clock_timestamp() THEN
        RAISE EXCEPTION 'Assertion has expired'
            USING ERRCODE = '28000';
    END IF;

    -- 3. Re-verify user is still active in database
    SELECT id, role, is_active INTO v_user
      FROM public.users
     WHERE id = v_assertion.user_id;

    IF NOT FOUND OR NOT v_user.is_active OR v_user.role != v_assertion.role THEN
        RAISE EXCEPTION 'User status or role has changed since assertion registration'
            USING ERRCODE = '28000';
    END IF;

    -- Mark assertion BOUND within this transaction
    UPDATE ledger_secure.consumed_assertions
       SET status = 'BOUND',
           claimed_txid = txid_current()
     WHERE nonce = p_nonce;

    -- 4. Establish Active Context Bound to (PID, TXID)
    INSERT INTO ledger_secure.active_session_contexts (
        backend_pid,
        txid,
        user_id,
        role,
        nonce,
        established_at
    ) VALUES (
        pg_backend_pid(),
        txid_current(),
        v_assertion.user_id,
        v_assertion.role,
        p_nonce,
        clock_timestamp()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, ledger_secure, pg_temp;
ALTER FUNCTION ledger_secure.establish_session_identity(UUID, BYTEA) OWNER TO ledgerline_owner;

-- 5c. Backward Compatibility Wrapper for claim_session_identity
CREATE OR REPLACE FUNCTION ledger_secure.claim_session_identity(
    p_nonce UUID,
    p_signature BYTEA
) RETURNS VOID AS $$
BEGIN
    PERFORM ledger_secure.consume_identity_assertion(p_nonce, p_signature);
    PERFORM ledger_secure.establish_session_identity(p_nonce, p_signature);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, ledger_secure, pg_temp;
ALTER FUNCTION ledger_secure.claim_session_identity(UUID, BYTEA) OWNER TO ledgerline_owner;

-- 6. Explicit Session Context Cleanup Procedure
CREATE OR REPLACE FUNCTION ledger_secure.clear_session_identity(p_txid BIGINT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
    IF p_txid IS NOT NULL THEN
        DELETE FROM ledger_secure.active_session_contexts
         WHERE backend_pid = pg_backend_pid()
           AND txid = p_txid;
    ELSE
        DELETE FROM ledger_secure.active_session_contexts
         WHERE backend_pid = pg_backend_pid();
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, ledger_secure, pg_temp;
ALTER FUNCTION ledger_secure.clear_session_identity(BIGINT) OWNER TO ledgerline_owner;

-- 7. Controlled Customer Account Creation (Atomic with Initial Account Holder)
CREATE OR REPLACE FUNCTION public.create_customer_account(
    p_account_number VARCHAR(34),
    p_currency VARCHAR(3) DEFAULT 'INR'
) RETURNS UUID AS $$
DECLARE
    v_current_user_id UUID;
    v_current_role VARCHAR;
    v_account_id UUID;
BEGIN
    v_current_user_id := ledger_secure.current_verified_user_id();
    v_current_role := ledger_secure.current_verified_user_role();

    IF v_current_user_id IS NULL THEN
        RAISE EXCEPTION 'Account creation requires verified session identity'
            USING ERRCODE = '28000';
    END IF;

    INSERT INTO public.accounts (
        account_number,
        account_type,
        system_role_type,
        currency,
        status,
        current_balance
    ) VALUES (
        p_account_number,
        'customer',
        NULL,
        p_currency,
        'active',
        0
    ) RETURNING id INTO v_account_id;

    INSERT INTO public.account_memberships (
        account_id,
        user_id,
        role
    ) VALUES (
        v_account_id,
        v_current_user_id,
        'account_holder'
    );

    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        v_current_user_id,
        v_current_role,
        'ACCOUNT_CREATED',
        'account',
        v_account_id,
        jsonb_build_object('account_number', p_account_number, 'currency', p_currency)
    );

    RETURN v_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, ledger_secure, pg_temp;
ALTER FUNCTION public.create_customer_account(VARCHAR, VARCHAR) OWNER TO ledgerline_owner;

-- 8. Controlled Status Transition Procedure
CREATE OR REPLACE FUNCTION public.update_account_status(
    p_account_id UUID,
    p_new_status VARCHAR(20),
    p_reason VARCHAR(255)
) RETURNS VOID AS $$
DECLARE
    v_current_user_id UUID;
    v_current_role VARCHAR;
    v_acc RECORD;
BEGIN
    v_current_user_id := ledger_secure.current_verified_user_id();
    v_current_role := ledger_secure.current_verified_user_role();

    IF v_current_user_id IS NULL THEN
        RAISE EXCEPTION 'Status update requires verified session identity'
            USING ERRCODE = '28000';
    END IF;

    IF p_new_status NOT IN ('active', 'frozen', 'closed') THEN
        RAISE EXCEPTION 'Invalid target account status: %', p_new_status
            USING ERRCODE = '22023';
    END IF;

    -- Lock parent account row
    SELECT * INTO v_acc
      FROM public.accounts
     WHERE id = p_account_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Account % does not exist', p_account_id
            USING ERRCODE = '02000';
    END IF;

    IF v_acc.status = 'closed' THEN
        RAISE EXCEPTION 'Account % is permanently closed; status cannot be modified', p_account_id
            USING ERRCODE = '25000';
    END IF;

    IF v_acc.status = p_new_status THEN
        RAISE EXCEPTION 'Account is already in status %', p_new_status
            USING ERRCODE = '25000';
    END IF;

    -- Authorization Matrix
    IF p_new_status = 'frozen' THEN
        IF v_current_role != 'admin' AND NOT ledger_secure.is_account_holder(p_account_id) THEN
            RAISE EXCEPTION 'Only an administrator or active account_holder may freeze an account'
                USING ERRCODE = '42501';
        END IF;
    ELSIF p_new_status = 'active' THEN
        IF v_current_role != 'admin' THEN
            RAISE EXCEPTION 'Only an administrator can unfreeze an account'
                USING ERRCODE = '42501';
        END IF;
    ELSIF p_new_status = 'closed' THEN
        IF v_current_role != 'admin' THEN
            RAISE EXCEPTION 'Only an administrator can close an account'
                USING ERRCODE = '42501';
        END IF;
        IF v_acc.current_balance != 0 THEN
            RAISE EXCEPTION 'Cannot close account with non-zero balance (% paise)', v_acc.current_balance
                USING ERRCODE = '25000';
        END IF;
    END IF;

    UPDATE public.accounts
       SET status = p_new_status,
           updated_at = clock_timestamp()
     WHERE id = p_account_id;

    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        v_current_user_id,
        v_current_role,
        'ACCOUNT_STATUS_CHANGED',
        'account',
        p_account_id,
        jsonb_build_object(
            'old_status', v_acc.status,
            'new_status', p_new_status,
            'reason', p_reason
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, ledger_secure, pg_temp;
ALTER FUNCTION public.update_account_status(UUID, VARCHAR, VARCHAR) OWNER TO ledgerline_owner;

-- 9. Assign or Update Membership (Locks Parent Account Row)
CREATE OR REPLACE FUNCTION public.assign_account_membership(
    p_account_id UUID,
    p_assigned_user_id UUID,
    p_role VARCHAR(20)
) RETURNS VOID AS $$
DECLARE
    v_current_user_id UUID;
    v_current_role VARCHAR;
    v_account RECORD;
    v_target_user RECORD;
    v_existing_mem RECORD;
BEGIN
    v_current_user_id := ledger_secure.current_verified_user_id();
    v_current_role := ledger_secure.current_verified_user_role();

    IF v_current_user_id IS NULL THEN
        RAISE EXCEPTION 'Membership modification requires verified session identity'
            USING ERRCODE = '28000';
    END IF;

    IF p_role NOT IN ('account_holder', 'auditor') THEN
        RAISE EXCEPTION 'Invalid membership role: %', p_role USING ERRCODE = '22023';
    END IF;

    -- CRITICAL CONCURRENCY FIX: Lock Parent Account Row First
    SELECT * INTO v_account
      FROM public.accounts
     WHERE id = p_account_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Account % does not exist', p_account_id USING ERRCODE = '02000';
    END IF;

    IF v_account.status = 'closed' THEN
        RAISE EXCEPTION 'Cannot modify memberships on closed account %', p_account_id USING ERRCODE = '25000';
    END IF;

    -- Verify target user
    SELECT * INTO v_target_user FROM public.users WHERE id = p_assigned_user_id;
    IF NOT FOUND OR NOT v_target_user.is_active THEN
        RAISE EXCEPTION 'Assigned user does not exist or is inactive' USING ERRCODE = '22023';
    END IF;

    -- Authorization hierarchy
    IF p_role = 'account_holder' THEN
        IF v_current_role != 'admin' THEN
            RAISE EXCEPTION 'Only an administrator can grant the account_holder role'
                USING ERRCODE = '42501';
        END IF;
    ELSIF p_role = 'auditor' THEN
        IF v_current_role != 'admin' AND NOT ledger_secure.is_account_holder(p_account_id) THEN
            RAISE EXCEPTION 'Only an admin or existing account_holder can assign an auditor'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Guarded upsert
    SELECT * INTO v_existing_mem
      FROM public.account_memberships
     WHERE account_id = p_account_id
       AND user_id = p_assigned_user_id;

    IF FOUND THEN
        IF v_existing_mem.role = 'account_holder' AND v_current_role != 'admin' THEN
            RAISE EXCEPTION 'Only an administrator may modify an existing account_holder membership'
                USING ERRCODE = '42501';
        END IF;

        UPDATE public.account_memberships
           SET role = p_role,
               updated_at = clock_timestamp()
         WHERE id = v_existing_mem.id;
    ELSE
        INSERT INTO public.account_memberships (
            account_id,
            user_id,
            role
        ) VALUES (
            p_account_id,
            p_assigned_user_id,
            p_role
        );
    END IF;

    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        v_current_user_id,
        v_current_role,
        'MEMBERSHIP_ASSIGNED',
        'account_membership',
        p_account_id,
        jsonb_build_object('assigned_user_id', p_assigned_user_id, 'role', p_role)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, ledger_secure, pg_temp;
ALTER FUNCTION public.assign_account_membership(UUID, UUID, VARCHAR) OWNER TO ledgerline_owner;

-- 10. Revoke Membership (Locks Parent Account Row, Protects Final Holder)
CREATE OR REPLACE FUNCTION public.revoke_account_membership(
    p_account_id UUID,
    p_target_user_id UUID
) RETURNS VOID AS $$
DECLARE
    v_current_user_id UUID;
    v_current_role VARCHAR;
    v_account RECORD;
    v_target_mem RECORD;
    v_holder_count INT;
BEGIN
    v_current_user_id := ledger_secure.current_verified_user_id();
    v_current_role := ledger_secure.current_verified_user_role();

    IF v_current_user_id IS NULL THEN
        RAISE EXCEPTION 'Membership revocation requires verified session identity'
            USING ERRCODE = '28000';
    END IF;

    -- CRITICAL CONCURRENCY FIX: Lock Parent Account Row First
    SELECT * INTO v_account
      FROM public.accounts
     WHERE id = p_account_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Account % does not exist', p_account_id USING ERRCODE = '02000';
    END IF;

    SELECT * INTO v_target_mem
      FROM public.account_memberships
     WHERE account_id = p_account_id
       AND user_id = p_target_user_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Membership record does not exist' USING ERRCODE = '02000';
    END IF;

    -- Authorization & final holder protection
    IF v_target_mem.role = 'account_holder' THEN
        IF v_current_role != 'admin' THEN
            RAISE EXCEPTION 'Only an administrator can revoke an account_holder membership'
                USING ERRCODE = '42501';
        END IF;

        -- Under parent account lock, count is strictly serialized and accurate
        SELECT COUNT(*) INTO v_holder_count
          FROM public.account_memberships
         WHERE account_id = p_account_id
           AND role = 'account_holder';

        IF v_holder_count <= 1 THEN
            RAISE EXCEPTION 'Cannot revoke the final account_holder of account %', p_account_id
                USING ERRCODE = '25000';
        END IF;
    ELSIF v_target_mem.role = 'auditor' THEN
        IF v_current_role != 'admin' AND NOT ledger_secure.is_account_holder(p_account_id) THEN
            RAISE EXCEPTION 'Only an admin or account_holder can revoke an auditor membership'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    DELETE FROM public.account_memberships WHERE id = v_target_mem.id;

    INSERT INTO public.audit_logs (
        actor_id,
        actor_role,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        v_current_user_id,
        v_current_role,
        'MEMBERSHIP_REVOKED',
        'account_membership',
        p_account_id,
        jsonb_build_object('revoked_user_id', p_target_user_id, 'former_role', v_target_mem.role)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, ledger_secure, pg_temp;
ALTER FUNCTION public.revoke_account_membership(UUID, UUID) OWNER TO ledgerline_owner;

