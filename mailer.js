const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_PORT == 465, 
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendResetCode = async (email, code) => {
  const mailOptions = {
    from: `"ShopSRY Support" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: email,
    subject: 'Parolni tiklash kodi',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e1e1e1; border-radius: 10px;">
        <h2 style="color: #2563EB; text-align: center;">ShopSRY</h2>
        <p>Salom!</p>
        <p>Siz parolingizni tiklashga so'rov yubordingiz. Quyidagi tasdiqlash kodidan foydalaning:</p>
        <div style="background-color: #f3f4f6; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
          <h1 style="letter-spacing: 5px; color: #111827; margin: 0;">${code}</h1>
        </div>
        <p>Ushbu kod 10 daqiqa davomida amal qiladi.</p>
        <p>Agar siz parolni tiklashga so'rov yubormagan bo'lsangiz, ushbu xabarni e'tiborsiz qoldirishingiz mumkin.</p>
        <hr style="border: none; border-top: 1px solid #e1e1e1; margin: 20px 0;">
        <p style="color: #6B7280; font-size: 12px; text-align: center;">ShopSRY jamoasi</p>
      </div>
    `,
  };

  // If credentials are not set, log the code for development
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('--- DEVELOPMENT MODE: Reset Code Email ---');
    console.log(`To: ${email}`);
    console.log(`Code: ${code}`);
    console.log('-------------------------------------------');
    return true;
  }

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Email yuborishda xatolik:', error);
    throw error;
  }
};

module.exports = { sendResetCode };
