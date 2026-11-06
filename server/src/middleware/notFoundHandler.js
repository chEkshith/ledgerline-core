/**
 * 404 Not Found Middleware
 * Handles requests to endpoints not defined in routes.
 */
export function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    error: {
      message: `Endpoint ${req.method} ${req.originalUrl} not found`,
    },
    timestamp: new Date().toISOString(),
  });
}

