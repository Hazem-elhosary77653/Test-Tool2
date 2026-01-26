const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
const db = new Database(dbPath);

try {
    const users = db.prepare("SELECT id, username, email, role, password_hash FROM users WHERE role = 'admin'").all();
    console.log('--- Admin Users Found ---');
    users.forEach(user => {
        console.log(`ID: ${user.id}`);
        console.log(`Username: ${user.username}`);
        console.log(`Email: ${user.email}`);
        console.log(`Hash starts with: ${user.password_hash.substring(0, 10)}...`);
        console.log('-------------------------');
    });
} catch (error) {
    console.error('Error reading database:', error.message);
}
