import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { generateHmacAssertion } from './crypto.js';

/**
 * Executes a callback within a verified database session context.
 * 
 * Enforces the Three-Stage Assertion Lifecycle on a single checked-out connection client:
 * 1. Independent Registration & Consumption (Committed):
 *    - Registers identity assertion with HMAC signature verification.
 *    - Consumes the assertion, transitioning status to 'CONSUMED'.
 *    - Commits immediately. This guarantees that whether the financial transaction
 *      succeeds or rolls back, this assertion is consumed and cannot be replayed.
 * 2. Financial Execution (Isolated Transaction on same Backend PID):
 *    - Establishes verified session context in ledger_secure.active_session_contexts
 *      using the already-consumed assertion.
 *    - Captures current txid.
 *    - Executes financial workload under RLS and lock timeouts.
 * 3. Session Cleanup:
 *    - Purges the context record upon commit or rollback.
 * 
 * @param {string} userId - UUID
 * @param {string} role - 'customer' | 'admin'
 * @param {(client: import('pg').PoolClient, txid: string) => Promise<any>} callback
 * @returns {Promise<any>}
 */
export async function executeWithSession(userId, role, callback) {
  const client = await pool.connect();
  let financialTxid = null;

  try {
    // Generate fresh HMAC assertion
    const assertion = generateHmacAssertion(userId, role, env.IDENTITY_HMAC_SECRET, 30000);

    // -------------------------------------------------------------------------
    // Phase 1: Dedicated Independent Registration & Consumption (Auto-Committed)
    // -------------------------------------------------------------------------
    await client.query('BEGIN');
    try {
      await client.query(
        'SELECT ledger_secure.register_identity_assertion($1, $2, $3, $4, $5)',
        [userId, role, assertion.expiresAt, assertion.nonce, assertion.signature]
      );
      await client.query(
        'SELECT ledger_secure.consume_identity_assertion($1, $2)',
        [assertion.nonce, assertion.signature]
      );
      await client.query('COMMIT');
    } catch (regErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw regErr;
    }

    // -------------------------------------------------------------------------
    // Phase 2: Financial Transaction on THE EXACT SAME Client (Same Backend PID)
    // -------------------------------------------------------------------------
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '3s'");

    // Establish verified session context using the already-consumed assertion
    await client.query(
      'SELECT ledger_secure.establish_session_identity($1, $2)',
      [assertion.nonce, assertion.signature]
    );

    // Capture the active financial transaction ID while the transaction is active
    const txidRes = await client.query('SELECT txid_current()::text AS txid');
    financialTxid = txidRes.rows[0].txid;

    // Execute financial workload
    const result = await callback(client, financialTxid);

    // Commit financial transaction
    await client.query('COMMIT');

    // Post-Commit Cleanup using captured transaction ID
    if (financialTxid) {
      await client.query(
        'SELECT ledger_secure.clear_session_identity($1::bigint)',
        [financialTxid]
      ).catch(() => {});
    }

    return result;
  } catch (err) {
    // Financial transaction rollback
    await client.query('ROLLBACK').catch(() => {});

    // Post-Rollback Cleanup using captured transaction ID or backend PID
    if (financialTxid) {
      await client.query(
        'SELECT ledger_secure.clear_session_identity($1::bigint)',
        [financialTxid]
      ).catch(() => {});
    } else {
      await client.query('SELECT ledger_secure.clear_session_identity()').catch(() => {});
    }

    throw err;
  } finally {
    // Release connection back to pool
    client.release();
  }
}
