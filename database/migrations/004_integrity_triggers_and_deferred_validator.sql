-- ==============================================================================
-- Migration: 004_integrity_triggers_and_deferred_validator.sql
-- Description: Triggers for balance maintenance, append-only, and commit validator.
-- ==============================================================================

-- 1. Cached Account Balance Maintenance Trigger
CREATE OR REPLACE FUNCTION public.maintain_account_balance_from_posting()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.accounts
       SET current_balance = current_balance + NEW.signed_amount_paise,
           updated_at = clock_timestamp()
     WHERE id = NEW.account_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.maintain_account_balance_from_posting() OWNER TO ledgerline_owner;

DROP TRIGGER IF EXISTS trg_maintain_account_balance ON public.ledger_postings;
CREATE TRIGGER trg_maintain_account_balance
    AFTER INSERT ON public.ledger_postings
    FOR EACH ROW EXECUTE FUNCTION public.maintain_account_balance_from_posting();

-- 2. Strict Append-Only Triggers for Postings and Audit Logs
CREATE OR REPLACE FUNCTION public.enforce_append_only_record()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Table % is strictly append-only; % operations are prohibited',
        TG_TABLE_NAME, TG_OP
        USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.enforce_append_only_record() OWNER TO ledgerline_owner;

DROP TRIGGER IF EXISTS trg_append_only_postings ON public.ledger_postings;
CREATE TRIGGER trg_append_only_postings
    BEFORE UPDATE OR DELETE ON public.ledger_postings
    FOR EACH ROW EXECUTE FUNCTION public.enforce_append_only_record();

DROP TRIGGER IF EXISTS trg_append_only_audit_logs ON public.audit_logs;
CREATE TRIGGER trg_append_only_audit_logs
    BEFORE UPDATE OR DELETE ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.enforce_append_only_record();

-- 3. Prevent Extra Postings on Non-Pending Transactions
CREATE OR REPLACE FUNCTION public.prevent_extra_postings_on_finalized_tx()
RETURNS TRIGGER AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT status INTO v_status FROM public.transactions WHERE id = NEW.transaction_id;
    IF v_status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Cannot insert postings for transaction % with status %',
            NEW.transaction_id, v_status
            USING ERRCODE = '25000';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.prevent_extra_postings_on_finalized_tx() OWNER TO ledgerline_owner;

DROP TRIGGER IF EXISTS trg_prevent_extra_postings ON public.ledger_postings;
CREATE TRIGGER trg_prevent_extra_postings
    BEFORE INSERT ON public.ledger_postings
    FOR EACH ROW EXECUTE FUNCTION public.prevent_extra_postings_on_finalized_tx();

-- 4. Strict Idempotency Lifecycle Trigger
CREATE OR REPLACE FUNCTION public.enforce_idempotency_lifecycle()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Requests fields are immutable
        IF NEW.user_id IS DISTINCT FROM OLD.user_id OR
           NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR
           NEW.request_method IS DISTINCT FROM OLD.request_method OR
           NEW.request_path IS DISTINCT FROM OLD.request_path OR
           NEW.request_payload_hash IS DISTINCT FROM OLD.request_payload_hash OR
           NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'Idempotency request identity fields are immutable'
                USING ERRCODE = '23514';
        END IF;

        -- Only in_progress -> resolved allowed
        IF OLD.status = 'resolved' AND NEW.status != 'resolved' THEN
            RAISE EXCEPTION 'Resolved idempotency keys cannot transition back to %', NEW.status
                USING ERRCODE = '23514';
        END IF;

        -- Bound transaction_id is immutable once resolved
        IF OLD.status = 'resolved' AND NEW.transaction_id IS DISTINCT FROM OLD.transaction_id THEN
            RAISE EXCEPTION 'Bound transaction_id is immutable once resolved'
                USING ERRCODE = '23514';
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Idempotency records cannot be deleted'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.enforce_idempotency_lifecycle() OWNER TO ledgerline_owner;

DROP TRIGGER IF EXISTS trg_enforce_idempotency_lifecycle ON public.idempotency_keys;
CREATE TRIGGER trg_enforce_idempotency_lifecycle
    BEFORE UPDATE OR DELETE ON public.idempotency_keys
    FOR EACH ROW EXECUTE FUNCTION public.enforce_idempotency_lifecycle();

-- 5. Deferred Transaction & Ledger Commit Validator Function
CREATE OR REPLACE FUNCTION public.validate_ledger_transaction_at_commit()
RETURNS TRIGGER AS $$
DECLARE
    v_current_tx RECORD;
    v_count INT;
    v_sum BIGINT;
    v_debit_count INT;
    v_credit_count INT;
    v_debit_total BIGINT;
    v_credit_total BIGINT;
    v_debit_acc UUID;
    v_credit_acc UUID;
    v_src_curr VARCHAR(3);
    v_dest_curr VARCHAR(3);
    v_src_bal BIGINT;
    v_src_postings_sum BIGINT;
    v_dest_bal BIGINT;
    v_dest_postings_sum BIGINT;
BEGIN
    -- CRITICAL DEFECT CORRECTION: Inspect the final live state of the row in the table
    SELECT * INTO v_current_tx
      FROM public.transactions
     WHERE id = NEW.id;

    IF NOT FOUND THEN
        RETURN NULL; -- Row deleted
    END IF;

    -- Case 1: Transaction remains pending at commit time -> REJECT
    IF v_current_tx.status = 'pending' THEN
        RAISE EXCEPTION 'Transaction % remains in pending status at commit', v_current_tx.id
            USING ERRCODE = '25000';
    END IF;

    -- Case 2: Transaction is REFUSED -> Exactly zero postings and non-null reason
    IF v_current_tx.status = 'refused' THEN
        SELECT COUNT(*) INTO v_count
          FROM public.ledger_postings
         WHERE transaction_id = v_current_tx.id;

        IF v_count != 0 THEN
            RAISE EXCEPTION 'Refused transaction % has % postings; must have exactly zero',
                v_current_tx.id, v_count USING ERRCODE = '23514';
        END IF;

        IF v_current_tx.refusal_reason IS NULL THEN
            RAISE EXCEPTION 'Refused transaction % must have a non-null refusal_reason', v_current_tx.id
                USING ERRCODE = '23514';
        END IF;

        RETURN NEW;
    END IF;

    -- Case 3: Transaction is POSTED -> Strict double-entry and balance reconciliation
    IF v_current_tx.status = 'posted' THEN
        SELECT COUNT(*),
               COALESCE(SUM(signed_amount_paise), 0),
               COUNT(CASE WHEN entry_type = 'DEBIT' THEN 1 END),
               COUNT(CASE WHEN entry_type = 'CREDIT' THEN 1 END),
               COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN -signed_amount_paise ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN signed_amount_paise ELSE 0 END), 0)
          INTO v_count, v_sum, v_debit_count, v_credit_count, v_debit_total, v_credit_total
          FROM public.ledger_postings
         WHERE transaction_id = v_current_tx.id;

        IF v_count != 2 THEN
            RAISE EXCEPTION 'Posted transaction % must have exactly 2 postings; found %',
                v_current_tx.id, v_count USING ERRCODE = '23514';
        END IF;

        IF v_debit_count != 1 OR v_credit_count != 1 THEN
            RAISE EXCEPTION 'Posted transaction % must have exactly 1 DEBIT and 1 CREDIT posting', v_current_tx.id
                USING ERRCODE = '23514';
        END IF;

        IF v_sum != 0 THEN
            RAISE EXCEPTION 'Posted transaction % postings do not sum to zero (sum: %)', v_current_tx.id, v_sum
                USING ERRCODE = '23514';
        END IF;

        IF v_debit_total != v_current_tx.amount_paise OR v_credit_total != v_current_tx.amount_paise THEN
            RAISE EXCEPTION 'Posting totals (debit: %, credit: %) do not match transaction amount (%)',
                v_debit_total, v_credit_total, v_current_tx.amount_paise USING ERRCODE = '23514';
        END IF;

        SELECT account_id INTO v_debit_acc 
          FROM public.ledger_postings 
         WHERE transaction_id = v_current_tx.id AND entry_type = 'DEBIT';

        SELECT account_id INTO v_credit_acc 
          FROM public.ledger_postings 
         WHERE transaction_id = v_current_tx.id AND entry_type = 'CREDIT';

        IF v_debit_acc != v_current_tx.source_account_id THEN
            RAISE EXCEPTION 'DEBIT posting account % does not match transaction source %',
                v_debit_acc, v_current_tx.source_account_id USING ERRCODE = '23514';
        END IF;

        IF v_credit_acc != v_current_tx.destination_account_id THEN
            RAISE EXCEPTION 'CREDIT posting account % does not match transaction destination %',
                v_credit_acc, v_current_tx.destination_account_id USING ERRCODE = '23514';
        END IF;

        SELECT currency INTO v_src_curr FROM public.accounts WHERE id = v_current_tx.source_account_id;
        SELECT currency INTO v_dest_curr FROM public.accounts WHERE id = v_current_tx.destination_account_id;

        IF v_src_curr != v_current_tx.currency OR v_dest_curr != v_current_tx.currency THEN
            RAISE EXCEPTION 'Currency mismatch between accounts and transaction %', v_current_tx.id
                USING ERRCODE = '23514';
        END IF;

        -- Balance Reconciliation against Postings Sum
        SELECT a.current_balance, COALESCE(SUM(p.signed_amount_paise), 0)
          INTO v_src_bal, v_src_postings_sum
          FROM public.accounts a
          LEFT JOIN public.ledger_postings p ON a.id = p.account_id
         WHERE a.id = v_current_tx.source_account_id
         GROUP BY a.current_balance;

        IF v_src_bal != v_src_postings_sum THEN
            RAISE EXCEPTION 'Balance reconciliation failure on source account %: cached balance %, postings sum %',
                v_current_tx.source_account_id, v_src_bal, v_src_postings_sum USING ERRCODE = '23514';
        END IF;

        SELECT a.current_balance, COALESCE(SUM(p.signed_amount_paise), 0)
          INTO v_dest_bal, v_dest_postings_sum
          FROM public.accounts a
          LEFT JOIN public.ledger_postings p ON a.id = p.account_id
         WHERE a.id = v_current_tx.destination_account_id
         GROUP BY a.current_balance;

        IF v_dest_bal != v_dest_postings_sum THEN
            RAISE EXCEPTION 'Balance reconciliation failure on destination account %: cached balance %, postings sum %',
                v_current_tx.destination_account_id, v_dest_bal, v_dest_postings_sum USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.validate_ledger_transaction_at_commit() OWNER TO ledgerline_owner;

DROP TRIGGER IF EXISTS trg_deferred_validate_transaction ON public.transactions;
CREATE CONSTRAINT TRIGGER trg_deferred_validate_transaction
    AFTER INSERT OR UPDATE ON public.transactions
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.validate_ledger_transaction_at_commit();

-- 6. Immutability of Finalized Transactions
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
        -- If already finalized (posted or refused), all mutations are strictly prohibited
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


