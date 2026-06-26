// scripts/seed_admins.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { pool } = require('../database');

(async () => {
  try {
    // Admin credentials from .env (fallback defaults)
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const superUsername = process.env.SUPERADMIN_USERNAME || 'superadmin';
    const superPassword = process.env.SUPERADMIN_PASSWORD || 'superadmin123';

    const adminHash = await bcrypt.hash(adminPassword, 10);
    const superHash = await bcrypt.hash(superPassword, 10);

    // Upsert admin
    await pool.query(
      `INSERT INTO users (username, email, password, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, role = EXCLUDED.role`,
      [adminUsername, `${adminUsername}@example.com`, adminHash, 'admin']
    );

    // Upsert super‑admin
    await pool.query(
      `INSERT INTO users (username, email, password, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, role = EXCLUDED.role`,
      [superUsername, `${superUsername}@example.com`, superHash, 'superadmin']
    );

    console.log('✅ Admin va Super‑admin foydalanuvchilar bazaga qo‘shildi / yangilandi');
    process.exit(0);
  } catch (err) {
    console.error('❌ Xato:', err);
    process.exit(1);
  }
})();
