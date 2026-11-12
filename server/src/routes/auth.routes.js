import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', requireAuth, authController.getMe);
router.patch('/status', requireAuth, requireRole('admin'), authController.setStatus);

export default router;

