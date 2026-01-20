require('dotenv').config();
const nodemailer = require('nodemailer');

const testEmail = async () => {
    console.log('Testing Email Configuration (Simplified Gmail Service)...');
    console.log(`User: ${process.env.EMAIL_USER}`);

    // Check for App Password format (16 chars, usually lowercase)
    const pass = process.env.EMAIL_PASSWORD || '';
    if (pass.length !== 16) {
        console.warn('⚠️ Warning: EMAIL_PASSWORD is not 16 characters. Ensure you are using a Gmail App Password.');
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
        console.error('❌ EMAIL_USER or EMAIL_PASSWORD missing in .env');
        return;
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
        },
        tls: {
            rejectUnauthorized: false
        }
    });

    try {
        console.log('Verifying connection...');
        await transporter.verify();
        console.log('✅ SMTP Connection Verified Successfully');

        console.log('Sending test email...');
        const info = await transporter.sendMail({
            from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: 'Test Email - Gmail Service Mode',
            text: 'This test uses service: "gmail" and follow your recommendations.'
        });

        console.log('✅ Email sent successfully:', info.messageId);
    } catch (error) {
        console.error('❌ Email Failed:');
        console.error(error.message);
        if (error.message.includes('ECONNRESET')) {
            console.error('💡 Hint: Still getting ECONNRESET. This is likely a network/firewall issue blocking SMTP ports.');
        }
    }
};

testEmail();
