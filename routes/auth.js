const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { pool } = require('../database');
const { sendResetCode } = require('../mailer');
const {
  SECRET_KEY,
  authenticateToken,
  authenticateAdmin,
  authenticateSuperAdmin
} = require('../middleware/auth');
const {
  saveBase64Image,
  logActivity,
  createNotification
} = require('../utils/helpers');

const router = express.Router();

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URL || 'http://localhost:5001/auth/google/callback'
);

// Register
router.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  
  try {
    await pool.query(
      'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4)',
      [username, email, hashedPassword, 'user']
    );
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'Username or email already exists' });
  }
});

// Login
router.post('/api/auth/login', async (req, res) => {
  const username = req.body.username?.trim();
  const password = req.body.password?.trim();
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  console.log(`\n[LOGIN ATTEMPT] Username: "${username}"`);
  
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    const user = rows[0];
    
    if (!user) {
      console.log(`[LOGIN FAILED] User "${username}" not found in database.`);
      return res.status(400).json({ error: 'Foydalanuvchi topilmadi' });
    }
    
    console.log(`[LOGIN DEBUG] User found. ID: ${user.id}, Role: ${user.role}. Checking password...`);
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.log(`[LOGIN FAILED] Password mismatch for user "${username}".`);
      return res.status(400).json({ error: 'Parol noto\'g\'ri' });
    }
    
    console.log(`[LOGIN SUCCESS] User "${username}" authenticated successfully.`);
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: '24h' });
    
    // Welcome Notification Trigger
    createNotification(user.id, 'Xush kelibsiz! ShopSRY do\'konimizga tashrif buyurganingizdan xursandmiz.', 'info');
    
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    console.error('[LOGIN ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// Forgot Password
router.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (rows.length === 0) return res.status(404).json({ error: 'Ushbu email bilan foydalanuvchi topilmadi' });
    
    // Check if user has password (might be Google user)
    if (!rows[0].password && rows[0].google_id) {
      return res.status(400).json({ error: 'Bu hisob Google orqali yaratilgan. Google orqali kiring.' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
    
    await pool.query('UPDATE users SET reset_code = $1, reset_expiry = $2 WHERE email = $3', [code, expiry, email]);
    
    // Wrap email sending in a try-catch for robustness
    try {
      await sendResetCode(email, code);
    } catch (mailErr) {
      console.warn('⚠️ OTP Email failed to send:', mailErr.message);
    }
    
    res.json({ success: true, message: 'Tasdiqlash kodi emailingizga yuborildi' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify Reset Code
router.post('/api/auth/verify-reset-code', async (req, res) => {
  const { email, code } = req.body;
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    
    if (!user || user.reset_code !== code || new Date() > new Date(user.reset_expiry)) {
      return res.status(400).json({ error: 'Tasdiqlash kodi noto\'g\'ri yoki muddati o\'tgan' });
    }
    
    res.json({ success: true, message: 'Kod tasdiqlandi' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset Password
router.post('/api/auth/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body;
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    
    if (!user || user.reset_code !== code || new Date() > new Date(user.reset_expiry)) {
      return res.status(400).json({ error: 'Tasdiqlash kodi noto\'g\'ri yoki muddati o\'tgan' });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1, reset_code = NULL, reset_expiry = NULL WHERE email = $2', [hashedPassword, email]);
    
    res.json({ success: true, message: 'Parol muvaffaqiyatli o\'zgartirildi' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Google OAuth
router.get('/auth/google', (req, res) => {
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'],
    prompt: 'select_account'
  });
  res.redirect(url);
});

// Google Callback
router.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  
  try {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    const { email, name, sub: google_id, picture } = payload;
    
    let { rows } = await pool.query('SELECT * FROM users WHERE google_id = $1', [google_id]);
    let user = rows[0];
    
    if (!user) {
      const emailCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      user = emailCheck.rows[0];
      
      const targetAdminEmail = 'urinovtolmas20@gmail.com';
      const role = email === targetAdminEmail ? 'admin' : 'user';

      if (user) {
        await pool.query(
          'UPDATE users SET google_id = $1, image = COALESCE(image, $2), full_name = COALESCE(full_name, $3), role = CASE WHEN email = $4 THEN $5 ELSE role END WHERE id = $6', 
          [google_id, picture, name, targetAdminEmail, 'admin', user.id]
        );
        user.google_id = google_id;
        if (email === targetAdminEmail) user.role = 'admin';
      } else {
        const username = email.split('@')[0] + Math.floor(Math.random() * 1000);
        const { rows: newUserRows } = await pool.query(
          'INSERT INTO users (username, email, google_id, image, full_name, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [username, email, google_id, picture, name, role]
        );
        user = newUserRows[0];
      }
    } else {
      // User exists with google_id, but let's ensure role is correct if email is the target admin
      const targetAdminEmail = 'urinovtolmas20@gmail.com';
      if (user.email === targetAdminEmail && user.role !== 'admin') {
        await pool.query('UPDATE users SET role = $1 WHERE id = $2', ['admin', user.id]);
        user.role = 'admin';
      }
    }
    
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: '24h' });
    
    // Redirect back to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/login-success?token=${token}`);
    
  } catch (err) {
    console.error('Google callback error:', err);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
  }
});

// Get Me
router.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, username, email, full_name, role, image, phone, points, notifications_enabled, privacy_private, address_list, saved_cards FROM users WHERE id = $1', [req.user.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Profile
router.put('/api/auth/profile', authenticateToken, async (req, res) => {
  const { username, email, password, image, full_name, phone, notifications_enabled, privacy_private, address_list, saved_cards } = req.body;
  const userId = req.user.id;
  
  try {
    const savedImagePath = saveBase64Image(image);
    let query = 'UPDATE users SET username = $1, email = $2, image = $3, full_name = $4, phone = $5, notifications_enabled = $6, privacy_private = $7, address_list = $8, saved_cards = $9';
    const params = [
      username, 
      email, 
      savedImagePath, 
      full_name, 
      phone, 
      notifications_enabled, 
      privacy_private, 
      JSON.stringify(address_list || []), 
      JSON.stringify(saved_cards || [])
    ];
    
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      query += ', password = $10 WHERE id = $11';
      params.push(hashedPassword, userId);
    } else {
      query += ' WHERE id = $10';
      params.push(userId);
    }
    
    await pool.query(query, params);
    
    // Fetch updated user
    const { rows } = await pool.query('SELECT id, username, email, full_name, role, image, phone, points, notifications_enabled, privacy_private, address_list, saved_cards FROM users WHERE id = $1', [userId]);
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(400).json({ error: 'Username or email already exists' });
  }
});

// Get User Reviews
router.get('/api/auth/my-reviews', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, name, image, comments FROM products WHERE comments @> $1', [JSON.stringify([{ username: req.user.username }])]);
    const reviews = [];
    rows.forEach(p => {
      p.comments.forEach(c => {
        if (c.username === req.user.username) {
          reviews.push({
            productId: p.id,
            productName: p.name,
            productImage: p.image,
            ...c
          });
        }
      });
    });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get all users
router.get('/api/users', authenticateAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, username, email, full_name, role, image, created_at FROM users ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Delete user
router.delete('/api/users/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    // Don't allow admin to delete themselves
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Siz o\'zingizni o\'chira olmaysiz' });
    }
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    
    await logActivity(req.user.id, 'USER_DELETE', `Deleted user ID: ${id}`);
    
    res.json({ success: true, message: 'Foydalanuvchi o\'chirildi' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Super Admin: Role Management
router.patch('/api/super-admin/users/:id/role', authenticateSuperAdmin, async (req, res) => {
  const { role } = req.body;
  const { id } = req.params;
  
  if (!['user', 'admin', 'superadmin'].includes(role)) {
    return res.status(400).json({ error: 'Noma\'lum rol' });
  }

  try {
    await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
    
    // Log activity
    await logActivity(req.user.id, 'ROLE_CHANGE', `User ID: ${id} role changed to ${role}`);
    
    res.json({ success: true, message: 'Foydalanuvchi roli o\'zgartirildi' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Super Admin: Activity Logs
router.get('/api/super-admin/logs', authenticateSuperAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT al.*, u.username 
      FROM activity_logs al 
      JOIN users u ON al.user_id = u.id 
      ORDER BY al.created_at DESC 
      LIMIT 100
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
