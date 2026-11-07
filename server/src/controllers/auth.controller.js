import * as authService from '../services/auth.service.js';

export async function register(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.registerCustomer(email, password);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function setStatus(req, res, next) {
  try {
    const { targetUserId, isActive, reason } = req.body;
    const result = await authService.setUserStatus(req.user.id, targetUserId, isActive, reason);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

