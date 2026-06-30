const { Worker } = require('bullmq');
const { getRedisClient } = require('../services/cacheService');
const nodemailer = require('nodemailer');

// Email transporter configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const emailWorker = new Worker('emails', async (job) => {
  const { to, subject, html, text } = job.data;
  
  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || '"ShopSRY" <noreply@shopsry.uz>',
      to,
      subject,
      html,
      text
    });
    
    console.log(`Email sent: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send error:', error);
    throw error;
  }
}, {
  connection: await getRedisClient(),
  concurrency: 5
});

emailWorker.on('completed', (job) => {
  console.log(`Email job ${job.id} completed`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`Email job ${job.id} failed:`, err.message);
});

module.exports = emailWorker;
