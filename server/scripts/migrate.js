import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
const { Client } = pkg;
import { env } from '../src/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATION_ADVISORY_LOCK_ID = 987654321;

async function runMigrations() {
  console.log('--- Starting LedgerLine Database Migration ---');
  console.log(`Target Database: ${env.DB_NAME} on ${env.DB_HOST}:${env.DB_PORT}`);
  console.log(`Connecting as Administrator: ${env.ADMIN_DB_USER}`);

  const client = new Client({
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.ADMIN_DB_USER,
    password: env.ADMIN_DB_PASSWORD,
  });

  let lockAcquired = false;

  try {
    await client.connect();
    console.log('Connected successfully as administrator.');

    // 1. Acquire migration advisory lock on the persistent client connection
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_ADVISORY_LOCK_ID]);
    lockAcquired = true;
    console.log(`Acquired migration advisory lock (lock_id=${MIGRATION_ADVISORY_LOCK_ID}).`);

    // 2. Create schema migrations tracking table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS public._schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
      );
    `);

    const migrationsDir = path.resolve(__dirname, '../../database/migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`Found ${files.length} migration files in ${migrationsDir}`);

    for (const file of files) {
      const res = await client.query('SELECT 1 FROM public._schema_migrations WHERE version = $1', [file]);
      if (res.rowCount > 0) {
        console.log(`[SKIPPED] ${file} (already applied)`);
        continue;
      }

      console.log(`[APPLYING] ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO public._schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[SUCCESS]  ${file} applied successfully.`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[FAILED]   ${file} failed: ${err.message}`);
        throw err;
      }
    }

    // 3. Run seeds
    const seedDir = path.resolve(__dirname, '../../database/seed');
    if (fs.existsSync(seedDir)) {
      const seedFiles = fs.readdirSync(seedDir).filter(f => f.endsWith('.sql')).sort();
      for (const seedFile of seedFiles) {
        console.log(`[SEEDING]  ${seedFile}...`);
        const seedPath = path.join(seedDir, seedFile);
        const seedSql = fs.readFileSync(seedPath, 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(seedSql);
          await client.query('COMMIT');
          console.log(`[SUCCESS]  ${seedFile} executed successfully.`);
        } catch (seedErr) {
          await client.query('ROLLBACK');
          console.error(`[FAILED]   Seed ${seedFile} failed: ${seedErr.message}`);
          throw seedErr;
        }
      }
    }

    console.log('--- All Migrations and Seeds Completed Successfully ---');
  } catch (error) {
    console.error('Migration aborted due to error:', error.message);
    process.exit(1);
  } finally {
    if (lockAcquired) {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_ADVISORY_LOCK_ID]);
        console.log('Released migration advisory lock.');
      } catch (unlockErr) {
        console.error('Error releasing advisory lock:', unlockErr.message);
      }
    }
    await client.end();
  }
}

runMigrations();
