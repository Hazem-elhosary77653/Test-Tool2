const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authMiddleware = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authMiddleware);

// User notification routes
router.get('/', notificationController.getNotifications);
router.post('/read/all', notificationController.markAllRead);
router.post('/read/:id', notificationController.markAsRead);

// Admin notification routes
router.get('/admin/settings', notificationController.getSettings);
router.put('/admin/settings', notificationController.updateSetting);
router.get('/admin/templates', notificationController.getTemplates);
router.put('/admin/templates', notificationController.updateTemplate);
router.get('/admin/targets', notificationController.getTargets);
router.post('/admin/send-bulk', notificationController.sendBulk);

module.exports = router;

