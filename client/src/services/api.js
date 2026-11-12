/**
 * LedgerLine Frontend API Client
 * Centralizes all HTTP communication with the Express backend.
 * Handles JWT authentication headers, client idempotency keys, and error handling.
 */

const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) || '';

const memoryStore = {};
export const memoryStorage = {
  getItem: (k) => memoryStore[k] || null,
  setItem: (k, v) => { memoryStore[k] = String(v); },
  removeItem: (k) => { delete memoryStore[k]; },
  clear: () => { Object.keys(memoryStore).forEach(k => delete memoryStore[k]); },
};

function getStorage() {
  try {
    // Browser authentication persistence must use sessionStorage ONLY
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const probeKey = '__ledgerline_probe__';
      window.sessionStorage.setItem(probeKey, probeKey);
      window.sessionStorage.removeItem(probeKey);
      return window.sessionStorage;
    }
    if (typeof sessionStorage !== 'undefined') {
      const probeKey = '__ledgerline_probe__';
      sessionStorage.setItem(probeKey, probeKey);
      sessionStorage.removeItem(probeKey);
      return sessionStorage;
    }
  } catch {
    // SecurityError (e.g. disabled third-party storage or sandboxed iframe) -> fallback to in-memory storage
    return memoryStorage;
  }
  // Isolated in-memory fallback when browser storage is unavailable (e.g. test environments)
  return memoryStorage;
}

export function getStoredToken() {
  try {
    const storage = getStorage();
    return storage.getItem('ledgerline_token') || null;
  } catch {
    return memoryStorage.getItem('ledgerline_token') || null;
  }
}

export function setStoredToken(token) {
  try {
    const storage = getStorage();
    if (token) {
      storage.setItem('ledgerline_token', token);
    } else {
      storage.removeItem('ledgerline_token');
    }
  } catch {
    if (token) {
      memoryStorage.setItem('ledgerline_token', token);
    } else {
      memoryStorage.removeItem('ledgerline_token');
    }
  }
}

export function getStoredUser() {
  try {
    const storage = getStorage();
    const raw = storage.getItem('ledgerline_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    try {
      const raw = memoryStorage.getItem('ledgerline_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

export function setStoredUser(user) {
  try {
    const storage = getStorage();
    if (user) {
      storage.setItem('ledgerline_user', JSON.stringify(user));
    } else {
      storage.removeItem('ledgerline_user');
    }
  } catch {
    if (user) {
      memoryStorage.setItem('ledgerline_user', JSON.stringify(user));
    } else {
      memoryStorage.removeItem('ledgerline_user');
    }
  }
}

export function clearAuthStorage() {
  try {
    const storage = getStorage();
    storage.removeItem('ledgerline_token');
    storage.removeItem('ledgerline_user');
  } catch {
    // Silently continue to purge memoryStorage
  }
  memoryStorage.removeItem('ledgerline_token');
  memoryStorage.removeItem('ledgerline_user');
}

/**
 * Base HTTP request wrapper with authorization and unified error normalization.
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = new Headers(options.headers || {});

  headers.set('Accept', 'application/json');

  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getStoredToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const config = {
    ...options,
    headers,
  };

  let response;
  try {
    response = await fetch(url, config);
  } catch (netErr) {
    const err = new Error(netErr.message || 'Network connection failed. Please check your network.');
    err.isNetworkError = true;
    throw err;
  }

  // Handle 401 Unauthorized globally
  if (response.status === 401) {
    clearAuthStorage();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ledgerline:session_expired'));
    }
  }

  // Parse JSON response body if present
  let data;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const extractedError =
      data &&
      (data.message ||
        (typeof data.error === 'string' ? data.error : data.error?.message));
    const message = extractedError || `Request failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  // Return parsed data plus headers (for Idempotent-Replay header detection)
  return {
    data,
    status: response.status,
    isIdempotentReplay: response.headers.get('Idempotent-Replay') === 'true',
  };
}

// -----------------------------------------------------------------------------
// Authentication Endpoints
// -----------------------------------------------------------------------------

export async function login(email, password) {
  const res = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (res.data && res.data.token) {
    setStoredToken(res.data.token);
    setStoredUser(res.data.user);
  }
  return res.data;
}

export async function register(email, password) {
  const res = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (res.data && res.data.token) {
    setStoredToken(res.data.token);
    setStoredUser(res.data.user);
  }
  return res.data;
}

export async function setUserStatus(targetUserId, isActive, reason) {
  const res = await request('/api/auth/status', {
    method: 'PATCH',
    body: JSON.stringify({ targetUserId, isActive, reason }),
  });
  return res.data;
}

export async function getCurrentUser() {
  const res = await request('/api/auth/me', { method: 'GET' });
  return res.data;
}

export async function listUsers() {
  const res = await request('/api/users', { method: 'GET' });
  return res.data?.users || [];
}

// -----------------------------------------------------------------------------
// Account Management Endpoints
// -----------------------------------------------------------------------------

export async function listAccounts() {
  const res = await request('/api/accounts', { method: 'GET' });
  return res.data;
}

export async function getAccount(accountId) {
  const res = await request(`/api/accounts/${accountId}`, { method: 'GET' });
  return res.data;
}

export async function createAccount(accountNumber, currency = 'INR') {
  const res = await request('/api/accounts', {
    method: 'POST',
    body: JSON.stringify({ accountNumber, currency }),
  });
  return res.data;
}

export async function getAccountStatement(accountId, { limit = 20, offset = 0 } = {}) {
  const res = await request(`/api/accounts/${accountId}/statement?limit=${limit}&offset=${offset}`, {
    method: 'GET',
  });
  return res.data;
}

export async function updateAccountStatus(accountId, status, reason) {
  const res = await request(`/api/accounts/${accountId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, reason }),
  });
  return res.data;
}

export async function listAccountMemberships(accountId) {
  const res = await request(`/api/accounts/${accountId}/memberships`, {
    method: 'GET',
  });
  return res.data;
}

export async function assignMembership(accountId, targetUserId, role) {
  const res = await request(`/api/accounts/${accountId}/memberships`, {
    method: 'POST',
    body: JSON.stringify({ targetUserId, role }),
  });
  return res.data;
}

export async function revokeMembership(accountId, targetUserId) {
  const res = await request(`/api/accounts/${accountId}/memberships/${targetUserId}`, {
    method: 'DELETE',
  });
  return res.data;
}

// -----------------------------------------------------------------------------
// Financial Operations Endpoints
// -----------------------------------------------------------------------------

export async function executeTransaction({
  type,
  amountPaise,
  sourceAccountId,
  destinationAccountId,
  originalTransactionId,
  idempotencyKey,
}) {
  const headers = {};
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const res = await request('/api/transactions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type,
      amountPaise,
      sourceAccountId,
      destinationAccountId,
      originalTransactionId,
    }),
  });

  return {
    ...res.data,
    isIdempotentReplay: res.isIdempotentReplay,
  };
}

export async function getTransaction(transactionId) {
  const res = await request(`/api/transactions/${transactionId}`, { method: 'GET' });
  return res.data;
}

export async function reverseTransaction(transactionId, { reason, idempotencyKey } = {}) {
  const headers = {};
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const res = await request(`/api/transactions/${transactionId}/reverse`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ reason }),
  });

  return {
    ...res.data,
    isIdempotentReplay: res.isIdempotentReplay,
  };
}

// -----------------------------------------------------------------------------
// System Health Endpoint
// -----------------------------------------------------------------------------

export async function getHealthStatus() {
  const startTime = performance.now();
  try {
    const res = await request('/api/health', { method: 'GET' });
    const latencyMs = Math.round(performance.now() - startTime);
    return {
      ok: res.data && res.data.status === 'UP',
      data: res.data,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startTime);
    return {
      ok: false,
      error: error.message || 'Network error: Unable to contact LedgerLine API server',
      latencyMs,
    };
  }
}
