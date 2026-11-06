import app from './app.js';
import { env } from './config/env.js';
import { pool } from './config/db.js';

const server = app.listen(env.PORT, () => {
  console.log(`=========================================`);
  console.log(` LedgerLine Server Running`);
  console.log(` Environment : ${env.NODE_ENV}`);
  console.log(` Port        : ${env.PORT}`);
  console.log(` Health API  : http://localhost:${env.PORT}/api/health`);
  console.log(` CORS Origin : ${env.CLIENT_ORIGIN}`);
  console.log(`=========================================`);

  // Verify initial database connectivity
  pool.query('SELECT 1 AS alive, NOW() AS db_time')
    .then((res) => {
      console.log(`[Database] PostgreSQL connection verified at: ${res.rows[0].db_time}`);
    })
    .catch((err) => {
      console.warn(`[Database Warning] Unable to connect to PostgreSQL: ${err.message}`);
      console.warn(`[Database Warning] Verify that PostgreSQL is running on ${env.DB_HOST}:${env.DB_PORT} and credentials in server/.env are valid.`);
    });
});

// Graceful shutdown handling
function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}. Gracefully terminating LedgerLine server...`);
  server.close(async () => {
    console.log('HTTP server closed.');
    try {
      await pool.end();
      console.log('PostgreSQL pool drained.');
      process.exit(0);
    } catch (err) {
      console.error('Error during pool shutdown:', err.message);
      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

