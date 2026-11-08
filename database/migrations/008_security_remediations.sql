-- ==============================================================================
-- Migration: 008_security_remediations.sql
-- Description: Additive security remediation migration:
--   1. Updates consumed_assertions status constraint for independent consumption.
--   2. Installs consume_identity_assertion and establish_session_identity.
--   3. Installs enforce_transaction_immutability trigger on public.transactions.
--   4. Enforces least-privilege permissions by revoking direct idempotency_keys updates.
-- ==============================================================================

-- 1. Assertion Status Constraint Update
ALTER TABLE ledger_secure.consumed_assertions 
    DROP CONSTRAINT IF EXISTS chk_assertion_status;

ALTER TABLE ledger_secure.consumed_assertions 
    ADD CONSTRAINT chk_assertion_status CHECK (status IN ('REGISTERED', 'CONSUMED', 'BOUND'));

-- 2. Procedure: Consume Identity Assertion (Independently Committed)
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

-- 3. Procedure: Establish Verified Session Context (Inside Financial Transaction)
CREATE OR REPLACE FUNCTION ledger_secure.establish_session_identity(
    p_nonce UUID,
    p_signature BYTEA
) RETURNS VOID AS $$
DECLARE
    v_assertion RECORD;
    v_user RECORD;
BEGIN
    -- Opportunistic cleanup of stale contexts
    DELETE FROM ledger_secure.active_session_contexts
     WHERE backend_pid = pg_backend_pid()
        OR established_at < clock_timestamp() - INTERVAL '2 minutes';

    -- Verify Consumed Assertion
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

    -- Re-verify user is still active in database
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

    -- Establish Active Context Bound to (PID, TXID)
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

-- 4. Procedure: Restricted wrapper for claim_session_identity
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
REVOKE ALL ON FUNCTION ledger_secure.claim_session_identity(UUID, BYTEA) FROM PUBLIC;
REVOKE ALL ON FUNCTION ledger_secure.claim_session_identity(UUID, BYTEA) FROM ledgerline_app;
GRANT EXECUTE ON FUNCTION ledger_secure.claim_session_identity(UUID, BYTEA) TO ledgerline_owner;

-- 5. Trigger: Finalized Transaction Immutability
CREATE OR REPLACE FUNCTION public.enforce_transaction_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('posted', 'refused') THEN
            RAISE EXCEPTION 'Finalized transactions (%) cannot be deleted', OLD.status
                USING ERRCODE = '23514';
        END IF;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        -- If already finalized, completely immutable
        IF OLD.status IN ('posted', 'refused') THEN
            RAISE EXCEPTION 'Transaction % is finalized (%) and immutable; updates are prohibited',
                OLD.id, OLD.status
                USING ERRCODE = '23514';
        END IF;

        -- If transitioning from pending to posted or refused, financial identity fields must not change
        IF OLD.status = 'pending' AND NEW.status IN ('posted', 'refused') THEN
            IF NEW.amount_paise IS DISTINCT FROM OLD.amount_paise OR
               NEW.currency IS DISTINCT FROM OLD.currency OR
               NEW.source_account_id IS DISTINCT FROM OLD.source_account_id OR
               NEW.destination_account_id IS DISTINCT FROM OLD.destination_account_id OR
               NEW.type IS DISTINCT FROM OLD.type OR
               NEW.created_by IS DISTINCT FROM OLD.created_by OR
               NEW.original_transaction_id IS DISTINCT FROM OLD.original_transaction_id THEN
                RAISE EXCEPTION 'Cannot modify financial identity fields of transaction % during finalization', OLD.id
                    USING ERRCODE = '23514';
            END IF;
        END IF;

        RETURN NEW;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.enforce_transaction_immutability() OWNER TO ledgerline_owner;

DROP TRIGGER IF EXISTS trg_protect_finalized_transactions ON public.transactions;
CREATE TRIGGER trg_protect_finalized_transactions
    BEFORE UPDATE OR DELETE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.enforce_transaction_immutability();

-- 6. Least-Privilege Grants & Revokes
REVOKE UPDATE ON TABLE public.idempotency_keys FROM ledgerline_app;

GRANT EXECUTE ON FUNCTION ledger_secure.consume_identity_assertion(UUID, BYTEA) TO ledgerline_app;
GRANT EXECUTE ON FUNCTION ledger_secure.establish_session_identity(UUID, BYTEA) TO ledgerline_app;
REVOKE ALL ON FUNCTION ledger_secure.claim_session_identity(UUID, BYTEA) FROM PUBLIC;
REVOKE ALL ON FUNCTION ledger_secure.claim_session_identity(UUID, BYTEA) FROM ledgerline_app;
GRANT EXECUTE ON FUNCTION ledger_secure.claim_session_identity(UUID, BYTEA) TO ledgerline_owner;
