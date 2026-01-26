const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const db = require('./db/connection');
const { initializeEmailService } = require('./services/emailService');
const { validateEnv } = require('./utils/validateEnv');
const { syncPermissions } = require('./utils/permissionSeeder');

const app = express();
app.use('/api/notification-email', require('./routes/notificationEmailRoutes'));

// Validate environment and initialize email service
validateEnv();
initializeEmailService();
syncPermissions().catch((err) => {
  console.error('[PERMISSIONS] Startup sync failed:', err.message);
});

// Create uploads directories if they don't exist
const uploadsDir = path.join(__dirname, '../uploads');
const avatarsDir = path.join(uploadsDir, 'avatars');
[uploadsDir, avatarsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
});

// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json());
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Apply session timeout middleware to all API routes
const sessionTimeoutMiddleware = require('./middleware/sessionTimeoutMiddleware');
app.use('/api', sessionTimeoutMiddleware);

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userManagementRoutes'));
app.use('/api/profile', require('./routes/userProfileRoutes'));
app.use('/api/activity', require('./routes/activityRoutes'));
app.use('/api/password-reset', require('./routes/passwordResetRoutes'));
app.use('/api/groups', require('./routes/groupRoutes'));
app.use('/api/permissions', require('./routes/permissionsRoutes'));
app.use('/api/sessions', require('./routes/sessionManagementRoutes'));
app.use('/api/user-stories', require('./routes/userStoriesRoutes'));
app.use('/api/brd', require('./routes/brdRoutes'));
app.use('/api/ai-config', require('./routes/aiConfigRoutes'));
app.use('/api/ai/stories', require('./routes/aiStoryRoutes'));
app.use('/api/templates', require('./routes/templatesRoutes'));
app.use('/api/documents', require('./routes/documentsRoutes'));
app.use('/api/diagrams', require('./routes/diagramRoutes'));
app.use('/api/reports', require('./routes/reportsRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));
app.use('/api/ai', require('./routes/chatRoutes'));
app.use('/api/azure-devops', require('./routes/azureDevOpsRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));
app.use('/api/user-settings', require('./routes/userSettingsRoutes'));
app.use('/api/system-settings', require('./routes/systemSettingsRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/test', require('./routes/testRoutes'));
app.use('/api/openai', require('./routes/openaiRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
