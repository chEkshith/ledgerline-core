import crypto from 'crypto';

/**
 * Deterministically sorts object keys recursively to produce canonical JSON.
 * @param {any} obj
 * @returns {string}
 */
export function canonicalizeJson(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalizeJson).join(',')}]`;
  }
  const sortedKeys = Object.keys(obj).sort();
  const entries = sortedKeys.map(key => `${JSON.stringify(key)}:${canonicalizeJson(obj[key])}`);
  return `{${entries.join(',')}}`;
}

/**
 * Computes SHA-256 hex hash of a payload object.
 * @param {any} payload
 * @returns {string} 64-character lowercase hex string
 */
export function hashPayload(payload) {
  const canonical = canonicalizeJson(payload);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Generates an HMAC-SHA256 signed identity assertion for database session authentication.
 * Format: IDENTITY|<user_id>|<role>|<utc_iso_timestamp>|<nonce>
 * @param {string} userId - UUID
 * @param {string} role - 'customer' | 'admin'
 * @param {string} secretHex - 32-byte hex secret
 * @param {number} [lifetimeMs=30000] - Assertion lifetime in milliseconds (max 30s)
 * @returns {{ nonce: string, expiresAt: string, signature: Buffer }}
 */
export function generateHmacAssertion(userId, role, secretHex, lifetimeMs = 30000) {
  const nonce = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + Math.min(lifetimeMs, 30000));
  const canonical = `IDENTITY|${userId}|${role}|${expiresAt.toISOString()}|${nonce}`;
  
  const secretKey = Buffer.from(secretHex, 'hex');
  const signature = crypto.createHmac('sha256', secretKey)
    .update(Buffer.from(canonical, 'utf8'))
    .digest();

  return {
    nonce,
    expiresAt: expiresAt.toISOString(),
    signature,
    canonical,
  };
}

/**
 * Hashes a plaintext password using crypto.scrypt.
 * Format: scrypt:<salt_hex>:<hash_hex>
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`scrypt:${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verifies a password against a stored hash string.
 * Supports scrypt format and dev bcrypt fallback.
 * @param {string} password
 * @param {string} storedHash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, storedHash) {
  if (!storedHash) return false;

  if (storedHash.startsWith('scrypt:')) {
    const [, salt, originalHash] = storedHash.split(':');
    return new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) return reject(err);
        const derivedHash = derivedKey.toString('hex');
        try {
          resolve(crypto.timingSafeEqual(Buffer.from(derivedHash, 'hex'), Buffer.from(originalHash, 'hex')));
        } catch {
          resolve(false);
        }
      });
    });
  }

  return false;
}

/**
 * Signs a lightweight JWT token using HMAC-SHA256.
 * @param {object} payload
 * @param {string} secret
 * @param {number} [expiresInSeconds=86400]
 * @returns {string}
 */
export function signJwt(payload, secret, expiresInSeconds = 86400) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const fullPayload = { ...payload, exp, iat: Math.floor(Date.now() / 1000) };

  const encodeBase64Url = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64url');

  const headerB64 = encodeBase64Url(header);
  const payloadB64 = encodeBase64Url(fullPayload);
  const data = `${headerB64}.${payloadB64}`;

  const sig = crypto.createHmac('sha256', secret)
    .update(data)
    .digest('base64url');

  return `${data}.${sig}`;
}

/**
 * Verifies a JWT token and returns decoded payload.
 * @param {string} token
 * @param {string} secret
 * @returns {object|null}
 */
export function verifyJwt(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signature] = parts;
  const data = `${headerB64}.${payloadB64}`;

  const expectedSig = crypto.createHmac('sha256', secret)
    .update(data)
    .digest('base64url');

  if (signature.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}

