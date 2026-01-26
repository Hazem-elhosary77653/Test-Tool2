const { body, validationResult } = require('express-validator');
const pool = require('../db/connection');
const { hashPassword, comparePassword, generateToken, getUserByCredential } = require('../utils/auth');
const { logAuditAction } = require('../utils/audit');
const { logUserActivity } = require('../services/activityService');

const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { createSession, endSession, endAllUserSessions, getSessionById } = require('../services/sessionManagementService');

// Register
const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, username, mobile, password, firstName, lastName } = req.body;

    // Check if user exists
    const existingUser = await getUserByCredential(email || username || mobile);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const result = await pool.query(
      `INSERT INTO users (email, username, mobile, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, username, role`,
      [email, username, mobile, passwordHash, firstName, lastName]
    );

    const user = result.rows[0];
    const ipAddress = req.ip || req.connection?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    const session = await createSession(user.id, ipAddress, userAgent);
    const token = generateToken(user, session.id);

    await logAuditAction(user.id, 'USER_REGISTERED', 'user', user.id, null, { email, username, mobile });

    // Push to activity feed
    try {
      await logUserActivity(
        user.id,
        'USER_REGISTERED',
        'User registered',
        {
          ipAddress,
          userAgent,
          resourceType: 'user',
          resourceId: user.id
        }
      );
    } catch (activityErr) {
      console.error('[AUTH] Activity logging (register) failed, continuing:', activityErr.message);
    }

    res.status(201).json({
      message: 'User registered successfully',
      user,
      token
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
};


const login = async (req, res) => {
  try {
    const { credential, password } = req.body;

    if (!credential || !password) {
      return res.status(400).json({ error: 'Credential and password required' });
    }

    const user = await getUserByCredential(credential);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const passwordMatch = await comparePassword(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'User account is inactive' });
    }

    // تم تعطيل التحقق الثنائي 2FA مؤقتاً - تسجيل دخول عادي فقط
    const userAgent = req.headers['user-agent'] || '';
    const ipAddress = req.ip || req.connection?.remoteAddress || '';
    const session = await createSession(user.id, ipAddress, userAgent);
    const token = generateToken(user, session.id);
    await logAuditAction(user.id, 'USER_LOGIN', 'user', user.id, null, null, req.ip);
    await logUserActivity(
      user.id,
      'USER_LOGIN',
      'User logged in',
      {
        ipAddress: req.ip || req.connection?.remoteAddress || '',
        userAgent: req.headers['user-agent'] || '',
        resourceType: 'user',
        resourceId: user.id
      }
    );
      // إرسال رد ناجح للفرونتند
      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role
        }
      });

        // إضافة إشعار للمستخدم عند تسجيل الدخول
        try {
          const sqlite3 = require('sqlite3').verbose();
          const db = new sqlite3.Database('./database.sqlite');
          db.run('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [user.id, 'تم تسجيل الدخول بنجاح'], function(err) {
            if (err) console.error('Notification error:', err.message);
          });

            // إرسال إشعار عبر البريد الإلكتروني
            try {
              const { sendNotificationEmail } = require('../services/notificationEmailService');
              if (user.email) {
                await sendNotificationEmail(
                  user.email,
                  'إشعار تسجيل الدخول',
                  'تم تسجيل الدخول بنجاح إلى حسابك.'
                );
              }
            } catch (emailErr) {
              console.error('Email notification error:', emailErr.message);
            }
        } catch (notifyErr) {
          console.error('Notification insert error:', notifyErr.message);
        }
  } catch (err) {
    console.error('[AUTH] Login error:', err.message);
    console.error('[AUTH] Error stack:', err.stack);
    res.status(500).json({ error: 'Login failed' });
  }
};

// Get current user
const getCurrentUser = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, username, mobile, first_name, last_name, role, is_active FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

module.exports = {
  register,
  login,
  getCurrentUser,
  refreshToken: async (req, res) => {
    try {
      const userResult = await pool.query(
        `SELECT id, email, username, mobile, first_name, last_name, role, is_active FROM users WHERE id = $1`,
        [req.user.id]
      );

      if (!userResult.rows.length) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = userResult.rows[0];

      if (!user.is_active) {
        return res.status(403).json({ error: 'User account is inactive' });
      }

      if (req.user.sessionId) {
        const session = await getSessionById(req.user.sessionId);
        if (!session || session.is_active === 0) {
          return res.status(401).json({ error: 'Session expired. Please log in again.' });
        }
      }

      const token = generateToken(user, req.user.sessionId || null);

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role
        }
      });
    } catch (err) {
      console.error('Refresh token error:', err.message);
      res.status(500).json({ error: 'Failed to refresh token' });
    }
  },
  logout: async (req, res) => {
    try {
      const sessionId = req.user.sessionId;
      if (sessionId) {
        await endSession(sessionId);
      }
      await logAuditAction(req.user.id, 'LOGOUT', 'user', req.user.id);

      // Mirror audit into activity feed
      try {
        await logUserActivity(
          req.user.id,
          'USER_LOGOUT',
          'User logged out',
          {
            ipAddress: req.ip || req.connection?.remoteAddress || '',
            userAgent: req.headers['user-agent'] || '',
            resourceType: 'user',
            resourceId: req.user.id
          }
        );
      } catch (activityErr) {
        console.error('[AUTH] Activity logging (logout) failed, continuing:', activityErr.message);
      }
      res.json({ success: true, message: 'Logged out' });
    } catch (err) {
      console.error('Logout error:', err.message);
      res.status(500).json({ error: 'Logout failed' });
    }
  },
  logoutAll: async (req, res) => {
    try {
      await endAllUserSessions(req.user.id);
      await logAuditAction(req.user.id, 'LOGOUT_ALL', 'user', req.user.id);
      res.json({ success: true, message: 'Logged out from all devices' });
    } catch (err) {
      console.error('Logout all error:', err.message);
      res.status(500).json({ error: 'Logout all failed' });
    }
  }
};
