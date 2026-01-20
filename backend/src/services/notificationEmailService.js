const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.example.com',
  port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || 'user@example.com',
    pass: process.env.SMTP_PASS || 'password',
  },
});

async function sendNotificationEmail(to, subject, message) {
  const mailOptions = {
    from: process.env.SMTP_FROM || 'no-reply@example.com',
    to,
    subject,
    text: message,
    html: `<div>${message}</div>`
  };
  return transporter.sendMail(mailOptions);
}

module.exports = { sendNotificationEmail };
