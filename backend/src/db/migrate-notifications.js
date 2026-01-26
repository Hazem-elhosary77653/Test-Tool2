const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../database.db');
const db = new Database(dbPath);

const migrate = () => {
    try {
        console.log('Starting Notification System migration...');

        // 1. Notification Templates table
        db.exec(`
      CREATE TABLE IF NOT EXISTS notification_templates (
        id TEXT PRIMARY KEY,
        type VARCHAR(50) UNIQUE NOT NULL,
        subject_template TEXT,
        message_template TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // 2. Notification Settings table (Admin-controlled)
        db.exec(`
      CREATE TABLE IF NOT EXISTS notification_settings (
        type VARCHAR(50) PRIMARY KEY,
        is_enabled_in_app INTEGER DEFAULT 1,
        is_enabled_email INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // 3. New Notifications table (Dropping old one if it's basic)
        // Check if table exists and has the old structure
        const tableInfo = db.prepare("PRAGMA table_info(notifications)").all();
        const hasType = tableInfo.some(col => col.name === 'type');

        if (tableInfo.length > 0 && !hasType) {
            console.log('Old notifications table detected. Migrating data and updating structure...');
            db.exec('ALTER TABLE notifications RENAME TO old_notifications');
        }

        db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        actor_id INTEGER,
        type VARCHAR(50) NOT NULL,
        resource_id TEXT,
        resource_type VARCHAR(50),
        message TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

        // 4. Initial Seed Data
        const templates = [
            { id: 'nt-001', type: 'COLLABORATOR_ASSIGNED', subject: 'New BRD Assignment', message: 'You have been assigned as a collaborator on BRD: {{brd_title}}' },
            { id: 'nt-002', type: 'REVIEW_REQUESTED', subject: 'Review Requested', message: '{{actor_name}} requested your review for BRD: {{brd_title}}' },
            { id: 'nt-003', type: 'BRD_APPROVED', subject: 'BRD Approved', message: 'Your BRD "{{brd_title}}" has been approved by {{actor_name}}' },
            { id: 'nt-004', type: 'BRD_REJECTED', subject: 'BRD Needs Revisions', message: 'Your BRD "{{brd_title}}" was sent back for revisions by {{actor_name}}' },
            { id: 'nt-005', type: 'COMMENT_ADDED', subject: 'New Comment', message: '{{actor_name}} added a comment to your BRD: {{brd_title}}' },
            { id: 'nt-006', type: 'SYSTEM_ANNOUNCEMENT', subject: 'System Announcement', message: '{{announcement_text}}' }
        ];

        const insertTpl = db.prepare('INSERT OR IGNORE INTO notification_templates (id, type, subject_template, message_template) VALUES (?, ?, ?, ?)');
        const insertSetting = db.prepare('INSERT OR IGNORE INTO notification_settings (type) VALUES (?)');

        db.transaction(() => {
            for (const tpl of templates) {
                insertTpl.run(tpl.id, tpl.type, tpl.subject, tpl.message);
                insertSetting.run(tpl.type);
            }
        })();

        console.log('✅ Notification migration completed successfully.');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
};

migrate();
