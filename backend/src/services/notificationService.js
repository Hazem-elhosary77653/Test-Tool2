const Database = require('better-sqlite3');
const path = require('path');
const { sendNotificationEmail } = require('./notificationEmailService');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../database.db');
const db = new Database(dbPath);

/**
 * Replace placeholders in template with metadata
 * Example: {{brd_title}} -> "Project X"
 */
const resolveTemplate = (template, metadata) => {
    let result = template;
    for (const [key, value] of Object.entries(metadata)) {
        const placeholder = new RegExp(`{{${key}}}`, 'g');
        result = result.replace(placeholder, value || '');
    }
    return result;
};

/**
 * Main notification dispatcher
 */
const notify = async (userId, type, metadata = {}) => {
    try {
        // 1. Check if notification type is enabled
        const settings = db.prepare('SELECT is_enabled_in_app, is_enabled_email FROM notification_settings WHERE type = ?').get(type);

        // If no settings found, default to enabled in-app only or skip
        if (!settings && type !== 'SYSTEM_ANNOUNCEMENT') {
            console.warn(`[NotificationService] No settings found for type: ${type}. Skipping.`);
            return;
        }

        const isAppEnabled = settings ? !!settings.is_enabled_in_app : true;
        const isEmailEnabled = settings ? !!settings.is_enabled_email : false;

        if (!isAppEnabled && !isEmailEnabled) return;

        // 2. Resolve template
        const template = db.prepare('SELECT subject_template, message_template FROM notification_templates WHERE type = ?').get(type);
        if (!template) {
            console.warn(`[NotificationService] No template found for type: ${type}.`);
            return;
        }

        const message = resolveTemplate(template.message_template, metadata);
        const subject = resolveTemplate(template.subject_template || 'New Notification', metadata);

        // 3. Save to database (In-app notification)
        if (isAppEnabled) {
            db.prepare(`
        INSERT INTO notifications (user_id, actor_id, type, resource_id, resource_type, message)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
                userId,
                metadata.actor_id || null,
                type,
                metadata.resource_id || null,
                metadata.resource_type || null,
                message
            );
        }

        // 4. Send email if enabled
        if (isEmailEnabled) {
            const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
            if (user && user.email) {
                try {
                    await sendNotificationEmail(user.email, subject, message);
                } catch (emailErr) {
                    console.error(`[NotificationService] Email delivery failed for user ${userId}:`, emailErr.message);
                }
            }
        }

        return true;
    } catch (error) {
        console.error('[NotificationService] Error:', error.message);
        return false;
    }
};

/**
 * Send bulk notifications (e.g., system-wide announcement)
 */
const notifyBulk = async (type, metadata = {}) => {
    try {
        const users = db.prepare('SELECT id FROM users WHERE is_active = 1').all();
        for (const user of users) {
            await notify(user.id, type, metadata);
        }
        return true;
    } catch (error) {
        console.error('[NotificationService] Bulk Error:', error.message);
        return false;
    }
};

module.exports = {
    notify,
    notifyBulk
};
