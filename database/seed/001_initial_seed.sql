-- ==============================================================================
-- Seed: 001_initial_seed.sql
-- Description: Seeds the zero-baseline System Cash Vault account.
-- Note: HMAC secrets and administrator users are provisioned securely via
--       environment-driven bootstrap (server/scripts/bootstrap.js).
-- ==============================================================================

-- 1. Seed System Cash Vault (Initial balance = 0 paise)
INSERT INTO public.accounts (
    id,
    account_number,
    account_type,
    system_role_type,
    currency,
    status,
    current_balance
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'SYS-VAULT-000000000001',
    'system',
    'SYSTEM_CASH_VAULT',
    'INR',
    'active',
    0
) ON CONFLICT (account_number) DO NOTHING;
