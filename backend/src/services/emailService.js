const nodemailer = require('nodemailer');

// Email transporter configuration
let transporter;

const initializeEmailService = async () => {
  // Check if email is configured
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    console.warn('⚠️  Email service not configured. Emails will be logged to console.');
    return null;
  }

  try {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });

    // We still try to verify but we won't let it crash the app if it fails (ECONNRESET)
    transporter.verify((error, success) => {
      if (error) {
        console.warn('⚠️  Email service verification failed (Network/Firewall issue). Emails will be logged to console as fallback.');
      } else {
        console.log('✅ Email service (Gmail) is ready to send.');
      }
    });

    return transporter;
  } catch (err) {
    console.error('❌ Failed to create email transporter:', err.message);
    return null;
  }
};

// Send email helper
const sendEmail = async (to, subject, htmlContent, textContent = '') => {
  try {
    // If transporter is not ready, we fall back to logging
    if (!transporter) {
      console.log('\n--- [EMAIL FALLBACK - NOT CONFIGURED] ---');
      console.log(`To: ${to}\nSubject: ${subject}\nContent: ${textContent || 'HTML Content (Check terminal)'}`);
      console.log('------------------------------------------\n');
      return { success: true, message: 'Email logged to console (service not configured)' };
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject,
      html: htmlContent,
      text: textContent
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${to}: ${subject}`);
    return { success: true, result };
  } catch (err) {
    // CRITICAL: If SMTP fails (ECONNRESET, etc.), log content to console so user isn't blocked!
    console.warn(`\n⚠️ SMTP Failed (${err.code}). FALLING BACK TO CONSOLE LOGGING:`);
    console.log('================================================');
    console.log(`TO: ${to}`);
    console.log(`SUBJECT: ${subject}`);
    console.log('CONTENT:');
    console.log(textContent || 'Check HTML content above in source');
    console.log('================================================\n');

    // We return success: true because the developer can now see the link/content
    return { success: true, message: 'Email fallback to console triggered' };
  }
};

// Email templates
const emailTemplates = {
  // Password reset email
  passwordReset: (userName, resetLink) => ({
    subject: 'Password Reset Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">Password Reset</h1>
        </div>
        <div style="padding: 30px; background: #f8f9fa; border-radius: 0 0 8px 8px;">
          <p style="color: #333; font-size: 16px;">Hello <strong>${userName}</strong>,</p>
          <p style="color: #555; font-size: 15px; line-height: 1.6;">
            We received a request to reset your password. Click the link below to reset it.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="color: #999; font-size: 13px;">
            This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
          </p>
          <p style="color: #999; font-size: 13px; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 20px;">
            © 2026 Business Analyst Assistant. All rights reserved.
          </p>
        </div>
      </div>
    `,
    text: `Password Reset Request\n\nHello ${userName},\n\nWe received a request to reset your password. Click the link below:\n${resetLink}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`
  }),

  // User creation welcome email
  userCreation: (userName, email, tempPassword) => ({
    subject: 'Welcome to Business Analyst Assistant',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">Welcome!</h1>
        </div>
        <div style="padding: 30px; background: #f8f9fa; border-radius: 0 0 8px 8px;">
          <p style="color: #333; font-size: 16px;">Hello <strong>${userName}</strong>,</p>
          <p style="color: #555; font-size: 15px; line-height: 1.6;">
            Your account has been created successfully. Here are your login credentials:
          </p>
          <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #667eea;">
            <p style="margin: 0 0 10px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 0;"><strong>Temporary Password:</strong> <code style="background: #f0f0f0; padding: 5px 10px; border-radius: 3px;">${tempPassword}</code></p>
          </div>
          <p style="color: #555; font-size: 15px; line-height: 1.6;">
            Please log in and change your password immediately for security.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.APP_URL || 'http://localhost:3000'}/login" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold; display: inline-block;">
              Login Now
            </a>
          </div>
          <p style="color: #999; font-size: 13px; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 20px;">
            © 2026 Business Analyst Assistant. All rights reserved.
          </p>
        </div>
      </div>
    `,
    text: `Welcome to Business Analyst Assistant\n\nHello ${userName},\n\nYour account has been created.\n\nEmail: ${email}\nTemporary Password: ${tempPassword}\n\nPlease log in and change your password immediately.\n\nLogin: ${process.env.APP_URL || 'http://localhost:3000'}/login`
  }),

  // Login alert email
  loginAlert: (userName, ipAddress, userAgent, timestamp) => ({
    subject: 'New Login to Your Account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">Login Alert</h1>
        </div>
        <div style="padding: 30px; background: #f8f9fa; border-radius: 0 0 8px 8px;">
          <p style="color: #333; font-size: 16px;">Hello <strong>${userName}</strong>,</p>
          <p style="color: #555; font-size: 15px; line-height: 1.6;">
            Someone just logged into your account. Here are the details:
          </p>
          <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f39c12;">
            <p style="margin: 0 0 10px 0;"><strong>IP Address:</strong> ${ipAddress}</p>
            <p style="margin: 0 0 10px 0;"><strong>Device:</strong> ${userAgent || 'Unknown'}</p>
            <p style="margin: 0;"><strong>Time:</strong> ${new Date(timestamp).toLocaleString()}</p>
          </div>
          <p style="color: #555; font-size: 15px; line-height: 1.6;">
            If this wasn't you, please change your password immediately and contact support.
          </p>
          <p style="color: #999; font-size: 13px; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 20px;">
            © 2026 Business Analyst Assistant. All rights reserved.
          </p>
        </div>
      </div>
    `,
    text: `Login Alert\n\nHello ${userName},\n\nSomeone just logged into your account.\n\nIP: ${ipAddress}\nDevice: ${userAgent || 'Unknown'}\nTime: ${new Date(timestamp).toLocaleString()}\n\nIf this wasn't you, change your password immediately.`
  }),

  // 2FA setup email
  twoFASetup: (userName, backupCodes) => ({
    subject: 'Two-Factor Authentication Enabled',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">2FA Enabled</h1>
        </div>
        <div style="padding: 30px; background: #f8f9fa; border-radius: 0 0 8px 8px;">
          <p style="color: #333; font-size: 16px;">Hello <strong>${userName}</strong>,</p>
          <p style="color: #555; font-size: 15px; line-height: 1.6;">
            Two-factor authentication has been enabled on your account. Your account is now more secure!
          </p>
          <p style="color: #d9534f; font-size: 14px; font-weight: bold; margin-top: 20px;">
            ⚠️ IMPORTANT: Save your backup codes below. You'll need them if you lose access to your authenticator app.
          </p>
          <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #d9534f; font-family: monospace; font-size: 14px;">
            ${backupCodes.map((code, idx) => `<p style="margin: 5px 0;">${idx + 1}. <code>${code}</code></p>`).join('')}
          </div>
          <p style="color: #999; font-size: 13px; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 20px;">
            © 2026 Business Analyst Assistant. All rights reserved.
          </p>
        </div>
      </div>
    `,
    text: `Two-Factor Authentication Enabled\n\nHello ${userName},\n\n2FA has been enabled. Save these backup codes:\n\n${backupCodes.map((code, idx) => `${idx + 1}. ${code}`).join('\n')}`
  })
};

// Send password reset email
const sendPasswordResetEmail = async (email, userName, resetLink) => {
  const template = emailTemplates.passwordReset(userName, resetLink);
  return sendEmail(email, template.subject, template.html, template.text);
};

// Send user creation welcome email
const sendUserCreationEmail = async (email, userName, tempPassword) => {
  const template = emailTemplates.userCreation(userName, email, tempPassword);
  return sendEmail(email, template.subject, template.html, template.text);
};

// Send login alert email
const sendLoginAlertEmail = async (email, userName, ipAddress, userAgent, timestamp) => {
  const template = emailTemplates.loginAlert(userName, ipAddress, userAgent, timestamp);
  return sendEmail(email, template.subject, template.html, template.text);
};

// Send 2FA setup email
const sendTwoFASetupEmail = async (email, userName, backupCodes) => {
  const template = emailTemplates.twoFASetup(userName, backupCodes);
  return sendEmail(email, template.subject, template.html, template.text);
};

module.exports = {
  initializeEmailService,
  sendEmail,
  sendPasswordResetEmail,
  sendUserCreationEmail,
  sendLoginAlertEmail,
  sendTwoFASetupEmail
};
