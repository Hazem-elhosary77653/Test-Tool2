const express = require('express');
const router = express.Router();
const speakeasy = require('speakeasy');
const pool = require('../db/connection');
const { generateToken, getUserByCredential } = require('../utils/auth');

// POST /2fa-verify/verify-code
router.post('/verify-code', async (req, res) => {
  try {
    const { userId, code } = req.body;
    if (!userId || !code) {
      return res.status(400).json({ error: 'User ID and code are required' });
    }
    // جلب secret من جدول user_2fa
    const faRows = await pool.query('SELECT secret FROM user_2fa WHERE user_id = $1 AND is_enabled = 1', [userId]);
    let secret;
    if (!faRows.length) {
      // إذا لم يكن هناك secret، اعتبر أن المستخدم في مرحلة التفعيل الأولى
      // جلب secret من الطلب (frontend يجب أن يرسله)
      secret = req.body.secret;
      if (!secret) {
        return res.status(400).json({ error: '2FA not set up for this user (no secret provided)' });
      }
      // تحقق من الكود
      const verified = speakeasy.totp.verify({
        secret: secret,
        encoding: 'base32',
        token: code,
        window: 1
      });
      console.log('[2FA DEBUG] verified (first setup):', verified);
      if (!verified) {
        return res.status(401).json({ error: 'Invalid or expired code' });
      }
      // احفظ secret في user_2fa
      await pool.query(
        `INSERT INTO user_2fa (user_id, secret, is_enabled, created_at, updated_at)
         VALUES ($1, $2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id) DO UPDATE SET secret = $2, is_enabled = 1, updated_at = CURRENT_TIMESTAMP`,
        [userId, secret]
      );
    } else {
      secret = faRows[0].secret;
      // تحقق من الكود
      const verified = speakeasy.totp.verify({
        secret: secret,
        encoding: 'base32',
        token: code,
        window: 1
      });
      console.log('[2FA DEBUG] verified:', verified);
      if (!verified) {
        return res.status(401).json({ error: 'Invalid or expired code' });
      }
    }
    // جلب بيانات المستخدم كاملة (للتوكن)
    const userRows = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userRows[0];
    const ipAddress = req.ip || req.connection?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const { createSession } = require('../services/sessionManagementService');
    const session = await createSession(user.id, ipAddress, userAgent);
    const token = generateToken(user, session.id);
    res.json({ success: true, token, user });
  } catch (err) {
    res.status(500).json({ error: '2FA verification failed' });
  }
});

module.exports = router;
