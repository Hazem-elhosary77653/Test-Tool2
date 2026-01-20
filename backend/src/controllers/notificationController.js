const Database = require('better-sqlite3');
const path = require('path');
const notificationService = require('../services/notificationService');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../database.db');
const db = new Database(dbPath);

/**
 * Get notifications for the authenticated user
 */
exports.getNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const { limit = 20, unreadOnly = false } = req.query;

        let query = `
      SELECT n.*, 
             COALESCE(u.first_name || ' ' || u.last_name, u.email) as actor_name
      FROM notifications n
      LEFT JOIN users u ON n.actor_id = u.id
      WHERE n.user_id = ?
    `;

        if (unreadOnly === 'true') {
            query += ' AND n.is_read = 0';
        }

        query += ' ORDER BY n.created_at DESC LIMIT ?';

        const notifications = db.prepare(query).all(userId, parseInt(limit));
        res.json({ success: true, data: notifications });
    } catch (error) {
        console.error('[NotificationController] getNotifications Error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
    }
};

/**
 * Mark a specific notification as read
 */
exports.markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const result = db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, userId);

        if (result.changes === 0) {
            return res.status(404).json({ success: false, error: 'Notification not found' });
        }

        res.json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
        console.error('[NotificationController] markAsRead Error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to update notification' });
    }
};

/**
 * Mark all notifications as read for current user
 */
exports.markAllRead = async (req, res) => {
    try {
        const userId = req.user.id;
        db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId);
        res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        console.error('[NotificationController] markAllRead Error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to update notifications' });
    }
};

// ============ ADMIN ENDPOINTS ============

/**
 * Get all notification settings
 */
exports.getSettings = async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

        const settings = db.prepare('SELECT * FROM notification_settings').all();
        res.json({ success: true, data: settings });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch settings' });
    }
};

/**
 * Update a notification setting
 */
exports.updateSetting = async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

        const { type, is_enabled_in_app, is_enabled_email } = req.body;
        db.prepare(`
      UPDATE notification_settings 
      SET is_enabled_in_app = ?, is_enabled_email = ?, updated_at = CURRENT_TIMESTAMP
      WHERE type = ?
    `).run(is_enabled_in_app ? 1 : 0, is_enabled_email ? 1 : 0, type);

        res.json({ success: true, message: 'Setting updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update setting' });
    }
};

/**
 * Get all templates
 */
exports.getTemplates = async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });
        const templates = db.prepare('SELECT * FROM notification_templates').all();
        res.json({ success: true, data: templates });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch templates' });
    }
};

/**
 * Update a template
 */
exports.updateTemplate = async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });
        const { type, subject_template, message_template } = req.body;

        db.prepare(`
      UPDATE notification_templates 
      SET subject_template = ?, message_template = ?, updated_at = CURRENT_TIMESTAMP
      WHERE type = ?
    `).run(subject_template, message_template, type);

        res.json({ success: true, message: 'Template updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update template' });
    }
};

/**
 * Send a bulk or targeted notification manually
 */
exports.sendBulk = async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });
        const { message, subject, target_type, target_value, channels } = req.body;

        if (!message) return res.status(400).json({ success: false, error: 'Message is required' });

        let targetUserIds = [];

        if (target_type === 'all' || !target_type) {
            const users = db.prepare('SELECT id FROM users WHERE is_active = 1').all();
            targetUserIds = users.map(u => u.id);
        } else if (target_type === 'role') {
            const users = db.prepare('SELECT id FROM users WHERE role = ? AND is_active = 1').all(target_value);
            targetUserIds = users.map(u => u.id);
        } else if (target_type === 'user') {
            targetUserIds = [target_value];
        }

        const forceInApp = !channels || channels.includes('app');
        const forceEmail = channels && channels.includes('email');

        const { sendNotificationEmail } = require('../services/notificationEmailService');

        for (const userId of targetUserIds) {
            if (forceInApp) {
                db.prepare(`
                    INSERT INTO notifications (user_id, actor_id, type, message)
                    VALUES (?, ?, ?, ?)
                `).run(userId, req.user.id, 'SYSTEM_ANNOUNCEMENT', message);
            }

            if (forceEmail) {
                const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
                if (user?.email) {
                    try { await sendNotificationEmail(user.email, subject || 'System Announcement', message); } catch (e) {
                        console.error(`Email fail for user ${userId}:`, e.message);
                    }
                }
            }
        }

        res.json({ success: true, message: `Notification sent to ${targetUserIds.length} users` });
    } catch (error) {
        console.error('[NotificationController] sendBulk Error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to send notification' });
    }
};

/**
 * Get available targeting options (users and roles)
 */
exports.getTargets = async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

        const users = db.prepare('SELECT id, first_name, last_name, username, email, role FROM users WHERE is_active = 1').all();
        const roles = [...new Set(users.map(u => u.role))];

        res.json({
            success: true,
            data: {
                users: users.map(u => ({ id: u.id, name: u.first_name ? `${u.first_name} ${u.last_name}` : (u.username || u.email), role: u.role })),
                roles: roles
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch targets' });
    }
};
