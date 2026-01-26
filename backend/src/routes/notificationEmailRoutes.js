const express = require('express');
const router = express.Router();
const { sendNotificationEmail } = require('../services/notificationEmailService');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

// Send notification email and save notification
router.post('/send', async (req, res) => {
  const { user_id, email, subject, message } = req.body;
  if (!user_id || !email || !subject || !message) {
    return res.status(400).json({ error: 'user_id, email, subject, and message are required' });
  }
  try {
    await sendNotificationEmail(email, subject, message);
    db.run('INSERT INTO notifications (user_id, message) VALUES (?, ?)', [user_id, message]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
