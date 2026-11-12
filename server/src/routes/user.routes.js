import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/', requireRole('admin'), authController.listUsers);

export default router;

