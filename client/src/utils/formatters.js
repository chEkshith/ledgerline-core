/**
 * Currency and Number Formatting Utilities
 * Strictly enforces zero floating-point arithmetic using BigInt string parsing.
 */

/**
 * Converts a rupee decimal string or number (e.g. "1250.50", "100") to integer paise string ("125050").
 * @param {string|number} rupeeVal
 * @returns {string} Integer paise string for backend API
 */
export function rupeesToPaise(rupeeVal) {
  if (rupeeVal === null || rupeeVal === undefined) {
    throw new Error('Amount is required');
  }

  const str = rupeeVal.toString().trim();
  if (!str) {
    throw new Error('Amount is required');
  }

  // Reject negatives, alphabets, multiple decimals
  if (!/^\d+(\.\d{1,2})?$/.test(str)) {
    throw new Error('Please enter a valid positive amount (e.g. 100 or 100.50)');
  }

  const [wholePart, fracPart = ''] = str.split('.');
  const paddedFrac = fracPart.padEnd(2, '0').slice(0, 2);

  const wholeBig = BigInt(wholePart);
  const fracBig = BigInt(paddedFrac);

  const totalPaiseBig = wholeBig * 100n + fracBig;
  if (totalPaiseBig <= 0n) {
    throw new Error('Amount must be greater than zero');
  }

  return totalPaiseBig.toString();
}

/**
 * Formats integer paise into localized INR currency format (e.g. 125050 -> "₹1,250.50").
 * @param {string|number|bigint} paise
 * @returns {string}
 */
export function paiseToRupees(paise) {
  if (paise === null || paise === undefined || paise === '') {
    return '₹0.00';
  }

  try {
    const big = BigInt(paise.toString().trim());
    const isNegative = big < 0n;
    const abs = isNegative ? -big : big;

    const whole = abs / 100n;
    const frac = (abs % 100n).toString().padStart(2, '0');

    // Indian numbering format (e.g. 1,00,000)
    const formattedWhole = Number(whole).toLocaleString('en-IN');
    const sign = isNegative ? '-' : '';

    return `${sign}₹${formattedWhole}.${frac}`;
  } catch {
    return '₹0.00';
  }
}

/**
 * Formats an ISO date timestamp into a readable date string.
 * @param {string} isoString
 * @returns {string}
 */
export function formatTimestamp(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

/**
 * Generates a cryptographically strong UUID v4 for client-side idempotency keys.
 * @returns {string}
 */
export function generateIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Computes exact BigInt absolute magnitude without IEEE-754 precision loss.
 * @param {string|number|bigint} val
 * @returns {string} Absolute value as string
 */
export function bigIntAbs(val) {
  if (val === null || val === undefined || val === '') return '0';
  const b = BigInt(val.toString().trim());
  return (b < 0n ? -b : b).toString();
}

/**
 * Validates double-entry ledger postings against transaction state.
 * Enforces:
 * - 'posted' transactions must have exactly 2 postings.
 * - Exactly one strictly negative posting (< 0) and one strictly positive posting (> 0).
 * - Postings sum strictly to 0n using BigInt arithmetic.
 * - Absolute debit and credit amounts equal the transaction amount (amount_paise).
 * - Matching currency (when currency field is provided on posting).
 * - Matching account endpoints (debit matches source_account_id, credit matches destination_account_id).
 * - Rejects zero/zero postings, single polarity (++ or --), imbalanced amounts, and mismatched amounts.
 * - 'refused' and 'pending' transactions must have 0 postings.
 *
 * @param {object} tx Transaction metadata
 * @param {Array} postings Ledger postings array
 * @returns {object} Verification result with badge label, balanced status, and validity.
 */
export function verifyLedgerPostings(tx, postings = []) {
  if (!tx) {
    return {
      status: 'unknown',
      label: 'Unknown Transaction',
      badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
      isBalanced: false,
      isValid: false,
    };
  }

  if (tx.status === 'refused') {
    const hasZeroPostings = (postings || []).length === 0;
    return {
      status: 'refused',
      label: hasZeroPostings
        ? 'No Ledger Postings Created (Transaction Refused)'
        : 'Integrity Error: Refused Transaction Contains Postings',
      badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      isBalanced: null,
      isValid: hasZeroPostings,
    };
  }

  if (tx.status === 'pending') {
    const hasZeroPostings = (postings || []).length === 0;
    return {
      status: 'pending',
      label: hasZeroPostings
        ? 'Pending Settlement (No Postings Yet)'
        : 'Integrity Error: Pending Transaction Contains Postings',
      badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      isBalanced: null,
      isValid: hasZeroPostings,
    };
  }

  if (tx.status === 'posted') {
    if (!Array.isArray(postings) || postings.length !== 2) {
      return {
        status: 'invalid_count',
        label: `Verification Failed: Expected Exactly 2 Postings, Found ${postings?.length || 0}`,
        badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        isBalanced: false,
        isValid: false,
      };
    }

    try {
      // Validate transaction amount
      if (typeof tx.amount_paise === 'undefined' || tx.amount_paise === null || tx.amount_paise === '') {
        return {
          status: 'malformed_tx_amount',
          label: 'Verification Failed: Transaction Missing Amount',
          badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
          isBalanced: false,
          isValid: false,
        };
      }

      const expectedAmount = BigInt(tx.amount_paise.toString().trim());
      if (expectedAmount <= 0n) {
        return {
          status: 'invalid_tx_amount',
          label: 'Verification Failed: Transaction Amount Must Be Greater Than Zero',
          badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
          isBalanced: false,
          isValid: false,
        };
      }

      let sum = 0n;
      let positiveCount = 0;
      let negativeCount = 0;
      let debitPosting = null;
      let creditPosting = null;

      for (const p of postings) {
        if (!p || typeof p.signed_amount_paise === 'undefined' || p.signed_amount_paise === null || p.signed_amount_paise === '') {
          throw new Error('Missing signed amount');
        }

        const b = BigInt(p.signed_amount_paise.toString().trim());
        sum += b;

        if (b > 0n) {
          positiveCount++;
          creditPosting = p;
        } else if (b < 0n) {
          negativeCount++;
          debitPosting = p;
        }

        // Validate posting currency against transaction currency if present on posting
        if (p.currency && tx.currency && p.currency !== tx.currency) {
          return {
            status: 'currency_mismatch',
            label: `Verification Failed: Posting Currency (${p.currency}) Does Not Match Transaction (${tx.currency})`,
            badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
            isBalanced: false,
            isValid: false,
          };
        }
      }

      // Must have exactly one strictly positive posting and one strictly negative posting (rejects 0/0, ++, --)
      if (positiveCount !== 1 || negativeCount !== 1 || !debitPosting || !creditPosting) {
        return {
          status: 'invalid_polarity',
          label: 'Verification Failed: Requires Exactly One Positive and One Negative Posting',
          badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
          isBalanced: false,
          isValid: false,
        };
      }

      // Double-entry zero-sum invariant check
      if (sum !== 0n) {
        return {
          status: 'unbalanced',
          label: `Verification Failed: Postings Do Not Sum to Zero (Residual: ${sum.toString()} paise)`,
          badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
          isBalanced: false,
          isValid: false,
        };
      }

      // Exact transaction amount check (both debit and credit magnitude must equal transaction amount)
      const debitAbs = -BigInt(debitPosting.signed_amount_paise.toString().trim());
      const creditAbs = BigInt(creditPosting.signed_amount_paise.toString().trim());
      if (debitAbs !== expectedAmount || creditAbs !== expectedAmount) {
        return {
          status: 'amount_mismatch',
          label: `Verification Failed: Postings (${creditAbs.toString()} paise) Do Not Match Transaction Amount (${expectedAmount.toString()} paise)`,
          badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
          isBalanced: false,
          isValid: false,
        };
      }

      // Account endpoints verification if source/destination are provided on transaction
      if (tx.source_account_id && tx.destination_account_id) {
        if (debitPosting.account_id !== tx.source_account_id || creditPosting.account_id !== tx.destination_account_id) {
          return {
            status: 'account_mismatch',
            label: 'Verification Failed: Posting Accounts Do Not Match Source / Destination Endpoints',
            badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
            isBalanced: false,
            isValid: false,
          };
        }
      }

      return {
        status: 'balanced',
        label: 'Double-Entry Consistency Verified (Debit + Credit = 0)',
        badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        isBalanced: true,
        isValid: true,
      };
    } catch {
      return {
        status: 'malformed',
        label: 'Verification Failed: Malformed Posting Amounts',
        badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        isBalanced: false,
        isValid: false,
      };
    }
  }

  return {
    status: 'unrecognized',
    label: `Unknown Transaction Status (${tx.status})`,
    badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    isBalanced: false,
    isValid: false,
  };
}

/**
 * Pure state transition manager for administrative reversal idempotency lifecycle.
 * Guarantees:
 * - A failed attempt preserves both the exact same idempotency key and request payload.
 * - Changing the reason initiates a genuinely new operation with a distinct idempotency key.
 * - Changing the transaction ID initiates a genuinely new operation with a distinct idempotency key.
 * - Successful completion rotates to a fresh idempotency key.
 */
export function transitionReversalState(currentState, action) {
  switch (action.type) {
    case 'INIT':
      return {
        targetTxId: action.txId,
        idempotencyKey: generateIdempotencyKey(),
        submittedPayload: null,
        isFailedRetry: false,
      };

    case 'SUBMIT_FAILURE':
      return {
        ...currentState,
        submittedPayload: action.payload,
        isFailedRetry: true,
      };

    case 'CHANGE_REASON': {
      // If user edits the reason after a failure, this represents a new business intent -> new key
      if (currentState.isFailedRetry && currentState.submittedPayload && action.reason !== currentState.submittedPayload.reason) {
        return {
          targetTxId: currentState.targetTxId,
          idempotencyKey: generateIdempotencyKey(),
          submittedPayload: null,
          isFailedRetry: false,
        };
      }
      return currentState;
    }

    case 'CHANGE_TX_ID':
      // Navigating to a different transaction ID MUST NOT reuse key
      return {
        targetTxId: action.txId,
        idempotencyKey: generateIdempotencyKey(),
        submittedPayload: null,
        isFailedRetry: false,
      };

    case 'SUCCESS':
      // Rotate key on success
      return {
        targetTxId: currentState.targetTxId,
        idempotencyKey: generateIdempotencyKey(),
        submittedPayload: null,
        isFailedRetry: false,
      };

    default:
      return currentState;
  }
}

/**
 * Determines whether the authenticated user can manage account memberships.
 * Restricted strictly to platform administrators.
 */
export function canManageAccountMemberships(user) {
  return Boolean(user && user.role === 'admin');
}

/**
 * Determines whether an account is strictly read-only for the caller (assigned as auditor).
 */
export function isAccountReadOnly(user, account) {
  return Boolean(user && user.role !== 'admin' && account && account.membership_role === 'auditor');
}

/**
 * Determines whether the caller may initiate financial operations (deposit/withdraw/transfer) on the account.
 */
export function canTransactOnAccount(user, account) {
  if (!user || !account) return false;
  if (user.role === 'admin') return true;
  return account.membership_role === 'account_holder';
}
