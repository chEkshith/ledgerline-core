import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';
const { Client, Pool } = pkg;

import {
  parseDbSsl,
  buildDbSslConfig,
  buildRuntimePoolConfig,
  buildAdminDbConfig,
} from '../src/config/dbConfig.js';
import { validateRenderTestEnv } from '../scripts/test_render_connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');

describe('PostgreSQL TLS / DB_SSL Configuration Suite', () => {
  it('1. parseDbSsl defaults to false when unset or explicitly false', () => {
    assert.equal(parseDbSsl(undefined), false);
    assert.equal(parseDbSsl(null), false);
    assert.equal(parseDbSsl(''), false);
    assert.equal(parseDbSsl('   '), false);
    assert.equal(parseDbSsl('false'), false);
    assert.equal(parseDbSsl(' FALSE '), false);
    assert.equal(parseDbSsl(false), false);
  });

  it('2. parseDbSsl enables TLS strictly when DB_SSL=true', () => {
    assert.equal(parseDbSsl('true'), true);
    assert.equal(parseDbSsl(' TRUE '), true);
    assert.equal(parseDbSsl(true), true);
  });

  it('3. parseDbSsl rejects invalid or insecure values such as no-verify', () => {
    for (const invalid of ['no-verify', 'insecure', 'disable', 'require', 'yes', '1', '0', 'invalid']) {
      assert.throws(
        () => parseDbSsl(invalid),
        /Startup configuration error: DB_SSL must be "true" or "false"/,
        `Should reject unsupported DB_SSL value: ${invalid}`
      );
    }
  });

  it('4. buildDbSslConfig never disables certificate validation', () => {
    assert.deepEqual(buildDbSslConfig(true), { rejectUnauthorized: true });
    assert.deepEqual(buildDbSslConfig('true'), { rejectUnauthorized: true });
    assert.equal(buildDbSslConfig(false), false);
    assert.equal(buildDbSslConfig(undefined), false);
  });

  it('5. buildAdminDbConfig and buildRuntimePoolConfig wire TLS for external hosts', () => {
    const sampleEnv = {
      DB_HOST: 'example-postgres.render.com',
      DB_PORT: 5432,
      DB_NAME: 'ledgerline_prod',
      DB_USER: 'ledgerline_app',
      DB_PASSWORD: 'app_password_placeholder',
      ADMIN_DB_USER: 'render_admin',
      ADMIN_DB_PASSWORD: 'admin_password_placeholder',
      DB_POOL_MAX: 10,
      DB_IDLE_TIMEOUT_MS: 30000,
      DB_CONNECTION_TIMEOUT_MS: 5000,
      DB_SSL: 'true',
    };

    const adminCfg = buildAdminDbConfig(sampleEnv);
    assert.equal(adminCfg.host, 'example-postgres.render.com');
    assert.equal(adminCfg.port, 5432);
    assert.equal(adminCfg.database, 'ledgerline_prod');
    assert.equal(adminCfg.user, 'render_admin');
    assert.deepEqual(adminCfg.ssl, { rejectUnauthorized: true });

    const runtimeCfg = buildRuntimePoolConfig(sampleEnv);
    assert.equal(runtimeCfg.user, 'ledgerline_app');
    assert.equal(runtimeCfg.max, 10);
    assert.deepEqual(runtimeCfg.ssl, { rejectUnauthorized: true });
  });

  it('6. pg Client and Pool preserve strict certificate validation even if PGSSLMODE=no-verify is set', async () => {
    const prevPgSslMode = process.env.PGSSLMODE;
    process.env.PGSSLMODE = 'no-verify';

    try {
      const tlsAdminClient = new Client(buildAdminDbConfig({ DB_HOST: 'db.example.com', DB_SSL: 'true' }));
      assert.deepEqual(tlsAdminClient.connectionParameters.ssl, { rejectUnauthorized: true });

      const nonTlsAdminClient = new Client(buildAdminDbConfig({ DB_HOST: 'localhost', DB_SSL: 'false' }));
      assert.equal(nonTlsAdminClient.connectionParameters.ssl, false);

      const defaultAdminClient = new Client(buildAdminDbConfig({ DB_HOST: 'localhost' }));
      assert.equal(defaultAdminClient.connectionParameters.ssl, false);

      const tlsPool = new Pool(buildRuntimePoolConfig({ DB_HOST: 'db.example.com', DB_SSL: 'true' }));
      assert.deepEqual(tlsPool.options.ssl, { rejectUnauthorized: true });
      await tlsPool.end();
    } finally {
      if (prevPgSslMode === undefined) {
        delete process.env.PGSSLMODE;
      } else {
        process.env.PGSSLMODE = prevPgSslMode;
      }
    }
  });

  it('7. env.js and db.js honor DB_SSL=true and reject DB_SSL=no-verify at startup', () => {
    const out = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import { env } from './src/config/env.js'; import { pool } from './src/config/db.js'; console.log(JSON.stringify({ dbSsl: env.DB_SSL, poolSsl: pool.options.ssl })); await pool.end();",
      ],
      {
        cwd: serverRoot,
        env: { ...process.env, DB_SSL: 'true' },
        encoding: 'utf8',
      }
    ).trim();

    assert.deepEqual(JSON.parse(out), {
      dbSsl: true,
      poolSsl: { rejectUnauthorized: true },
    });

    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          ['--input-type=module', '-e', "import './src/config/env.js';"],
          {
            cwd: serverRoot,
            env: { ...process.env, DB_SSL: 'no-verify' },
            encoding: 'utf8',
            stdio: 'pipe',
          }
        ),
      (err) => /DB_SSL must be "true" or "false"/.test(err.stderr || err.message)
    );
  });

  it('8. All three admin scripts and db.js share dbConfig without disabling certificate validation', () => {
    const targets = [
      'scripts/migrate.js',
      'scripts/bootstrap.js',
      'scripts/verify_install.js',
      'src/config/db.js',
      'src/config/dbConfig.js',
    ];

    for (const rel of targets) {
      const content = fs.readFileSync(path.join(serverRoot, rel), 'utf8');
      assert.equal(
        /rejectUnauthorized\s*:\s*false/.test(content),
        false,
        `${rel} must never disable TLS certificate validation`
      );
    }

    for (const scriptRel of ['scripts/migrate.js', 'scripts/bootstrap.js', 'scripts/verify_install.js', 'scripts/test_render_connection.js']) {
      const content = fs.readFileSync(path.join(serverRoot, scriptRel), 'utf8');
      assert.match(content, /buildAdminDbConfig\(/, `${scriptRel} must use shared buildAdminDbConfig`);
      assert.equal(
        /rejectUnauthorized\s*:\s*false/.test(content),
        false,
        `${scriptRel} must never disable TLS certificate validation`
      );
    }
  });

  it('9. validateRenderTestEnv enforces Render external host, ledgerline_prod, DB_SSL=true, and non-empty credentials', () => {
    const emptyCheck = validateRenderTestEnv({});
    assert.equal(emptyCheck.ok, false);
    assert.equal(emptyCheck.reason, 'missing');
    assert.deepEqual(emptyCheck.missing, [
      'DB_HOST',
      'DB_NAME',
      'ADMIN_DB_USER',
      'ADMIN_DB_PASSWORD',
      'DB_SSL',
    ]);

    assert.equal(
      validateRenderTestEnv({
        DB_HOST: '127.0.0.1',
        DB_NAME: 'ledgerline_prod',
        ADMIN_DB_USER: 'render_admin',
        ADMIN_DB_PASSWORD: 'test_placeholder_value',
        DB_SSL: 'true',
      }).reason,
      'local_host'
    );

    assert.equal(
      validateRenderTestEnv({
        DB_HOST: 'dpg-example.render.com',
        DB_NAME: 'ledgerline_dev',
        ADMIN_DB_USER: 'render_admin',
        ADMIN_DB_PASSWORD: 'test_placeholder_value',
        DB_SSL: 'true',
      }).reason,
      'unexpected_database'
    );

    assert.equal(
      validateRenderTestEnv({
        DB_HOST: 'dpg-example.render.com',
        DB_NAME: 'ledgerline_prod',
        ADMIN_DB_USER: 'render_admin',
        ADMIN_DB_PASSWORD: 'test_placeholder_value',
        DB_SSL: 'false',
      }).reason,
      'ssl_not_true'
    );

    assert.deepEqual(
      validateRenderTestEnv({
        DB_HOST: 'dpg-example.render.com',
        DB_NAME: 'ledgerline_prod',
        ADMIN_DB_USER: 'render_admin',
        ADMIN_DB_PASSWORD: 'test_placeholder_value',
        DB_SSL: 'true',
      }),
      { ok: true }
    );
  });
});

