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
  listUserAccounts,
} from '../src/services/account.service.js';
import {
  processTransactionRequest,
  getTransactionById,
  validateAmountPaise,
} from '../src/services/transaction.service.js';
import { executeWithSession } from '../src/utils/sessionContext.js';
import { generateHmacAssertion, hashPassword } from '../src/utils/crypto.js';

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
    // 0. Strict Test Isolation Guard: Refuse to execute against anything other than ledgerline_test
    if (env.DB_NAME !== 'ledgerline_test') {
      throw new Error(
        `CRITICAL TEST ISOLATION FAILURE: Integration tests must execute strictly against an isolated test database ('ledgerline_test'). Refusing to run against '${env.DB_NAME}' to safeguard development data.`
      );
    }

    if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('ledgerline_test')) {
      throw new Error(
        'CRITICAL TEST ISOLATION FAILURE: DATABASE_URL must not override test database isolation.'
      );
    }

    const dbCheck = await query(
      'SELECT host(inet_server_addr()) AS server_ip, inet_server_port() AS server_port, current_database() AS db_name'
    );
    const { server_ip, server_port, db_name: actualDb } = dbCheck.rows[0] || {};
    if (actualDb !== 'ledgerline_test') {
      throw new Error(
        `CRITICAL TEST ISOLATION FAILURE: Connected database is '${actualDb}', but tests are only permitted to execute against 'ledgerline_test'. Refusing execution.`
      );
    }
    if (server_ip && server_ip !== '127.0.0.1' && server_ip !== '::1') {
      throw new Error(
        `CRITICAL TEST ISOLATION FAILURE: Connected server IP is '${server_ip}', expected local test host 127.0.0.1.`
      );
    }

    // 1. Fetch system vault
    const vaultRes = await query("SELECT id FROM public.accounts WHERE system_role_type = 'SYSTEM_CASH_VAULT'");
    assert.ok(vaultRes.rowCount > 0, 'System vault must exist');
    vaultAccount = vaultRes.rows[0];

    // 2. Authenticate admin user using environment-provisioned credentials
    const adminEmail = env.INITIAL_ADMIN_EMAIL;
    const adminPassword = env.INITIAL_ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      throw new Error(
        'Test configuration error: INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD must be defined in environment (provisioned via bootstrap).'
      );
    }

    const adminLogin = await login(adminEmail, adminPassword);
    assert.ok(adminLogin.user && adminLogin.user.id, 'Admin user must exist and authenticate with environment credentials');
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
    assert.equal(res.body.amount_paise, 50000);

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

    await assert.rejects(
      async () => {
        await processTransactionRequest({
          userId: customerA.id,
          role: 'customer',
          idempotencyKey: key,
          method: 'POST',
          path: '/api/transactions',
          body,
        });
      },
      /Caller is not an active account_holder on transfer source account/
    );
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

    await assert.rejects(
      async () => {
        await processTransactionRequest({
          userId: customerA.id,
          role: 'customer',
          idempotencyKey: key,
          method: 'POST',
          path: '/api/transactions',
          body,
        });
      },
      /Caller is not an active account_holder on deposit destination account/
    );
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

    await assert.rejects(
      async () => {
        await processTransactionRequest({
          userId: auditorUser.id,
          role: 'customer',
          idempotencyKey: key,
          method: 'POST',
          path: '/api/transactions',
          body,
        });
      },
      /Caller is not an active account_holder on transfer source account|Auditor role cannot initiate operations/
    );
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

    // Winning request must be fulfilled with status 200
    const fulfilled200 = results.filter(r => r.status === 'fulfilled' && r.value.statusCode === 200);
    assert.ok(fulfilled200.length >= 1, 'At least one request must succeed with HTTP 200');

    // Primary winner must have isIdempotentReplay === false
    const winner = fulfilled200.find(r => r.value.isIdempotentReplay === false);
    assert.ok(winner, 'The winning execution must have isIdempotentReplay === false');
    assert.equal(winner.value.isIdempotentReplay, false, 'Winner isIdempotentReplay must explicitly be false');
    const winnerTxId = winner.value.body.transaction_id;
    assert.ok(winnerTxId, 'Winning transaction must return a valid transaction_id');

    // Concurrent counterpart must either be an exact replay (200, same txId, isIdempotentReplay: true)
    // OR return documented in-progress rejection (HTTP 409). Unexpected errors must fail the test.
    for (const r of results) {
      if (r === winner) continue;
      if (r.status === 'fulfilled') {
        assert.equal(r.value.statusCode, 200, 'Replay response must have statusCode 200');
        assert.equal(r.value.isIdempotentReplay, true, 'Replay response must set isIdempotentReplay=true');
        assert.equal(r.value.body.transaction_id, winnerTxId, 'Replay must return identical transaction_id');
      } else {
        assert.equal(r.reason.status, 409, 'Concurrent in-progress request must return HTTP 409');
        assert.match(
          r.reason.message,
          /A request with this idempotency key is currently in progress/,
          'Rejection must specifically be concurrent in-progress error'
        );
      }
    }

    // Direct Database Verification: Exactly 1 idempotency record, 1 transaction, and 2 postings
    const idempKeyRes = await adminClient.query(
      'SELECT id, status, transaction_id FROM public.idempotency_keys WHERE user_id = $1 AND idempotency_key = $2',
      [customerA.id, key]
    );
    assert.equal(idempKeyRes.rowCount, 1, 'Exactly one idempotency record must exist');
    assert.equal(idempKeyRes.rows[0].status, 'resolved', 'Idempotency key must be in resolved status');
    assert.equal(idempKeyRes.rows[0].transaction_id, winnerTxId, 'Idempotency record must be bound to winner transaction');

    const txCountRes = await adminClient.query('SELECT COUNT(*) FROM public.transactions WHERE id = $1', [winnerTxId]);
    assert.equal(parseInt(txCountRes.rows[0].count, 10), 1, 'Exactly one transaction row must be created');

    const postCountRes = await adminClient.query('SELECT COUNT(*) FROM public.ledger_postings WHERE transaction_id = $1', [winnerTxId]);
    assert.equal(parseInt(postCountRes.rows[0].count, 10), 2, 'Exactly two ledger postings must exist');
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

    // Ensure accountA balance remains non-negative (query via adminClient to bypass RLS)
    const acc = await adminClient.query('SELECT current_balance FROM public.accounts WHERE id = $1', [accountA]);
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

      // Vector C1: ledgerline_app cannot execute claim_session_identity (grant revoked)
      await client.query('BEGIN');
      await assert.rejects(
        async () => {
          await client.query(
            'SELECT ledger_secure.claim_session_identity($1, $2)',
            [assertion.nonce, assertion.signature]
          );
        },
        /permission denied for function claim_session_identity/
      );
      await client.query('ROLLBACK');

      // Vector C2: Even on privileged connection, claim_session_identity rejects consumed nonce
      await adminClient.query('BEGIN');
      await assert.rejects(
        async () => {
          await adminClient.query(
            'SELECT ledger_secure.claim_session_identity($1, $2)',
            [assertion.nonce, assertion.signature]
          );
        },
        /has already been claimed and cannot be reused/
      );
      await adminClient.query('ROLLBACK');
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

    // Verify account retains exactly 1 active account_holder in the database
    const holdersRes = await adminClient.query(
      "SELECT COUNT(*) FROM public.account_memberships WHERE account_id = $1 AND role = 'account_holder'",
      [accountA]
    );
    assert.equal(parseInt(holdersRes.rows[0].count, 10), 1, 'Account must retain exactly 1 active account_holder');

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
      // Insert a pending transaction first so postings can be added
      const txRes = await adminClient.query(`
        INSERT INTO public.transactions 
          (type, status, amount_paise, currency, source_account_id, destination_account_id, created_by)
        VALUES ('transfer', 'pending', 100, 'INR', $1, $2, $3)
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

      // Transition transaction to 'posted'
      await adminClient.query(`
        UPDATE public.transactions SET status = 'posted' WHERE id = $1
      `, [txId]);

      // Corrupt cached balance on accountA
      await adminClient.query('UPDATE public.accounts SET current_balance = current_balance + 9999 WHERE id = $1', [accountA]);

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
  it('24. Refused transaction zero postings: validator verifies exactly 0 postings exist for specific refused transaction', async () => {
    const key = `refused_postings_check_${Date.now()}`;
    const res = await processTransactionRequest({
      userId: customerA.id,
      role: 'customer',
      idempotencyKey: key,
      method: 'POST',
      path: '/api/transactions',
      body: {
        type: 'transfer',
        amountPaise: 999999999, // Guaranteed refusal (insufficient funds)
        sourceAccountId: accountA,
        destinationAccountId: accountB,
      },
    });

    assert.equal(res.statusCode, 422);
    assert.equal(res.body.status, 'refused');
    const specificRefusedId = res.body.transaction_id;
    assert.ok(specificRefusedId, 'Refused transaction must return a transaction_id');

    // Verify postings specifically for this transaction via adminClient
    const countRes = await adminClient.query(
      'SELECT COUNT(*) FROM public.ledger_postings WHERE transaction_id = $1',
      [specificRefusedId]
    );
    assert.equal(parseInt(countRes.rows[0].count, 10), 0, 'Specifically created refused transaction must have 0 postings');
  });

  // ---------------------------------------------------------------------------
  // 25. Session Context Cleanup After Commit and Rollback
  // ---------------------------------------------------------------------------
  it('25. Session context cleanup: captures backend PID and verifies exact context deletion on commit and rollback', async () => {
    // 1. Commit Path Cleanup
    let commitPid = null;
    let commitTxid = null;

    await executeWithSession(customerA.id, 'customer', async (client, txid) => {
      commitTxid = txid;
      // Verify active session identity on the active client via helper
      const uidRes = await client.query('SELECT ledger_secure.current_verified_user_id() AS uid');
      assert.equal(uidRes.rows[0].uid, customerA.id, 'Session identity must be established inside transaction');

      const pidRes = await client.query('SELECT pg_backend_pid() AS pid');
      commitPid = pidRes.rows[0].pid;
    });

    assert.ok(commitPid, 'Must capture backend PID from commit session');
    assert.ok(commitTxid, 'Must capture financial transaction ID from commit session');

    // Post-Commit Verification: Query active_session_contexts for that EXACT backend PID and txid via privileged adminClient
    const postCommitRes = await adminClient.query(
      'SELECT * FROM ledger_secure.active_session_contexts WHERE backend_pid = $1 OR txid = $2::bigint',
      [commitPid, commitTxid]
    );
    assert.equal(postCommitRes.rowCount, 0, 'Context row for exact backend PID and txid must be deleted post-commit');

    // 2. Rollback Path Cleanup
    let rollbackPid = null;
    let rollbackTxid = null;

    await assert.rejects(
      async () => {
        await executeWithSession(customerA.id, 'customer', async (client, txid) => {
          rollbackTxid = txid;
          // Verify active session identity on the active client prior to abort
          const uidRes = await client.query('SELECT ledger_secure.current_verified_user_id() AS uid');
          assert.equal(uidRes.rows[0].uid, customerA.id, 'Session identity must be established prior to abort');

          const pidRes = await client.query('SELECT pg_backend_pid() AS pid');
          rollbackPid = pidRes.rows[0].pid;

          throw new Error('deliberate_abort_for_cleanup_test');
        });
      },
      /deliberate_abort_for_cleanup_test/
    );

    assert.ok(rollbackPid, 'Must capture backend PID from rollback session');
    assert.ok(rollbackTxid, 'Must capture financial transaction ID from rollback session');

    // Post-Rollback Verification: Query active_session_contexts for that EXACT backend PID and txid via privileged adminClient
    const postRollbackRes = await adminClient.query(
      'SELECT * FROM ledger_secure.active_session_contexts WHERE backend_pid = $1 OR txid = $2::bigint',
      [rollbackPid, rollbackTxid]
    );
    assert.equal(postRollbackRes.rowCount, 0, 'Context row for exact backend PID and txid must be deleted post-rollback');
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

    // 1. Authorized participant (customerA) reads transaction (sees accountA posting under RLS)
    const readA = await getTransactionById({ userId: customerA.id, role: 'customer', transactionId: txId });
    assert.equal(readA.transaction.id, txId);
    assert.equal(readA.postings.length, 1);
    assert.equal(readA.postings[0].entry_type, 'DEBIT');
    assert.equal(readA.postings[0].account_id, accountA);

    // 2. Administrator reads transaction (sees both balanced double-entry postings)
    const readAdmin = await getTransactionById({ userId: adminUser.id, role: 'admin', transactionId: txId });
    assert.equal(readAdmin.transaction.id, txId);
    assert.equal(readAdmin.postings.length, 2);
    assert.equal(readAdmin.postings[0].entry_type, 'DEBIT');
    assert.equal(readAdmin.postings[1].entry_type, 'CREDIT');

    // 3. Auditor reads transaction (sees accountA posting under RLS without cross-account leakage)
    const readAuditor = await getTransactionById({ userId: auditorUser.id, role: 'customer', transactionId: txId });
    assert.equal(readAuditor.transaction.id, txId);
    assert.equal(readAuditor.postings.length, 1);
    assert.equal(readAuditor.postings[0].account_id, accountA);

    // 4. Unauthorized customer (userC) reading transaction -> 404 access denied
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

  // ---------------------------------------------------------------------------
  // 29. Admin Action Attribution & Audit Log Recording
  // ---------------------------------------------------------------------------
  it('29. Admin action attribution: records verified admin actor ID and details in audit log', async () => {
    // Admin suspends userC
    const reason = 'Suspicious velocity detected by compliance';
    const statusResult = await setUserStatus(adminUser.id, userC.id, false, reason);
    assert.equal(statusResult.success, true);
    assert.equal(statusResult.isActive, false);

    // Verify user table state
    const userRes = await adminClient.query('SELECT is_active FROM public.users WHERE id = $1', [userC.id]);
    assert.equal(userRes.rows[0].is_active, false, 'User must be marked inactive');

    // Verify audit log has the true admin actor
    const auditRes = await adminClient.query(
      `SELECT actor_id, actor_role, action, entity_type, entity_id, metadata
         FROM public.audit_logs
        WHERE entity_id = $1 AND action = 'USER_STATUS_CHANGED'
        ORDER BY created_at DESC
        LIMIT 1`,
      [userC.id]
    );
    assert.equal(auditRes.rowCount, 1, 'Audit log entry must be created');
    const log = auditRes.rows[0];
    assert.equal(log.actor_id, adminUser.id, 'Audit log actor_id must match verified admin user ID');
    assert.equal(log.actor_role, 'admin', 'Audit log actor_role must be admin');
    assert.equal(log.metadata.reason, reason, 'Audit log metadata must contain the reason');
    assert.equal(log.metadata.new_is_active, false);

    // Reactivate userC to clean up
    await setUserStatus(adminUser.id, userC.id, true, 'Account reinstated after review');
    const reactivatedRes = await adminClient.query('SELECT is_active FROM public.users WHERE id = $1', [userC.id]);
    assert.equal(reactivatedRes.rows[0].is_active, true, 'User must be reactivated');
  });

  // ---------------------------------------------------------------------------
  // 30. Null-Safe Admin Authorization Matrix (5 Cases)
  // ---------------------------------------------------------------------------
  describe('30. Null-safe admin authorization matrix for set_user_status', () => {
    // Helper to query target user state and audit log count
    async function getTargetUserState(userId) {
      const uRes = await adminClient.query('SELECT is_active FROM public.users WHERE id = $1', [userId]);
      const aRes = await adminClient.query(
        "SELECT COUNT(*)::int AS count FROM public.audit_logs WHERE entity_id = $1 AND action = 'USER_STATUS_CHANGED'",
        [userId]
      );
      return { isActive: uRes.rows[0]?.is_active, auditCount: aRes.rows[0]?.count };
    }

    it('Case 1: Rejects execution with NO session context (v_current_user_id IS NULL)', async () => {
      const before = await getTargetUserState(userC.id);
      assert.equal(before.isActive, true);

      // Call public.set_user_status directly without session context
      await assert.rejects(
        async () => {
          await query('SELECT public.set_user_status($1, $2, $3)', [userC.id, false, 'Tamper without session']);
        },
        (err) => /Only an administrator can modify user status/.test(err.message) || err.code === '42501'
      );

      const after = await getTargetUserState(userC.id);
      assert.equal(after.isActive, before.isActive, 'Target user is_active must remain unchanged');
      assert.equal(after.auditCount, before.auditCount, 'Zero audit logs must be inserted on rejection');
    });

    it('Case 2: Rejects execution with Customer session context', async () => {
      const before = await getTargetUserState(userC.id);

      await assert.rejects(
        async () => {
          await executeWithSession(customerA.id, 'customer', async (client) => {
            await client.query('SELECT public.set_user_status($1, $2, $3)', [userC.id, false, 'Tamper by customer']);
          });
        },
        (err) => /Only an administrator can modify user status/.test(err.message) || err.code === '42501'
      );

      const after = await getTargetUserState(userC.id);
      assert.equal(after.isActive, before.isActive, 'Target user is_active must remain unchanged');
      assert.equal(after.auditCount, before.auditCount, 'Zero audit logs must be inserted on rejection');
    });

    it('Case 3: Rejects execution with Auditor session context', async () => {
      const before = await getTargetUserState(userC.id);

      // Attempting to assert role auditor or execute with auditor context
      await assert.rejects(
        async () => {
          await executeWithSession(auditorUser.id, 'auditor', async (client) => {
            await client.query('SELECT public.set_user_status($1, $2, $3)', [userC.id, false, 'Tamper by auditor']);
          });
        },
        (err) => /Assertion role auditor does not match authoritative database role/.test(err.message) ||
                 /Only an administrator can modify user status/.test(err.message)
      );

      const after = await getTargetUserState(userC.id);
      assert.equal(after.isActive, before.isActive, 'Target user is_active must remain unchanged');
      assert.equal(after.auditCount, before.auditCount, 'Zero audit logs must be inserted on rejection');
    });

    it('Case 4: Succeeds with verified Admin session context', async () => {
      const before = await getTargetUserState(userC.id);
      assert.equal(before.isActive, true);

      // Admin successfully suspends userC
      await setUserStatus(adminUser.id, userC.id, false, 'Legitimate administrative suspension');

      const suspended = await getTargetUserState(userC.id);
      assert.equal(suspended.isActive, false, 'Target user must be suspended');
      assert.equal(suspended.auditCount, before.auditCount + 1, 'Exactly one audit log entry must be recorded');

      // Admin successfully reactivates userC
      await setUserStatus(adminUser.id, userC.id, true, 'Reactivation cleanup');

      const restored = await getTargetUserState(userC.id);
      assert.equal(restored.isActive, true, 'Target user must be restored');
      assert.equal(restored.auditCount, suspended.auditCount + 1, 'Exactly one audit log entry must be recorded for reactivation');
    });

    it('Case 5: Rejects execution by a Demoted Admin', async () => {
      // 1. Create a temporary admin user
      const unique = Date.now();
      const demotedEmail = `demoted_admin_${unique}@test.local`;
      const createRes = await adminClient.query(
        `INSERT INTO public.users (email, password_hash, role, is_active)
         VALUES ($1, 'hash_placeholder', 'admin', true)
         RETURNING id`,
        [demotedEmail]
      );
      const demotedAdminId = createRes.rows[0].id;

      // 2. Demote the admin to 'customer' in public.users
      await adminClient.query(
        "UPDATE public.users SET role = 'customer' WHERE id = $1",
        [demotedAdminId]
      );

      const before = await getTargetUserState(userC.id);

      // 3. Demoted admin attempts to call setUserStatus claiming admin
      await assert.rejects(
        async () => {
          await setUserStatus(demotedAdminId, userC.id, false, 'Demoted admin unauthorized attempt');
        },
        (err) => /Assertion role admin does not match authoritative database role customer/.test(err.message) ||
                 /Caller is not an active administrator in database/.test(err.message) ||
                 /Only an administrator can modify user status/.test(err.message)
      );

      const after = await getTargetUserState(userC.id);
      assert.equal(after.isActive, before.isActive, 'Target user is_active must remain unchanged');
      assert.equal(after.auditCount, before.auditCount, 'Zero audit logs must be inserted on rejection');
    });
  });

  // ---------------------------------------------------------------------------
  // 31. Business Refusal Helper Security & Actor Forgery Prevention
  // ---------------------------------------------------------------------------
  it('31. Business refusal helper security: direct execution denied to app role and actor derived from verified session', async () => {
    // 1. Direct invocation attempt by ledgerline_app must be rejected at PostgreSQL grant level (SQLSTATE 42501)
    await assert.rejects(
      async () => {
        // query() connects as runtime application role ledgerline_app
        await query('SELECT public.record_business_refusal($1, $2)', [
          '00000000-0000-0000-0000-000000000001',
          'FORGED_REFUSAL',
        ]);
      },
      (err) => err.code === '42501' || /permission denied for function record_business_refusal/.test(err.message)
    );

    // 2. Direct invocation on privileged connection without active session must be rejected with SQLSTATE 28000
    await assert.rejects(
      async () => {
        await adminClient.query('SELECT public.record_business_refusal($1, $2)', [
          '00000000-0000-0000-0000-000000000001',
          'FORGED_REFUSAL',
        ]);
      },
      (err) => err.code === '28000' || /Refusal recording requires an active verified session context/.test(err.message)
    );

    // 3. Verify that old 4-argument overload accepting caller-supplied actor identity has been completely dropped
    await assert.rejects(
      async () => {
        await adminClient.query(
          'SELECT public.record_business_refusal($1, $2, $3, $4)',
          [
            '00000000-0000-0000-0000-000000000001',
            'FORGED_REFUSAL',
            adminUser.id,
            'admin',
          ]
        );
      },
      (err) => err.code === '42883' || /function public.record_business_refusal.*does not exist/.test(err.message)
    );
  });

  // ---------------------------------------------------------------------------
  // 32. Session Identity Wrapper Security: ledgerline_app Execution Denied
  // ---------------------------------------------------------------------------
  it('32. Session identity wrapper security: direct execution of claim_session_identity denied to ledgerline_app', async () => {
    const dummyNonce = '00000000-0000-0000-0000-000000000001';
    const dummySignature = Buffer.from('test_signature_bytes');

    await assert.rejects(
      async () => {
        // query() connects as runtime application role ledgerline_app
        await query('SELECT ledger_secure.claim_session_identity($1, $2)', [
          dummyNonce,
          dummySignature,
        ]);
      },
      (err) => err.code === '42501' || /permission denied for function claim_session_identity/.test(err.message)
    );
  });

  // ---------------------------------------------------------------------------
  // 33. Schema & Database Creation Restrictions (ledgerline_app & PUBLIC)
  // ---------------------------------------------------------------------------
  it('33. Schema & database creation restrictions: ledgerline_app and PUBLIC cannot create objects in protected or temporary schemas', async () => {
    // 1. ledgerline_app cannot create tables in public
    await assert.rejects(
      async () => {
        await query('CREATE TABLE public.unauthorized_tbl (id int)');
      },
      (err) => err.code === '42501' || /permission denied for schema public/.test(err.message)
    );

    // 2. ledgerline_app cannot create tables in ledger_secure
    await assert.rejects(
      async () => {
        await query('CREATE TABLE ledger_secure.unauthorized_tbl (id int)');
      },
      (err) => err.code === '42501' || /permission denied for schema ledger_secure/.test(err.message)
    );

    // 3. ledgerline_app cannot create temporary tables (TEMPORARY revoked from database)
    await assert.rejects(
      async () => {
        await query('CREATE TEMP TABLE unauthorized_temp_tbl (id int)');
      },
      (err) => err.code === '42501' || /permission denied to create temporary tables/.test(err.message)
    );

    // 4. ledgerline_app cannot create functions in pg_temp
    await assert.rejects(
      async () => {
        await query("CREATE FUNCTION pg_temp.unauthorized_fn() RETURNS text AS $$ SELECT 'evil'; $$ LANGUAGE sql;");
      },
      (err) => err.code === '42501' || /permission denied to create temporary tables/.test(err.message)
    );

    // 5. Verify catalog privileges for PUBLIC role
    const privCheck = await adminClient.query(`
      SELECT has_schema_privilege('public', 'public', 'CREATE') AS public_create_public,
             has_schema_privilege('public', 'ledger_secure', 'CREATE') AS public_create_secure,
             has_database_privilege('public', current_database(), 'TEMPORARY') AS public_temp_db
    `);
    const { public_create_public, public_create_secure, public_temp_db } = privCheck.rows[0];
    assert.equal(public_create_public, false, 'PUBLIC must not have CREATE on schema public');
    assert.equal(public_create_secure, false, 'PUBLIC must not have CREATE on schema ledger_secure');
    assert.equal(public_temp_db, false, 'PUBLIC must not have TEMPORARY on database');
  });

  // ---------------------------------------------------------------------------
  // 34. Search-Path Shadow Resistance & Precedence
  // ---------------------------------------------------------------------------
  it('34. Search-path shadow resistance: privileged functions prioritize pg_catalog and ledger_secure, preventing object shadowing', async () => {
    // 1. Privileged functions prioritize pg_catalog over temporary schema
    // Demonstrate that even if a shadow object exists in pg_temp on an admin connection,
    // a SECURITY DEFINER function with 'pg_catalog' first resolves the authentic built-in.
    await adminClient.query('BEGIN');
    try {
      await adminClient.query(`
        CREATE FUNCTION pg_temp.clock_timestamp() RETURNS timestamptz AS $$
          SELECT '1970-01-01 00:00:00+00'::timestamptz;
        $$ LANGUAGE sql;
      `);

      const shadowTest = await adminClient.query(`
        DO $$
        DECLARE
          v_ts timestamptz;
        BEGIN
          SET LOCAL search_path = pg_catalog, ledger_secure, public, pg_temp;
          v_ts := clock_timestamp();
          IF v_ts = '1970-01-01 00:00:00+00'::timestamptz THEN
            RAISE EXCEPTION 'VULNERABILITY: clock_timestamp was shadowed by pg_temp!';
          END IF;
        END $$;
      `);
      assert.ok(shadowTest, 'Built-in clock_timestamp must not be shadowed by pg_temp');
    } finally {
      await adminClient.query('ROLLBACK');
    }

    // 2. Verify search_path configuration on all 26 SECURITY DEFINER functions
    const spCheck = await adminClient.query(`
      SELECT p.proname,
             array_to_string(p.proconfig, ', ') AS search_path_config
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE p.prosecdef = true
         AND n.nspname IN ('public', 'ledger_secure')
       ORDER BY p.proname;
    `);

    assert.equal(spCheck.rowCount, 26, 'Must inspect exactly 26 SECURITY DEFINER functions');
    for (const row of spCheck.rows) {
      assert.ok(row.search_path_config, `Function ${row.proname} must have configured search_path`);
      // Every search path must begin with pg_catalog and end with pg_temp
      assert.match(
        row.search_path_config,
        /^search_path=pg_catalog,.*pg_temp$/,
        `Function ${row.proname} search path must start with pg_catalog and end with pg_temp`
      );
      // If both ledger_secure and public appear, ledger_secure must precede public
      if (row.search_path_config.includes('ledger_secure') && row.search_path_config.includes('public')) {
        const idxSecure = row.search_path_config.indexOf('ledger_secure');
        const idxPublic = row.search_path_config.indexOf('public');
        assert.ok(
          idxSecure < idxPublic,
          `Function ${row.proname} must order ledger_secure before public to prevent shadowing`
        );
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 35. Trigger-Only & Internal Procedure Execution Denied to Runtime Role
  // ---------------------------------------------------------------------------
  it('35. Trigger-only & internal procedure execution denied to runtime role', async () => {
    const triggerFunctions = [
      'public.enforce_append_only_record()',
      'public.enforce_idempotency_lifecycle()',
      'public.enforce_transaction_immutability()',
      'public.maintain_account_balance_from_posting()',
      'public.prevent_extra_postings_on_finalized_tx()',
      'public.validate_ledger_transaction_at_commit()',
    ];

    for (const tf of triggerFunctions) {
      await assert.rejects(
        async () => {
          await query(`SELECT ${tf}`);
        },
        (err) => err.code === '42501' || /permission denied for function/.test(err.message),
        `Runtime role ledgerline_app must not have EXECUTE privilege on ${tf}`
      );
    }
  });

  // ---------------------------------------------------------------------------
  // 36. Adversarial RLS Isolation: Customer A cannot read Customer B account
  // ---------------------------------------------------------------------------
  it('36. Adversarial RLS isolation: Customer A cannot read Customer B account', async () => {
    // 1. Verify via adminClient that Customer B account actually exists in database
    const bCheck = await adminClient.query('SELECT id, account_number, current_balance FROM public.accounts WHERE id = $1', [accountB]);
    assert.equal(bCheck.rowCount, 1, 'Customer B account must exist in the database');

    // 2. Direct SQL via Customer A session context: RLS filters out account B
    await executeWithSession(customerA.id, 'customer', async (client) => {
      const res = await client.query('SELECT * FROM public.accounts WHERE id = $1', [accountB]);
      assert.equal(res.rowCount, 0, 'Customer A direct query must return 0 rows for Customer B account');
    });

    // 3. API service layer: Customer A attempting getAccountDetails on account B returns 404
    await assert.rejects(
      async () => {
        await getAccountDetails(customerA.id, 'customer', accountB);
      },
      (err) => err.status === 404,
      'Customer A attempting to fetch Customer B account must return 404'
    );
  });

  // ---------------------------------------------------------------------------
  // 37. Adversarial Transaction & Posting Isolation: Customer A cannot read Customer B transactions or postings
  // ---------------------------------------------------------------------------
  it('37. Adversarial Transaction & Posting Isolation: Customer A cannot read Customer B transactions or postings', async () => {
    // 1. Create a distinct deposit transaction for Customer B on account B
    const uniqueB = Date.now() + 37;
    const depB = await processTransactionRequest({
      userId: customerB.id,
      role: 'customer',
      idempotencyKey: `idemp-custb-tx-${uniqueB}`,
      method: 'POST',
      path: '/api/transactions/deposit',
      body: {
        type: 'deposit',
        amountPaise: '30000',
        sourceAccountId: vaultAccount.id,
        destinationAccountId: accountB,
      },
    });
    assert.equal(depB.statusCode, 200, 'Customer B deposit must succeed');
    const txIdB = depB.body.transaction_id;

    // 2. Verify via adminClient that transaction and dual postings exist on disk
    const bTxCheck = await adminClient.query('SELECT id FROM public.transactions WHERE id = $1', [txIdB]);
    assert.equal(bTxCheck.rowCount, 1, 'Customer B transaction must exist');
    const bPostingsCheck = await adminClient.query('SELECT id FROM public.ledger_postings WHERE transaction_id = $1', [txIdB]);
    assert.equal(bPostingsCheck.rowCount, 2, 'Customer B transaction must have 2 postings');

    // 3. Customer A direct SQL queries: RLS returns 0 rows for both transactions and postings
    await executeWithSession(customerA.id, 'customer', async (client) => {
      const txRes = await client.query('SELECT * FROM public.transactions WHERE id = $1', [txIdB]);
      assert.equal(txRes.rowCount, 0, 'Customer A cannot view Customer B transaction under RLS');

      const postRes = await client.query('SELECT * FROM public.ledger_postings WHERE transaction_id = $1', [txIdB]);
      assert.equal(postRes.rowCount, 0, 'Customer A cannot view Customer B postings under RLS');
    });

    // 4. Customer A API call: getTransactionById returns 404
    await assert.rejects(
      async () => {
        await getTransactionById({ userId: customerA.id, role: 'customer', transactionId: txIdB });
      },
      (err) => err.status === 404,
      'Customer A attempting to retrieve Customer B transaction must return 404'
    );
  });

  // ---------------------------------------------------------------------------
  // 38. Statement & Join Indirect Leakage Resistance: Customer A cannot access Customer B statement or join data
  // ---------------------------------------------------------------------------
  it('38. Statement & Join Indirect Leakage Resistance: Customer A cannot access Customer B statement or join data', async () => {
    // 1. Customer A attempts to fetch statement for account B via service layer
    await assert.rejects(
      async () => {
        await getAccountStatement(customerA.id, 'customer', accountB, 20, 0);
      },
      (err) => err.status === 404,
      'Customer A fetching Customer B statement must return 404'
    );

    // 2. Adversarial direct join query attempting indirect data leakage
    await executeWithSession(customerA.id, 'customer', async (client) => {
      const leakRes = await client.query(`
        SELECT a.id, a.account_number, a.current_balance, p.id AS posting_id, p.signed_amount_paise
          FROM public.accounts a
          LEFT JOIN public.ledger_postings p ON a.id = p.account_id
         WHERE a.id = $1
      `, [accountB]);

      assert.equal(leakRes.rowCount, 0, 'Adversarial join must yield 0 rows under RLS');
    });
  });

  // ---------------------------------------------------------------------------
  // 39. Cross-Account Financial Operation Rejection: Customer A cannot debit or credit Customer B account
  // ---------------------------------------------------------------------------
  it('39. Cross-Account Financial Operation Rejection: Customer A cannot debit or credit Customer B account', async () => {
    const unique39 = Date.now() + 39;

    // 1. Deposit with Customer B account as destination
    await assert.rejects(
      async () => {
        await processTransactionRequest({
          userId: customerA.id,
          role: 'customer',
          idempotencyKey: `idemp-cross-dep-${unique39}`,
          method: 'POST',
          path: '/api/transactions/deposit',
          body: {
            type: 'deposit',
            amountPaise: '10000',
            sourceAccountId: vaultAccount.id,
            destinationAccountId: accountB,
          },
        });
      },
      (err) => /Caller is not an active account_holder on deposit destination account/.test(err.message),
      'Customer A must be denied depositing into Customer B account'
    );

    // 2. Withdrawal with Customer B account as source
    await assert.rejects(
      async () => {
        await processTransactionRequest({
          userId: customerA.id,
          role: 'customer',
          idempotencyKey: `idemp-cross-wd-${unique39}`,
          method: 'POST',
          path: '/api/transactions/withdraw',
          body: {
            type: 'withdrawal',
            amountPaise: '10000',
            sourceAccountId: accountB,
            destinationAccountId: vaultAccount.id,
          },
        });
      },
      (err) => /Caller is not an active account_holder on withdrawal source account/.test(err.message),
      'Customer A must be denied withdrawing from Customer B account'
    );

    // 3. Transfer with Customer B account as source
    await assert.rejects(
      async () => {
        await processTransactionRequest({
          userId: customerA.id,
          role: 'customer',
          idempotencyKey: `idemp-cross-tf-${unique39}`,
          method: 'POST',
          path: '/api/transactions/transfer',
          body: {
            type: 'transfer',
            amountPaise: '10000',
            sourceAccountId: accountB,
            destinationAccountId: accountA,
          },
        });
      },
      (err) => /Caller is not an active account_holder on transfer source account/.test(err.message),
      'Customer A must be denied transferring out of Customer B account'
    );
  });

  // ---------------------------------------------------------------------------
  // 40. Unauthorized Membership Modification Denial: Customer cannot assign or revoke memberships on another account
  // ---------------------------------------------------------------------------
  it('40. Unauthorized Membership Modification Denial: Customer cannot assign or revoke memberships on another account', async () => {
    // 1. Customer A attempts to assign Customer C as account_holder on Account B
    await assert.rejects(
      async () => {
        await assignMembership(customerA.id, 'customer', accountB, userC.id, 'account_holder');
      },
      (err) => /Only an administrator can grant the account_holder role/.test(err.message),
      'Customer A must not be permitted to grant account_holder role'
    );

    // 2. Customer A attempts to assign Customer C as auditor on Account B
    await assert.rejects(
      async () => {
        await assignMembership(customerA.id, 'customer', accountB, userC.id, 'auditor');
      },
      (err) => /Only an admin or existing account_holder can assign an auditor/.test(err.message),
      'Customer A must not be permitted to assign auditor on an account they do not hold'
    );

    // 3. Customer A attempts to revoke Customer B membership on Account B
    await assert.rejects(
      async () => {
        await revokeMembership(customerA.id, 'customer', accountB, customerB.id);
      },
      (err) => /Only an administrator can revoke an account_holder membership/.test(err.message),
      'Customer A must not be permitted to revoke account_holder membership'
    );
  });

  // ---------------------------------------------------------------------------
  // 41. Auditor Role Boundary Matrix: Auditor denied all financial writes and mutations
  // ---------------------------------------------------------------------------
  it('41. Auditor Role Boundary Matrix: Auditor denied all financial writes and mutations', async () => {
    const unique41 = Date.now() + 41;

    // 1. Deposit denied: Auditor is assigned on accountA as 'auditor', not 'account_holder'
    await assert.rejects(
      async () => {
        await processTransactionRequest({
          userId: auditorUser.id,
          role: auditorUser.role,
          idempotencyKey: `aud-dep-${unique41}`,
          method: 'POST',
          path: '/api/transactions/deposit',
          body: {
            type: 'deposit',
            amountPaise: '5000',
            sourceAccountId: vaultAccount.id,
            destinationAccountId: accountA,
          },
        });
      },
      (err) => /Caller is not an active account_holder on deposit destination account/.test(err.message),
      'Auditor must not be permitted to deposit'
    );

    // 2. Withdrawal denied
    await assert.rejects(
      async () => {
        await processTransactionRequest({
          userId: auditorUser.id,
          role: auditorUser.role,
          idempotencyKey: `aud-wd-${unique41}`,
          method: 'POST',
          path: '/api/transactions/withdraw',
          body: {
            type: 'withdrawal',
            amountPaise: '5000',
            sourceAccountId: accountA,
            destinationAccountId: vaultAccount.id,
          },
        });
      },
      (err) => /Caller is not an active account_holder on withdrawal source account/.test(err.message),
      'Auditor must not be permitted to withdraw'
    );

    // 3. Transfer denied
    await assert.rejects(
      async () => {
        await processTransactionRequest({
          userId: auditorUser.id,
          role: auditorUser.role,
          idempotencyKey: `aud-tf-${unique41}`,
          method: 'POST',
          path: '/api/transactions/transfer',
          body: {
            type: 'transfer',
            amountPaise: '5000',
            sourceAccountId: accountA,
            destinationAccountId: accountB,
          },
        });
      },
      (err) => /Caller is not an active account_holder on transfer source account/.test(err.message),
      'Auditor must not be permitted to transfer'
    );

    // 4. Reversal denied
    // Perform a valid deposit on accountA first to get a valid posted transaction
    const depValid = await processTransactionRequest({
      userId: customerA.id,
      role: 'customer',
      idempotencyKey: `valid-dep-for-aud-${unique41}`,
      method: 'POST',
      path: '/api/transactions/deposit',
      body: {
        type: 'deposit',
        amountPaise: '5000',
        sourceAccountId: vaultAccount.id,
        destinationAccountId: accountA,
      },
    });
    assert.equal(depValid.statusCode, 200);
    const validTxId = depValid.body.transaction_id;

    await assert.rejects(
      async () => {
        await processTransactionRequest({
          userId: auditorUser.id,
          role: auditorUser.role,
          idempotencyKey: `aud-rev-${unique41}`,
          method: 'POST',
          path: '/api/transactions/reverse',
          body: {
            type: 'reversal',
            amountPaise: '5000',
            sourceAccountId: accountA,
            destinationAccountId: vaultAccount.id,
            originalTransactionId: validTxId,
          },
        });
      },
      (err) => /Only administrators may execute transaction reversals/.test(err.message),
      'Auditor must not be permitted to reverse'
    );

    // 5. Membership assignment denied
    await assert.rejects(
      async () => {
        await assignMembership(auditorUser.id, auditorUser.role, accountA, userC.id, 'account_holder');
      },
      (err) => /Only an administrator can grant the account_holder role/.test(err.message),
      'Auditor must not be permitted to assign account_holder role'
    );

    // 6. Account freeze denied
    await assert.rejects(
      async () => {
        await updateAccountStatus(auditorUser.id, auditorUser.role, accountA, 'frozen', 'Audit hold');
      },
      (err) => /Only an administrator or active account_holder may freeze an account/.test(err.message),
      'Auditor must not be permitted to freeze accounts'
    );

    // 7. Legitimate auditor read permitted
    const audAcc = await getAccountDetails(auditorUser.id, auditorUser.role, accountA);
    assert.equal(audAcc.id, accountA, 'Auditor must be permitted to inspect account details');
    const audStmt = await getAccountStatement(auditorUser.id, auditorUser.role, accountA);
    assert.ok(Array.isArray(audStmt.statement), 'Auditor must be permitted to inspect statement');
  });

  // ---------------------------------------------------------------------------
  // 42. Revoked Member Immediate Cutoff: Existing session loses access immediately upon revocation
  // ---------------------------------------------------------------------------
  it('42. Revoked Member Immediate Cutoff: Existing session loses access immediately upon revocation', async () => {
    const unique42 = Date.now() + 42;
    const resX1 = await registerCustomer(`custX1_${unique42}@test.local`, 'Password123!');
    const custX1 = resX1.user;
    const resX2 = await registerCustomer(`custX2_${unique42}@test.local`, 'Password123!');
    const custX2 = resX2.user;

    // Create account with custX1 as holder
    const accXRes = await createCustomerAccount(custX1.id, 'customer', `ACC-X-${unique42}`);
    const accountX = accXRes.accountId;

    // Add custX2 as second holder (via admin)
    await assignMembership(adminUser.id, 'admin', accountX, custX2.id, 'account_holder');

    // Confirm custX1 can read accountX
    const read1 = await getAccountDetails(custX1.id, 'customer', accountX);
    assert.equal(read1.id, accountX, 'custX1 must initially be able to read accountX');

    // Admin revokes custX1 from accountX
    await revokeMembership(adminUser.id, 'admin', accountX, custX1.id);

    // custX1 immediately attempts access using their identity
    await assert.rejects(
      async () => {
        await getAccountDetails(custX1.id, 'customer', accountX);
      },
      (err) => err.status === 404,
      'Revoked member must immediately receive 404 on getAccountDetails'
    );

    await assert.rejects(
      async () => {
        await getAccountStatement(custX1.id, 'customer', accountX);
      },
      (err) => err.status === 404,
      'Revoked member must immediately receive 404 on getAccountStatement'
    );

    await assert.rejects(
      async () => {
        await processTransactionRequest({
          userId: custX1.id,
          role: 'customer',
          idempotencyKey: `x1-wd-${unique42}`,
          method: 'POST',
          path: '/api/transactions/withdraw',
          body: {
            type: 'withdrawal',
            amountPaise: '1000',
            sourceAccountId: accountX,
            destinationAccountId: vaultAccount.id,
          },
        });
      },
      (err) => /Caller is not an active account_holder on withdrawal source account/.test(err.message),
      'Revoked member must immediately be denied initiating withdrawals'
    );
  });

  // ---------------------------------------------------------------------------
  // 43. Unauthenticated / Missing Session Identity Query Denial: 0 protected rows returned
  // ---------------------------------------------------------------------------
  it('43. Unauthenticated / Missing Session Identity Query Denial: 0 protected rows returned', async () => {
    // 1. Direct query without executeWithSession runs under ledgerline_app with NULL session context
    const qAcc = await query("SELECT * FROM public.accounts WHERE account_type = 'customer'");
    assert.equal(qAcc.rowCount, 0, 'Unauthenticated query must return 0 customer accounts');

    const qTx = await query('SELECT * FROM public.transactions');
    assert.equal(qTx.rowCount, 0, 'Unauthenticated query must return 0 transactions');

    const qPost = await query('SELECT * FROM public.ledger_postings');
    assert.equal(qPost.rowCount, 0, 'Unauthenticated query must return 0 ledger postings');

    const qMem = await query('SELECT * FROM public.account_memberships');
    assert.equal(qMem.rowCount, 0, 'Unauthenticated query must return 0 account memberships');

    const qUsers = await query('SELECT * FROM public.users');
    assert.equal(qUsers.rowCount, 0, 'Unauthenticated query must return 0 users');

    const qIdemp = await query('SELECT * FROM public.idempotency_keys');
    assert.equal(qIdemp.rowCount, 0, 'Unauthenticated query must return 0 idempotency keys');

    const qAudit = await query('SELECT * FROM public.audit_logs');
    assert.equal(qAudit.rowCount, 0, 'Unauthenticated query must return 0 audit logs');

    // 2. Verify via adminClient that records actually exist in every single table
    const aAcc = await adminClient.query("SELECT COUNT(*) FROM public.accounts WHERE account_type = 'customer'");
    assert.ok(parseInt(aAcc.rows[0].count, 10) > 0, 'Database must have customer accounts');

    const aTx = await adminClient.query('SELECT COUNT(*) FROM public.transactions');
    assert.ok(parseInt(aTx.rows[0].count, 10) > 0, 'Database must have transactions');

    const aPost = await adminClient.query('SELECT COUNT(*) FROM public.ledger_postings');
    assert.ok(parseInt(aPost.rows[0].count, 10) > 0, 'Database must have ledger postings');

    const aMem = await adminClient.query('SELECT COUNT(*) FROM public.account_memberships');
    assert.ok(parseInt(aMem.rows[0].count, 10) > 0, 'Database must have account memberships');

    const aUsers = await adminClient.query('SELECT COUNT(*) FROM public.users');
    assert.ok(parseInt(aUsers.rows[0].count, 10) > 0, 'Database must have users');

    const aAudit = await adminClient.query('SELECT COUNT(*) FROM public.audit_logs');
    assert.ok(parseInt(aAudit.rows[0].count, 10) > 0, 'Database must have audit logs');
  });

  // ---------------------------------------------------------------------------
  // 44. Identity & Role Anti-Tampering: Forged user ID or unearned role rejected
  // ---------------------------------------------------------------------------
  it('44. Identity & Role Anti-Tampering: Forged user ID or unearned role rejected', async () => {
    // 1. Customer attempts to sign assertion claiming role 'admin'
    const forgedAdminAssertion = generateHmacAssertion(customerA.id, 'admin', env.IDENTITY_HMAC_SECRET);
    await assert.rejects(
      async () => {
        await query(
          'SELECT ledger_secure.register_identity_assertion($1, $2, $3, $4, $5)',
          [customerA.id, 'admin', forgedAdminAssertion.expiresAt, forgedAdminAssertion.nonce, forgedAdminAssertion.signature]
        );
      },
      (err) => err.code === '28000' && /Assertion role admin does not match authoritative database role customer/.test(err.message),
      'Claiming admin role with customer database user must be rejected'
    );

    // 2. Forged cryptographic signature
    const corruptSignature = Buffer.from('corrupted_signature_bytes_0000000000000000');
    const validAssertion = generateHmacAssertion(customerA.id, 'customer', env.IDENTITY_HMAC_SECRET);
    await assert.rejects(
      async () => {
        await query(
          'SELECT ledger_secure.register_identity_assertion($1, $2, $3, $4, $5)',
          [customerA.id, 'customer', validAssertion.expiresAt, validAssertion.nonce, corruptSignature]
        );
      },
      (err) => err.code === '28000' && /Cryptographic signature verification failed/.test(err.message),
      'Forged signature must be rejected'
    );

    // 3. Forged non-existent user ID
    const fakeUserId = '00000000-0000-0000-0000-000000000099';
    const fakeAssertion = generateHmacAssertion(fakeUserId, 'customer', env.IDENTITY_HMAC_SECRET);
    await assert.rejects(
      async () => {
        await query(
          'SELECT ledger_secure.register_identity_assertion($1, $2, $3, $4, $5)',
          [fakeUserId, 'customer', fakeAssertion.expiresAt, fakeAssertion.nonce, fakeAssertion.signature]
        );
      },
      (err) => err.code === '28000' && /does not exist in database/.test(err.message),
      'Assertion for non-existent user must be rejected'
    );
  });

  // ---------------------------------------------------------------------------
  // 45. Cross-User Idempotency Key Isolation: User cannot inspect, resolve, or hijack another user key
  // ---------------------------------------------------------------------------
  it('45. Cross-User Idempotency Key Isolation: User cannot inspect, resolve, or hijack another user key', async () => {
    const sharedKey = `shared-key-${Date.now()}`;

    // 1. Customer A deposits using sharedKey
    const depA = await processTransactionRequest({
      userId: customerA.id,
      role: 'customer',
      idempotencyKey: sharedKey,
      method: 'POST',
      path: '/api/transactions/deposit',
      body: {
        type: 'deposit',
        amountPaise: '15000',
        sourceAccountId: vaultAccount.id,
        destinationAccountId: accountA,
      },
    });
    assert.equal(depA.statusCode, 200);
    assert.equal(depA.isIdempotentReplay, false);

    // 2. Customer B attempts to read Customer A's idempotency record via direct SQL
    await executeWithSession(customerB.id, 'customer', async (client) => {
      const q = await client.query('SELECT * FROM public.idempotency_keys WHERE idempotency_key = $1', [sharedKey]);
      assert.equal(q.rowCount, 0, 'Customer B must not see Customer A idempotency record');
    });

    // 3. Customer B submits a request with the exact same sharedKey
    // It must NOT replay Customer A's transaction response; it executes independently in Customer B namespace
    const depB = await processTransactionRequest({
      userId: customerB.id,
      role: 'customer',
      idempotencyKey: sharedKey,
      method: 'POST',
      path: '/api/transactions/deposit',
      body: {
        type: 'deposit',
        amountPaise: '20000',
        sourceAccountId: vaultAccount.id,
        destinationAccountId: accountB,
      },
    });
    assert.equal(depB.statusCode, 200);
    assert.equal(depB.isIdempotentReplay, false, 'Customer B using same key must execute independently, not replay Customer A');
    assert.notEqual(depB.body.transaction_id, depA.body.transaction_id, 'Transactions must be distinct');
  });

  // ---------------------------------------------------------------------------
  // 46. Admin Action Attribution & Financial Integrity Enforcement
  // ---------------------------------------------------------------------------
  it('46. Admin Action Attribution & Financial Integrity Enforcement: Audit logs record authentic actor ID', async () => {
    const unique46 = Date.now() + 46;
    const testReason = `Compliance suspension check ${unique46}`;

    // 1. Admin suspends userC
    await setUserStatus(adminUser.id, userC.id, false, testReason);

    // 2. Inspect audit_logs via adminClient
    const auditRes = await adminClient.query(
      `SELECT actor_id, actor_role, action, entity_type, entity_id, metadata
         FROM public.audit_logs
        WHERE entity_id = $1 AND action = 'USER_STATUS_CHANGED'
        ORDER BY created_at DESC
        LIMIT 1`,
      [userC.id]
    );

    assert.equal(auditRes.rowCount, 1, 'Audit log entry must exist for user status change');
    const log = auditRes.rows[0];
    assert.equal(log.actor_id, adminUser.id, 'Audit log actor_id must match verified admin actor ID');
    assert.equal(log.actor_role, 'admin', 'Audit log actor_role must be admin');
    assert.equal(log.entity_type, 'user');
    assert.equal(log.metadata.reason, testReason);

    // Re-activate userC
    await setUserStatus(adminUser.id, userC.id, true, 'Re-activated after test');
  });

  // ---------------------------------------------------------------------------
  // 47. Authorization Race Condition: Concurrent membership revocation and financial transaction serialized deterministically
  // ---------------------------------------------------------------------------
  it('47. Authorization Race Condition: Concurrent membership revocation and financial transaction serialized deterministically', async () => {
    const unique47 = Date.now() + 47;
    const resH1 = await registerCustomer(`h1_${unique47}@test.local`, 'Password123!');
    const h1 = resH1.user;
    const resH2 = await registerCustomer(`h2_${unique47}@test.local`, 'Password123!');
    const h2 = resH2.user;

    // Create shared account with H1 as initial holder
    const accRes = await createCustomerAccount(h1.id, 'customer', `ACC-RACE-${unique47}`);
    const accountRaceId = accRes.accountId;

    // Admin assigns H2 as second account_holder
    await assignMembership(adminUser.id, 'admin', accountRaceId, h2.id, 'account_holder');

    // Fund account with 50000 paise from vault
    await processTransactionRequest({
      userId: h1.id,
      role: 'customer',
      idempotencyKey: `dep-race-${unique47}`,
      method: 'POST',
      path: '/api/transactions/deposit',
      body: {
        type: 'deposit',
        amountPaise: '50000',
        sourceAccountId: vaultAccount.id,
        destinationAccountId: accountRaceId,
      },
    });

    // Concurrently trigger revocation of H2 and withdrawal by H2
    const results = await Promise.allSettled([
      revokeMembership(adminUser.id, 'admin', accountRaceId, h2.id),
      processTransactionRequest({
        userId: h2.id,
        role: 'customer',
        idempotencyKey: `wd-race-${unique47}`,
        method: 'POST',
        path: '/api/transactions/withdraw',
        body: {
          type: 'withdrawal',
          amountPaise: '10000',
          sourceAccountId: accountRaceId,
          destinationAccountId: vaultAccount.id,
        },
      }),
    ]);

    const revResult = results[0];
    const wdResult = results[1];

    assert.equal(revResult.status, 'fulfilled', 'Revocation must succeed');

    // Check deterministic serialization
    if (wdResult.status === 'rejected') {
      // Revocation acquired the lock first -> withdrawal must fail with authorization error
      assert.match(
        wdResult.reason.message,
        /Caller is not an active account_holder on withdrawal source account/,
        'When revocation locks first, withdrawal must fail with account_holder authorization error'
      );
    } else {
      // Withdrawal acquired the lock first -> withdrawal completed before revocation took effect
      assert.equal(wdResult.value.statusCode, 200, 'If withdrawal serialized first, it must return 200');
    }

    // After both finish, H2 must not be able to execute any further transaction
    await assert.rejects(
      async () => {
        await processTransactionRequest({
          userId: h2.id,
          role: 'customer',
          idempotencyKey: `wd-race-post-${unique47}`,
          method: 'POST',
          path: '/api/transactions/withdraw',
          body: {
            type: 'withdrawal',
            amountPaise: '5000',
            sourceAccountId: accountRaceId,
            destinationAccountId: vaultAccount.id,
          },
        });
      },
      (err) => /Caller is not an active account_holder on withdrawal source account/.test(err.message),
      'After revocation, subsequent withdrawal must be denied'
    );
  });

  // ---------------------------------------------------------------------------
  // 48. Administrator Global Read Access & Customer/Auditor Non-Elevation Matrix
  // ---------------------------------------------------------------------------
  it('48. Administrator Global Read Access & Customer/Auditor Non-Elevation Matrix', async () => {
    // 1. Establish ground truth set via adminClient
    const allAccountsRes = await adminClient.query('SELECT id FROM public.accounts ORDER BY id');
    const allTxRes = await adminClient.query('SELECT id FROM public.transactions ORDER BY id');
    const allPostRes = await adminClient.query('SELECT id FROM public.ledger_postings ORDER BY id');
    const allMemRes = await adminClient.query('SELECT id FROM public.account_memberships ORDER BY id');

    assert.ok(allAccountsRes.rowCount > 0, 'Database must contain accounts');
    assert.ok(allTxRes.rowCount > 0, 'Database must contain transactions');
    assert.ok(allPostRes.rowCount > 0, 'Database must contain postings');
    assert.ok(allMemRes.rowCount > 0, 'Database must contain memberships');

    // 2. Query under verified admin session context via ledgerline_app
    await executeWithSession(adminUser.id, 'admin', async (client) => {
      const adminAcc = await client.query('SELECT id FROM public.accounts ORDER BY id');
      assert.equal(adminAcc.rowCount, allAccountsRes.rowCount, 'Admin must see 100% of accounts');
      assert.deepEqual(adminAcc.rows.map(r => r.id), allAccountsRes.rows.map(r => r.id));

      const adminTx = await client.query('SELECT id FROM public.transactions ORDER BY id');
      assert.equal(adminTx.rowCount, allTxRes.rowCount, 'Admin must see 100% of transactions');
      assert.deepEqual(adminTx.rows.map(r => r.id), allTxRes.rows.map(r => r.id));

      const adminPost = await client.query('SELECT id FROM public.ledger_postings ORDER BY id');
      assert.equal(adminPost.rowCount, allPostRes.rowCount, 'Admin must see 100% of ledger postings');
      assert.deepEqual(adminPost.rows.map(r => r.id), allPostRes.rows.map(r => r.id));

      const adminMem = await client.query('SELECT id FROM public.account_memberships ORDER BY id');
      assert.equal(adminMem.rowCount, allMemRes.rowCount, 'Admin must see 100% of account memberships');
      assert.deepEqual(adminMem.rows.map(r => r.id), allMemRes.rows.map(r => r.id));
    });

    // 3. Verify admin access through API service layer across customer-owned records
    // Customer B's account details
    const accBDetails = await getAccountDetails(adminUser.id, 'admin', accountB);
    assert.equal(accBDetails.id, accountB, 'Admin must be able to read Customer B account details via API');

    // Customer B's account statement
    const accBStatement = await getAccountStatement(adminUser.id, 'admin', accountB, 20, 0);
    assert.ok(accBStatement.statement.length > 0, 'Admin must be able to read Customer B account statement via API');

    // All accounts listing
    const accountsList = await listUserAccounts(adminUser.id, 'admin');
    assert.equal(accountsList.length, allAccountsRes.rowCount, 'Admin listUserAccounts must return all accounts');

    // 4. Verify Customer A and Auditor visibility remains strictly restricted
    await executeWithSession(customerA.id, 'customer', async (client) => {
      const custAcc = await client.query('SELECT id FROM public.accounts WHERE id = $1', [accountB]);
      assert.equal(custAcc.rowCount, 0, 'Customer A must not see Customer B account');
    });

    await executeWithSession(auditorUser.id, 'customer', async (client) => {
      const audAcc = await client.query('SELECT id FROM public.accounts WHERE id = $1', [accountB]);
      assert.equal(audAcc.rowCount, 0, 'Auditor on Account A must not see Customer B account');
    });
  });

  // ---------------------------------------------------------------------------
  // 49. Adversarial Idempotency: 10 Simultaneous Identical Requests
  // ---------------------------------------------------------------------------
  it('49. Adversarial Idempotency: 10 Simultaneous Identical Requests Produce Exactly One Execution and 9 Replays', async () => {
    const key10 = `key10_conc_${Date.now()}`;
    const payload10 = {
      type: 'transfer',
      amountPaise: 15000, // ₹150.00
      sourceAccountId: accountA,
      destinationAccountId: accountB,
    };

    const startBalA = (await adminClient.query('SELECT current_balance FROM public.accounts WHERE id = $1', [accountA])).rows[0].current_balance;
    const startBalB = (await adminClient.query('SELECT current_balance FROM public.accounts WHERE id = $1', [accountB])).rows[0].current_balance;

    const promises10 = Array.from({ length: 10 }, () =>
      processTransactionRequest({
        userId: customerA.id,
        role: 'customer',
        idempotencyKey: key10,
        method: 'POST',
        path: '/api/transactions',
        body: payload10,
      })
    );

    const results10 = await Promise.all(promises10);
    assert.equal(results10.length, 10, 'All 10 requests must settle');

    // All must be HTTP 200 and identify the same transaction ID
    const firstTxId = results10[0].body.transaction_id;
    for (let i = 0; i < 10; i++) {
      assert.equal(results10[i].statusCode, 200, `Request ${i} must return HTTP 200`);
      assert.equal(results10[i].body.transaction_id, firstTxId, `Request ${i} must return identical transaction ID`);
    }

    // Exactly 1 initial execution and 9 idempotent replays
    const initialExecutions = results10.filter((r) => !r.isIdempotentReplay);
    const replayedExecutions = results10.filter((r) => r.isIdempotentReplay);
    assert.equal(initialExecutions.length, 1, 'Exactly 1 request must be the initial execution');
    assert.equal(replayedExecutions.length, 9, 'Exactly 9 requests must be marked as idempotent replays');

    // Exactly 1 transaction row in database
    const txCount = await adminClient.query('SELECT count(*) FROM public.transactions WHERE id = $1', [firstTxId]);
    assert.equal(parseInt(txCount.rows[0].count, 10), 1, 'Exactly 1 transaction row must exist in database');

    // Exactly 2 ledger postings in database
    const postCount = await adminClient.query('SELECT count(*) FROM public.ledger_postings WHERE transaction_id = $1', [firstTxId]);
    assert.equal(parseInt(postCount.rows[0].count, 10), 2, 'Exactly 2 ledger postings must exist in database');

    // Exact balance debit and credit without duplicates
    const endBalA = (await adminClient.query('SELECT current_balance FROM public.accounts WHERE id = $1', [accountA])).rows[0].current_balance;
    const endBalB = (await adminClient.query('SELECT current_balance FROM public.accounts WHERE id = $1', [accountB])).rows[0].current_balance;
    assert.equal(BigInt(endBalA), BigInt(startBalA) - 15000n, 'Source account must be debited exactly once (15000 paise)');
    assert.equal(BigInt(endBalB), BigInt(startBalB) + 15000n, 'Destination account must be credited exactly once (15000 paise)');
  });

  // ---------------------------------------------------------------------------
  // 50. Adversarial Idempotency: Simultaneous Conflict Race (Different Payloads)
  // ---------------------------------------------------------------------------
  it('50. Adversarial Idempotency: Simultaneous Key Race with Conflicting Payloads Rejects Loser with HTTP 409', async () => {
    const conflictKey = `key_race_diff_${Date.now()}`;
    const payload1 = {
      type: 'transfer',
      amountPaise: 20000,
      sourceAccountId: accountA,
      destinationAccountId: accountB,
    };
    const payload2 = {
      type: 'transfer',
      amountPaise: 30000, // Conflicting amount
      sourceAccountId: accountA,
      destinationAccountId: accountB,
    };

    const resultsConflict = await Promise.allSettled([
      processTransactionRequest({
        userId: customerA.id,
        role: 'customer',
        idempotencyKey: conflictKey,
        method: 'POST',
        path: '/api/transactions',
        body: payload1,
      }),
      processTransactionRequest({
        userId: customerA.id,
        role: 'customer',
        idempotencyKey: conflictKey,
        method: 'POST',
        path: '/api/transactions',
        body: payload2,
      }),
    ]);

    const fulfilled = resultsConflict.filter((r) => r.status === 'fulfilled');
    const rejected = resultsConflict.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly one payload must own the key and succeed');
    assert.equal(rejected.length, 1, 'The conflicting payload must be rejected');
    assert.equal(rejected[0].reason.status, 409, 'Conflict status must be HTTP 409');
    assert.match(
      rejected[0].reason.message,
      /Idempotency key re-used with different request parameters or payload|currently in progress/,
      'Rejected request must report idempotency payload conflict'
    );
  });

  // ---------------------------------------------------------------------------
  // 51. Adversarial Idempotency: Retry After Failure Before Commit
  // ---------------------------------------------------------------------------
  it('51. Adversarial Idempotency: Failed Pre-Commit Operation Leaves No Residue and Retries Cleanly', async () => {
    const retryKey = `key_retry_fail_${Date.now()}`;

    // 1. Trigger failure before commit: invalid destination endpoint for transfer
    let failed = false;
    try {
      await processTransactionRequest({
        userId: customerA.id,
        role: 'customer',
        idempotencyKey: retryKey,
        method: 'POST',
        path: '/api/transactions',
        body: {
          type: 'transfer',
          amountPaise: 5000,
          sourceAccountId: accountA,
          destinationAccountId: vaultAccount.id, // System vault cannot be transfer destination -> raises 22023!
        },
      });
    } catch (err) {
      failed = true;
      assert.match(err.message, /Transfer endpoints must both be customer accounts/);
    }
    assert.ok(failed, 'Pre-commit validation must fail and abort the transaction');

    // 2. Confirm no partial idempotency state remains
    const idempCheck = await adminClient.query(
      'SELECT * FROM public.idempotency_keys WHERE user_id = $1 AND idempotency_key = $2',
      [customerA.id, retryKey]
    );
    assert.equal(idempCheck.rowCount, 0, 'Rolled-back transaction must leave no idempotency record');

    // 3. Retry with same key and valid payload succeeds
    const retryRes = await processTransactionRequest({
      userId: customerA.id,
      role: 'customer',
      idempotencyKey: retryKey,
      method: 'POST',
      path: '/api/transactions',
      body: {
        type: 'transfer',
        amountPaise: 5000,
        sourceAccountId: accountA,
        destinationAccountId: accountB,
      },
    });
    assert.equal(retryRes.statusCode, 200, 'Legitimate retry must succeed with HTTP 200');
    assert.equal(retryRes.body.status, 'success');
  });

  // ---------------------------------------------------------------------------
  // 52. Concurrent Reversal Protection (Dual Administrator Race)
  // ---------------------------------------------------------------------------
  it('52. Concurrent Reversal Protection: Dual Administrator Race Yields Exactly One Compensating Reversal', async () => {
    // 0. Ensure accountA has sufficient funds
    await processTransactionRequest({
      userId: customerA.id,
      role: 'customer',
      idempotencyKey: `dep_fund_rev_${Date.now()}`,
      method: 'POST',
      path: '/api/transactions',
      body: {
        type: 'deposit',
        amountPaise: 500000, // ₹5,000.00
        sourceAccountId: vaultAccount.id,
        destinationAccountId: accountA,
      },
    });

    // 1. Provision authentic second administrator
    const admin2Email = `admin2_rev_${Date.now()}@test.local`;
    const admin2PwHash = await hashPassword('Admin2Secret@123!');
    const admin2Res = await adminClient.query(`
      INSERT INTO public.users (email, password_hash, role, is_active)
      VALUES ($1, $2, 'admin', true)
      RETURNING id, email, role
    `, [admin2Email, admin2PwHash]);
    const adminUser2 = admin2Res.rows[0];

    // 2. Create posted transfer to reverse
    const origKey = `orig_transfer_${Date.now()}`;
    const origTxRes = await processTransactionRequest({
      userId: customerA.id,
      role: 'customer',
      idempotencyKey: origKey,
      method: 'POST',
      path: '/api/transactions',
      body: {
        type: 'transfer',
        amountPaise: 10000, // ₹100.00
        sourceAccountId: accountA,
        destinationAccountId: accountB,
      },
    });
    const origTxId = origTxRes.body.transaction_id;
    assert.equal(origTxRes.statusCode, 200);

    const balBeforeRevA = (await adminClient.query('SELECT current_balance FROM public.accounts WHERE id = $1', [accountA])).rows[0].current_balance;
    const balBeforeRevB = (await adminClient.query('SELECT current_balance FROM public.accounts WHERE id = $1', [accountB])).rows[0].current_balance;

    // 3. Two administrators simultaneously execute reversal with different idempotency keys
    const revKey1 = `rev_adm1_${Date.now()}`;
    const revKey2 = `rev_adm2_${Date.now()}`;

    const revResults = await Promise.all([
      processTransactionRequest({
        userId: adminUser.id,
        role: 'admin',
        idempotencyKey: revKey1,
        method: 'POST',
        path: '/api/transactions',
        body: {
          type: 'reversal',
          amountPaise: 10000,
          sourceAccountId: accountB,
          destinationAccountId: accountA,
          originalTransactionId: origTxId,
        },
      }),
      processTransactionRequest({
        userId: adminUser2.id,
        role: 'admin',
        idempotencyKey: revKey2,
        method: 'POST',
        path: '/api/transactions',
        body: {
          type: 'reversal',
          amountPaise: 10000,
          sourceAccountId: accountB,
          destinationAccountId: accountA,
          originalTransactionId: origTxId,
        },
      }),
    ]);

    const postedRev = revResults.filter((r) => r.statusCode === 200);
    const refusedRev = revResults.filter((r) => r.statusCode === 422);

    assert.equal(postedRev.length, 1, 'Exactly one reversal must successfully post');
    assert.equal(refusedRev.length, 1, 'The losing reversal request must be refused with HTTP 422');
    assert.equal(refusedRev[0].body.reason, 'ALREADY_REVERSED', 'Refusal reason must be ALREADY_REVERSED');

    // 4. Verify original transaction has not been reversed twice
    const postedReversals = await adminClient.query(
      "SELECT count(*) FROM public.transactions WHERE original_transaction_id = $1 AND type = 'reversal' AND status = 'posted'",
      [origTxId]
    );
    assert.equal(parseInt(postedReversals.rows[0].count, 10), 1, 'Exactly one posted reversal record may exist');

    // 5. Total financial effect is correct (restored to initial balances)
    const balAfterRevA = (await adminClient.query('SELECT current_balance FROM public.accounts WHERE id = $1', [accountA])).rows[0].current_balance;
    const balAfterRevB = (await adminClient.query('SELECT current_balance FROM public.accounts WHERE id = $1', [accountB])).rows[0].current_balance;
    assert.equal(BigInt(balAfterRevA), BigInt(balBeforeRevA) + 10000n, 'Account A balance must be restored');
    assert.equal(BigInt(balAfterRevB), BigInt(balBeforeRevB) - 10000n, 'Account B balance must be restored');

    // 6. Retry with winning key returns original reversal result
    const winningKey = postedRev[0] === revResults[0] ? revKey1 : revKey2;
    const winningAdminId = postedRev[0] === revResults[0] ? adminUser.id : adminUser2.id;
    const retryWinning = await processTransactionRequest({
      userId: winningAdminId,
      role: 'admin',
      idempotencyKey: winningKey,
      method: 'POST',
      path: '/api/transactions',
      body: {
        type: 'reversal',
        amountPaise: 10000,
        sourceAccountId: accountB,
        destinationAccountId: accountA,
        originalTransactionId: origTxId,
      },
    });
    assert.equal(retryWinning.statusCode, 200);
    assert.equal(retryWinning.isIdempotentReplay, true, 'Retry with winning key must be marked as idempotent replay');
    assert.equal(retryWinning.body.transaction_id, postedRev[0].body.transaction_id);

    // 7. Fresh reversal key is refused
    const freshRev = await processTransactionRequest({
      userId: adminUser.id,
      role: 'admin',
      idempotencyKey: `rev_fresh_${Date.now()}`,
      method: 'POST',
      path: '/api/transactions',
      body: {
        type: 'reversal',
        amountPaise: 10000,
        sourceAccountId: accountB,
        destinationAccountId: accountA,
        originalTransactionId: origTxId,
      },
    });
    assert.equal(freshRev.statusCode, 422);
    assert.equal(freshRev.body.reason, 'ALREADY_REVERSED');

    // 8. Unauthorized user cannot reverse transactions
    await assert.rejects(
      async () => {
        await processTransactionRequest({
          userId: customerA.id,
          role: 'customer',
          idempotencyKey: `rev_unauth_${Date.now()}`,
          method: 'POST',
          path: '/api/transactions',
          body: {
            type: 'reversal',
            amountPaise: 10000,
            sourceAccountId: accountB,
            destinationAccountId: accountA,
            originalTransactionId: origTxId,
          },
        });
      },
      (err) => /Only administrators may execute transaction reversals/.test(err.message)
    );
  });

  // ---------------------------------------------------------------------------
  // 53. Failure Injection & Atomic Rollback Across Execution Boundaries
  // ---------------------------------------------------------------------------
  it('53. Failure Injection & Atomic Rollback: Injected Database Errors Guarantee Zero Financial Residue', async () => {
    // 0. Ensure accountA has sufficient funds (at least 3,000,000 paise for injected amounts)
    await processTransactionRequest({
      userId: customerA.id,
      role: 'customer',
      idempotencyKey: `dep_fund_fail_${Date.now()}`,
      method: 'POST',
      path: '/api/transactions',
      body: {
        type: 'deposit',
        amountPaise: 5000000, // ₹50,000.00
        sourceAccountId: vaultAccount.id,
        destinationAccountId: accountA,
      },
    });

    const baseAmt = 880000 + (Date.now() % 10000);
    const amt1 = baseAmt + 1;
    const amt2 = baseAmt + 2;
    const amt3 = baseAmt + 3;

    // Install temporary test-only triggers in ledgerline_test
    await adminClient.query(`
      CREATE OR REPLACE FUNCTION public._test_fail_postings_trigger()
      RETURNS TRIGGER AS $$
      BEGIN
          IF NEW.amount_paise = ${amt1} THEN
              RAISE EXCEPTION 'TEST_INJECTED_FAILURE_DURING_POSTING' USING ERRCODE = 'P0001';
          END IF;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS _trg_test_fail_postings ON public.ledger_postings;
      CREATE TRIGGER _trg_test_fail_postings
          BEFORE INSERT ON public.ledger_postings
          FOR EACH ROW EXECUTE FUNCTION public._test_fail_postings_trigger();

      CREATE OR REPLACE FUNCTION public._test_fail_tx_trigger()
      RETURNS TRIGGER AS $$
      BEGIN
          IF NEW.amount_paise = ${amt2} AND NEW.status = 'posted' THEN
              RAISE EXCEPTION 'TEST_INJECTED_FAILURE_AFTER_POSTINGS' USING ERRCODE = 'P0001';
          END IF;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS _trg_test_fail_tx ON public.transactions;
      CREATE TRIGGER _trg_test_fail_tx
          BEFORE UPDATE ON public.transactions
          FOR EACH ROW EXECUTE FUNCTION public._test_fail_tx_trigger();

      CREATE OR REPLACE FUNCTION public._test_fail_audit_trigger()
      RETURNS TRIGGER AS $$
      BEGIN
          IF (NEW.metadata->>'amount_paise')::bigint = ${amt3} THEN
              RAISE EXCEPTION 'TEST_INJECTED_FAILURE_DURING_AUDIT_LOG' USING ERRCODE = 'P0001';
          END IF;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS _trg_test_fail_audit ON public.audit_logs;
      CREATE TRIGGER _trg_test_fail_audit
          BEFORE INSERT ON public.audit_logs
          FOR EACH ROW EXECUTE FUNCTION public._test_fail_audit_trigger();
    `);

    try {
      const injectionPoints = [
        { amount: amt1, label: 'During ledger posting insertion', expectedErr: /TEST_INJECTED_FAILURE_DURING_POSTING/ },
        { amount: amt2, label: 'After postings inserted but before commit', expectedErr: /TEST_INJECTED_FAILURE_AFTER_POSTINGS/ },
        { amount: amt3, label: 'During later database operation in same transaction', expectedErr: /TEST_INJECTED_FAILURE_DURING_AUDIT_LOG/ },
      ];

      for (const pt of injectionPoints) {
        const preBalA = (await adminClient.query('SELECT current_balance FROM public.accounts WHERE id = $1', [accountA])).rows[0].current_balance;
        const preBalB = (await adminClient.query('SELECT current_balance FROM public.accounts WHERE id = $1', [accountB])).rows[0].current_balance;

        const failKey = `fail_inj_${pt.amount}_${Date.now()}`;

        await assert.rejects(
          async () => {
            await processTransactionRequest({
              userId: customerA.id,
              role: 'customer',
              idempotencyKey: failKey,
              method: 'POST',
              path: '/api/transactions',
              body: {
                type: 'transfer',
                amountPaise: pt.amount,
                sourceAccountId: accountA,
                destinationAccountId: accountB,
              },
            });
          },
          pt.expectedErr,
          `Injected failure at '${pt.label}' must abort transaction`
        );

        // 1. No partial ledger postings remain
        const postCheck = await adminClient.query('SELECT count(*) FROM public.ledger_postings WHERE amount_paise = $1', [pt.amount]);
        assert.equal(parseInt(postCheck.rows[0].count, 10), 0, 'No partial ledger postings must remain');

        // 2. No transaction marked posted
        const txCheck = await adminClient.query("SELECT count(*) FROM public.transactions WHERE amount_paise = $1 AND status = 'posted'", [pt.amount]);
        assert.equal(parseInt(txCheck.rows[0].count, 10), 0, 'No transaction must be marked posted');

        // 3. Cached balances remain unchanged
        const postBalA = (await adminClient.query('SELECT current_balance FROM public.accounts WHERE id = $1', [accountA])).rows[0].current_balance;
        const postBalB = (await adminClient.query('SELECT current_balance FROM public.accounts WHERE id = $1', [accountB])).rows[0].current_balance;
        assert.equal(postBalA, preBalA, 'Account A balance must remain strictly unchanged');
        assert.equal(postBalB, preBalB, 'Account B balance must remain strictly unchanged');

        // 4. Idempotency key does not point to failed transaction
        const idempCheck = await adminClient.query('SELECT * FROM public.idempotency_keys WHERE idempotency_key = $1', [failKey]);
        assert.equal(idempCheck.rowCount, 0, 'Failed transaction must not leave resolved idempotency key');

        // 5. Legitimate retry with normal valid amount succeeds
        const retrySuccess = await processTransactionRequest({
          userId: customerA.id,
          role: 'customer',
          idempotencyKey: failKey,
          method: 'POST',
          path: '/api/transactions',
          body: {
            type: 'transfer',
            amountPaise: 5000,
            sourceAccountId: accountA,
            destinationAccountId: accountB,
          },
        });
        assert.equal(retrySuccess.statusCode, 200, 'Legitimate retry after injected failure must succeed');
        assert.equal(retrySuccess.body.status, 'success');
      }
    } finally {
      // Guaranteed cleanup of temporary test triggers
      await adminClient.query(`
        DROP TRIGGER IF EXISTS _trg_test_fail_postings ON public.ledger_postings;
        DROP TRIGGER IF EXISTS _trg_test_fail_tx ON public.transactions;
        DROP TRIGGER IF EXISTS _trg_test_fail_audit ON public.audit_logs;
        DROP FUNCTION IF EXISTS public._test_fail_postings_trigger();
        DROP FUNCTION IF EXISTS public._test_fail_tx_trigger();
        DROP FUNCTION IF EXISTS public._test_fail_audit_trigger();
      `);
    }
  });

  // ---------------------------------------------------------------------------
  // 54. Monetary Precision & Boundary Enforcement Matrix
  // ---------------------------------------------------------------------------
  it('54. Monetary Precision & Boundary Enforcement Matrix', async () => {
    // 1. Zero amount rejection
    assert.throws(() => validateAmountPaise(0), /must be a positive integer greater than zero/);
    assert.throws(() => validateAmountPaise('0'), /must be positive integer digits/);

    // 2. Negative amount rejection
    assert.throws(() => validateAmountPaise(-100), /must be a positive integer greater than zero/);
    assert.throws(() => validateAmountPaise('-100'), /must be positive integer digits/);

    // 3. Decimal and fractional amounts rejection
    assert.throws(() => validateAmountPaise(12.345), /unsafe integer value exceeding JavaScript safe integer precision/);
    assert.throws(() => validateAmountPaise('12.345'), /must be positive integer digits/);

    // 4. Valid amounts: ₹0.01 (1 paise) and ₹123.45 (12345 paise)
    assert.equal(validateAmountPaise(1), '1');
    assert.equal(validateAmountPaise('1'), '1');
    assert.equal(validateAmountPaise(12345), '12345');
    assert.equal(validateAmountPaise('12345'), '12345');

    // 5. Large value near BIGINT limit: MAX_BIGINT = 9223372036854775807
    assert.equal(validateAmountPaise('9223372036854775807'), '9223372036854775807');

    // 6. Exceeding BIGINT limit
    assert.throws(() => validateAmountPaise('9223372036854775808'), /exceeds maximum PostgreSQL BIGINT capacity/);

    // 7. Exponential notation, non-numeric strings, NaN, Infinity
    assert.throws(() => validateAmountPaise('1e5'), /must be positive integer digits/);
    assert.throws(() => validateAmountPaise('abc'), /must be positive integer digits/);
    assert.throws(() => validateAmountPaise(''), /must be positive integer digits/);
    assert.throws(() => validateAmountPaise(NaN), /unsafe integer value/);
    assert.throws(() => validateAmountPaise(Infinity), /unsafe integer value/);
    assert.throws(() => validateAmountPaise(-Infinity), /unsafe integer value/);

    // 8. Precision-losing JavaScript floating-point rejection (> MAX_SAFE_INTEGER as Number)
    const unsafeFloat = Number.MAX_SAFE_INTEGER + 2; // 9007199254740993
    assert.throws(() => validateAmountPaise(unsafeFloat), /unsafe integer value exceeding JavaScript safe integer precision/);

    // 9. Safe integer string representation (> MAX_SAFE_INTEGER as String)
    assert.equal(validateAmountPaise('9007199254740993'), '9007199254740993');
  });

  // ---------------------------------------------------------------------------
  // 55. Independent Database Reconciliation: 9 Consistency Invariants
  // ---------------------------------------------------------------------------
  it('55. Independent Database Reconciliation: 9 Financial Consistency Invariants', async () => {
    // 1. Every posted transaction has exactly two ledger postings
    const check1 = await adminClient.query(`
      SELECT t.id, count(p.id) as posting_count
      FROM public.transactions t
      LEFT JOIN public.ledger_postings p ON p.transaction_id = t.id
      WHERE t.status = 'posted'
      GROUP BY t.id
      HAVING count(p.id) != 2;
    `);
    assert.equal(check1.rowCount, 0, 'Invariant 1: Every posted transaction must have exactly 2 postings');

    // 2. Every posted transaction postings sum to zero
    const check2 = await adminClient.query(`
      SELECT t.id, sum(p.signed_amount_paise) as balance_sum
      FROM public.transactions t
      JOIN public.ledger_postings p ON p.transaction_id = t.id
      WHERE t.status = 'posted'
      GROUP BY t.id
      HAVING sum(p.signed_amount_paise) != 0;
    `);
    assert.equal(check2.rowCount, 0, 'Invariant 2: Every posted transaction postings must sum to zero');

    // 3. No refused transaction has ledger postings
    const check3 = await adminClient.query(`
      SELECT t.id, count(p.id) as posting_count
      FROM public.transactions t
      JOIN public.ledger_postings p ON p.transaction_id = t.id
      WHERE t.status = 'refused'
      GROUP BY t.id;
    `);
    assert.equal(check3.rowCount, 0, 'Invariant 3: No refused transaction has ledger postings');

    // 4. No pending transaction is left with partial postings
    const check4 = await adminClient.query(`
      SELECT t.id, count(p.id) as posting_count
      FROM public.transactions t
      JOIN public.ledger_postings p ON p.transaction_id = t.id
      WHERE t.status = 'pending'
      GROUP BY t.id;
    `);
    assert.equal(check4.rowCount, 0, 'Invariant 4: No pending transaction is left with partial postings');

    // 5. No ledger posting references a nonexistent transaction or account
    const check5 = await adminClient.query(`
      SELECT p.id, p.transaction_id, p.account_id
      FROM public.ledger_postings p
      LEFT JOIN public.transactions t ON t.id = p.transaction_id
      LEFT JOIN public.accounts a ON a.id = p.account_id
      WHERE t.id IS NULL OR a.id IS NULL;
    `);
    assert.equal(check5.rowCount, 0, 'Invariant 5: No ledger posting references nonexistent transaction or account');

    // 6. No posted transaction has been mutated in a way that breaks its original financial record
    const check6 = await adminClient.query(`
      SELECT t.id, t.amount_paise, abs(p.signed_amount_paise) as posting_amount
      FROM public.transactions t
      JOIN public.ledger_postings p ON p.transaction_id = t.id
      WHERE t.status = 'posted' AND t.amount_paise != abs(p.signed_amount_paise);
    `);
    assert.equal(check6.rowCount, 0, 'Invariant 6: No posted transaction has mutated');

    // 7. Cached account balances match the sum of their ledger postings
    const check7 = await adminClient.query(`
      SELECT a.id, a.account_number, a.current_balance, COALESCE(sum(p.signed_amount_paise), 0) as postings_sum
      FROM public.accounts a
      LEFT JOIN public.ledger_postings p ON p.account_id = a.id
      GROUP BY a.id, a.account_number, a.current_balance
      HAVING a.current_balance != COALESCE(sum(p.signed_amount_paise), 0);
    `);
    assert.equal(check7.rowCount, 0, 'Invariant 7: Cached account balances match sum of postings');

    // 8. Reversal records do not create duplicate reversals
    const check8 = await adminClient.query(`
      SELECT original_transaction_id, count(*) as reversal_count
      FROM public.transactions
      WHERE type = 'reversal' AND status = 'posted'
      GROUP BY original_transaction_id
      HAVING count(*) > 1;
    `);
    assert.equal(check8.rowCount, 0, 'Invariant 8: Reversal records do not create duplicate reversals');

    // 9. Idempotency mappings do not point to missing or inconsistent transactions
    const check9 = await adminClient.query(`
      SELECT k.idempotency_key, k.transaction_id, t.id as tx_id, t.status
      FROM public.idempotency_keys k
      LEFT JOIN public.transactions t ON t.id = k.transaction_id
      WHERE (k.status = 'resolved' AND (k.transaction_id IS NULL OR t.id IS NULL))
         OR (k.transaction_id IS NOT NULL AND t.id IS NULL);
    `);
    assert.equal(check9.rowCount, 0, 'Invariant 9: Idempotency mappings do not point to missing or inconsistent transactions');
  });

  // ---------------------------------------------------------------------------
  // 56. Posted Transaction & Ledger Immutability: Runtime Role and Trigger Enforcement
  // ---------------------------------------------------------------------------
  it('56. Posted Transaction & Ledger Immutability: Runtime Privileges and Trigger Enforcement', async () => {
    // 1. Fetch a posted transaction and its postings
    const txRes = await adminClient.query(`
      SELECT t.id, t.amount_paise, p.id as posting_id
      FROM public.transactions t
      JOIN public.ledger_postings p ON p.transaction_id = t.id
      WHERE t.status = 'posted'
      LIMIT 1
    `);
    assert.ok(txRes.rowCount > 0, 'Posted transaction must exist for immutability testing');
    const { id: postedTxId, posting_id: postingId } = txRes.rows[0];

    // 2. Direct operations as runtime application role (ledgerline_app)
    await assert.rejects(
      async () => {
        await pool.query('UPDATE public.transactions SET amount_paise = amount_paise + 1 WHERE id = $1', [postedTxId]);
      },
      (err) => err.code === '42501' || /permission denied/.test(err.message),
      'Runtime role ledgerline_app must be denied UPDATE grant on transactions'
    );

    await assert.rejects(
      async () => {
        await pool.query('DELETE FROM public.transactions WHERE id = $1', [postedTxId]);
      },
      (err) => err.code === '42501' || /permission denied/.test(err.message),
      'Runtime role ledgerline_app must be denied DELETE grant on transactions'
    );

    await assert.rejects(
      async () => {
        await pool.query('UPDATE public.ledger_postings SET amount_paise = 999 WHERE id = $1', [postingId]);
      },
      (err) => err.code === '42501' || /permission denied/.test(err.message),
      'Runtime role ledgerline_app must be denied UPDATE grant on ledger_postings'
    );

    await assert.rejects(
      async () => {
        await pool.query('DELETE FROM public.ledger_postings WHERE id = $1', [postingId]);
      },
      (err) => err.code === '42501' || /permission denied/.test(err.message),
      'Runtime role ledgerline_app must be denied DELETE grant on ledger_postings'
    );

    await assert.rejects(
      async () => {
        await pool.query(
          `INSERT INTO public.ledger_postings (transaction_id, account_id, entry_type, amount_paise, signed_amount_paise, sequence_number)
           VALUES ($1, $2, 'DEBIT', 100, -100, 3)`,
          [postedTxId, accountA]
        );
      },
      (err) => err.code === '42501' || /permission denied/.test(err.message),
      'Runtime role ledgerline_app must be denied direct INSERT grant on ledger_postings'
    );

    // 3. Trigger enforcement even under privileged owner role
    await assert.rejects(
      async () => {
        await adminClient.query('UPDATE public.transactions SET amount_paise = amount_paise + 1 WHERE id = $1', [postedTxId]);
      },
      (err) => err.code === '23514' && /(?:is finalized|Finalized transactions|Prohibited mutation)/i.test(err.message),
      'Trigger trg_protect_finalized_transactions must block UPDATE on posted transactions'
    );

    await assert.rejects(
      async () => {
        await adminClient.query('DELETE FROM public.transactions WHERE id = $1', [postedTxId]);
      },
      (err) => err.code === '23514' && /(?:is finalized|Finalized transactions|Prohibited mutation)/i.test(err.message),
      'Trigger trg_protect_finalized_transactions must block DELETE on posted transactions'
    );

    await assert.rejects(
      async () => {
        await adminClient.query('UPDATE public.ledger_postings SET amount_paise = 999 WHERE id = $1', [postingId]);
      },
      (err) => err.code === '23514' && /strictly append-only/.test(err.message),
      'Trigger trg_append_only_postings must block UPDATE on ledger_postings'
    );

    await assert.rejects(
      async () => {
        await adminClient.query('DELETE FROM public.ledger_postings WHERE id = $1', [postingId]);
      },
      (err) => err.code === '23514' && /strictly append-only/.test(err.message),
      'Trigger trg_append_only_postings must block DELETE on ledger_postings'
    );

    await assert.rejects(
      async () => {
        await adminClient.query(
          `INSERT INTO public.ledger_postings (transaction_id, account_id, entry_type, amount_paise, signed_amount_paise, sequence_number)
           VALUES ($1, $2, 'DEBIT', 100, -100, 3)`,
          [postedTxId, accountA]
        );
      },
      (err) => err.code === '25000' && /Cannot insert postings for transaction .* with status posted/.test(err.message),
      'Trigger trg_prevent_extra_postings must block inserting additional postings on posted transactions'
    );
  });

  // ---------------------------------------------------------------------------
  // 57. Actual Monetary Overflow: Database BIGINT Balance Arithmetic Rollback
  // ---------------------------------------------------------------------------
  it('57. Actual Monetary Overflow: Database BIGINT Balance Arithmetic Exceedance and Atomic Rollback', async () => {
    const unique = Date.now();
    const ovfUser = (await registerCustomer(`ovf_user_${unique}@test.local`, 'Password123!')).user;
    const ovfAcc = (await createCustomerAccount(ovfUser.id, 'customer', `ACC-OVF-${unique}`)).accountId;

    // Set account balance near MAX_BIGINT (9223372036854775800)
    const nearMax = '9223372036854775800';
    await adminClient.query('UPDATE public.accounts SET current_balance = $1 WHERE id = $2', [nearMax, ovfAcc]);

    const preBal = (await adminClient.query('SELECT current_balance FROM public.accounts WHERE id = $1', [ovfAcc])).rows[0].current_balance;
    assert.equal(preBal, nearMax, 'Account balance must be initialized near MAX_BIGINT');

    const overflowKey = `ovf_tx_key_${unique}`;

    // Attempt deposit of 100 paise: 9223372036854775800 + 100 = 9223372036854775900 > MAX_BIGINT
    await assert.rejects(
      async () => {
        await processTransactionRequest({
          userId: ovfUser.id,
          role: 'customer',
          idempotencyKey: overflowKey,
          method: 'POST',
          path: '/api/transactions',
          body: {
            type: 'deposit',
            amountPaise: 100,
            sourceAccountId: vaultAccount.id,
            destinationAccountId: ovfAcc,
          },
        });
      },
      (err) => err.code === '22003' || /bigint out of range/i.test(err.message),
      'PostgreSQL balance trigger must reject BIGINT overflow with SQLSTATE 22003'
    );

    // 1. Exactly zero ledger postings remain for overflow attempt
    const postCount = await adminClient.query('SELECT count(*) FROM public.ledger_postings WHERE account_id = $1', [ovfAcc]);
    assert.equal(parseInt(postCount.rows[0].count, 10), 0, 'No partial postings may exist after overflow rollback');

    // 2. Exactly zero transactions marked posted
    const txCount = await adminClient.query("SELECT count(*) FROM public.transactions WHERE destination_account_id = $1 AND status = 'posted'", [ovfAcc]);
    assert.equal(parseInt(txCount.rows[0].count, 10), 0, 'No transaction may be marked posted after overflow rollback');

    // 3. Cached balance is strictly unchanged
    const postBal = (await adminClient.query('SELECT current_balance FROM public.accounts WHERE id = $1', [ovfAcc])).rows[0].current_balance;
    assert.equal(postBal, preBal, 'Cached balance must remain strictly unchanged after overflow');

    // 4. Idempotency reservation is rolled back
    const idempCheck = await adminClient.query('SELECT * FROM public.idempotency_keys WHERE idempotency_key = $1', [overflowKey]);
    assert.equal(idempCheck.rowCount, 0, 'Rolled-back overflow transaction must leave no idempotency record');

    // 5. Subsequent valid transaction succeeds on the same key after resetting balance to normal
    await adminClient.query('UPDATE public.accounts SET current_balance = 0 WHERE id = $1', [ovfAcc]);

    const validRes = await processTransactionRequest({
      userId: ovfUser.id,
      role: 'customer',
      idempotencyKey: overflowKey,
      method: 'POST',
      path: '/api/transactions',
      body: {
        type: 'deposit',
        amountPaise: 5000,
        sourceAccountId: vaultAccount.id,
        destinationAccountId: ovfAcc,
      },
    });
    assert.equal(validRes.statusCode, 200, 'Legitimate retry with safe balance must succeed with HTTP 200');
    assert.equal(validRes.body.status, 'success');
  });

  // ---------------------------------------------------------------------------
  // 58. Comprehensive Database Reconciliation: Zero Stale In-Progress Idempotency Keys
  // ---------------------------------------------------------------------------
  it('58. Comprehensive Database Reconciliation: Zero Stale In-Progress Keys and Invariant Consistency', async () => {
    // Verify that NO committed in_progress idempotency records exist in database
    const staleIdemp = await adminClient.query("SELECT count(*) FROM public.idempotency_keys WHERE status = 'in_progress'");
    assert.equal(parseInt(staleIdemp.rows[0].count, 10), 0, 'Zero in_progress idempotency records may exist in committed state');

    // Verify all resolved keys reference valid, existing transactions
    const resolvedCheck = await adminClient.query(`
      SELECT count(*)
      FROM public.idempotency_keys k
      LEFT JOIN public.transactions t ON t.id = k.transaction_id
      WHERE k.status = 'resolved' AND (k.transaction_id IS NULL OR t.id IS NULL)
    `);
    assert.equal(parseInt(resolvedCheck.rows[0].count, 10), 0, 'All resolved idempotency keys must reference valid transactions');
  });
});
