import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env relative to server root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
// Also try loading root .env if not found
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';

// In test environment, load isolated test environment settings (.env.test) with override
if (NODE_ENV === 'test') {
  dotenv.config({ path: path.resolve(__dirname, '../../.env.test'), override: true });
}

// -----------------------------------------------------------------------------
// Security Secret Validations
// -----------------------------------------------------------------------------
const hmacSecret = process.env.IDENTITY_HMAC_SECRET;
if (!hmacSecret || !/^[0-9a-fA-F]{64}$/.test(hmacSecret)) {
  throw new Error(
    'Startup configuration error: IDENTITY_HMAC_SECRET must be provided as exactly 32 cryptographically random bytes represented as hexadecimal (64 hex characters).'
  );
}

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error(
    'Startup configuration error: JWT_SECRET must be provided and must be at least 32 characters long.'
  );
}

// In production, reject empty or missing runtime database credentials
if (NODE_ENV === 'production') {
  if (!process.env.DB_PASSWORD) {
    throw new Error(
      'Production configuration error: DB_PASSWORD must be explicitly configured and non-empty in production.'
    );
  }
}

export const env = {
  NODE_ENV,
  PORT: parseInt(process.env.PORT, 10) || 5000,
  HOST: process.env.HOST || 'localhost',

  // Database settings - explicitly ledgerline_app runtime role
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT, 10) || 5432,
  DB_NAME: process.env.DB_NAME || 'ledgerline_dev',
  DB_USER: process.env.DB_USER || 'ledgerline_app',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX, 10) || 20,
  DB_IDLE_TIMEOUT_MS: parseInt(process.env.DB_IDLE_TIMEOUT_MS, 10) || 30000,
  DB_CONNECTION_TIMEOUT_MS: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS, 10) || 2000,

  // Client CORS
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  // Administrative / Migration credentials (Bootstrap and migration execution only)
  ADMIN_DB_USER: process.env.ADMIN_DB_USER || 'postgres',
  ADMIN_DB_PASSWORD: process.env.ADMIN_DB_PASSWORD || '',

  // Security Secrets
  IDENTITY_HMAC_SECRET: hmacSecret,
  JWT_SECRET: jwtSecret,
  HMAC_KEY_VERSION: parseInt(process.env.HMAC_KEY_VERSION, 10) || 1,

  // Initial Administrator Credentials (Bootstrap only)
  INITIAL_ADMIN_EMAIL: process.env.INITIAL_ADMIN_EMAIL || 'admin@ledgerline.local',
  INITIAL_ADMIN_PASSWORD: process.env.INITIAL_ADMIN_PASSWORD || '',
};
