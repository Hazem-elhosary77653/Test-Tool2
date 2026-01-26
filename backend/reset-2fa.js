// Script to reset 2FA secret for a user by email or id
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'database.db');
const db = new Database(dbPath);

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node reset-2fa.js admin@example.com');
  process.exit(1);
}

let user;
if (/^\d+$/.test(arg)) {
  user = db.prepare('SELECT * FROM users WHERE id = ?').get(arg);
} else {
  user = db.prepare('SELECT * FROM users WHERE email = ?').get(arg);
}

if (!user) {
  console.error('User not found');
  process.exit(1);
}

db.prepare('UPDATE users SET twofa_secret = NULL WHERE id = ?').run(user.id);
console.log('2FA secret reset for user:', user.email || user.id);
