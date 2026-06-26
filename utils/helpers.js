const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('../database');

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Helper to save base64 image
function saveBase64Image(base64) {
  if (!base64 || !base64.startsWith('data:image/')) return base64;
  
  try {
    // Improved regex to handle various MIME types like image/webp, image/svg+xml, etc.
    const matches = base64.match(/^data:image\/([^;]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return base64;
    
    let extension = matches[1].toLowerCase();
    
    // Map MIME types to clean extensions
    if (extension.includes('svg')) {
      extension = 'svg';
    } else if (extension === 'jpeg' || extension === 'pjpeg') {
      extension = 'jpg';
    } else if (extension.includes('icon') || extension.includes('x-icon')) {
      extension = 'ico';
    } else {
      // For types like png, gif, webp, avif, etc.
      extension = extension.split('+')[0].split('.')[0].split('/')[0];
    }
    
    const data = matches[2];
    const buffer = Buffer.from(data, 'base64');
    const filename = `img_${Date.now()}_${Math.floor(Math.random() * 1000)}.${extension}`;
    const filepath = path.join(uploadsDir, filename);
    
    fs.writeFileSync(filepath, buffer);
    return `/uploads/${filename}`;
  } catch (err) {
    console.error('Error saving image:', err);
    return base64;
  }
}

// Admin seeding logic
async function ensureAdminExists() {
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE role = $1 OR LOWER(username) = LOWER($2)', ['admin', adminUser.toLowerCase()]);
    const hashedPassword = await bcrypt.hash(adminPass, 10);

    if (rows.length === 0) {
      console.log(`Admin user "${adminUser}" not found, creating one...`);
      await pool.query(
        'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4)',
        [adminUser.toLowerCase(), 'admin@shopsry.com', hashedPassword, 'admin']
      );
      console.log('✅ Admin user created successfully');
    } else {
      const existingUser = rows[0];
      await pool.query(
        'UPDATE users SET password = $1, role = $2, username = $3 WHERE id = $4',
        [hashedPassword, 'admin', adminUser.toLowerCase(), existingUser.id]
      );
      console.log(`✅ Admin account synced: User="${adminUser.toLowerCase()}", Role="admin"`);
    }

    const demoPromos = [
      { code: 'SHOPSRY10', percent: 10 },
      { code: 'NEW2026', percent: 20 },
      { code: 'UZUM', percent: 15 }
    ];
    for (const p of demoPromos) {
      await pool.query(
        'INSERT INTO promo_codes (code, discount_percent) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING',
        [p.code, p.percent]
      );
    }

    const creamCategories = [
      { name: 'Yuz kremlari', desc: 'Yuz terisi uchun maxsus kremlar' },
      { name: 'Qo\'l kremlari', desc: 'Qo\'l va tirnoq parvarishi uchun' },
      { name: 'Tana kremlari', desc: 'Tana terisini namlantiruvchi kremlar' },
      { name: 'Quyoshdan himoya kremlari', desc: 'SPF himoya vositalari' }
    ];
    for (const cat of creamCategories) {
      await pool.query(
        'INSERT INTO categories (name, description) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [cat.name, cat.desc]
      );
    }

    return { username: adminUser.toLowerCase(), password: adminPass, role: 'admin' };
  } catch (err) {
    console.error('❌ Error ensuring admin exists:', err.message);
    return null;
  }
}

async function ensureSuperAdminExists() {
  const superUser = process.env.SUPERADMIN_USERNAME || 'superadmin';
  const superPass = process.env.SUPERADMIN_PASSWORD || 'superadmin123';

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE role = $1 OR LOWER(username) = LOWER($2)', ['superadmin', superUser.toLowerCase()]);

    if (rows.length === 0) {
      const hashedPassword = await bcrypt.hash(superPass, 10);
      await pool.query(
        'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4)',
        [superUser.toLowerCase(), 'super@shopsry.com', hashedPassword, 'superadmin']
      );
      console.log('✅ Superadmin user created successfully');
    } else {
      const user = rows[0];
      const hashedPassword = await bcrypt.hash(superPass, 10);
      await pool.query(
        'UPDATE users SET password = $1, role = $2, username = $3 WHERE id = $4',
        [hashedPassword, 'superadmin', superUser.toLowerCase(), user.id]
      );
      console.log(`✅ Superadmin account synced`);
    }

    return { username: superUser.toLowerCase(), password: superPass, role: 'superadmin' };
  } catch (err) {
    console.error('❌ Error ensuring superadmin exists:', err.message);
    return null;
  }
}

// Activity logging helper
async function logActivity(userId, action, details) {
  try {
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [userId, action, typeof details === 'object' ? JSON.stringify(details) : details]
    );
  } catch (err) {
    console.error('Error logging activity:', err.message);
  }
}

// Notification Helper
async function createNotification(userId, message, type = 'info') {
  try {
    await pool.query(
      'INSERT INTO notifications (user_id, message, type) VALUES ($1, $2, $3)',
      [userId, message, type]
    );
    return true;
  } catch (err) {
    console.error('Error creating notification:', err.message);
    return false;
  }
}

module.exports = {
  saveBase64Image,
  ensureAdminExists,
  ensureSuperAdminExists,
  logActivity,
  createNotification
};
