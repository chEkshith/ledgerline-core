import { Router } from 'express';
import * as accountController from '../controllers/account.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.post('/', accountController.createAccount);
router.get('/', accountController.listAccounts);
router.get('/:id', accountController.getAccount);
router.get('/:id/statement', accountController.getAccountStatement);
router.patch('/:id/status', accountController.updateStatus);
router.post('/:id/memberships', accountController.assignMembership);
router.delete('/:id/memberships/:userId', accountController.revokeMembership);

export default router;

