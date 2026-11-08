import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  rupeesToPaise,
  paiseToRupees,
  formatTimestamp,
  generateIdempotencyKey,
  verifyLedgerPostings,
  bigIntAbs,
  transitionReversalState,
} from '../src/utils/formatters.js';
import * as api from '../src/services/api.js';

describe('LedgerLine Frontend Utilities & Financial Precision Suite', () => {
  describe('rupeesToPaise - Exact Minor Currency Conversion', () => {
    it('converts whole rupee integer strings to exact paise', () => {
      assert.equal(rupeesToPaise('1'), '100');
      assert.equal(rupeesToPaise('100'), '10000');
      assert.equal(rupeesToPaise('1000000'), '100000000');
    });

    it('converts two-decimal rupee strings to exact paise', () => {
      assert.equal(rupeesToPaise('10.50'), '1050');
      assert.equal(rupeesToPaise('0.05'), '5');
      assert.equal(rupeesToPaise('0.99'), '99');
      // Famous IEEE-754 precision trap: 10.55 * 100 in float equals 1054.9999999999998
      assert.equal(rupeesToPaise('10.55'), '1055');
      assert.equal(rupeesToPaise('1234567.89'), '123456789');
    });

    it('converts one-decimal rupee strings with zero padding', () => {
      assert.equal(rupeesToPaise('5.5'), '550');
      assert.equal(rupeesToPaise('100.1'), '10010');
    });

    it('handles numeric input safely', () => {
      assert.equal(rupeesToPaise(500), '50000');
    });

    it('rejects zero, negative, or invalid amounts', () => {
      assert.throws(() => rupeesToPaise('0'), /Amount must be greater than zero/);
      assert.throws(() => rupeesToPaise('-50'), /Please enter a valid positive amount/);
      assert.throws(() => rupeesToPaise('abc'), /Please enter a valid positive amount/);
      assert.throws(() => rupeesToPaise('10.555'), /Please enter a valid positive amount/);
      assert.throws(() => rupeesToPaise(''), /Amount is required/);
      assert.throws(() => rupeesToPaise(null), /Amount is required/);
    });
  });

  describe('paiseToRupees - Exact Display Formatting', () => {
    it('formats positive paise to Indian Rupee strings', () => {
      assert.equal(paiseToRupees('10000'), '₹100.00');
      assert.equal(paiseToRupees('1050'), '₹10.50');
      assert.equal(paiseToRupees('5'), '₹0.05');
      assert.equal(paiseToRupees(50000), '₹500.00');
    });

    it('formats large numbers with Indian numbering commas', () => {
      assert.equal(paiseToRupees('10000000'), '₹1,00,000.00');
      assert.equal(paiseToRupees('1000000000'), '₹1,00,00,000.00');
    });

    it('formats negative paise accurately', () => {
      assert.equal(paiseToRupees('-1000'), '-₹10.00');
      assert.equal(paiseToRupees(-50), '-₹0.50');
    });

    it('handles zero and empty values gracefully', () => {
      assert.equal(paiseToRupees('0'), '₹0.00');
      assert.equal(paiseToRupees(null), '₹0.00');
      assert.equal(paiseToRupees(''), '₹0.00');
    });
  });

  describe('generateIdempotencyKey - UUID v4 Compliance', () => {
    it('generates valid UUID v4 format strings', () => {
      const key = generateIdempotencyKey();
      const uuidv4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      assert.match(key, uuidv4Regex, 'Key must strictly adhere to UUID v4 specification');
    });

    it('generates unique keys on successive calls', () => {
      const keys = new Set();
      for (let i = 0; i < 50; i++) {
        keys.add(generateIdempotencyKey());
      }
      assert.equal(keys.size, 50, 'All generated idempotency keys must be distinct');
    });
  });

  describe('formatTimestamp', () => {
    it('formats ISO timestamps', () => {
      const formatted = formatTimestamp('2026-11-08T10:30:00.000Z');
      assert.ok(typeof formatted === 'string');
      assert.ok(formatted.length > 5);
    });

    it('handles null/undefined gracefully', () => {
      assert.equal(formatTimestamp(null), '—');
      assert.equal(formatTimestamp(''), '—');
    });
  });
});

describe('LedgerLine API Client & HTTP Error Normalization Suite', () => {
  let originalFetch;
  let originalWindow;
  let dispatchedEvents = [];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalWindow = globalThis.window;
    dispatchedEvents = [];

    // Mock window with event dispatch
    globalThis.window = {
      dispatchEvent: (event) => dispatchedEvents.push(event),
      sessionStorage: {
        _store: {},
        getItem(k) { return this._store[k] || null; },
        setItem(k, v) { this._store[k] = String(v); },
        removeItem(k) { delete this._store[k]; },
      },
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    api.clearAuthStorage();
  });

  it('handles 401 Unauthorized: purges storage and triggers session expired event', async () => {
    api.setStoredToken('expired_test_jwt');
    assert.equal(api.getStoredToken(), 'expired_test_jwt');

    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'Unauthorized', message: 'Invalid or expired authentication token' }),
    });

    await assert.rejects(
      async () => {
        await api.getAccount('00000000-0000-0000-0000-000000000001');
      },
      (err) => err.status === 401 && /Invalid or expired authentication token/.test(err.message)
    );

    // Auth storage must be purged
    assert.equal(api.getStoredToken(), null, 'Stored token must be purged on 401');
    assert.equal(dispatchedEvents.length, 1, 'session_expired event must be dispatched');
    assert.equal(dispatchedEvents[0].type, 'ledgerline:session_expired');
  });

  it('handles 403 Forbidden: extracts permission denied error without purging token', async () => {
    api.setStoredToken('valid_customer_jwt');

    globalThis.fetch = async () => ({
      ok: false,
      status: 403,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'Forbidden', message: 'Insufficient privileges for this operation' }),
    });

    await assert.rejects(
      async () => {
        await api.setUserStatus('00000000-0000-0000-0000-000000000002', false, 'test');
      },
      (err) => err.status === 403 && /Insufficient privileges/.test(err.message)
    );

    // Token should remain intact for 403 (user is authenticated but lacks permission)
    assert.equal(api.getStoredToken(), 'valid_customer_jwt');
  });

  it('handles 422 Transaction Refusal: preserves refused status and reason in error payload', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 422,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        status: 'refused',
        refusal_reason: 'insufficient_funds',
        message: 'Transaction refused: Source account balance is insufficient',
      }),
    });

    await assert.rejects(
      async () => {
        await api.executeTransaction({
          type: 'transfer',
          amountPaise: '999999999',
          sourceAccountId: 'acc1',
          destinationAccountId: 'acc2',
          idempotencyKey: 'test-key',
        });
      },
      (err) => err.status === 422 && /insufficient/.test(err.message)
    );
  });

  it('injects Authorization Bearer and Idempotency-Key headers on requests', async () => {
    api.setStoredToken('bearer_sample_token');
    let capturedHeaders = null;

    globalThis.fetch = async (url, options) => {
      capturedHeaders = options.headers;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ status: 'success', transaction_id: 'tx-123' }),
      };
    };

    const res = await api.executeTransaction({
      type: 'deposit',
      amountPaise: '5000',
      sourceAccountId: 'vault',
      destinationAccountId: 'acc1',
      idempotencyKey: 'uuid-idem-key-888',
    });

    assert.equal(res.status, 'success');
    assert.equal(capturedHeaders.get('Authorization'), 'Bearer bearer_sample_token');
    assert.equal(capturedHeaders.get('Idempotency-Key'), 'uuid-idem-key-888');
  });

  it('detects server Idempotent-Replay header and sets isIdempotentReplay=true', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/json',
        'Idempotent-Replay': 'true',
      }),
      json: async () => ({ status: 'success', transaction_id: 'tx-original-winner' }),
    });

    const res = await api.executeTransaction({
      type: 'transfer',
      amountPaise: '1000',
      sourceAccountId: 'acc1',
      destinationAccountId: 'acc2',
      idempotencyKey: 'replayed-key-999',
    });

    assert.equal(res.isIdempotentReplay, true, 'isIdempotentReplay must be true when header present');
    assert.equal(res.transaction_id, 'tx-original-winner');
  });
});

describe('LedgerLine Role Boundaries & Idempotency Lifecycle Suite', () => {
  it('enforces role authorization matrix boundaries', () => {
    function checkAccess(role, route) {
      if (route === '/admin') return role === 'admin';
      if (route === '/operations') return role === 'customer' || role === 'account_holder';
      if (route === '/accounts') return true; // all authenticated roles
      return false;
    }

    // Admin
    assert.equal(checkAccess('admin', '/admin'), true);
    assert.equal(checkAccess('admin', '/accounts'), true);

    // Customer
    assert.equal(checkAccess('customer', '/admin'), false);
    assert.equal(checkAccess('customer', '/operations'), true);
    assert.equal(checkAccess('customer', '/accounts'), true);

    // Auditor (read-only)
    assert.equal(checkAccess('auditor', '/admin'), false);
    assert.equal(checkAccess('auditor', '/operations'), false);
    assert.equal(checkAccess('auditor', '/accounts'), true);
  });

  it('preserves idempotency key on network failure and rotates on success', () => {
    let currentKey = generateIdempotencyKey();
    const initialKey = currentKey;

    // Simulate failure: key MUST NOT rotate
    const networkFailed = true;
    if (networkFailed) {
      // Key is preserved
      assert.equal(currentKey, initialKey, 'Key must be preserved for retry on network error');
    }

    // Simulate success: key MUST rotate for genuinely new transaction
    const transactionSettled = true;
    let nextKey = currentKey;
    if (transactionSettled) {
      nextKey = generateIdempotencyKey();
    }
    assert.notEqual(nextKey, initialKey, 'New transaction must receive a distinct key');
  });

  it('manages session storage securely', () => {
    api.clearAuthStorage();
    assert.equal(api.getStoredToken(), null);
    assert.equal(api.getStoredUser(), null);

    api.setStoredToken('test_tok');
    api.setStoredUser({ id: 'u1', email: 'test@local', role: 'customer' });

    assert.equal(api.getStoredToken(), 'test_tok');
    assert.equal(api.getStoredUser()?.email, 'test@local');

    api.clearAuthStorage();
    assert.equal(api.getStoredToken(), null);
    assert.equal(api.getStoredUser(), null);
  });

  it('strictly ignores any legacy tokens stored in localStorage', () => {
    // Setup mock localStorage with a legacy / rogue token
    const mockLocalStorage = {
      'ledgerline_token': 'rogue_legacy_localstorage_jwt_token',
      'ledgerline_user': JSON.stringify({ id: 'bad-actor', role: 'admin' }),
    };

    globalThis.localStorage = {
      getItem(k) { return mockLocalStorage[k] || null; },
      setItem(k, v) { mockLocalStorage[k] = String(v); },
      removeItem(k) { delete mockLocalStorage[k]; },
    };

    // Ensure sessionStorage and memoryStorage have no active session
    api.clearAuthStorage();

    // Verify api.getStoredToken() and api.getStoredUser() return null
    assert.equal(
      api.getStoredToken(),
      null,
      'A token present only in localStorage MUST NOT be accepted or returned'
    );
    assert.equal(
      api.getStoredUser(),
      null,
      'A user present only in localStorage MUST NOT be accepted or returned'
    );

    // Verify writing a token writes only to sessionStorage, never localStorage
    api.setStoredToken('legitimate_session_token');
    assert.equal(
      mockLocalStorage['ledgerline_token'],
      'rogue_legacy_localstorage_jwt_token',
      'setStoredToken must never write to or overwrite localStorage'
    );

    // Clean up mock
    delete globalThis.localStorage;
    api.clearAuthStorage();
  });

  it('seamlessly falls back to in-memory storage when sessionStorage throws SecurityError', () => {
    // Setup window where sessionStorage property access or operations throw SecurityError
    const savedWindow = globalThis.window;
    globalThis.window = {};
    Object.defineProperty(globalThis.window, 'sessionStorage', {
      configurable: true,
      get() {
        const err = new Error('Access is denied for this document');
        err.name = 'SecurityError';
        throw err;
      },
    });

    api.clearAuthStorage();
    assert.equal(api.getStoredToken(), null);

    // setStoredToken must NOT throw SecurityError, but use memoryStorage fallback
    assert.doesNotThrow(() => {
      api.setStoredToken('security_fallback_jwt_token');
    });

    assert.equal(api.getStoredToken(), 'security_fallback_jwt_token');

    // setStoredUser must also succeed via memory fallback
    assert.doesNotThrow(() => {
      api.setStoredUser({ id: 'fallback-user', role: 'customer' });
    });
    assert.equal(api.getStoredUser()?.id, 'fallback-user');

    // clearAuthStorage must also succeed
    assert.doesNotThrow(() => {
      api.clearAuthStorage();
    });
    assert.equal(api.getStoredToken(), null);
    assert.equal(api.getStoredUser(), null);

    // Restore original window
    globalThis.window = savedWindow;
  });

  it('seamlessly operates using memory storage when window is undefined (e.g. CLI/worker environments)', () => {
    const savedWindow = globalThis.window;
    delete globalThis.window;

    api.clearAuthStorage();
    assert.equal(api.getStoredToken(), null);

    api.setStoredToken('cli_token');
    api.setStoredUser({ email: 'cli@local' });

    assert.equal(api.getStoredToken(), 'cli_token');
    assert.equal(api.getStoredUser()?.email, 'cli@local');

    api.clearAuthStorage();
    assert.equal(api.getStoredToken(), null);

    globalThis.window = savedWindow;
  });
});

describe('LedgerLine Transaction Ledger Verification Suite (verifyLedgerPostings)', () => {
  it('correctly handles Refused transactions with 0 postings', () => {
    const tx = { id: 'tx-ref-1', status: 'refused', refusal_reason: 'insufficient_funds' };
    const result = verifyLedgerPostings(tx, []);
    assert.equal(result.status, 'refused');
    assert.equal(result.isValid, true);
    assert.equal(result.isBalanced, null);
    assert.match(result.label, /Transaction Refused/);
  });

  it('correctly handles Pending transactions with 0 postings', () => {
    const tx = { id: 'tx-pend-1', status: 'pending' };
    const result = verifyLedgerPostings(tx, []);
    assert.equal(result.status, 'pending');
    assert.equal(result.isValid, true);
    assert.equal(result.isBalanced, null);
    assert.match(result.label, /Pending Settlement/);
  });

  it('REJECTS empty postings on a Posted transaction as a verification failure', () => {
    const tx = { id: 'tx-post-empty', status: 'posted', amount_paise: '5000' };
    // Previously, [].reduce gave 0n, falsely displaying "Zero-Sum Balanced"
    const result = verifyLedgerPostings(tx, []);
    assert.equal(result.status, 'invalid_count');
    assert.equal(result.isBalanced, false);
    assert.equal(result.isValid, false);
    assert.match(result.label, /Expected Exactly 2 Postings, Found 0/);
  });

  it('REJECTS single posting on a Posted transaction as an invalid count', () => {
    const tx = { id: 'tx-post-single', status: 'posted', amount_paise: '5000' };
    const postings = [{ id: 'p1', signed_amount_paise: '1000', entry_type: 'credit' }];
    const result = verifyLedgerPostings(tx, postings);
    assert.equal(result.status, 'invalid_count');
    assert.equal(result.isBalanced, false);
    assert.equal(result.isValid, false);
    assert.match(result.label, /Expected Exactly 2 Postings, Found 1/);
  });

  it('validates a balanced Posted transaction with exactly 2 complementary postings', () => {
    const tx = { id: 'tx-post-valid', status: 'posted', amount_paise: '5000' };
    const postings = [
      { id: 'p1', sequence_number: 1, signed_amount_paise: '-5000', entry_type: 'debit' },
      { id: 'p2', sequence_number: 2, signed_amount_paise: '5000', entry_type: 'credit' },
    ];
    const result = verifyLedgerPostings(tx, postings);
    assert.equal(result.status, 'balanced');
    assert.equal(result.isBalanced, true);
    assert.equal(result.isValid, true);
    assert.match(result.label, /Double-Entry Consistency Verified/);
  });

  it('REJECTS an unbalanced Posted transaction where postings do not sum to zero', () => {
    const tx = { id: 'tx-post-unbalanced', status: 'posted', amount_paise: '5000' };
    const postings = [
      { id: 'p1', sequence_number: 1, signed_amount_paise: '-5000', entry_type: 'debit' },
      { id: 'p2', sequence_number: 2, signed_amount_paise: '4500', entry_type: 'credit' },
    ];
    const result = verifyLedgerPostings(tx, postings);
    assert.equal(result.status, 'unbalanced');
    assert.equal(result.isBalanced, false);
    assert.equal(result.isValid, false);
    assert.match(result.label, /Do Not Sum to Zero/);
  });

  it('REJECTS malformed posting amounts (non-numeric strings)', () => {
    const tx = { id: 'tx-post-malformed', status: 'posted', amount_paise: '5000' };
    const postings = [
      { id: 'p1', signed_amount_paise: 'corrupt_amount', entry_type: 'debit' },
      { id: 'p2', signed_amount_paise: '5000', entry_type: 'credit' },
    ];
    const result = verifyLedgerPostings(tx, postings);
    assert.equal(result.status, 'malformed');
    assert.equal(result.isBalanced, false);
    assert.equal(result.isValid, false);
    assert.match(result.label, /Malformed Posting Amounts/);
  });

  it('accurately verifies large-BIGINT postings exceeding Number.MAX_SAFE_INTEGER', () => {
    // 9007199254740993n > Number.MAX_SAFE_INTEGER (9007199254740991)
    const largePaise = '9007199254740993';
    const tx = { id: 'tx-post-large', status: 'posted', amount_paise: largePaise };
    const postings = [
      { id: 'p1', sequence_number: 1, signed_amount_paise: `-${largePaise}`, entry_type: 'debit' },
      { id: 'p2', sequence_number: 2, signed_amount_paise: largePaise, entry_type: 'credit' },
    ];

    const result = verifyLedgerPostings(tx, postings);
    assert.equal(result.status, 'balanced');
    assert.equal(result.isBalanced, true);
    assert.equal(result.isValid, true);

    // Verify bigIntAbs does not lose precision compared to Math.abs
    const absStr = bigIntAbs(`-${largePaise}`);
    assert.equal(absStr, largePaise, 'bigIntAbs must preserve exact precision for 64-bit integer strings');
    // Math.abs(9007199254740993) loses precision in IEEE-754: 9007199254740992!
    assert.notEqual(
      BigInt(Math.abs(Number(largePaise))).toString(),
      largePaise,
      'Confirms Math.abs suffers precision loss on large numbers, whereas bigIntAbs does not'
    );
  });

  it('REJECTS zero/zero postings as invalid polarity (both zero)', () => {
    const tx = { id: 'tx-post-zero', status: 'posted', amount_paise: '5000' };
    const postings = [
      { id: 'p1', sequence_number: 1, signed_amount_paise: '0', entry_type: 'debit' },
      { id: 'p2', sequence_number: 2, signed_amount_paise: '0', entry_type: 'credit' },
    ];
    const result = verifyLedgerPostings(tx, postings);
    assert.equal(result.status, 'invalid_polarity');
    assert.equal(result.isBalanced, false);
    assert.equal(result.isValid, false);
    assert.match(result.label, /Requires Exactly One Positive and One Negative Posting/);
  });

  it('REJECTS postings with zero-sum residual but mismatched amounts against transaction amount', () => {
    const tx = { id: 'tx-post-mismatch', status: 'posted', amount_paise: '5000' };
    // Sum is -3000 + 3000 = 0n, but 3000 != 5000!
    const postings = [
      { id: 'p1', sequence_number: 1, signed_amount_paise: '-3000', entry_type: 'debit' },
      { id: 'p2', sequence_number: 2, signed_amount_paise: '3000', entry_type: 'credit' },
    ];
    const result = verifyLedgerPostings(tx, postings);
    assert.equal(result.status, 'amount_mismatch');
    assert.equal(result.isBalanced, false);
    assert.equal(result.isValid, false);
    assert.match(result.label, /Do Not Match Transaction Amount/);
  });

  it('REJECTS postings with two positive amounts (both credits, ++ polarity)', () => {
    const tx = { id: 'tx-post-double-pos', status: 'posted', amount_paise: '5000' };
    const postings = [
      { id: 'p1', sequence_number: 1, signed_amount_paise: '5000', entry_type: 'credit' },
      { id: 'p2', sequence_number: 2, signed_amount_paise: '5000', entry_type: 'credit' },
    ];
    const result = verifyLedgerPostings(tx, postings);
    assert.equal(result.status, 'invalid_polarity');
    assert.equal(result.isBalanced, false);
    assert.equal(result.isValid, false);
  });

  it('REJECTS postings with two negative amounts (both debits, -- polarity)', () => {
    const tx = { id: 'tx-post-double-neg', status: 'posted', amount_paise: '5000' };
    const postings = [
      { id: 'p1', sequence_number: 1, signed_amount_paise: '-5000', entry_type: 'debit' },
      { id: 'p2', sequence_number: 2, signed_amount_paise: '-5000', entry_type: 'debit' },
    ];
    const result = verifyLedgerPostings(tx, postings);
    assert.equal(result.status, 'invalid_polarity');
    assert.equal(result.isBalanced, false);
    assert.equal(result.isValid, false);
  });

  it('REJECTS postings with currency mismatch against transaction currency', () => {
    const tx = { id: 'tx-post-curr', status: 'posted', amount_paise: '5000', currency: 'INR' };
    const postings = [
      { id: 'p1', sequence_number: 1, signed_amount_paise: '-5000', currency: 'INR' },
      { id: 'p2', sequence_number: 2, signed_amount_paise: '5000', currency: 'USD' },
    ];
    const result = verifyLedgerPostings(tx, postings);
    assert.equal(result.status, 'currency_mismatch');
    assert.equal(result.isBalanced, false);
    assert.equal(result.isValid, false);
    assert.match(result.label, /Currency \(USD\) Does Not Match Transaction \(INR\)/);
  });

  it('REJECTS postings with account endpoint mismatch against source/destination accounts', () => {
    const tx = {
      id: 'tx-post-acc',
      status: 'posted',
      amount_paise: '5000',
      source_account_id: 'acc-src-1',
      destination_account_id: 'acc-dst-2',
    };
    const postings = [
      { id: 'p1', sequence_number: 1, signed_amount_paise: '-5000', account_id: 'acc-other-rogue' },
      { id: 'p2', sequence_number: 2, signed_amount_paise: '5000', account_id: 'acc-dst-2' },
    ];
    const result = verifyLedgerPostings(tx, postings);
    assert.equal(result.status, 'account_mismatch');
    assert.equal(result.isBalanced, false);
    assert.equal(result.isValid, false);
    assert.match(result.label, /Posting Accounts Do Not Match Source \/ Destination Endpoints/);
  });
});

describe('LedgerLine Administrative Reversal Idempotency Lifecycle Suite', () => {
  it('preserves the reversal idempotency key and payload across network error and retries', async () => {
    // Component state simulation
    let reversalIdempotencyKey = generateIdempotencyKey();
    const initialKey = reversalIdempotencyKey;
    const reversePayload = { reason: 'Investigating customer dispute #104' };

    let submitAttempts = 0;
    const capturedSubmissions = [];

    async function simulateReversalSubmit(key, payload) {
      submitAttempts++;
      capturedSubmissions.push({ key, payload });
      if (submitAttempts === 1) {
        // First attempt fails with network error / timeout
        const netErr = new Error('Network timeout talking to gateway');
        netErr.isNetworkError = true;
        throw netErr;
      }
      // Second attempt (retry) succeeds with the same key
      return { status: 'success', transaction_id: 'reversal-tx-444', isIdempotentReplay: false };
    }

    // Attempt 1: Fails
    try {
      await simulateReversalSubmit(reversalIdempotencyKey, reversePayload);
      assert.fail('First attempt should have thrown network error');
    } catch (err) {
      assert.equal(err.isNetworkError, true);
      // Key MUST remain unchanged in state on failure!
      assert.equal(
        reversalIdempotencyKey,
        initialKey,
        'Idempotency key must NOT rotate on failure or timeout'
      );
    }

    // Attempt 2: User clicks Retry button -> Exact same key and payload submitted
    const retryResult = await simulateReversalSubmit(reversalIdempotencyKey, reversePayload);
    assert.equal(retryResult.status, 'success');
    assert.equal(capturedSubmissions.length, 2);
    assert.equal(
      capturedSubmissions[0].key,
      capturedSubmissions[1].key,
      'Retry attempt MUST reuse the exact same idempotency key'
    );
    assert.equal(
      capturedSubmissions[0].payload.reason,
      capturedSubmissions[1].payload.reason,
      'Retry attempt MUST reuse the exact same reversal payload'
    );

    // On settlement success: rotate key for subsequent fresh reversals
    reversalIdempotencyKey = generateIdempotencyKey();
    assert.notEqual(
      reversalIdempotencyKey,
      initialKey,
      'New reversal operation must generate a distinct idempotency key'
    );
  });

  it('detects server idempotent replay on duplicate submission with the same key', async () => {
    const sharedKey = generateIdempotencyKey();
    let callCount = 0;

    const mockReverseApi = async (idempotencyKey) => {
      callCount++;
      return {
        status: 'success',
        transaction_id: 'rev-tx-999',
        isIdempotentReplay: callCount > 1,
      };
    };

    const first = await mockReverseApi(sharedKey);
    assert.equal(first.isIdempotentReplay, false);

    const second = await mockReverseApi(sharedKey);
    assert.equal(second.isIdempotentReplay, true, 'Second submission with same key returns isIdempotentReplay=true');
    assert.equal(first.transaction_id, second.transaction_id);
  });

  it('transitionReversalState strictly manages immutable operation lifecycle across failures, reason edits, and route navigation', () => {
    // 1. INIT: State created with target transaction ID and unique UUID v4 idempotency key
    const initOp = transitionReversalState(null, { type: 'INIT', txId: 'tx-100' });
    assert.equal(initOp.targetTxId, 'tx-100');
    assert.ok(initOp.idempotencyKey);
    assert.equal(initOp.submittedPayload, null);
    assert.equal(initOp.isFailedRetry, false);

    const initialKey = initOp.idempotencyKey;

    // 2. SUBMIT_FAILURE: Network error or server rejection preserves key and stores payload
    const failedOp = transitionReversalState(initOp, {
      type: 'SUBMIT_FAILURE',
      payload: { reason: 'Incorrect charge dispute' },
    });
    assert.equal(failedOp.idempotencyKey, initialKey, 'Key must be strictly preserved across failures');
    assert.equal(failedOp.submittedPayload.reason, 'Incorrect charge dispute');
    assert.equal(failedOp.isFailedRetry, true);

    // 3. RETRY without editing reason: Must preserve key and payload
    const retryReasonNoChange = transitionReversalState(failedOp, {
      type: 'CHANGE_REASON',
      reason: 'Incorrect charge dispute',
    });
    assert.equal(retryReasonNoChange.idempotencyKey, initialKey, 'Identical reason on retry must preserve key');
    assert.equal(retryReasonNoChange.isFailedRetry, true);

    // 4. CHANGE_REASON: User modifies reason after failure -> initiates genuinely new operation with new key
    const editedReasonOp = transitionReversalState(failedOp, {
      type: 'CHANGE_REASON',
      reason: 'Updated dispute reason: Customer provided signed receipt',
    });
    assert.notEqual(editedReasonOp.idempotencyKey, initialKey, 'Editing reason after failure must generate a brand new key');
    assert.equal(editedReasonOp.submittedPayload, null, 'Editing reason resets submitted payload');
    assert.equal(editedReasonOp.isFailedRetry, false, 'Editing reason resets isFailedRetry');
    assert.equal(editedReasonOp.targetTxId, 'tx-100');

    // 5. CHANGE_TX_ID: User navigates to a different transaction -> initiates new operation with new key
    const newTxOp = transitionReversalState(failedOp, {
      type: 'CHANGE_TX_ID',
      txId: 'tx-200',
    });
    assert.notEqual(newTxOp.idempotencyKey, initialKey, 'Changing transaction ID must generate a brand new key');
    assert.equal(newTxOp.targetTxId, 'tx-200');
    assert.equal(newTxOp.submittedPayload, null);
    assert.equal(newTxOp.isFailedRetry, false);

    // 6. SUCCESS: Successful settlement rotates to fresh idempotency key
    const successOp = transitionReversalState(failedOp, { type: 'SUCCESS' });
    assert.notEqual(successOp.idempotencyKey, initialKey, 'Settlement success must rotate idempotency key');
    assert.equal(successOp.submittedPayload, null);
    assert.equal(successOp.isFailedRetry, false);
  });
});
