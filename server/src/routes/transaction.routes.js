import { Router } from 'express';
import * as transactionController from '../controllers/transaction.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

// Core generic transaction processor
router.post('/', transactionController.handleTransaction);

// Explicit convenience financial endpoints
router.post('/deposit', transactionController.deposit);
router.post('/withdraw', transactionController.withdraw);
router.post('/transfer', transactionController.transfer);
router.post('/:id/reverse', transactionController.reverse);

// Transaction read endpoint
router.get('/:id', transactionController.getTransaction);

export default router;
