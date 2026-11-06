import { pool } from '../config/db.js';

/**
 * Health Service
 * Inspects system vitality and database connectivity using a SELECT 1 query.
 */
export async function checkSystemHealth() {
  const startTime = Date.now();
  let dbConnected = false;
  let dbLatencyMs = null;
  let dbError = null;
  let dbTime = null;

  try {
    const result = await pool.query('SELECT 1 AS alive, NOW() AS db_time');
    dbLatencyMs = Date.now() - startTime;
    dbConnected = result.rows && result.rows.length > 0 && result.rows[0].alive === 1;
    dbTime = result.rows[0]?.db_time || null;
  } catch (error) {
    dbLatencyMs = Date.now() - startTime;
    dbConnected = false;
    dbError = error.message;
  }

  const isHealthy = dbConnected;

  return {
    status: isHealthy ? 'UP' : 'DEGRADED',
    service: 'ledgerline-server',
    version: '1.0.0',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: {
      status: dbConnected ? 'CONNECTED' : 'DISCONNECTED',
      driver: 'node-postgres (pg)',
      latencyMs: dbLatencyMs,
      serverTime: dbTime,
      ...(dbError && { error: dbError }),
    },
  };
}

