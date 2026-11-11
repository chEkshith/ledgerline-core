/**
 * Pure PostgreSQL connection and TLS configuration helpers shared across
 * runtime services (db.js) and administrative scripts (migrate, bootstrap, verify_install).
 */

/**
 * Parses and validates the DB_SSL flag.
 * TLS certificate validation is never disabled; insecure values are rejected.
 *
 * @param {string|boolean|undefined|null} rawValue
 * @returns {boolean}
 */
export function parseDbSsl(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return false;
  }

  if (typeof rawValue === 'boolean') {
    return rawValue;
  }

  const normalized = String(rawValue).trim().toLowerCase();
  if (normalized === '' || normalized === 'false') {
    return false;
  }
  if (normalized === 'true') {
    return true;
  }

  throw new Error(
    `Startup configuration error: DB_SSL must be "true" or "false" when specified (received "${normalized}"). Disabling certificate validation is not permitted.`
  );
}

/**
 * Builds the node-postgres `ssl` option from DB_SSL.
 * When TLS is enabled, strict certificate chain & hostname validation is enforced.
 * When disabled, returns `false` explicitly so PGSSLMODE=no-verify cannot weaken TLS.
 *
 * @param {string|boolean|undefined|null} dbSsl
 * @returns {{ rejectUnauthorized: true } | false}
 */
export function buildDbSslConfig(dbSsl) {
  if (parseDbSsl(dbSsl)) {
    return { rejectUnauthorized: true };
  }
  return false;
}

/**
 * Builds the runtime Pool configuration for the least-privilege application role.
 *
 * @param {object} envConfig
 * @returns {object}
 */
export function buildRuntimePoolConfig(envConfig = {}) {
  return {
    host: envConfig.DB_HOST || 'localhost',
    port: Number(envConfig.DB_PORT) || 5432,
    database: envConfig.DB_NAME || 'ledgerline_dev',
    user: envConfig.DB_USER || 'ledgerline_app',
    password: envConfig.DB_PASSWORD ?? '',
    max: Number(envConfig.DB_POOL_MAX) || 20,
    idleTimeoutMillis: Number(envConfig.DB_IDLE_TIMEOUT_MS) || 30000,
    connectionTimeoutMillis: Number(envConfig.DB_CONNECTION_TIMEOUT_MS) || 2000,
    ssl: buildDbSslConfig(envConfig.DB_SSL),
  };
}

/**
 * Builds the administrative Client/Pool configuration for migrations,
 * bootstrap, and installation verification scripts.
 *
 * @param {object} envConfig
 * @returns {object}
 */
export function buildAdminDbConfig(envConfig = {}) {
  return {
    host: envConfig.DB_HOST || 'localhost',
    port: Number(envConfig.DB_PORT) || 5432,
    database: envConfig.DB_NAME || 'ledgerline_dev',
    user: envConfig.ADMIN_DB_USER || 'postgres',
    password: envConfig.ADMIN_DB_PASSWORD ?? '',
    ssl: buildDbSslConfig(envConfig.DB_SSL),
  };
}

