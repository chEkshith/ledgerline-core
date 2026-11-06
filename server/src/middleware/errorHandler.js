import { env } from '../config/env.js';

/**
 * Central Error-Handling Middleware
 * Catches all unhandled synchronous and asynchronous exceptions in Express routes.
 * Prevents stack trace disclosure in production while returning standardized JSON.
 */
export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const statusCode = err.statusCode || (res.statusCode >= 400 ? res.statusCode : 500);

  // Structured server log for observability
  console.error(`[Error] ${req.method} ${req.originalUrl}:`, {
    message: err.message,
    statusCode,
    stack: env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      message: err.isOperational || env.NODE_ENV === 'development'
        ? err.message
        : 'An internal server error occurred. Please contact the administrator.',
      ...(env.NODE_ENV === 'development' && { stack: err.stack }),
    },
    timestamp: new Date().toISOString(),
  });
}

