import { env } from '../config/env.js';
import { mapSqlErrorStatus } from '../utils/sqlError.js';

/**
 * Central Error-Handling Middleware
 * Catches all unhandled synchronous and asynchronous exceptions in Express routes.
 * Prevents stack trace disclosure in production while returning standardized JSON.
 */
export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const mappedSqlStatus = !err.status && !err.statusCode ? mapSqlErrorStatus(err) : null;
  const statusCode =
    err.status ||
    err.statusCode ||
    mappedSqlStatus ||
    (res.statusCode >= 400 ? res.statusCode : 500);
  const exposeMessage =
    err.isOperational ||
    (mappedSqlStatus !== null && mappedSqlStatus >= 400 && mappedSqlStatus < 500) ||
    env.NODE_ENV === 'development';

  // Structured server log for observability
  console.error(`[Error] ${req.method} ${req.originalUrl}:`, {
    message: err.message,
    statusCode,
    stack: env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      message: exposeMessage
        ? err.message
        : 'An internal server error occurred. Please contact the administrator.',
      ...(env.NODE_ENV === 'development' && { stack: err.stack }),
    },
    timestamp: new Date().toISOString(),
  });
}

