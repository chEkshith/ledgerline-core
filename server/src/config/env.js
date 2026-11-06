import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env relative to server root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5000,
  HOST: process.env.HOST || 'localhost',

  // Database settings
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT, 10) || 5432,
  DB_NAME: process.env.DB_NAME || 'postgres',
  DB_USER: process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX, 10) || 20,
  DB_IDLE_TIMEOUT_MS: parseInt(process.env.DB_IDLE_TIMEOUT_MS, 10) || 30000,
  DB_CONNECTION_TIMEOUT_MS: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS, 10) || 2000,

  // Client CORS
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
};

