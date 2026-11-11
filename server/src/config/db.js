import pkg from 'pg';
const { Pool } = pkg;
import { env } from './env.js';
import { buildRuntimePoolConfig } from './dbConfig.js';

/**
 * PostgreSQL Connection Pool configuration
 * Uses node-postgres (pg) Pool to manage reusable database connections.
 */
export const pool = new Pool(buildRuntimePoolConfig(env));

// Pool-level error handling for idle clients
pool.on('error', (err) => {
  console.error('[DB Pool Error] Unexpected idle client error:', err.message);
});

/**
 * Helper to run parameterized SQL queries using the connection pool
 * @param {string} text - SQL statement with parameterized placeholders ($1, $2, etc.)
 * @param {Array} [params] - Query parameter array
 * @returns {Promise<pkg.QueryResult>}
 */
export const query = (text, params) => pool.query(text, params);

export default {
  pool,
  query,
};

