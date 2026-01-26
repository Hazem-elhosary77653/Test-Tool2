const pool = require('../db/connection');
const crypto = require('crypto');
const { hashPassword } = require('../utils/auth');
const { logAuditAction } = require('../utils/audit');

// Generate password reset token
const generateResetToken = async (userId) => {
  try {
    // Generate random token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour from now

    // Store token in database
    const result = await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at, created_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       RETURNING id, token, expires_at`,
      [userId, token, expiresAt]
    );

    return result.rows[0];
  } catch (err) {
    console.error('Generate reset token error:', err);
    throw err;
  }
};

// Verify reset token
const verifyResetToken = async (token) => {
  try {
    const result = await pool.query(
      `SELECT id, user_id, expires_at, used_at
       FROM password_reset_tokens
       WHERE token = $1`,
      [token]
    );

    if (!result.rows.length) {
      throw new Error('Invalid token');
    }

    const tokenData = result.rows[0];

    // Check if token has expired
    if (new Date(tokenData.expires_at) < new Date()) {
      throw new Error('Token has expired');
    }

    // Check if token has already been used
    if (tokenData.used_at) {
      throw new Error('Token has already been used');
    }

    return tokenData;
  } catch (err) {
    console.error('Verify reset token error:', err);
    throw err;
  }
};

// Reset password with token
const resetPasswordWithToken = async (token, newPassword) => {
  try {
    const tokenData = await verifyResetToken(token);

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update user password
    await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [passwordHash, tokenData.user_id]
    );

    // Mark token as used
    await pool.query(
      `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [tokenData.id]
    );

    // Log audit
    await logAuditAction(
      tokenData.user_id,
      'PASSWORD_RESET',
      'user',
      tokenData.user_id,
      null,
      { method: 'reset_token' }
    );

    return { success: true, message: 'Password reset successfully' };
  } catch (err) {
    console.error('Reset password error:', err);
    throw err;
  }
};

// Clean up expired tokens
const cleanupExpiredTokens = async () => {
  try {
    const result = await pool.query(
      `DELETE FROM password_reset_tokens
       WHERE expires_at < CURRENT_TIMESTAMP AND used_at IS NULL`
    );

    console.log(`Cleaned up ${result.rowCount} expired tokens`);
    return result.rowCount;
  } catch (err) {
    console.error('Cleanup expired tokens error:', err);
    throw err;
  }
};

module.exports = {
  generateResetToken,
  verifyResetToken,
  resetPasswordWithToken,
  cleanupExpiredTokens
};
