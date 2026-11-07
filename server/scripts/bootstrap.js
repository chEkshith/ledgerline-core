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
