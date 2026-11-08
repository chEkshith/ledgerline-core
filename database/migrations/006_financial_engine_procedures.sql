-- ==============================================================================
-- Migration: 006_financial_engine_procedures.sql
-- Description: Financial posting engine, atomic idempotency binding & business refusals.
-- ==============================================================================

-- 1. Bind Idempotency Key to Transaction
CREATE OR REPLACE FUNCTION public.bind_transaction_to_idempotency_key(
    p_idempotency_key VARCHAR(255),
    p_transaction_id UUID
) RETURNS VOID AS $$
DECLARE
    v_current_user_id UUID;
    v_rows INT;
BEGIN
    v_current_user_id := ledger_secure.current_verified_user_id();

    IF v_current_user_id IS NULL THEN
        RAISE EXCEPTION 'Binding idempotency key requires active verified session'
            USING ERRCODE = '28000';
    END IF;

    UPDATE public.idempotency_keys
       SET transaction_id = p_transaction_id,
           updated_at = clock_timestamp()
     WHERE user_id = v_current_user_id
       AND idempotency_key = p_idempotency_key
       AND status = 'in_progress'
       AND transaction_id IS NULL;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows != 1 THEN
        RAISE EXCEPTION 'Failed to bind idempotency key % to transaction % (expected 1 row, affected %)',
            p_idempotency_key, p_transaction_id, v_rows
            USING ERRCODE = '55000';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, ledger_secure, pg_temp;
ALTER FUNCTION public.bind_transaction_to_idempotency_key(VARCHAR, UUID) OWNER TO ledgerline_owner;

-- 1b. Create Pending Financial Transaction with Deterministic Ascending Account Locking
CREATE OR REPLACE FUNCTION public.create_pending_financial_transaction(
    p_idempotency_key VARCHAR(255),
    p_type VARCHAR(20),
    p_amount_paise BIGINT,
    p_source_account_id UUID,
    p_destination_account_id UUID,
    p_original_tx_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_current_user_id UUID;
    v_first_lock UUID;
    v_second_lock UUID;
    v_tx_id UUID;
    v_rows INT;
BEGIN
    v_current_user_id := ledger_secure.current_verified_user_id();
    IF v_current_user_id IS NULL THEN
        RAISE EXCEPTION 'Session identity required' USING ERRCODE = '28000';
    END IF;

    -- Deterministic Ascending UUID Account Locking
    v_first_lock  := LEAST(p_source_account_id, p_destination_account_id);
    v_second_lock := GREATEST(p_source_account_id, p_destination_account_id);

    PERFORM 1 FROM public.accounts WHERE id = v_first_lock FOR UPDATE;
    PERFORM 1 FROM public.accounts WHERE id = v_second_lock FOR UPDATE;

    -- Insert Pending Transaction
    INSERT INTO public.transactions (
        type, status, amount_paise, currency, source_account_id,
        destination_account_id, original_transaction_id, created_by
    ) VALUES (
        p_type, 'pending', p_amount_paise, 'INR', p_source_account_id,
        p_destination_account_id, p_original_tx_id, v_current_user_id
    ) RETURNING id INTO v_tx_id;

    -- Bind to Idempotency Key
    UPDATE public.idempotency_keys
       SET transaction_id = v_tx_id,
           updated_at = clock_timestamp()
     WHERE user_id = v_current_user_id
       AND idempotency_key = p_idempotency_key
       AND status = 'in_progress'
       AND transaction_id IS NULL;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows != 1 THEN
        RAISE EXCEPTION 'Failed to bind idempotency key % (expected 1 row, affected %)',
            p_idempotency_key, v_rows USING ERRCODE = '55000';
    END IF;

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, ledger_secure, pg_temp;
ALTER FUNCTION public.create_pending_financial_transaction(VARCHAR, VARCHAR, BIGINT, UUID, UUID, UUID) OWNER TO ledgerline_owner;

-- 2. Business Refusal Recording Helper (Derives Actor Directly From Verified Session Identity)
DROP FUNCTION IF EXISTS public.record_business_refusal(UUID, VARCHAR, UUID, VARCHAR);

CREATE OR REPLACE FUNCTION public.record_business_refusal(
    p_transaction_id UUID,
    p_reason VARCHAR(255)
) RETURNS JSONB AS $$
DECLARE
    v_current_user_id UUID;
    v_current_role VARCHAR;
    v_result JSONB;
    v_rows INT;
BEGIN
    -- Derive actor identity strictly from verified database context to prevent parameter forgery
    v_current_user_id := ledger_secure.current_verified_user_id();
    v_current_role := ledger_secure.current_verified_user_role();

    IF v_current_user_id IS NULL THEN
        RAISE EXCEPTION 'Refusal recording requires an active verified session context'
            USING ERRCODE = '28000';
    END IF;

    UPDATE public.transactions
       SET status = 'refused',
           refusal_reason = p_reason,
           updated_at = clock_timestamp()
     WHERE id = p_transaction_id;

    v_result := jsonb_build_object(
        'status', 'refused',
        'transaction_id', p_transaction_id,
        'reason', p_reason,
        'refused_at', clock_timestamp()
    );

    UPDATE public.idempotency_keys
       SET status = 'resolved',
           response_code = 422,
           response_body = v_result,
           updated_at = clock_timestamp()
     WHERE transaction_id = p_transaction_id
       AND status = 'in_progress';

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows != 1 THEN
        RAISE EXCEPTION 'Failed to resolve refusal idempotency key for transaction % (expected 1 row, updated %)',
            p_transaction_id, v_rows USING ERRCODE = '55000';
    END IF;

    -- Actor identity recorded in audit log is authentic and non-forgeable
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
        'TRANSACTION_REFUSED',
        'transaction',
        p_transaction_id,
        jsonb_build_object('reason', p_reason)
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, ledger_secure, pg_temp;
ALTER FUNCTION public.record_business_refusal(UUID, VARCHAR) OWNER TO ledgerline_owner;
REVOKE ALL ON FUNCTION public.record_business_refusal(UUID, VARCHAR) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_business_refusal(UUID, VARCHAR) FROM ledgerline_app;
GRANT EXECUTE ON FUNCTION public.record_business_refusal(UUID, VARCHAR) TO ledgerline_owner;

-- 3. Unified Financial Transaction Execution Engine
CREATE OR REPLACE FUNCTION public.process_financial_transaction(
    p_transaction_id UUID,
    p_idempotency_key VARCHAR(255),
    p_request_method VARCHAR(10),
    p_request_path VARCHAR(255),
    p_request_payload_hash VARCHAR(64)
) RETURNS JSONB AS $$
DECLARE
    v_current_user_id UUID;
    v_current_role VARCHAR;
    v_tx RECORD;
    v_orig_tx RECORD;
    v_first_lock UUID;
    v_second_lock UUID;
    v_source_acc RECORD;
    v_dest_acc RECORD;
    v_idemp RECORD;
    v_result JSONB;
    v_rows INT;
BEGIN
    -- 1. Verify Caller Identity
    v_current_user_id := ledger_secure.current_verified_user_id();
    v_current_role := ledger_secure.current_verified_user_role();

    IF v_current_user_id IS NULL THEN
        RAISE EXCEPTION 'Transaction execution requires an established database identity'
            USING ERRCODE = '28000';
    END IF;

    -- 2. Lock and Validate Transaction Row
    SELECT * INTO v_tx
      FROM public.transactions
     WHERE id = p_transaction_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction % does not exist', p_transaction_id USING ERRCODE = '02000';
    END IF;

    IF v_tx.status != 'pending' THEN
        RAISE EXCEPTION 'Transaction % is in status %, only pending transactions can be executed',
            p_transaction_id, v_tx.status USING ERRCODE = '25000';
    END IF;

    IF (v_current_role IS DISTINCT FROM 'admin') AND v_tx.created_by != v_current_user_id THEN
        RAISE EXCEPTION 'Caller % is not authorized to execute transaction created by %',
            v_current_user_id, v_tx.created_by USING ERRCODE = '42501';
    END IF;

    -- 3. Lock and Strictly Validate Idempotency Record
    SELECT * INTO v_idemp
      FROM public.idempotency_keys
     WHERE transaction_id = p_transaction_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No idempotency key is bound to transaction %', p_transaction_id USING ERRCODE = '55000';
    END IF;

    IF v_idemp.user_id != v_current_user_id THEN
        RAISE EXCEPTION 'Idempotency owner mismatch' USING ERRCODE = '42501';
    END IF;

    IF v_idemp.idempotency_key != p_idempotency_key THEN
        RAISE EXCEPTION 'Provided idempotency key does not match transaction binding' USING ERRCODE = '22023';
    END IF;

    IF v_idemp.request_method != p_request_method OR
       v_idemp.request_path != p_request_path OR
       v_idemp.request_payload_hash != p_request_payload_hash THEN
        RAISE EXCEPTION 'Idempotency request identity mismatch (method/path/payload)' USING ERRCODE = '22023';
    END IF;

    IF v_idemp.status != 'in_progress' THEN
        RAISE EXCEPTION 'Idempotency key % is already resolved; cannot re-execute', p_idempotency_key USING ERRCODE = '55000';
    END IF;

    -- 4. Reversal Integrity Validation
    IF v_tx.type = 'reversal' THEN
        IF v_current_role IS DISTINCT FROM 'admin' THEN
            RAISE EXCEPTION 'Only administrators may execute transaction reversals' USING ERRCODE = '42501';
        END IF;

        SELECT * INTO v_orig_tx
          FROM public.transactions
         WHERE id = v_tx.original_transaction_id
           FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Original transaction % does not exist', v_tx.original_transaction_id USING ERRCODE = '02000';
        END IF;

        IF v_orig_tx.status != 'posted' THEN
            RETURN public.record_business_refusal(p_transaction_id, 'ORIGINAL_TRANSACTION_NOT_POSTED');
        END IF;

        IF v_orig_tx.type = 'reversal' THEN
            RAISE EXCEPTION 'Cannot reverse a reversal transaction' USING ERRCODE = '22023';
        END IF;

        IF v_tx.source_account_id != v_orig_tx.destination_account_id OR
           v_tx.destination_account_id != v_orig_tx.source_account_id THEN
            RAISE EXCEPTION 'Reversal endpoints must be exact inversion of original endpoints' USING ERRCODE = '22023';
        END IF;

        IF v_tx.amount_paise != v_orig_tx.amount_paise OR v_tx.currency != v_orig_tx.currency THEN
            RAISE EXCEPTION 'Reversal amount and currency must match original transaction exactly' USING ERRCODE = '22023';
        END IF;

        IF EXISTS (
            SELECT 1 
              FROM public.transactions
             WHERE original_transaction_id = v_orig_tx.id
               AND type = 'reversal'
               AND status = 'posted'
               AND id != p_transaction_id
        ) THEN
            RETURN public.record_business_refusal(p_transaction_id, 'ALREADY_REVERSED');
        END IF;
    END IF;

    -- 5. Deterministic Ascending UUID Account Locking
    v_first_lock  := LEAST(v_tx.source_account_id, v_tx.destination_account_id);
    v_second_lock := GREATEST(v_tx.source_account_id, v_tx.destination_account_id);

    SELECT * INTO v_source_acc FROM public.accounts WHERE id = v_first_lock FOR UPDATE;
    SELECT * INTO v_dest_acc   FROM public.accounts WHERE id = v_second_lock FOR UPDATE;

    IF v_tx.source_account_id != v_first_lock THEN
        SELECT * INTO v_source_acc FROM public.accounts WHERE id = v_tx.source_account_id;
        SELECT * INTO v_dest_acc   FROM public.accounts WHERE id = v_tx.destination_account_id;
    END IF;

    -- 6. Account Status Business Checks
    IF v_source_acc.status != 'active' THEN
        RETURN public.record_business_refusal(p_transaction_id, 'SOURCE_ACCOUNT_' || UPPER(v_source_acc.status));
    END IF;

    IF v_dest_acc.status != 'active' THEN
        RETURN public.record_business_refusal(p_transaction_id, 'DESTINATION_ACCOUNT_' || UPPER(v_dest_acc.status));
    END IF;

    -- 7. Endpoint Role Validations
    IF v_tx.type = 'deposit' THEN
        IF v_source_acc.account_type != 'system' OR v_source_acc.system_role_type != 'SYSTEM_CASH_VAULT' THEN
            RAISE EXCEPTION 'Deposit source must be SYSTEM_CASH_VAULT' USING ERRCODE = '22023';
        END IF;
        IF v_dest_acc.account_type != 'customer' THEN
            RAISE EXCEPTION 'Deposit destination must be customer account' USING ERRCODE = '22023';
        END IF;
    ELSIF v_tx.type = 'withdrawal' THEN
        IF v_source_acc.account_type != 'customer' THEN
            RAISE EXCEPTION 'Withdrawal source must be customer account' USING ERRCODE = '22023';
        END IF;
        IF v_dest_acc.account_type != 'system' OR v_dest_acc.system_role_type != 'SYSTEM_CASH_VAULT' THEN
            RAISE EXCEPTION 'Withdrawal destination must be SYSTEM_CASH_VAULT' USING ERRCODE = '22023';
        END IF;
    ELSIF v_tx.type = 'transfer' THEN
        IF v_source_acc.account_type != 'customer' OR v_dest_acc.account_type != 'customer' THEN
            RAISE EXCEPTION 'Transfer endpoints must both be customer accounts' USING ERRCODE = '22023';
        END IF;
    END IF;

    -- 8. Mandatory Account Authorization (Addressing Requirement 2.C)
    -- Deposit: Caller must be an authorized account_holder of destination customer account, or admin
    IF v_tx.type = 'deposit' AND (v_current_role IS DISTINCT FROM 'admin') THEN
        IF NOT EXISTS (
            SELECT 1 
              FROM public.account_memberships
             WHERE account_id = v_dest_acc.id
               AND user_id = v_current_user_id
               AND role = 'account_holder'
        ) THEN
            RAISE EXCEPTION 'Caller is not an active account_holder on deposit destination account'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Withdrawal: Caller must be an authorized account_holder of source customer account, or admin
    IF v_tx.type = 'withdrawal' AND (v_current_role IS DISTINCT FROM 'admin') THEN
        IF NOT EXISTS (
            SELECT 1 
              FROM public.account_memberships
             WHERE account_id = v_source_acc.id
               AND user_id = v_current_user_id
               AND role = 'account_holder'
        ) THEN
            RAISE EXCEPTION 'Caller is not an active account_holder on withdrawal source account'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Transfer: Caller must be an authorized account_holder of source customer account, or admin
    IF v_tx.type = 'transfer' AND (v_current_role IS DISTINCT FROM 'admin') THEN
        IF NOT EXISTS (
            SELECT 1 
              FROM public.account_memberships
             WHERE account_id = v_source_acc.id
               AND user_id = v_current_user_id
               AND role = 'account_holder'
        ) THEN
            RAISE EXCEPTION 'Caller is not an active account_holder on transfer source account'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 9. Balance Availability Check (Customer Accounts Cannot Overdraw)
    IF v_source_acc.account_type = 'customer' AND v_source_acc.current_balance < v_tx.amount_paise THEN
        RETURN public.record_business_refusal(p_transaction_id, 'INSUFFICIENT_FUNDS');
    END IF;

    -- 10. INSERT Exactly Two Ledger Postings
    -- Sequence 1: DEBIT Source Account (-amount)
    INSERT INTO public.ledger_postings (
        transaction_id, account_id, entry_type, amount_paise, signed_amount_paise, sequence_number
    ) VALUES (
        p_transaction_id, v_tx.source_account_id, 'DEBIT', v_tx.amount_paise, -v_tx.amount_paise, 1
    );

    -- Sequence 2: CREDIT Destination Account (+amount)
    INSERT INTO public.ledger_postings (
        transaction_id, account_id, entry_type, amount_paise, signed_amount_paise, sequence_number
    ) VALUES (
        p_transaction_id, v_tx.destination_account_id, 'CREDIT', v_tx.amount_paise, v_tx.amount_paise, 2
    );

    -- 11. Update Transaction to Posted
    UPDATE public.transactions
       SET status = 'posted',
           updated_at = clock_timestamp()
     WHERE id = p_transaction_id;

    -- 12. Resolve Idempotency Record (Row Count Checked)
    v_result := jsonb_build_object(
        'status', 'success',
        'transaction_id', p_transaction_id,
        'amount_paise', v_tx.amount_paise,
        'type', v_tx.type,
        'source_account_id', v_tx.source_account_id,
        'destination_account_id', v_tx.destination_account_id,
        'posted_at', clock_timestamp()
    );

    UPDATE public.idempotency_keys
       SET status = 'resolved',
           response_code = 200,
           response_body = v_result,
           updated_at = clock_timestamp()
     WHERE transaction_id = p_transaction_id
       AND status = 'in_progress';

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows != 1 THEN
        RAISE EXCEPTION 'Failed to resolve idempotency key for transaction % (expected 1 row, updated %)',
            p_transaction_id, v_rows USING ERRCODE = '55000';
    END IF;

    -- 13. Audit Log
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
        CASE WHEN v_tx.type = 'reversal' THEN 'TRANSACTION_REVERSED' ELSE 'TRANSACTION_POSTED' END,
        'transaction',
        p_transaction_id,
        v_result
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, ledger_secure, pg_temp;
ALTER FUNCTION public.process_financial_transaction(UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR) OWNER TO ledgerline_owner;
