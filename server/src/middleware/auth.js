import { verifyJwt } from '../utils/crypto.js';
import { env } from '../config/env.js';

/**
 * Authentication Middleware
 * Validates JWT bearer token and sets req.user.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication token required',
    });
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyJwt(token, env.JWT_SECRET);

  if (!payload || !payload.id || !payload.role) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired authentication token',
    });
  }

  req.user = {
    id: payload.id,
    email: payload.email,
    role: payload.role,
  };

  next();
}

/**
 * Role-Based Access Control Middleware
 * @param  {...string} allowedRoles
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient privileges for this operation',
      });
    }
    next();
  };
}

