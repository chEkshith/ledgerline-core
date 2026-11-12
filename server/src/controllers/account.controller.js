import * as accountService from '../services/account.service.js';

export async function createAccount(req, res, next) {
  try {
    const { accountNumber, currency } = req.body;
    const result = await accountService.createCustomerAccount(
      req.user.id,
      req.user.role,
      accountNumber,
      currency
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function updateStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    const result = await accountService.updateAccountStatus(
      req.user.id,
      req.user.role,
      id,
      status,
      reason
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function listMemberships(req, res, next) {
  try {
    const { id } = req.params;
    const result = await accountService.listAccountMemberships(
      req.user.id,
      req.user.role,
      id
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function assignMembership(req, res, next) {
  try {
    const { id } = req.params;
    const { targetUserId, role } = req.body;
    const result = await accountService.assignMembership(
      req.user.id,
      req.user.role,
      id,
      targetUserId,
      role
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function revokeMembership(req, res, next) {
  try {
    const { id, userId } = req.params;
    const result = await accountService.revokeMembership(
      req.user.id,
      req.user.role,
      id,
      userId
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getAccount(req, res, next) {
  try {
    const { id } = req.params;
    const result = await accountService.getAccountDetails(
      req.user.id,
      req.user.role,
      id
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function listAccounts(req, res, next) {
  try {
    const result = await accountService.listUserAccounts(
      req.user.id,
      req.user.role
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getAccountStatement(req, res, next) {
  try {
    const { id } = req.params;
    const { limit, offset } = req.query;
    const result = await accountService.getAccountStatement(
      req.user.id,
      req.user.role,
      id,
      limit,
      offset
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

