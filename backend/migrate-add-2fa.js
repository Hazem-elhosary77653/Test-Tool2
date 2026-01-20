// Migration Script: Add twofa_secret column to users table
// Usage: node migrate-add-2fa.js

const Database = require('better-sqlite3');
const path = require('path');
const dbPath = process.env.DB_PATH || path.join(__dirname, './database.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

try {
  const columns = db.prepare("PRAGMA table_info(users)").all();
  const has2FASecret = columns.some(col => col.name === 'twofa_secret');
  if (!has2FASecret) {
    console.log('📝 Adding twofa_secret column to users table...');
    db.prepare(`ALTER TABLE users ADD COLUMN twofa_secret TEXT DEFAULT NULL`).run();
    console.log('✅ twofa_secret column added successfully');
  } else {
    console.log('✅ twofa_secret column already exists in users table');
  }
} catch (e) {
  console.error('❌ Failed to add twofa_secret column:', e.message);
}
