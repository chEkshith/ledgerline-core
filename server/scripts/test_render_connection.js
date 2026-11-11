import pkg from 'pg';
const { Client } = pkg;
import { buildAdminDbConfig, parseDbSsl } from '../src/config/dbConfig.js';

const EXPECTED_DATABASE = 'ledgerline_prod';
const REQUIRED_ENV_VARS = ['DB_HOST', 'DB_NAME', 'ADMIN_DB_USER', 'ADMIN_DB_PASSWORD', 'DB_SSL'];

/**
 * Validates required environment variables from process.env without falling back
 * to local .env dev defaults and without ever printing secret values.
 */
export function validateRenderTestEnv(sourceEnv = process.env) {
  const missing = [];

  for (const name of REQUIRED_ENV_VARS) {
    const val = sourceEnv[name];
    if (val === undefined || String(val).trim() === '') {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    return { ok: false, reason: 'missing', missing };
  }

  let sslEnabled = false;
  try {
    sslEnabled = parseDbSsl(sourceEnv.DB_SSL);
  } catch {
    return { ok: false, reason: 'invalid_ssl' };
  }

  if (!sslEnabled) {
    return { ok: false, reason: 'ssl_not_true' };
  }

  const host = String(sourceEnv.DB_HOST).trim().toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return { ok: false, reason: 'local_host' };
  }

  if (String(sourceEnv.DB_NAME).trim() !== EXPECTED_DATABASE) {
    return { ok: false, reason: 'unexpected_database' };
  }

  return { ok: true };
}

export async function runRenderConnectionTest(sourceEnv = process.env) {
  const validation = validateRenderTestEnv(sourceEnv);
  if (!validation.ok) {
    if (validation.reason === 'missing') {
      console.error(`Missing required environment variables: ${validation.missing.join(', ')}`);
    } else if (validation.reason === 'invalid_ssl' || validation.reason === 'ssl_not_true') {
      console.error('Configuration error: DB_SSL must be set explicitly to "true" for external TLS verification.');
    } else if (validation.reason === 'local_host') {
      console.error('Configuration error: DB_HOST must point to the external Render PostgreSQL host, not localhost.');
    } else if (validation.reason === 'unexpected_database') {
      console.error(`Configuration error: DB_NAME must be "${EXPECTED_DATABASE}".`);
    }
    return { success: false, validation };
  }

  const clientConfig = buildAdminDbConfig({
    ...sourceEnv,
    DB_SSL: 'true',
  });

  const client = new Client({
    ...clientConfig,
    connectionTimeoutMillis: 10000,
    statement_timeout: 5000,
  });

  try {
    await client.connect();

    const identityRes = await client.query('SELECT current_database(), current_user, version()');
    const sslRes = await client.query(
      'SELECT ssl, version AS tls_version, cipher FROM pg_stat_ssl WHERE pid = pg_backend_pid()'
    );

    const identity = identityRes.rows[0] || {};
    const serverSsl = sslRes.rows[0] || {};
    const stream = client.connection && client.connection.stream;
    const clientTlsEncrypted = Boolean(stream && stream.encrypted);
    const clientTlsAuthorized = Boolean(stream && stream.authorized);

    const databaseMatches = identity.current_database === EXPECTED_DATABASE;
    const sslVerified = Boolean(serverSsl.ssl) && clientTlsEncrypted && clientTlsAuthorized;

    console.log(
      JSON.stringify(
        {
          connected: true,
          database: identity.current_database || null,
          database_is_ledgerline_prod: databaseMatches,
          current_user: identity.current_user || null,
          postgres_version: identity.version || null,
          ssl_active_server: Boolean(serverSsl.ssl),
          tls_version: serverSsl.tls_version || null,
          tls_cipher: serverSsl.cipher || null,
          tls_client_encrypted: clientTlsEncrypted,
          tls_certificate_authorized: clientTlsAuthorized,
        },
        null,
        2
      )
    );

    if (!databaseMatches || !sslVerified) {
      return { success: false, identity, serverSsl, clientTlsEncrypted, clientTlsAuthorized };
    }

    return { success: true, identity, serverSsl, clientTlsEncrypted, clientTlsAuthorized };
  } catch (err) {
    console.error(`Connection failed (${err.code || 'ERROR'}): ${err.message}`);
    return { success: false, errorCode: err.code || 'ERROR', errorMessage: err.message };
  } finally {
    await client.end().catch(() => {});
  }
}

if (process.argv[1] && process.argv[1].endsWith('test_render_connection.js')) {
  runRenderConnectionTest()
    .then((result) => process.exit(result.success ? 0 : 1))
    .catch((err) => {
      console.error(`Connection check aborted (${err.code || 'ERROR'}): ${err.message}`);
      process.exit(1);
    });
}

