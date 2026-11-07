import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pkg from 'pg';
const { Client } = pkg;
import { pool, query } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { registerCustomer, login, setUserStatus } from '../src/services/auth.service.js';
import {
  createCustomerAccount,
  updateAccountStatus,
  assignMembership,
  revokeMembership,
  getAccountDetails,
  getAccountStatement,
} from '../src/services/account.service.js';
import {
  processTransactionRequest,
  getTransactionById,
  validateAmountPaise,
} from '../src/services/transaction.service.js';
import { executeWithSession } from '../src/utils/sessionContext.js';
import { generateHmacAssertion } from '../src/utils/crypto.js';

describe('LedgerLine Phase 2 Comprehensive Test Suite', () => {
  let adminUser;
  let customerA;
  let customerB;
  let userC;
  let auditorUser;
  let vaultAccount;
  let accountA;
  let accountB;
  let adminClient; // Privileged connection strictly for test-only trigger verification

  before(async () => {
    // 1. Fetch system vault
    const vaultRes = await query("SELECT id FROM public.accounts WHERE system_role_type = 'SYSTEM_CASH_VAULT'");
    assert.ok(vaultRes.rowCount > 0, 'System vault must exist');
    vaultAccount = vaultRes.rows[0];

    // 2. Authenticate admin user
    const adminLogin = await login('admin@ledgerline.local', 'Admin@123!');
    assert.ok(adminLogin.user && adminLogin.user.id, 'Admin user must exist and authenticate');
    adminUser = adminLogin.user;

    // 3. Register test customers
    const unique = Date.now();
    const resA = await registerCustomer(`customerA_${unique}@test.local`, 'Password123!');
    customerA = resA.user;

    const resB = await registerCustomer(`customerB_${unique}@test.local`, 'Password123!');
    customerB = resB.user;

    const resC = await registerCustomer(`userC_${unique}@test.local`, 'Password123!');
    userC = resC.user;

    const resAuditor = await registerCustomer(`auditor_${unique}@test.local`, 'Password123!');
    auditorUser = resAuditor.user;

    // 4. Create customer accounts
    const accARes = await createCustomerAccount(customerA.id, 'customer', `ACC-A-${unique}`);
    accountA = accARes.accountId;

    const accBRes = await createCustomerAccount(customerB.id, 'customer', `ACC-B-${unique}`);
    accountB = accBRes.accountId;

    // Attach auditorUser as auditor on accountA
    await assignMembership(adminUser.id, 'admin', accountA, auditorUser.id, 'auditor');

    // 5. Connect privileged admin client for test-only trigger verification
    adminClient = new Client({
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.ADMIN_DB_USER,
      password: env.ADMIN_DB_PASSWORD,
    });
    await adminClient.connect();
  });

  after(async () => {
    if (adminClient) {
      await adminClient.end().catch(() => {});
    }
    await pool.end();
  });

  // ---------------------------------------------------------------------------
  // 1. Successful Deposit
  // ---------------------------------------------------------------------------
  it('1. Successful deposit: transfers from Vault to Customer Account', async () => {
    const key = `dep_${Date.now()}_1`;
    const body = {
      type: 'deposit',
      amountPaise: 50000, // ₹500.00
      sourceAccountId: vaultAccount.id,
      destinationAccountId: accountA,
    };

    const res = await processTransactionRequest({
      userId: customerA.id,
      role: 'customer',
      idempotencyKey: key,
      method: 'POST',
      path: '/api/transactions',
      body,
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.amount_paise, '50000');

    // Verify balance
    const acc = await executeWithSession(customerA.id, 'customer', async (client) => {
      const r = await client.query('SELECT current_balance FROM public.accounts WHERE id = $1', [accountA]);
      return r.rows[0];
    });
    assert.equal(acc.current_balance, '50000');
  });

  // ---------------------------------------------------------------------------
  // 2. Successful Withdrawal
  // ---------------------------------------------------------------------------
  it('2. Successful withdrawal: transfers from Customer Account to Vault', async () => {
    const key = `wth_${Date.now()}_2`;
    const body = {
      type: 'withdrawal',
      amountPaise: 10000, // ₹100.00
      sourceAccountId: accountA,
      destinationAccountId: vaultAccount.id,
    };

    const res = await processTransactionRequest({
      userId: customerA.id,
      role: 'customer',
      idempotencyKey: key,
      method: 'POST',
      path: '/api/transactions',
      body,
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'success');

    // Balance should now be 40000 paise (₹400.00)
    const acc = await executeWithSession(customerA.id, 'customer', async (client) => {
      const r = await client.query('SELECT current_balance FROM public.accounts WHERE id = $1', [accountA]);
      return r.rows[0];
    });
    assert.equal(acc.current_balance, '40000');
  });

  // ---------------------------------------------------------------------------
  // 3. Successful Transfer
  // ---------------------------------------------------------------------------
  it('3. Successful transfer: transfers between two customer accounts', async () => {
    const key = `trf_${Date.now()}_3`;
    const body = {
      type: 'transfer',
      amountPaise: 15000, // ₹150.00
      sourceAccountId: accountA,
      destinationAccountId: accountB,
    };

    const res = await processTransactionRequest({
      userId: customerA.id,
      role: 'customer',
      idempotencyKey: key,
      method: 'POST',
      path: '/api/transactions',
      body,
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'success');

    // Account A balance: 40000 - 15000 = 25000
    // Account B balance: 0 + 15000 = 15000
    const [accA, accB] = await executeWithSession(adminUser.id, 'admin', async (client) => {
      const rA = await client.query('SELECT current_balance FROM public.accounts WHERE id = $1', [accountA]);
      const rB = await client.query('SELECT current_balance FROM public.accounts WHERE id = $1', [accountB]);
      return [rA.rows[0], rB.rows[0]];
    });
    assert.equal(accA.current_balance, '25000');
    assert.equal(accB.current_balance, '15000');
  });

  // ---------------------------------------------------------------------------
  // 4. Insufficient-Funds Refusal
  // ---------------------------------------------------------------------------
  it('4. Insufficient-funds refusal: records status=refused, 0 postings, HTTP 422', async () => {
    const key = `insuf_${Date.now()}_4`;
    const body = {
      type: 'transfer',
      amountPaise: 99999999, // Way higher than balance
      sourceAccountId: accountA,
      destinationAccountId: accountB,
    };

    const res = await processTransactionRequest({
      userId: customerA.id,
      role: 'customer',
      idempotencyKey: key,
      method: 'POST',
      path: '/api/transactions',
      body,
    });

    assert.equal(res.statusCode, 422);
    assert.equal(res.body.status, 'refused');
    assert.equal(res.body.reason, 'INSUFFICIENT_FUNDS');

    // Verify 0 postings exist for this transaction
    const postingsCount = await executeWithSession(customerA.id, 'customer', async (client) => {
      const r = await client.query(
        'SELECT COUNT(*) FROM public.ledger_postings WHERE transaction_id = $1',
        [res.body.transaction_id]
      );
      return parseInt(r.rows[0].count, 10);
    });
    assert.equal(postingsCount, 0);
  });

  // ---------------------------------------------------------------------------
  // 5. Frozen Account Refusal
  // ---------------------------------------------------------------------------
  it('5. Frozen account refusal: refuses operations involving a frozen account', async () => {
    // Freeze accountB
    await updateAccountStatus(adminUser.id, 'admin', accountB, 'frozen', 'Suspicious activity audit');

    const key = `froz_${Date.now()}_5`;
    const body = {
      type: 'transfer',
      amountPaise: 1000,
      sourceAccountId: accountA,
      destinationAccountId: accountB,
    };

    const res = await processTransactionRequest({
      userId: customerA.id,
      role: 'customer',
      idempotencyKey: key,
      method: 'POST',
      path: '/api/transactions',
      body,
    });

    assert.equal(res.statusCode, 422);
    assert.equal(res.body.status, 'refused');
    assert.equal(res.body.reason, 'DESTINATION_ACCOUNT_FROZEN');

    // Unfreeze accountB for subsequent tests
    await updateAccountStatus(adminUser.id, 'admin', accountB, 'active', 'Audit cleared');
  });

  // ---------------------------------------------------------------------------
  // 6. Unauthorized Source Account
  // ---------------------------------------------------------------------------
  it('6. Unauthorized source account: rejects customer debiting another user account', async () => {
    const key = `unauth_src_${Date.now()}_6`;
    const body = {
      type: 'transfer',
      amountPaise: 500,
      sourceAccountId: accountB, // Owned by customerB, but caller is customerA
      destinationAccountId: accountA,
    };

    const res = await processTransactionRequest({
      userId: customerA.id,
      role: 'customer',
      idempotencyKey: key,
      method: 'POST',
      path: '/api/transactions',
      body,
    });

    assert.equal(res.statusCode, 422);
    assert.equal(res.body.status, 'refused');
    assert.equal(res.body.reason, 'UNAUTHORIZED_SOURCE_ACCOUNT');
  });

  // ---------------------------------------------------------------------------
  // 7. Unauthorized Deposit Destination
  // ---------------------------------------------------------------------------
  it('7. Unauthorized deposit destination: rejects deposit into another customer account', async () => {
    const key = `unauth_dep_${Date.now()}_7`;
    const body = {
      type: 'deposit',
      amountPaise: 500,
      sourceAccountId: vaultAccount.id,
      destinationAccountId: accountB, // Customer A attempting deposit to Customer B account
    };

    const res = await processTransactionRequest({
      userId: customerA.id,
      role: 'customer',
      idempotencyKey: key,
      method: 'POST',
      path: '/api/transactions',
      body,
    });

    assert.equal(res.statusCode, 422);
    assert.equal(res.body.status, 'refused');
    assert.equal(res.body.reason, 'UNAUTHORIZED_DESTINATION_ACCOUNT');
  });

  // ---------------------------------------------------------------------------
  // 8. Auditor Financial Attempt Refusal
  // ---------------------------------------------------------------------------
  it('8. Auditor attempting financial operation: auditor role cannot initiate transfers', async () => {
    const key = `audit_op_${Date.now()}_8`;
    const body = {
      type: 'transfer',
      amountPaise: 100,
      sourceAccountId: accountA,
      destinationAccountId: accountB,
    };

    const res = await processTransactionRequest({
      userId: auditorUser.id,
      role: 'customer',
      idempotencyKey: key,
      method: 'POST',
      path: '/api/transactions',
      body,
    });

    assert.equal(res.statusCode, 422);
    assert.equal(res.body.status, 'refused');
    assert.equal(res.body.reason, 'AUDITOR_CANNOT_INITIATE_OPERATIONS');
  });

  // ---------------------------------------------------------------------------
  // 9. Exact Idempotency Replay
  // ---------------------------------------------------------------------------
  it('9. Exact idempotency replay: returns cached response without duplicate execution', async () => {
    const key = `idemp_replay_${Date.now()}_9`;
    const body = {
      type: 'transfer',
      amountPaise: 2000,
      sourceAccountId: accountA,
      destinationAccountId: accountB,
    };

    // First request
    const firstRes = await processTransactionRequest({
      userId: customerA.id,
      role: 'customer',
      idempotencyKey: key,
      method: 'POST',
      path: '/api/transactions',
      body,
    });
    assert.equal(firstRes.statusCode, 200);
    assert.equal(firstRes.isIdempotentReplay, false);
    const firstTxId = firstRes.body.transaction_id;

    // Second request with identical payload and key
    const replayRes = await processTransactionRequest({
      userId: customerA.id,
      role: 'customer',
      idempotencyKey: key,
      method: 'POST',
      path: '/api/transactions',
      body,
    });
    assert.equal(replayRes.statusCode, 200);
    assert.equal(replayRes.isIdempotentReplay, true);
    assert.equal(replayRes.body.transaction_id, firstTxId);
  });

  // ---------------------------------------------------------------------------
  // 10. Idempotency Payload Mismatch Detection
  // ---------------------------------------------------------------------------
  it('10. Idempotency payload mismatch: re-using key with different amount returns HTTP 409', async () => {
    const key = `idemp_mismatch_${Date.now()}_10`;
    const body1 = {
      type: 'transfer',
      amountPaise: 1000,
      sourceAccountId: accountA,
      destinationAccountId: accountB,
    };

    await processTransactionRequest({
      userId: customerA.id,
      role: 'customer',
      idempotencyKey: key,
      method: 'POST',
      path: '/api/transactions',
      body: body1,
    });

    // Reuse key with different amount
    const body2 = {
      type: 'transfer',
      amountPaise: 9999, // Mismatched amount
      sourceAccountId: accountA,
      destinationAccountId: accountB,
    };

    await assert.rejects(
      async () => {
        await processTransactionRequest({
          userId: customerA.id,
          role: 'customer',
          idempotencyKey: key,
          method: 'POST',
          path: '/api/transactions',
          body: body2,
        });
      },
      (err) => err.status === 409 && /different request parameters or payload/.test(err.message)
    );
  });

  // ---------------------------------------------------------------------------
  // 11. Concurrent Duplicate Requests (Exact Idempotency Invariant Verification)
  // ---------------------------------------------------------------------------
  it('11. Concurrent duplicate requests: exactly one transaction processed', async () => {
    const key = `concurrent_dup_${Date.now()}_11`;
    const body = {
      type: 'transfer',
      amountPaise: 1000,
      sourceAccountId: accountA,
      destinationAccountId: accountB,
    };

    const results = await Promise.allSettled([
      processTransactionRequest({
        userId: customerA.id,
        role: 'customer',
        idempotencyKey: key,
        method: 'POST',
        path: '/api/transactions',
        body,
      }),
      processTransactionRequest({
        userId: customerA.id,
        role: 'customer',
        idempotencyKey: key,
        method: 'POST',
        path: '/api/transactions',
        body,
      }),
    ]);

    const successes = results.filter(r => r.status === 'fulfilled');
    assert.ok(successes.length >= 1, 'At least one request must succeed');
    const txId = successes[0].value.body.transaction_id;

    // Direct Database Verification: Exactly 1 transaction and exactly 2 postings exist
    const txCountRes = await query('SELECT COUNT(*) FROM public.transactions WHERE idempotency_key = $1', [key]);
    assert.equal(parseInt(txCountRes.rows[0].count, 10), 1, 'Exactly one transaction row must be created');

    const postCountRes = await query('SELECT COUNT(*) FROM public.ledger_postings WHERE transaction_id = $1', [txId]);
    assert.equal(parseInt(postCountRes.rows[0].count, 10), 2, 'Exactly two ledger postings must exist');

    const idempKeyRes = await query(
      'SELECT status FROM public.idempotency_keys WHERE user_id = $1 AND idempotency_key = $2',
      [customerA.id, key]
    );
    assert.equal(idempKeyRes.rows[0].status, 'resolved', 'Idempotency key must be in resolved status');
  });

  // ---------------------------------------------------------------------------
  // 12. Concurrent Withdrawals Overdraw Protection
  // ---------------------------------------------------------------------------
  it('12. Concurrent withdrawals: account balance cannot become negative', async () => {
    const key1 = `race_overdraw_1_${Date.now()}`;
    const key2 = `race_overdraw_2_${Date.now()}`;

    // Concurrently attempt two transfers of 15000 paise from accountA
    // accountA balance is ~21000 paise. Exactly one can succeed, second must be refused or reject.
    const [res1, res2] = await Promise.all([
      processTransactionRequest({
        userId: customerA.id,
        role: 'customer',
        idempotencyKey: key1,
        method: 'POST',
        path: '/api/transactions',
        body: {
          type: 'transfer',
          amountPaise: 15000,
          sourceAccountId: accountA,
          destinationAccountId: accountB,
        },
      }),
      processTransactionRequest({
        userId: customerA.id,
        role: 'customer',
        idempotencyKey: key2,
        method: 'POST',
        path: '/api/transactions',
        body: {
          type: 'transfer',
          amountPaise: 15000,
          sourceAccountId: accountA,
          destinationAccountId: accountB,
        },
      }),
    ]);

    const statuses = [res1.statusCode, res2.statusCode].sort();
    assert.deepEqual(statuses, [200, 422], 'Exactly one transfer must succeed (200) and one must be refused (422)');

    // Ensure accountA balance remains non-negative
    const acc = await query('SELECT current_balance FROM public.accounts WHERE id = $1', [accountA]);
    const balance = BigInt(acc.rows[0].current_balance);
    assert.ok(balance >= 0n, 'Account balance must never become negative');
  });

  // ---------------------------------------------------------------------------
  // 13. Opposite-Direction Concurrent Transfers (Deadlock Elimination)
  // ---------------------------------------------------------------------------
  it('13. Opposite-direction transfers: concurrent A->B and B->A succeed without deadlock', async () => {
    const keyAB = `cross_ab_${Date.now()}`;
    const keyBA = `cross_ba_${Date.now()}`;

    const [resAB, resBA] = await Promise.all([
      processTransactionRequest({
        userId: customerA.id,
        role: 'customer',
        idempotencyKey: keyAB,
        method: 'POST',
        path: '/api/transactions',
        body: {
          type: 'transfer',
          amountPaise: 100,
          sourceAccountId: accountA,
          destinationAccountId: accountB,
        },
      }),
      processTransactionRequest({
        userId: customerB.id,
        role: 'customer',
        idempotencyKey: keyBA,
        method: 'POST',
        path: '/api/transactions',
        body: {
          type: 'transfer',
          amountPaise: 100,
          sourceAccountId: accountB,
          destinationAccountId: accountA,
        },
      }),
    ]);

    assert.equal(resAB.statusCode, 200);
    assert.equal(resBA.statusCode, 200);
  });

  // ---------------------------------------------------------------------------
  // 14. Assertion Replay After Successful Commit
  // ---------------------------------------------------------------------------
  it('14. Assertion replay after successful commit: assertion cannot be reused in another transaction', async () => {
    const assertion = generateHmacAssertion(customerA.id, 'customer', env.IDENTITY_HMAC_SECRET, 30000);
    const client = await pool.connect();
    try {
      // Step 1: Register assertion (independent commit)
      await client.query('BEGIN');
      await client.query(
        'SELECT ledger_secure.register_identity_assertion($1, $2, $3, $4, $5)',
        [customerA.id, 'customer', assertion.expiresAt, assertion.nonce, assertion.signature]
      );
      await client.query('COMMIT');

      // Step 2: Consume assertion (independent commit before financial tx)
      await client.query('BEGIN');
      await client.query(
        'SELECT ledger_secure.consume_identity_assertion($1, $2)',
        [assertion.nonce, assertion.signature]
      );
      await client.query('COMMIT');

      // Step 3: Establish verified session context inside financial transaction and commit
      await client.query('BEGIN');
      await client.query(
        'SELECT ledger_secure.establish_session_identity($1, $2)',
        [assertion.nonce, assertion.signature]
      );
      await client.query('COMMIT');

      // Attempt to claim / consume same assertion again -> must reject
      await client.query('BEGIN');
      await assert.rejects(
        async () => {
          await client.query(
            'SELECT ledger_secure.consume_identity_assertion($1, $2)',
            [assertion.nonce, assertion.signature]
          );
        },
        /has already been claimed and cannot be reused/
      );
      await client.query('ROLLBACK');

      // Attempt to establish context with already-bound assertion -> must reject
      await client.query('BEGIN');
      await assert.rejects(
        async () => {
          await client.query(
            'SELECT ledger_secure.establish_session_identity($1, $2)',
            [assertion.nonce, assertion.signature]
          );
        },
        /has already been bound or is invalid/
      );
      await client.query('ROLLBACK');
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  });

  // ---------------------------------------------------------------------------
  // 15. Assertion Replay After Financial Rollback (Independently Committed Nonce)
  // ---------------------------------------------------------------------------
  it('15. Assertion replay after financial rollback: nonce consumption survives rollback', async () => {
    const assertion = generateHmacAssertion(customerA.id, 'customer', env.IDENTITY_HMAC_SECRET, 30000);
    const client = await pool.connect();
    try {
      // Step 1: Register assertion (independent commit)
      await client.query('BEGIN');
      await client.query(
        'SELECT ledger_secure.register_identity_assertion($1, $2, $3, $4, $5)',
        [customerA.id, 'customer', assertion.expiresAt, assertion.nonce, assertion.signature]
      );
      await client.query('COMMIT');

      // Step 2: Consume assertion (independent commit before financial tx)
      await client.query('BEGIN');
      await client.query(
        'SELECT ledger_secure.consume_identity_assertion($1, $2)',
        [assertion.nonce, assertion.signature]
      );
      await client.query('COMMIT');

      // Step 3: Begin financial transaction & establish verified session context
      await client.query('BEGIN');
      await client.query(
        'SELECT ledger_secure.establish_session_identity($1, $2)',
        [assertion.nonce, assertion.signature]
      );

      // Verify context is active
      const inTx = await client.query('SELECT ledger_secure.current_verified_user_id() AS uid');
      assert.equal(inTx.rows[0].uid, customerA.id);

      // Step 4: Financial rollback
      await client.query('ROLLBACK');

      // Step 5: Attempt to reuse exact same nonce and signature -> must be rejected!
      // Vector A: Re-registering fails with unique constraint
      await client.query('BEGIN');
      await assert.rejects(
        async () => {
          await client.query(
            'SELECT ledger_secure.register_identity_assertion($1, $2, $3, $4, $5)',
            [customerA.id, 'customer', assertion.expiresAt, assertion.nonce, assertion.signature]
          );
        },
        /duplicate key value violates unique constraint/
      );
      await client.query('ROLLBACK');

      // Vector B: Re-consuming fails because consumption committed in Step 2 survived rollback
      await client.query('BEGIN');
      await assert.rejects(
        async () => {
          await client.query(
            'SELECT ledger_secure.consume_identity_assertion($1, $2)',
            [assertion.nonce, assertion.signature]
          );
        },
        /has already been claimed and cannot be reused/
      );
      await client.query('ROLLBACK');

      // Vector C: Compatibility wrapper claim_session_identity fails
      await client.query('BEGIN');
      await assert.rejects(
        async () => {
          await client.query(
            'SELECT ledger_secure.claim_session_identity($1, $2)',
            [assertion.nonce, assertion.signature]
          );
        },
        /has already been claimed and cannot be reused/
      );
      await client.query('ROLLBACK');
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  });

  // ---------------------------------------------------------------------------
  // 16. Stale or Suspended User Assertion
  // ---------------------------------------------------------------------------
  it('16. Stale or suspended user assertion: deactivating user rejects assertion immediately', async () => {
    // Suspend userC
    await setUserStatus(adminUser.id, userC.id, false, 'Temporary suspension for test');

    const assertion = generateHmacAssertion(userC.id, 'customer', env.IDENTITY_HMAC_SECRET, 30000);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await assert.rejects(
        async () => {
          await client.query(
            'SELECT ledger_secure.register_identity_assertion($1, $2, $3, $4, $5)',
            [userC.id, 'customer', assertion.expiresAt, assertion.nonce, assertion.signature]
          );
        },
        /is inactive or suspended/
      );
      await client.query('ROLLBACK');
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }

    // Reactivate userC
    await setUserStatus(adminUser.id, userC.id, true, 'Test complete');
  });

  // ---------------------------------------------------------------------------
  // 17. Concurrent Final Account-Holder Revocation Protection
  // ---------------------------------------------------------------------------
  it('17. Concurrent final account-holder revocation: serialized check prevents 0 holders', async () => {
    // Add customerB as second account_holder on accountA
    await assignMembership(adminUser.id, 'admin', accountA, customerB.id, 'account_holder');

    // Concurrently attempt to revoke customerA and customerB
    const results = await Promise.allSettled([
      revokeMembership(adminUser.id, 'admin', accountA, customerA.id),
      revokeMembership(adminUser.id, 'admin', accountA, customerB.id),
    ]);

    const rejected = results.find(r => r.status === 'rejected');
    const fulfilled = results.find(r => r.status === 'fulfilled');

    assert.ok(fulfilled, 'One revocation must succeed');
    assert.ok(rejected, 'Second revocation must be rejected');
    assert.match(rejected.reason.message, /Cannot revoke the final account_holder/);

    // Ensure customerA is restored as account_holder
    await assignMembership(adminUser.id, 'admin', accountA, customerA.id, 'account_holder').catch(() => {});
  });

  // ---------------------------------------------------------------------------
  // 18. Ledger Posting Append-Only Protection (Distinguishing Grant vs Trigger)
  // ---------------------------------------------------------------------------
  it('18. Ledger posting mutation attempt: distinguishes grant denial from trigger enforcement', async () => {
    // 1. Application role lacks UPDATE privilege -> PostgreSQL permission denied
    const appClient = await pool.connect();
    try {
      await appClient.query('BEGIN');
      await assert.rejects(
        async () => {
          await appClient.query('UPDATE public.ledger_postings SET amount_paise = 999999');
        },
        /permission denied for table ledger_postings/
      );
      await appClient.query('ROLLBACK');
    } finally {
      await appClient.query('ROLLBACK').catch(() => {});
      appClient.release();
    }

    // 2. Privileged admin client has table privileges -> Genuine Trigger Execution
    await adminClient.query('BEGIN');
    await assert.rejects(
      async () => {
        await adminClient.query('UPDATE public.ledger_postings SET amount_paise = 999999');
      },
      /Table ledger_postings is strictly append-only; UPDATE operations are prohibited/
    );
    await adminClient.query('ROLLBACK');

    // 3. Privileged delete attempt -> Genuine Trigger Execution
    await adminClient.query('BEGIN');
    await assert.rejects(
      async () => {
        await adminClient.query('DELETE FROM public.ledger_postings');
      },
      /Table ledger_postings is strictly append-only; DELETE operations are prohibited/
    );
    await adminClient.query('ROLLBACK');
  });

  // ---------------------------------------------------------------------------
  // 19. Finalized Transaction Immutability
  // ---------------------------------------------------------------------------
  it('19. Finalized transaction immutability: trigger blocks update or deletion of finalized transactions', async () => {
    // Fetch posted and refused transaction IDs
    const [postedTxId, refusedTxId] = await executeWithSession(customerA.id, 'customer', async (client) => {
      const p = await client.query("SELECT id FROM public.transactions WHERE status = 'posted' LIMIT 1");
      const r = await client.query("SELECT id FROM public.transactions WHERE status = 'refused' LIMIT 1");
      return [p.rows[0]?.id, r.rows[0]?.id];
    });

    assert.ok(postedTxId, 'Posted transaction must exist');
    assert.ok(refusedTxId, 'Refused transaction must exist');

    // 1. UPDATE on posted transaction must be rejected by trigger
    await adminClient.query('BEGIN');
    await assert.rejects(
      async () => {
        await adminClient.query('UPDATE public.transactions SET amount_paise = 999999 WHERE id = $1', [postedTxId]);
      },
      /Transaction .* is finalized \(posted\) and immutable; updates are prohibited/
    );
    await adminClient.query('ROLLBACK');

    // 2. UPDATE on refused transaction must be rejected by trigger
    await adminClient.query('BEGIN');
    await assert.rejects(
      async () => {
        await adminClient.query("UPDATE public.transactions SET refusal_reason = 'TAMPERED' WHERE id = $1", [refusedTxId]);
      },
      /Transaction .* is finalized \(refused\) and immutable; updates are prohibited/
    );
    await adminClient.query('ROLLBACK');

    // 3. DELETE on posted transaction must be rejected by trigger
    await adminClient.query('BEGIN');
    await assert.rejects(
      async () => {
        await adminClient.query('DELETE FROM public.transactions WHERE id = $1', [postedTxId]);
      },
      /Finalized transactions \(posted\) cannot be deleted/
    );
    await adminClient.query('ROLLBACK');

    // 4. Modifying financial identity fields during pending->posted transition must be rejected
    await adminClient.query('BEGIN');
    const pendingInsert = await adminClient.query(`
      INSERT INTO public.transactions 
        (type, status, amount_paise, currency, source_account_id, destination_account_id, created_by)
      VALUES ('transfer', 'pending', 500, 'INR', $1, $2, $3)
      RETURNING id
    `, [accountA, accountB, customerA.id]);
    const pendingId = pendingInsert.rows[0].id;

    await assert.rejects(
      async () => {
        await adminClient.query(`
          UPDATE public.transactions 
             SET status = 'posted', amount_paise = 999999 
           WHERE id = $1
        `, [pendingId]);
      },
      /Cannot modify financial identity fields of transaction .* during finalization/
    );
    await adminClient.query('ROLLBACK');
  });

  // ---------------------------------------------------------------------------
  // 20. Balance Reconciliation Failure Verification
  // ---------------------------------------------------------------------------
  it('20. Balance reconciliation: commit validator detects corrupted balance and aborts commit', async () => {
    // 1. Verify clean reconciliation currently
    const reconRes = await executeWithSession(adminUser.id, 'admin', async (client) => {
      return client.query(`
        SELECT a.id, a.account_number, a.current_balance, COALESCE(SUM(p.signed_amount_paise), 0) AS calculated_balance
          FROM public.accounts a
          LEFT JOIN public.ledger_postings p ON a.id = p.account_id
         GROUP BY a.id, a.account_number, a.current_balance
        HAVING a.current_balance != COALESCE(SUM(p.signed_amount_paise), 0);
      `);
    });
    assert.equal(reconRes.rowCount, 0, 'All accounts must have 0 reconciliation discrepancies');

    // 2. Deliberately corrupt account balance in a privileged test transaction and assert commit validator fails
    await adminClient.query('BEGIN');
    try {
      // Corrupt cached balance
      await adminClient.query('UPDATE public.accounts SET current_balance = current_balance + 9999 WHERE id = $1', [accountA]);

      // Insert a posted transaction and balanced postings
      const txRes = await adminClient.query(`
        INSERT INTO public.transactions 
          (type, status, amount_paise, currency, source_account_id, destination_account_id, created_by)
        VALUES ('transfer', 'posted', 100, 'INR', $1, $2, $3)
        RETURNING id
      `, [accountA, accountB, customerA.id]);
      const txId = txRes.rows[0].id;

      await adminClient.query(`
        INSERT INTO public.ledger_postings 
          (transaction_id, account_id, entry_type, amount_paise, signed_amount_paise, sequence_number)
        VALUES 
          ($1, $2, 'DEBIT', 100, -100, 1),
          ($1, $3, 'CREDIT', 100, 100, 2)
      `, [txId, accountA, accountB]);

      // Attempt commit -> deferred trigger must abort commit with reconciliation error
      await assert.rejects(
        async () => {
          await adminClient.query('COMMIT');
        },
        /Balance reconciliation failure on source account/
      );
    } finally {
      await adminClient.query('ROLLBACK').catch(() => {});
    }
  });

  // ---------------------------------------------------------------------------
  // 21. Invalid Reversal
  // ---------------------------------------------------------------------------
  it('21. Invalid reversal: endpoint tampering or mismatched amount is rejected', async () => {
    const key = `valid_orig_${Date.now()}`;
    const origRes = await processTransactionRequest({
      userId: customerA.id,
      role: 'customer',
      idempotencyKey: key,
      method: 'POST',
      path: '/api/transactions',
      body: {
        type: 'transfer',
        amountPaise: 500,
        sourceAccountId: accountA,
        destinationAccountId: accountB,
      },
    });
    const origTxId = origRes.body.transaction_id;

    // Tampered Reversal: Reversal source does not invert original destination
    const revKey = `rev_tamper_${Date.now()}`;
    await assert.rejects(
      async () => {
        await processTransactionRequest({
          userId: adminUser.id,
          role: 'admin',
          idempotencyKey: revKey,
          method: 'POST',
          path: '/api/transactions',
          body: {
            type: 'reversal',
            amountPaise: 500,
            sourceAccountId: accountA, // Wrong! Should be accountB
            destinationAccountId: accountB,
            originalTransactionId: origTxId,
          },
        });
      },
      /Reversal endpoints must be exact inversion of original endpoints/
    );
  });

  // ---------------------------------------------------------------------------
  // 22. Duplicate Reversal
  // ---------------------------------------------------------------------------
  it('22. Duplicate reversal: an already reversed transaction cannot be reversed again', async () => {
    // 1. Valid transfer
    const keyOrig = `orig_tx_${Date.now()}`;
    const origRes = await processTransactionRequest({
      userId: customerA.id,
      role: 'customer',
      idempotencyKey: keyOrig,
      method: 'POST',
      path: '/api/transactions',
      body: {
        type: 'transfer',
        amountPaise: 300,
        sourceAccountId: accountA,
        destinationAccountId: accountB,
      },
    });
    const origTxId = origRes.body.transaction_id;

    // 2. First valid reversal by admin
    const keyRev1 = `rev_first_${Date.now()}`;
    const rev1Res = await processTransactionRequest({
      userId: adminUser.id,
      role: 'admin',
      idempotencyKey: keyRev1,
      method: 'POST',
      path: '/api/transactions',
      body: {
        type: 'reversal',
        amountPaise: 300,
        sourceAccountId: accountB,
        destinationAccountId: accountA,
        originalTransactionId: origTxId,
      },
    });
    assert.equal(rev1Res.statusCode, 200);

    // 3. Second reversal attempt -> Refused with ALREADY_REVERSED
    const keyRev2 = `rev_second_${Date.now()}`;
    const rev2Res = await processTransactionRequest({
      userId: adminUser.id,
      role: 'admin',
      idempotencyKey: keyRev2,
      method: 'POST',
      path: '/api/transactions',
      body: {
        type: 'reversal',
        amountPaise: 300,
        sourceAccountId: accountB,
        destinationAccountId: accountA,
        originalTransactionId: origTxId,
      },
    });
    assert.equal(rev2Res.statusCode, 422);
    assert.equal(rev2Res.body.reason, 'ALREADY_REVERSED');
  });

  // ---------------------------------------------------------------------------
  // 23. Pending Transaction at Commit
  // ---------------------------------------------------------------------------
  it('23. Pending transaction at commit: deferred trigger aborts commit if still pending', async () => {
    const assertion = generateHmacAssertion(customerA.id, 'customer', env.IDENTITY_HMAC_SECRET, 30000);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT ledger_secure.register_identity_assertion($1, $2, $3, $4, $5)',
        [customerA.id, 'customer', assertion.expiresAt, assertion.nonce, assertion.signature]
      );
      await client.query(
        'SELECT ledger_secure.consume_identity_assertion($1, $2)',
        [assertion.nonce, assertion.signature]
      );
      await client.query('COMMIT');

      await client.query('BEGIN');
      await client.query('SELECT ledger_secure.establish_session_identity($1, $2)', [assertion.nonce, assertion.signature]);
      await client.query(
        `INSERT INTO public.transactions 
           (type, status, amount_paise, currency, source_account_id, destination_account_id, created_by)
         VALUES ('transfer', 'pending', 100, 'INR', $1, $2, $3)`,
        [accountA, accountB, customerA.id]
      );

      await assert.rejects(
        async () => {
          await client.query('COMMIT');
        },
        /remains in pending status at commit/
      );
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  });

  // ---------------------------------------------------------------------------
  // 24. Refused Transaction Zero Postings
  // ---------------------------------------------------------------------------
  it('24. Refused transaction zero postings: validator verifies exactly 0 postings exist', async () => {
    const count = await executeWithSession(customerA.id, 'customer', async (client) => {
      const refusedRes = await client.query("SELECT id FROM public.transactions WHERE status = 'refused' LIMIT 1");
      assert.ok(refusedRes.rowCount > 0, 'Refused transaction must exist');
      const refusedId = refusedRes.rows[0].id;
      const countRes = await client.query('SELECT COUNT(*) FROM public.ledger_postings WHERE transaction_id = $1', [refusedId]);
      return parseInt(countRes.rows[0].count, 10);
    });
    assert.equal(count, 0);
  });

  // ---------------------------------------------------------------------------
  // 25. Session Context Cleanup After Commit and Rollback
  // ---------------------------------------------------------------------------
  it('25. Session context cleanup: context deleted after commit and rollback', async () => {
    // 1. Commit Path Cleanup
    await executeWithSession(customerA.id, 'customer', async (client) => {
      const inTxRes = await client.query('SELECT ledger_secure.current_verified_user_id() AS uid');
      assert.equal(inTxRes.rows[0].uid, customerA.id);
    });
    const postCommitUid = await query('SELECT ledger_secure.current_verified_user_id() AS uid');
    assert.equal(postCommitUid.rows[0].uid, null, 'Context must be cleared post-commit');

    // 2. Rollback Path Cleanup
    await assert.rejects(
      async () => {
        await executeWithSession(customerA.id, 'customer', async (client) => {
          const inTxRes = await client.query('SELECT ledger_secure.current_verified_user_id() AS uid');
          assert.equal(inTxRes.rows[0].uid, customerA.id);
          throw new Error('deliberate_financial_abort');
        });
      },
      /deliberate_financial_abort/
    );
    const postRollbackUid = await query('SELECT ledger_secure.current_verified_user_id() AS uid');
    assert.equal(postRollbackUid.rows[0].uid, null, 'Context must be cleared post-rollback');
  });

  // ---------------------------------------------------------------------------
  // 26. Monetary Input Validation & Safe BIGINT Arithmetic
  // ---------------------------------------------------------------------------
  it('26. Input validation: rejects unsafe integers, floats, negatives, and non-digits', () => {
    // Valid inputs
    assert.equal(validateAmountPaise(500), '500');
    assert.equal(validateAmountPaise('500'), '500');
    assert.equal(validateAmountPaise('9223372036854775807'), '9223372036854775807'); // Max BIGINT

    // Rejects unsafe JavaScript integer
    assert.throws(
      () => validateAmountPaise(9007199254740992), // Number.MAX_SAFE_INTEGER + 1
      /unsafe integer value/
    );

    // Rejects floats
    assert.throws(() => validateAmountPaise(10.5), /unsafe integer value|integer minor-currency/);
    assert.throws(() => validateAmountPaise('10.5'), /positive integer digits/);

    // Rejects zero and negatives
    assert.throws(() => validateAmountPaise(0), /positive integer greater than zero/);
    assert.throws(() => validateAmountPaise(-100), /positive integer greater than zero/);
    assert.throws(() => validateAmountPaise('0'), /positive integer digits/);
    assert.throws(() => validateAmountPaise('-50'), /positive integer digits/);

    // Rejects invalid strings
    assert.throws(() => validateAmountPaise('100abc'), /positive integer digits/);
    assert.throws(() => validateAmountPaise(''), /positive integer digits/);

    // Rejects values exceeding signed 64-bit BIGINT
    assert.throws(
      () => validateAmountPaise('9223372036854775808'),
      /exceeds maximum PostgreSQL BIGINT capacity/
    );
  });

  // ---------------------------------------------------------------------------
  // 27. Transaction Read API & Double-Entry Postings
  // ---------------------------------------------------------------------------
  it('27. Transaction read API: retrieves transaction details and dual postings with authorization', async () => {
    // Execute a test transfer
    const key = `read_tx_${Date.now()}`;
    const txRes = await processTransactionRequest({
      userId: customerA.id,
      role: 'customer',
      idempotencyKey: key,
      method: 'POST',
      path: '/api/transactions',
      body: {
        type: 'transfer',
        amountPaise: 250,
        sourceAccountId: accountA,
        destinationAccountId: accountB,
      },
    });
    const txId = txRes.body.transaction_id;

    // 1. Authorized participant (customerA) reads transaction
    const readA = await getTransactionById({ userId: customerA.id, role: 'customer', transactionId: txId });
    assert.equal(readA.transaction.id, txId);
    assert.equal(readA.postings.length, 2);
    assert.equal(readA.postings[0].entry_type, 'DEBIT');
    assert.equal(readA.postings[1].entry_type, 'CREDIT');

    // 2. Auditor reads transaction
    const readAuditor = await getTransactionById({ userId: auditorUser.id, role: 'customer', transactionId: txId });
    assert.equal(readAuditor.transaction.id, txId);
    assert.equal(readAuditor.postings.length, 2);

    // 3. Unauthorized customer (userC) reading transaction -> 404 access denied
    await assert.rejects(
      async () => {
        await getTransactionById({ userId: userC.id, role: 'customer', transactionId: txId });
      },
      (err) => err.status === 404 && /Transaction not found or access denied/.test(err.message)
    );
  });

  // ---------------------------------------------------------------------------
  // 28. Account Statement API with Running Balances and Pagination
  // ---------------------------------------------------------------------------
  it('28. Account statement API: returns postings, running balance, and pagination', async () => {
    // 1. Authorized member (customerA) requests statement
    const stmt = await getAccountStatement(customerA.id, 'customer', accountA, 5, 0);
    assert.ok(stmt.account, 'Account details must be returned');
    assert.equal(stmt.account.id, accountA);
    assert.ok(Array.isArray(stmt.statement), 'Statement postings must be an array');
    assert.ok(stmt.statement.length > 0, 'Postings must exist');
    assert.equal(stmt.pagination.limit, 5);
    assert.equal(stmt.pagination.offset, 0);

    // Each posting must have running_balance_paise computed
    for (const entry of stmt.statement) {
      assert.ok(entry.running_balance_paise !== undefined, 'Each entry must have a running balance');
      assert.ok(entry.amount_paise > 0, 'Posting amount must be positive');
    }

    // 2. Pagination test (offset 1)
    const page2 = await getAccountStatement(customerA.id, 'customer', accountA, 2, 1);
    assert.equal(page2.pagination.limit, 2);
    assert.equal(page2.pagination.offset, 1);

    // 3. Unauthorized user (userC) requesting accountA statement -> 404 access denied
    await assert.rejects(
      async () => {
        await getAccountStatement(userC.id, 'customer', accountA, 10, 0);
      },
      (err) => err.status === 404 && /Account not found or access denied/.test(err.message)
    );
  });
});
