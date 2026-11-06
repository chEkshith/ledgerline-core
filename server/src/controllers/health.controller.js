import { checkSystemHealth } from '../services/health.service.js';

/**
 * Health Controller
 * Responds to GET /api/health with system & database reachability status.
 */
export async function getHealth(req, res, next) {
  try {
    const health = await checkSystemHealth();
    const httpStatus = health.status === 'UP' ? 200 : 503;
    res.status(httpStatus).json(health);
  } catch (error) {
    next(error);
  }
}

