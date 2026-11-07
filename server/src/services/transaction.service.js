import { executeWithSession } from '../utils/sessionContext.js';
import { hashPayload } from '../utils/crypto.js';

const MAX_BIGINT = 9223372036854775807n;

/**
 * Validates monetary amounts strictly in integer paise without floating-point conversion.
 * Accepts safe integer numbers or positive integer strings within PostgreSQL BIGINT range.
 * 
 * @param {number|string} amountPaise
 * @returns {string} Exact integer string for parameterized SQL queries
 */
export function validateAmountPaise(amountPaise) {
  if (amountPaise === null || amountPaise === undefined) {
    const err = new Error('amountPaise is required');
    err.status = 400;
    throw err;
  }

  if (typeof amountPaise === 'boolean' || typeof amountPaise === 'object') {
    const err = new Error('amountPaise must be a valid integer minor-currency amount');
    err.status = 400;
    throw err;
  }

  let strVal;
  if (typeof amountPaise === 'number') {
    if (!Number.isSafeInteger(amountPaise)) {
      const err = new Error('amountPaise is an unsafe integer value exceeding JavaScript safe integer precision');
      err.status = 400;
      throw err;
    }
    if (amountPaise <= 0) {
      const err = new Error('amountPaise must be a positive integer greater than zero');
      err.status = 400;
      throw err;
    }
    strVal = amountPaise.toString();
  } else if (typeof amountPaise === 'string') {
    const trimmed = amountPaise.trim();
    if (!/^[1-9]\d*$/.test(trimmed)) {
      const err = new Error('amountPaise string must be positive integer digits without decimals, fractions, or signs');
      err.status = 400;
      throw err;
    }
    strVal = trimmed;
  } else {
    const err = new Error('amountPaise must be an integer number or digit string');
    err.status = 400;
    throw err;
  }

  const bigVal = BigInt(strVal);
  if (bigVal <= 0n) {
    const err = new Error('amountPaise must be greater than zero');
    err.status = 400;
    throw err;
  }
  if (bigVal > MAX_BIGINT) {
    const err = new Error('amountPaise exceeds maximum PostgreSQL BIGINT capacity');
    err.status = 400;
    throw err;
  }

  return strVal;
}

/**
 * Processes a financial transaction request under full RLS and idempotency guarantees.
 */
export async function processTransactionRequest({
  userId,
  role,
  idempotencyKey,
  method,
  path,
  body,
}) {
  const { type, amountPaise, sourceAccountId, destinationAccountId, originalTransactionId } = body;

  // 1. Input Validation
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    const err = new Error('Idempotency-Key header is required');
    err.status = 400;
    throw err;
  }

  if (!['deposit', 'withdrawal', 'transfer', 'reversal'].includes(type)) {
    const err = new Error('Invalid transaction type (must be deposit, withdrawal, transfer, or reversal)');
    err.status = 400;
    throw err;
  }

  const validatedAmountPaise = validateAmountPaise(amountPaise);

  if (!sourceAccountId || !destinationAccountId) {
    const err = new Error('sourceAccountId and destinationAccountId are required');
    err.status = 400;
    throw err;
  }

  if (sourceAccountId === destinationAccountId) {
    const err = new Error('sourceAccountId and destinationAccountId must be distinct');
    err.status = 400;
    throw err;
  }

  if (type === 'reversal' && !originalTransactionId) {
    const err = new Error('originalTransactionId is required for reversal transactions');
    err.status = 400;
    throw err;
  }

  // Canonicalize body with validated integer amount for deterministic hashing
  const canonicalBody = {
    ...body,
    amountPaise: validatedAmountPaise,
  };
  const payloadHash = hashPayload(canonicalBody);
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = path.toLowerCase();

  // 2. Execute Within Verified Session Context
  return executeWithSession(userId, role, async (client) => {
    // Attempt Idempotency Reservation
    const idempInsertRes = await client.query(
      `INSERT INTO public.idempotency_keys 
         (user_id, idempotency_key, request_method, request_path, request_payload_hash, status)
       VALUES ($1, $2, $3, $4, $5, 'in_progress')
       ON CONFLICT (user_id, idempotency_key) DO NOTHING
       RETURNING id`,
      [userId, idempotencyKey, normalizedMethod, normalizedPath, payloadHash]
    );

    // Conflict / Replay Detection
    if (idempInsertRes.rowCount === 0) {
      const existingRes = await client.query(
        `SELECT status, request_method, request_path, request_payload_hash, response_code, response_body
           FROM public.idempotency_keys
          WHERE user_id = $1 AND idempotency_key = $2`,
        [userId, idempotencyKey]
      );

      if (existingRes.rowCount === 0) {
        const err = new Error('Concurrent idempotency resolution error');
        err.status = 409;
        throw err;
      }

      const existing = existingRes.rows[0];

      // Payload / parameter mismatch check
      if (
        existing.request_method !== normalizedMethod ||
        existing.request_path !== normalizedPath ||
        existing.request_payload_hash !== payloadHash
      ) {
        const err = new Error('Idempotency key re-used with different request parameters or payload');
        err.status = 409;
        throw err;
      }

      // Check state
      if (existing.status === 'in_progress') {
        const err = new Error('A request with this idempotency key is currently in progress');
        err.status = 409;
        throw err;
      }

      if (existing.status === 'resolved') {
        return {
          statusCode: existing.response_code,
          body: existing.response_body,
          isIdempotentReplay: true,
        };
      }
    }

    // Call controlled procedure to lock accounts in ascending UUID order, insert pending transaction, and bind idempotency key
    const createTxRes = await client.query(
      'SELECT public.create_pending_financial_transaction($1, $2, $3::bigint, $4, $5, $6) AS transaction_id',
      [
        idempotencyKey,
        type,
        validatedAmountPaise,
        sourceAccountId,
        destinationAccountId,
        originalTransactionId || null,
      ]
    );
    const transactionId = createTxRes.rows[0].transaction_id;

    // Process financial execution (postings, refusal or posted commit)
    const execRes = await client.query(
      'SELECT public.process_financial_transaction($1, $2, $3, $4, $5) AS result',
      [transactionId, idempotencyKey, normalizedMethod, normalizedPath, payloadHash]
    );

    const result = execRes.rows[0].result;
    const statusCode = result.status === 'success' ? 200 : 422;

    return {
      statusCode,
      body: result,
      isIdempotentReplay: false,
    };
  });
}

/**
 * Retrieves a single transaction and its double-entry postings with authorization checks.
 */
export async function getTransactionById({ userId, role, transactionId }) {
  return executeWithSession(userId, role, async (client) => {
    const txRes = await client.query(
      `SELECT id, idempotency_key, type, status, amount_paise, currency,
              source_account_id, destination_account_id, created_by,
              original_transaction_id, refusal_reason, created_at, updated_at
         FROM public.transactions
        WHERE id = $1`,
      [transactionId]
    );

    if (txRes.rowCount === 0) {
      const err = new Error('Transaction not found or access denied');
      err.status = 404;
      throw err;
    }

    const transaction = txRes.rows[0];

    // Fetch double-entry postings for this transaction
    const postRes = await client.query(
      `SELECT id, account_id, entry_type, amount_paise, signed_amount_paise, sequence_number, created_at
         FROM public.ledger_postings
        WHERE transaction_id = $1
        ORDER BY sequence_number ASC`,
      [transactionId]
    );

    return {
      transaction,
      postings: postRes.rows,
    };
  });
}
