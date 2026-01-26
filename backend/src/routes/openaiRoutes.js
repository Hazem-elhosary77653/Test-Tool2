
const express = require('express');
const router = express.Router();
const axios = require('axios');
const Database = require('better-sqlite3');
const path = require('path');
const { decryptKey } = require('../utils/encryption');
const authMiddleware = require('../middleware/authMiddleware');


// GET /api/openai/credit - Get OpenAI credit/quota info
router.get('/credit', authMiddleware, async (req, res) => {
  // جلب الـ API Key من قاعدة البيانات للمستخدم الحالي
  let apiKey = null;
  try {
    const userId = req.user?.id;
    if (userId) {
      const dbPath = process.env.DB_PATH || path.join(__dirname, '../../database.db');
      const db = new Database(dbPath);
      const stmt = db.prepare('SELECT api_key FROM ai_configurations WHERE user_id = ?');
      const config = stmt.get(String(userId));
      if (config && config.api_key) {
        apiKey = decryptKey(config.api_key);
      }
      db.close();
    }
  } catch (e) {
    // تجاهل الخطأ، fallback على env
  }
  // fallback على env إذا لم يوجد في قاعدة البيانات
  if (!apiKey) {
    apiKey = process.env.OPENAI_API_KEY;
  }
  if (!apiKey) {
    return res.status(400).json({ error: 'OpenAI API key not configured' });
  }
  try {
    const response = await axios.get('https://api.openai.com/v1/dashboard/billing/credit_grants', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    res.json({ success: true, data: response.data });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error || err.message });
  }
});

module.exports = router;
