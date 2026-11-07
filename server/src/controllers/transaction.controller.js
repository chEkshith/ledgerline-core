import * as transactionService from '../services/transaction.service.js';

export async function handleTransaction(req, res, next) {
  try {
    const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
    const result = await transactionService.processTransactionRequest({
      userId: req.user.id,
      role: req.user.role,
      idempotencyKey,
      method: req.method,
      path: req.originalUrl || req.baseUrl + req.path,
      body: req.body,
    });

    if (result.isIdempotentReplay) {
      res.setHeader('Idempotent-Replay', 'true');
    }

    res.status(result.statusCode).json(result.body);
  } catch (err) {
    next(err);
  }
}

export async function deposit(req, res, next) {
  req.body = { ...req.body, type: 'deposit' };
  return handleTransaction(req, res, next);
}

export async function withdraw(req, res, next) {
  req.body = { ...req.body, type: 'withdrawal' };
  return handleTransaction(req, res, next);
}

export async function transfer(req, res, next) {
  req.body = { ...req.body, type: 'transfer' };
  return handleTransaction(req, res, next);
}

export async function reverse(req, res, next) {
  req.body = {
    ...req.body,
    type: 'reversal',
    originalTransactionId: req.params.id,
  };
  return handleTransaction(req, res, next);
}

export async function getTransaction(req, res, next) {
  try {
    const result = await transactionService.getTransactionById({
      userId: req.user.id,
      role: req.user.role,
      transactionId: req.params.id,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}
