const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'database.db');
const db = new Database(dbPath);

async function resetAdminPassword() {
    try {
        const newPassword = 'Admin@123';
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(newPassword, salt);

        // البحث عن أول مستخدم بصلحية أدمن
        const admin = db.prepare("SELECT id, email, username FROM users WHERE role = 'admin'").get();

        if (admin) {
            const update = db.prepare("UPDATE users SET password_hash = ? WHERE id = ?");
            update.run(hash, admin.id);

            console.log('✅ Admin Password Reset Successfully!');
            console.log(`Username: ${admin.username}`);
            console.log(`Email: ${admin.email}`);
            console.log(`New Password: ${newPassword}`);
            console.log('---');
            console.log('Please try to login with these credentials.');
        } else {
            console.error('❌ No admin user found in the database.');
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        db.close();
    }
}

resetAdminPassword();
