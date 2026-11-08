import pkg from 'pg';
const { Client } = pkg;
import { env } from '../src/config/env.js';
import { hashPassword } from '../src/utils/crypto.js';

/**
 * LedgerLine Secure Database Bootstrap Procedure
 * 
 * Provisions:
 * 1. Runtime application database password for ledgerline_app.
 * 2. Versioned HMAC authentication secret in ledger_secure.auth_secrets.
 * 3. Initial administrator user with scrypt password hash.
 * 
 * Never logs or prints sensitive credentials or secrets.
 */
export async function bootstrapDatabase() {
  console.log('--- Starting Secure Database Bootstrap ---');
  console.log(`Database: ${env.DB_NAME} on ${env.DB_HOST}:${env.DB_PORT}`);
  console.log(`Administrative User: ${env.ADMIN_DB_USER}`);

  if (env.NODE_ENV === 'production') {
    if (!process.env.ADMIN_DB_USER || !process.env.ADMIN_DB_PASSWORD) {
      throw new Error(
        'Production security error: ADMIN_DB_USER and ADMIN_DB_PASSWORD must be explicitly provided in production.'
      );
    }
    if (!process.env.INITIAL_ADMIN_PASSWORD || process.env.INITIAL_ADMIN_PASSWORD.length < 12) {
      throw new Error(
        'Production security error: INITIAL_ADMIN_PASSWORD must be explicitly provided and at least 12 characters in production.'
      );
    }
  }

  const client = new Client({
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.ADMIN_DB_USER,
    password: env.ADMIN_DB_PASSWORD,
  });

  try {
    await client.connect();
    console.log('Connected successfully as administrator.');

    // Verify connected database identity matches environment
    const dbRes = await client.query(
      'SELECT host(inet_server_addr()) AS server_ip, inet_server_port() AS server_port, current_database() AS db_name'
    );
    const { server_ip, db_name: connectedDb } = dbRes.rows[0] || {};
    if (env.NODE_ENV === 'test' && connectedDb !== 'ledgerline_test') {
      throw new Error(
        `CRITICAL TEST ISOLATION FAILURE: Connected database is '${connectedDb}', but test bootstrap is restricted to 'ledgerline_test'.`
      );
    }
    if (env.NODE_ENV === 'test' && server_ip && server_ip !== '127.0.0.1' && server_ip !== '::1') {
      throw new Error(
        `CRITICAL TEST ISOLATION FAILURE: Connected server IP is '${server_ip}', expected local test host 127.0.0.1.`
      );
    }

    await client.query('BEGIN');

    // 1. Configure runtime database role password
    if (env.DB_PASSWORD) {
      const escapedPw = env.DB_PASSWORD.replace(/'/g, "''");
      await client.query(`ALTER ROLE ledgerline_app WITH PASSWORD '${escapedPw}'`);
      console.log('[PROVISIONED] Runtime database role password updated.');
    }

    // 2. Versioned HMAC Secret Provisioning
    const keyVersion = env.HMAC_KEY_VERSION || 1;
    await client.query(`
      INSERT INTO ledger_secure.auth_secrets (key_version, secret_bytes, is_active)
      VALUES ($1, decode($2, 'hex'), true)
      ON CONFLICT (key_version) DO UPDATE
         SET secret_bytes = EXCLUDED.secret_bytes,
             is_active = true,
             created_at = clock_timestamp();
    `, [keyVersion, env.IDENTITY_HMAC_SECRET]);

    // Deactivate previous key versions if rotating
    await client.query(`
      UPDATE ledger_secure.auth_secrets
         SET is_active = false
       WHERE key_version != $1;
    `, [keyVersion]);
    console.log(`[PROVISIONED] Versioned HMAC authentication secret activated (version ${keyVersion}).`);

    // 3. Provision Initial Administrator User using application scrypt hashing
    if (env.INITIAL_ADMIN_EMAIL && env.INITIAL_ADMIN_PASSWORD) {
      const passwordHash = await hashPassword(env.INITIAL_ADMIN_PASSWORD);
      await client.query(`
        INSERT INTO public.users (id, email, password_hash, role, is_active)
        VALUES ('00000000-0000-0000-0000-000000000002', LOWER(TRIM($1)), $2, 'admin', true)
        ON CONFLICT (email) DO UPDATE
           SET password_hash = EXCLUDED.password_hash,
               role = 'admin',
               is_active = true,
               updated_at = clock_timestamp();
      `, [env.INITIAL_ADMIN_EMAIL, passwordHash]);
      console.log(`[PROVISIONED] Initial administrator user provisioned (${env.INITIAL_ADMIN_EMAIL}).`);
    }

    await client.query('COMMIT');
    console.log('--- Secure Database Bootstrap Completed Successfully ---');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Bootstrap failed:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

// Allow direct CLI execution: node server/scripts/bootstrap.js
if (process.argv[1] && process.argv[1].endsWith('bootstrap.js')) {
  bootstrapDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
