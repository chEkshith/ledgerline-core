import pg from 'pg';
import { env } from '../src/config/env.js';
import { buildAdminDbConfig } from '../src/config/dbConfig.js';

const { Pool } = pg;

async function verifyInstallation() {
  console.log(`Starting Database Installation & Security Catalog Audit on database: ${env.DB_NAME}...`);
  console.log(`TLS / SSL: ${env.DB_SSL ? 'enabled (certificate verification active)' : 'disabled'}`);
  const pool = new Pool(buildAdminDbConfig(env));

  try {
    // 1. Audit RLS on domain tables
    const expectedTables = [
      'users',
      'accounts',
      'account_memberships',
      'transactions',
      'ledger_postings',
      'idempotency_keys',
      'audit_logs',
    ];

    const rlsRes = await pool.query(`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1)
    `, [expectedTables]);

    console.log(`\n1. Auditing Row-Level Security (${rlsRes.rows.length}/${expectedTables.length} tables found):`);
    for (const row of rlsRes.rows) {
      console.log(`   - Table '${row.relname}': RLS=${row.relrowsecurity}, FORCE_RLS=${row.relforcerowsecurity}`);
      if (!row.relrowsecurity || !row.relforcerowsecurity) {
        throw new Error(`Security violation: Table ${row.relname} does not have FORCE ROW LEVEL SECURITY enabled!`);
      }
    }

    if (rlsRes.rows.length !== expectedTables.length) {
      throw new Error(`Missing domain tables! Expected ${expectedTables.length}, found ${rlsRes.rows.length}`);
    }

    // 2. Audit SECURITY DEFINER functions
    const funcRes = await pool.query(`
      SELECT 
        n.nspname AS schema_name,
        p.proname AS function_name,
        r.rolname AS owner,
        p.proconfig,
        has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute,
        has_function_privilege('ledgerline_app', p.oid, 'EXECUTE') AS app_execute,
        EXISTS (
          SELECT 1
          FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
          WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
        ) AS public_aclexplode_execute
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_roles r ON r.oid = p.proowner
      WHERE p.prosecdef = true
        AND n.nspname IN ('public', 'ledger_secure')
      ORDER BY n.nspname, p.proname;
    `);

    console.log(`\n2. Auditing SECURITY DEFINER functions (${funcRes.rows.length} found):`);
    for (const f of funcRes.rows) {
      if (f.public_execute || f.public_aclexplode_execute) {
        throw new Error(`Security violation: PUBLIC has EXECUTE on ${f.schema_name}.${f.function_name}!`);
      }
      const configStr = (f.proconfig || []).join('; ');
      if (!configStr.startsWith('search_path=pg_catalog') || !configStr.endsWith('pg_temp')) {
        throw new Error(`Security violation: ${f.schema_name}.${f.function_name} must prioritize pg_catalog and end with pg_temp!`);
      }
      console.log(`   - ${f.schema_name}.${f.function_name} | Owner: ${f.owner} | PUBLIC: false | Path: ${configStr}`);
    }

    console.log(`\n✔ All ${rlsRes.rows.length} domain tables have FORCE RLS enabled.`);
    console.log(`✔ All ${funcRes.rows.length} SECURITY DEFINER functions verified: 0 executable by PUBLIC, all hardened.`);
    console.log(`✔ Installation and security catalog audit PASSED.\n`);
  } finally {
    await pool.end();
  }
}

verifyInstallation().catch((err) => {
  console.error(`\n❌ Verification failed: ${err.message}`);
  process.exit(1);
});
