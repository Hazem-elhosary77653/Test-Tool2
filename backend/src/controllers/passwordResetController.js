const pool = require('../db/connection');
const { logUserActivity } = require('../services/activityService');
const { logAuditAction } = require('../utils/audit');
const { hashPassword } = require('../utils/auth');
const { sendEmail } = require('../services/emailService');
const { verifyResetToken, resetPasswordWithToken, cleanupExpiredTokens } = require('../services/passwordResetService');
const crypto = require('crypto');

// Generate password reset token
const generateResetToken = async (userId) => {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour from now

  // Store token in database
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at, created_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
    [userId, token, expiresAt.toISOString()]
  );

  return token;
};

// Request password reset - generates token and sends reset link via email
const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find user by email
    const result = await pool.query(
      `SELECT id, email, first_name, last_name FROM users WHERE email = $1`,
      [email]
    );

    if (!result.rows.length) {
      // Don't reveal if email exists for security reasons
      return res.json({
        success: true,
        message: 'If the email exists, a password reset link has been sent'
      });
    }

    const user = result.rows[0];
    const userName = user.first_name || user.email.split('@')[0];

    // Generate reset token
    const token = await generateResetToken(user.id);

    // Create reset link
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const resetLink = `${appUrl}/reset-password?token=${token}`;

    // Send email with reset link
    const emailTemplate = {
      subject: 'Password Reset Request - Business Analyst Assistant',
      html: `
        <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #0b2b4c 0%, #123a63 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">Password Reset</h1>
          </div>
          <div style="padding: 30px; background: #f8fafc; border-radius: 0 0 8px 8px;">
            <p style="color: #0f172a; font-size: 16px;">Hello <strong>${userName}</strong>,</p>
            <p style="color: #475569; font-size: 15px; line-height: 1.6;">
              We received a request to reset your password. Click the button below to create a new password:
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" style="background: #ff9f1c; color: white; padding: 14px 35px; text-decoration: none; border-radius: 30px; font-size: 16px; font-weight: bold; display: inline-block;">
                Reset Password
              </a>
            </div>
            <p style="color: #475569; font-size: 14px; line-height: 1.6;">
              Or copy and paste this link in your browser:
            </p>
            <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #e2e8f0; word-break: break-all;">
              <a href="${resetLink}" style="color: #0b2b4c; font-size: 13px; text-decoration: none;">${resetLink}</a>
            </div>
            <p style="color: #c2410c; font-size: 14px; font-weight: bold;">
              ⚠️ This link will expire in 1 hour.
            </p>
            <p style="color: #94a3b8; font-size: 13px; margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
              If you didn't request this password reset, please ignore this email or contact support if you have concerns.
            </p>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 10px;">
              © 2026 Business Analyst Assistant. All rights reserved.
            </p>
          </div>
        </div>
      `,
      text: `Password Reset Request\n\nHello ${userName},\n\nWe received a request to reset your password. Click the link below to create a new password:\n\n${resetLink}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this, please ignore this email.`
    };

    // Log the link clearly for development
    console.log('\n================================================');
    console.log('🔗 PASSWORD RESET LINK:');
    console.log(resetLink);
    console.log('================================================\n');

    try {
      await sendEmail(user.email, emailTemplate.subject, emailTemplate.html, emailTemplate.text);
    } catch (emailErr) {
      console.error('⚠️ Could not send email, but user can use the link from console.');
    }

    // Log activity
    await logUserActivity(
      user.id,
      'PASSWORD_RESET_REQUESTED',
      'User requested password reset link',
      {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    );

    console.log(`Password reset link sent to ${email}`);

    res.json({
      success: true,
      message: 'Password reset link has been sent to your email'
    });
  } catch (err) {
    console.error('Request password reset error:', err);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
};

// Verify reset token
const verifyToken = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const tokenData = await verifyResetToken(token);

    res.json({
      success: true,
      message: 'Token is valid',
      data: {
        userId: tokenData.user_id,
        expiresAt: tokenData.expires_at
      }
    });
  } catch (err) {
    console.error('Verify token error:', err);

    if (err.message.includes('Invalid token') || err.message.includes('expired') || err.message.includes('already')) {
      return res.status(400).json({ error: err.message });
    }

    res.status(500).json({ error: 'Failed to verify token' });
  }
};

// Reset password with token
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;

    if (!token || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Verify token first
    const tokenData = await verifyResetToken(token);

    // Reset password
    const result = await resetPasswordWithToken(token, newPassword);

    // Log audit
    await logAuditAction(
      tokenData.user_id,
      'PASSWORD_RESET_COMPLETED',
      'user',
      tokenData.user_id,
      null,
      { method: 'reset_token' }
    );

    res.json({
      success: true,
      message: result.message
    });
  } catch (err) {
    console.error('Reset password error:', err);

    if (err.message.includes('Invalid') || err.message.includes('expired') || err.message.includes('already')) {
      return res.status(400).json({ error: err.message });
    }

    res.status(500).json({ error: 'Failed to reset password' });
  }
};

// Cleanup expired tokens (can be called via cron job)
const cleanupTokens = async (req, res) => {
  try {
    // Check if request is from admin or internal
    if (req.user && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can perform cleanup' });
    }

    const cleaned = await cleanupExpiredTokens();

    res.json({
      success: true,
      message: `Cleaned up ${cleaned} expired tokens`
    });
  } catch (err) {
    console.error('Cleanup tokens error:', err);
    res.status(500).json({ error: 'Failed to cleanup tokens' });
  }
};

module.exports = {
  requestPasswordReset,
  verifyToken,
  resetPassword,
  cleanupTokens
};
