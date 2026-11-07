import { query } from '../config/db.js';
import { env } from '../config/env.js';
import { hashPassword, verifyPassword, signJwt } from '../utils/crypto.js';
import { executeWithSession } from '../utils/sessionContext.js';

export async function registerCustomer(email, password) {
  if (!email || !password || password.length < 8) {
    const err = new Error('Email and password (minimum 8 characters) are required');
    err.status = 400;
    throw err;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const passwordHash = await hashPassword(password);

  try {
    const res = await query(
      'SELECT public.register_customer_user($1, $2) AS user_id',
      [normalizedEmail, passwordHash]
    );
    const userId = res.rows[0].user_id;

    const token = signJwt({ id: userId, email: normalizedEmail, role: 'customer' }, env.JWT_SECRET);
    return {
      user: {
        id: userId,
        email: normalizedEmail,
        role: 'customer',
      },
      token,
    };
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      const conflictErr = new Error('A user with this email address already exists');
      conflictErr.status = 409;
      throw conflictErr;
    }
    throw err;
  }
}

export async function login(email, password) {
  if (!email || !password) {
    const err = new Error('Email and password are required');
    err.status = 400;
    throw err;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const res = await query(
    'SELECT * FROM ledger_secure.get_auth_credentials($1)',
    [normalizedEmail]
  );

  if (res.rowCount === 0) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }

  const user = res.rows[0];

  if (!user.is_active) {
    const err = new Error('User account is suspended');
    err.status = 403;
    throw err;
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }

  const token = signJwt(
    { id: user.user_id, email: normalizedEmail, role: user.role },
    env.JWT_SECRET
  );

  return {
    user: {
      id: user.user_id,
      email: normalizedEmail,
      role: user.role,
    },
    token,
  };
}

export async function setUserStatus(adminUserId, targetUserId, isActive, reason) {
  return executeWithSession(adminUserId, 'admin', async (client) => {
    await client.query(
      'SELECT public.set_user_status($1, $2, $3)',
      [targetUserId, isActive, reason]
    );
    return { success: true, targetUserId, isActive };
  });
}

