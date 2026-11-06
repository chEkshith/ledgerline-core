/**
 * Currency Utilities for LedgerLine
 * 
 * In financial systems, never use floating-point numbers (e.g. 0.1 + 0.2 === 0.30000000000000004).
 * All monetary amounts are stored and calculated as integers in the currency's minor unit (e.g., cents for USD/EUR, paise for INR).
 */

/**
 * Formats integer cents into a human-readable currency string.
 * @param {number|bigint} cents - Monetary value in minor units (e.g. 1050 cents = $10.50)
 * @param {string} [currency='USD'] - ISO 4217 Currency Code
 * @param {string} [locale='en-US'] - BCP 47 Language Tag
 * @returns {string} Formatted currency representation
 */
export function formatMinorUnits(cents, currency = 'USD', locale = 'en-US') {
  if (!Number.isInteger(cents) && typeof cents !== 'bigint') {
    throw new TypeError(`Amount must be an integer (minor unit), received: ${cents}`);
  }

  // Use Intl.NumberFormat with minor units converted to major unit representation
  const majorAmount = Number(cents) / 100;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(majorAmount);
}

/**
 * Parses a decimal string (e.g. "10.50") safely into integer cents without float drift.
 * @param {string} decimalString - Major unit string (e.g. "12.34")
 * @returns {number} Cents as integer
 */
export function parseToMinorUnits(decimalString) {
  if (typeof decimalString !== 'string') {
    throw new TypeError('Expected a decimal string representation');
  }

  const trimmed = decimalString.trim();
  const match = trimmed.match(/^([+-]?\d+)(?:\.(\d{1,2}))?$/);
  if (!match) {
    throw new Error(`Invalid monetary format: "${decimalString}"`);
  }

  const sign = match[1].startsWith('-') ? -1 : 1;
  const whole = Math.abs(parseInt(match[1], 10));
  const fraction = (match[2] || '').padEnd(2, '0');

  return sign * (whole * 100 + parseInt(fraction, 10));
}

