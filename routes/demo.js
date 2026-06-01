const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../database');
const { ensureAdminExists } = require('../utils/helpers');

const router = express.Router();

// Emergency Admin Reset Endpoint
router.get('/api/auth/reset-admin', async (req, res) => {
  const success = await ensureAdminExists();
  if (success) {
    const fUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #2563EB;">ShopSRY API is Running</h1>
        <p>Backend version 2.0.0 (Production Ready)</p>
        <a href="${fUrl}/admin/login" style="background: #2563EB; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none;">Go to Login Page</a>
      </div>
    `);
  } else {
    res.status(500).send('Error resetting admin account. Check server logs.');
  }
});

// Demo data insertion API
router.post('/api/demo/seed', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create Admin User from .env
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedAdminPass = await bcrypt.hash(adminPass, 10);
    
    // Check if admin exists before inserting
    const { rows: existingAdmin } = await client.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [adminUser]);
    if (existingAdmin.length === 0) {
      await client.query(
        'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4)',
        [adminUser, 'admin@shop.com', hashedAdminPass, 'admin']
      );
    }

    // Create categories (check existence first since no UNIQUE constraint on name)
    const categories = [
      ['Electronics', 'Gadgets and devices'],
      ['Clothing', 'Men and Women clothing'],
      ['Home', 'Everything for your home']
    ];
    for (const c of categories) {
      const { rows: existing } = await client.query('SELECT id FROM categories WHERE name = $1', [c[0]]);
      if (existing.length === 0) {
        await client.query('INSERT INTO categories (name, description) VALUES ($1, $2)', [c[0], c[1]]);
      }
    }
    
    // Create some products (check by name to avoid duplicates)
    const sampleProducts = [
      ['Smartphone X', 'TechBrand', 'Electronics', 'Latest smartphone with amazing features.', 699, 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=800'],
      ['Cotton T-Shirt', 'FashionCo', 'Clothing', 'Premium cotton t-shirt for daily wear.', 19, 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800'],
      ['Smart Watch', 'FitLife', 'Electronics', 'Track your health and fitness in style.', 199, 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=800']
    ];
    for (const p of sampleProducts) {
      const { rows: existingProduct } = await client.query('SELECT id FROM products WHERE name = $1 AND brand = $2', [p[0], p[1]]);
      if (existingProduct.length === 0) {
        await client.query(
          'INSERT INTO products (name, brand, category, description, price, image, colors, sizes, stock_count) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)', 
          [p[0], p[1], p[2], p[3], p[4], p[5], JSON.stringify(['Black', 'White']), JSON.stringify(['M', 'L']), 50]
        );
      }
    }

    // Create Blog Posts
    const blogPosts = [
      ['ShopSRY: Kelajak Do\'koni', 'Bizning do\'konimizda endi sun\'iy intellekt yordamida mahsulot tanlash imkoniyati mavjud. Kelajak texnologiyalari bilan tanishing!', 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800', ['tech', 'future']],
      ['Smartfon tanlashda 5 ta xato', '2026-yilda smartfon tanlashda nimalarga e\'tibor berish kerakligi haqida eng muhim maslahatlar. Xatolardan qoching!', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800', ['guide', 'mobile']],
      ['Toshkentda 1 soat ichida yetkazib berish', 'Biz endi buyurtmalaringizni poytaxt bo\'ylab atigi 1 soat ichida yetkazib bera olamiz! Xizmat sifatini oshirishda davom etamiz.', 'https://images.unsplash.com/photo-1580674285054-bed31e145f59?w=800', ['news', 'delivery']]
    ];
    for (const b of blogPosts) {
      const { rows: existingBlog } = await client.query('SELECT id FROM blogs WHERE title = $1', [b[0]]);
      if (existingBlog.length === 0) {
        await client.query(
          'INSERT INTO blogs (title, content, image, tags) VALUES ($1, $2, $3, $4)',
          [b[0], b[1], b[2], JSON.stringify(b[3])]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Demo ma\'lumotlar muvaffaqiyatli qo\'shildi!' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Demo seed error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
