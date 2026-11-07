import { executeWithSession } from '../utils/sessionContext.js';

export async function createCustomerAccount(userId, role, accountNumber, currency = 'INR') {
  if (!accountNumber || typeof accountNumber !== 'string') {
    const err = new Error('Valid account number is required');
    err.status = 400;
    throw err;
  }

  return executeWithSession(userId, role, async (client) => {
    const res = await client.query(
      'SELECT public.create_customer_account($1, $2) AS account_id',
      [accountNumber.trim(), currency]
    );
    return {
      accountId: res.rows[0].account_id,
      accountNumber: accountNumber.trim(),
      currency,
      status: 'active',
    };
  });
}

export async function updateAccountStatus(userId, role, accountId, newStatus, reason) {
  if (!accountId || !newStatus || !['active', 'frozen', 'closed'].includes(newStatus)) {
    const err = new Error('Valid accountId and target status (active, frozen, closed) are required');
    err.status = 400;
    throw err;
  }

  return executeWithSession(userId, role, async (client) => {
    await client.query(
      'SELECT public.update_account_status($1, $2, $3)',
      [accountId, newStatus, reason || 'Status updated via API']
    );
    return { success: true, accountId, newStatus };
  });
}

export async function assignMembership(userId, role, accountId, targetUserId, memberRole) {
  if (!accountId || !targetUserId || !['account_holder', 'auditor'].includes(memberRole)) {
    const err = new Error('Valid accountId, targetUserId, and role (account_holder, auditor) are required');
    err.status = 400;
    throw err;
  }

  return executeWithSession(userId, role, async (client) => {
    await client.query(
      'SELECT public.assign_account_membership($1, $2, $3)',
      [accountId, targetUserId, memberRole]
    );
    return { success: true, accountId, targetUserId, role: memberRole };
  });
}

export async function revokeMembership(userId, role, accountId, targetUserId) {
  if (!accountId || !targetUserId) {
    const err = new Error('Valid accountId and targetUserId are required');
    err.status = 400;
    throw err;
  }

  return executeWithSession(userId, role, async (client) => {
    await client.query(
      'SELECT public.revoke_account_membership($1, $2)',
      [accountId, targetUserId]
    );
    return { success: true, accountId, targetUserId };
  });
}

export async function getAccountDetails(userId, role, accountId) {
  return executeWithSession(userId, role, async (client) => {
    const res = await client.query(
      'SELECT id, account_number, account_type, system_role_type, currency, status, current_balance, created_at FROM public.accounts WHERE id = $1',
      [accountId]
    );
    if (res.rowCount === 0) {
      const err = new Error('Account not found or access denied');
      err.status = 404;
      throw err;
    }
    return res.rows[0];
  });
}

export async function listUserAccounts(userId, role) {
  return executeWithSession(userId, role, async (client) => {
    const res = await client.query(
      'SELECT id, account_number, account_type, system_role_type, currency, status, current_balance, created_at FROM public.accounts ORDER BY created_at ASC'
    );
    return res.rows;
  });
}

/**
 * Retrieves a paginated account statement with running balances calculated from ledger postings.
 * Access is restricted to authorized account members and auditors/admins.
 */
export async function getAccountStatement(userId, role, accountId, limit = 20, offset = 0) {
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

  return executeWithSession(userId, role, async (client) => {
    // 1. Fetch account under RLS (non-members get 0 rows -> 404)
    const accRes = await client.query(
      `SELECT id, account_number, account_type, currency, status, current_balance, created_at
         FROM public.accounts
        WHERE id = $1`,
      [accountId]
    );

    if (accRes.rowCount === 0) {
      const err = new Error('Account not found or access denied');
      err.status = 404;
      throw err;
    }

    const account = accRes.rows[0];

    // 2. Total count of postings for this account
    const countRes = await client.query(
      'SELECT COUNT(*) as total FROM public.ledger_postings WHERE account_id = $1',
      [accountId]
    );
    const total = parseInt(countRes.rows[0].total, 10);

    // 3. Postings with running balance window function and stable ordering (created_at ASC, id ASC)
    const stmtRes = await client.query(
      `SELECT p.id,
              p.transaction_id,
              p.entry_type,
              p.amount_paise,
              p.signed_amount_paise,
              p.sequence_number,
              p.created_at,
              t.type AS transaction_type,
              t.status AS transaction_status,
              SUM(p.signed_amount_paise) OVER (
                ORDER BY p.created_at ASC, p.id ASC
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
              ) AS running_balance_paise
         FROM public.ledger_postings p
         JOIN public.transactions t ON p.transaction_id = t.id
        WHERE p.account_id = $1
        ORDER BY p.created_at ASC, p.id ASC
        LIMIT $2 OFFSET $3`,
      [accountId, parsedLimit, parsedOffset]
    );

    return {
      account,
      statement: stmtRes.rows,
      pagination: {
        total,
        limit: parsedLimit,
        offset: parsedOffset,
      },
    };
  });
}
