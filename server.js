const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { pool, initializeDB } = require('./database');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');
const { sendResetCode } = require('./mailer');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
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
    console.log(`Checking for admin user: ${adminUser}...`);
    const { rows } = await pool.query('SELECT * FROM users WHERE role = $1 OR LOWER(username) = LOWER($2)', ['admin', adminUser.toLowerCase()]);
    const hashedPassword = await bcrypt.hash(adminPass, 10);

    if (rows.length === 0) {
      console.log(`Admin user "${adminUser}" not found, creating one...`);
      await pool.query(
        'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4)',
        [adminUser.toLowerCase(), 'admin@shopsry.com', hashedPassword, 'admin']
      );
      console.log('✅ Admin user created successfully with password from .env');
    } else {
      // Force sync password and role even if user exists
      const existingUser = rows[0];
      await pool.query(
        'UPDATE users SET password = $1, role = $2, username = $3 WHERE id = $4',
        [hashedPassword, 'admin', adminUser.toLowerCase(), existingUser.id]
      );
      console.log(`✅ Admin account synced: User="${adminUser.toLowerCase()}", Role="admin", Password="[UPDATED FROM .env]"`);
    }
    // Seed initial promo codes
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

    // Seed cream categories
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

    return true;
  } catch (err) {
    console.error('❌ Error ensuring admin exists:', err.message);
    return false;
  }
}

async function ensureSuperAdminExists() {
  const superUser = process.env.SUPERADMIN_USERNAME || 'superadmin';
  const superPass = process.env.SUPERADMIN_PASSWORD || 'superadmin123';
  
  try {
    console.log(`Checking for superadmin user: ${superUser}...`);
    const hashedPassword = await bcrypt.hash(superPass, 10);
    
    const { rows } = await pool.query('SELECT * FROM users WHERE role = $1 OR LOWER(username) = LOWER($2)', ['superadmin', superUser.toLowerCase()]);
    
    if (rows.length === 0) {
      console.log(`Superadmin user "${superUser}" not found, creating one...`);
      await pool.query(
        'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4)',
        [superUser.toLowerCase(), 'super@shopsry.com', hashedPassword, 'superadmin']
      );
      console.log('✅ Superadmin user created successfully');
    } else {
      const user = rows[0];
      await pool.query(
        'UPDATE users SET password = $1, role = $2, username = $3 WHERE id = $4',
        [hashedPassword, 'superadmin', superUser.toLowerCase(), user.id]
      );
      console.log(`✅ Superadmin account synced`);
    }
    return true;
  } catch (err) {
    console.error('❌ Error ensuring superadmin exists:', err.message);
    return false;
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

// Emergency Admin Reset Endpoint
app.get('/api/auth/reset-admin', async (req, res) => {
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

const SECRET_KEY = process.env.JWT_SECRET || 'secret';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

function authenticateAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  
  jwt.verify(token, SECRET_KEY, (err, user) => {
    // Both admin and superadmin can access standard admin routes
    if (err || (user.role !== 'admin' && user.role !== 'superadmin')) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

function authenticateSuperAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err || user.role !== 'superadmin') return res.sendStatus(403);
    req.user = user;
    next();
  });
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

// Categories
app.get('/api/categories', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM categories ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', authenticateAdmin, async (req, res) => {
  const { name, description } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING id',
      [name, description]
    );
    
    await logActivity(req.user.id, 'CATEGORY_CREATE', `Created category: ${name}`);
    
    res.json({ id: rows[0].id, name, description });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/categories/:id', authenticateAdmin, async (req, res) => {
  const { name, description } = req.body;
  try {
    await pool.query(
      'UPDATE categories SET name = $1, description = $2 WHERE id = $3',
      [name, description, req.params.id]
    );
    
    await logActivity(req.user.id, 'CATEGORY_UPDATE', `Updated category: ${name} (ID: ${req.params.id})`);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', authenticateAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    
    await logActivity(req.user.id, 'CATEGORY_DELETE', `Deleted category ID: ${req.params.id}`);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Products with filtering and sorting
app.get('/api/products', async (req, res) => {
  const { brand, name, category, minPrice, maxPrice, sort } = req.query;
  let query = 'SELECT * FROM products WHERE 1=1';
  const params = [];
  let paramCount = 1;
  
  if (brand) {
    query += ` AND brand ILIKE $${paramCount++}`;
    params.push(`%${brand}%`);
  }
  if (name) {
    query += ` AND name ILIKE $${paramCount++}`;
    params.push(`%${name}%`);
  }
  if (category) {
    query += ` AND category ILIKE $${paramCount++}`;
    params.push(`%${category}%`);
  }
  if (minPrice) {
    query += ` AND price >= $${paramCount++}`;
    params.push(minPrice);
  }
  if (maxPrice) {
    query += ` AND price <= $${paramCount++}`;
    params.push(maxPrice);
  }
  
  switch(sort) {
    case 'price_asc': query += ' ORDER BY price ASC'; break;
    case 'price_desc': query += ' ORDER BY price DESC'; break;
    case 'newest': query += ' ORDER BY created_at DESC'; break;
    default: query += ' ORDER BY created_at DESC';
  }
  
  try {
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', authenticateAdmin, async (req, res) => {
  const { name, brand, category, description, price, image, colors, sizes, stock_count } = req.body;
  const processedImage = saveBase64Image(image);
  try {
    const { rows } = await pool.query(
      'INSERT INTO products (name, brand, category, description, price, image, colors, sizes, stock_count) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
      [name, brand, category, description, price, processedImage, JSON.stringify(colors || []), JSON.stringify(sizes || []), stock_count || 0]
    );
    
    await logActivity(req.user.id, 'PRODUCT_CREATE', `Created product: ${name} (ID: ${rows[0].id})`);
    
    res.json({ id: rows[0].id, name, brand, category, description, price, image: processedImage, colors, sizes, stock_count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', authenticateAdmin, async (req, res) => {
  const { name, brand, category, description, price, image, colors, sizes, stock_count } = req.body;
  const processedImage = saveBase64Image(image);
  try {
    await pool.query(
      'UPDATE products SET name = $1, brand = $2, category = $3, description = $4, price = $5, image = $6, colors = $7, sizes = $8, stock_count = $9 WHERE id = $10',
      [name, brand, category, description, price, processedImage, JSON.stringify(colors || []), JSON.stringify(sizes || []), stock_count, req.params.id]
    );
    
    await logActivity(req.user.id, 'PRODUCT_UPDATE', `Updated product: ${name} (ID: ${req.params.id})`);
    
    res.json({ success: true, image: processedImage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', authenticateAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    
    await logActivity(req.user.id, 'PRODUCT_DELETE', `Deleted product ID: ${req.params.id}`);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ADS API ---
app.get('/api/ads', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM ads WHERE is_active = true ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ads/admin', authenticateAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM ads ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ads', authenticateAdmin, async (req, res) => {
  const { title, subtitle, description, image, button_text, link, color, is_active } = req.body;
  const processedImage = saveBase64Image(image);
  try {
    const { rows } = await pool.query(
      'INSERT INTO ads (title, subtitle, description, image, button_text, link, color, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [title, subtitle, description, processedImage, button_text, link, color, is_active !== undefined ? is_active : true]
    );
    await logActivity(req.user.id, 'AD_CREATE', `Created ad: ${title}`);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/ads/:id', authenticateAdmin, async (req, res) => {
  const { title, subtitle, description, image, button_text, link, color, is_active } = req.body;
  const processedImage = saveBase64Image(image);
  try {
    await pool.query(
      'UPDATE ads SET title = $1, subtitle = $2, description = $3, image = $4, button_text = $5, link = $6, color = $7, is_active = $8 WHERE id = $9',
      [title, subtitle, description, processedImage, button_text, link, color, is_active, req.params.id]
    );
    await logActivity(req.user.id, 'AD_UPDATE', `Updated ad ID: ${req.params.id}`);
    res.json({ success: true, image: processedImage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/ads/:id', authenticateAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM ads WHERE id = $1', [req.params.id]);
    await logActivity(req.user.id, 'AD_DELETE', `Deleted ad ID: ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- NOTIFICATIONS API ---
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM notifications WHERE (user_id = $1 OR user_id IS NULL) ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications/broadcast', authenticateAdmin, async (req, res) => {
  const { message, type } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });
  
  try {
    await pool.query(
      'INSERT INTO notifications (user_id, message, type) VALUES (NULL, $1, $2)',
      [message, type || 'info']
    );
    res.json({ success: true, message: 'Broadcast sent successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/notifications/read-all', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE (user_id = $1 OR user_id IS NULL)',
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- BLOGS API ---
app.post('/api/products/:id/like', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const { rows } = await pool.query('SELECT likes FROM products WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    
    let likes = rows[0].likes || [];
    const index = likes.indexOf(userId);
    if (index > -1) {
      likes.splice(index, 1);
    } else {
      likes.push(userId);
    }
    await pool.query('UPDATE products SET likes = $1 WHERE id = $2', [JSON.stringify(likes), req.params.id]);
    res.json({ likes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add comment
app.post('/api/products/:id/comments', authenticateToken, async (req, res) => {
  const { text, image } = req.body;
  const processedImage = saveBase64Image(image);
  try {
    const { rows } = await pool.query('SELECT comments FROM products WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    
    let comments = rows[0].comments || [];
    comments.push({
      username: req.user.username,
      text,
      image: processedImage || null,
      timestamp: new Date().toISOString()
    });
    await pool.query('UPDATE products SET comments = $1 WHERE id = $2', [JSON.stringify(comments), req.params.id]);
    res.json({ comments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Delete comment
app.delete('/api/products/:id/comments/:index', authenticateAdmin, async (req, res) => {
  try {
    const { id, index } = req.params;
    const { rows } = await pool.query('SELECT comments FROM products WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    
    let comments = rows[0].comments || [];
    const idx = parseInt(index);
    if (idx >= 0 && idx < comments.length) {
      comments.splice(idx, 1);
      await pool.query('UPDATE products SET comments = $1 WHERE id = $2', [JSON.stringify(comments), id]);
      res.json({ success: true, comments });
    } else {
      res.status(400).json({ error: 'Invalid comment index' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Orders
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.*, 
       COALESCE(json_agg(json_build_object('name', p.name, 'image', p.image, 'quantity', oi.quantity, 'price', oi.price)) FILTER (WHERE p.id IS NOT NULL), '[]') as items_list
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE o.user_id = $1
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/admin', authenticateAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.*, 
       COALESCE(json_agg(json_build_object('name', p.name, 'image', p.image, 'quantity', oi.quantity, 'price', oi.price)) FILTER (WHERE p.id IS NOT NULL), '[]') as items_list
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN products p ON oi.product_id = p.id
       GROUP BY o.id
       ORDER BY o.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.*, 
       COALESCE(json_agg(json_build_object('name', p.name, 'image', p.image, 'quantity', oi.quantity, 'price', oi.price)) FILTER (WHERE p.id IS NOT NULL), '[]') as items_list
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE o.id = $1 AND (o.user_id = $2 OR $3 = 'admin')
       GROUP BY o.id`,
      [req.params.id, req.user.id, req.user.role]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Validate Promo Code
app.post('/api/promo/validate', authenticateToken, async (req, res) => {
  const { code } = req.body;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM promo_codes WHERE code = $1 AND is_active = true AND (expiry_date IS NULL OR expiry_date > NOW()) AND (usage_limit IS NULL OR used_count < usage_limit)',
      [code]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Promo-kod noto\'g\'ri or muddati o\'tgan yoki limit tugagan' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get all promo codes
app.get('/api/promo/admin', authenticateAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM promo_codes ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Create promo code
app.post('/api/promo/admin', authenticateAdmin, async (req, res) => {
  const { code, discount_percent, expiry_date, usage_limit } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO promo_codes (code, discount_percent, expiry_date, usage_limit) VALUES ($1, $2, $3, $4) RETURNING *',
      [code.toUpperCase(), discount_percent, expiry_date || null, usage_limit || 100]
    );
    await logActivity(req.user.id, 'PROMO_CREATE', `Created promo code: ${code.toUpperCase()} (${discount_percent}%)`);
    res.json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: 'Promo-kod allaqachon mavjud' });
  }
});

// Admin: Update promo code
app.put('/api/promo/admin/:id', authenticateAdmin, async (req, res) => {
  const { code, discount_percent, expiry_date, usage_limit, is_active } = req.body;
  const { id } = req.params;
  try {
    await pool.query(
      'UPDATE promo_codes SET code = $1, discount_percent = $2, expiry_date = $3, usage_limit = $4, is_active = $5 WHERE id = $6',
      [code.toUpperCase(), discount_percent, expiry_date || null, usage_limit, is_active, id]
    );
    await logActivity(req.user.id, 'PROMO_UPDATE', `Updated promo code ID: ${id} (${code.toUpperCase()})`);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin: Delete promo code
app.delete('/api/promo/admin/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM promo_codes WHERE id = $1', [id]);
    await logActivity(req.user.id, 'PROMO_DELETE', `Deleted promo code ID: ${id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', authenticateToken, async (req, res) => {
  const { customer_name, customer_phone, customer_address, items, payment_method, promo_code, use_points, delivery_method, delivery_cost } = req.body;
  const user_id = req.user.id;
  
  let subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  let discount = 0;
  let shipping = parseFloat(delivery_cost) || 0;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Calculate Promo Discount
    if (promo_code) {
      const promoRes = await client.query('SELECT * FROM promo_codes WHERE code = $1 AND is_active = true', [promo_code]);
      if (promoRes.rows.length > 0) {
        const promo = promoRes.rows[0];
        discount = (subtotal * promo.discount_percent) / 100;
        await client.query('UPDATE promo_codes SET used_count = used_count + 1 WHERE id = $1', [promo.id]);
      }
    }

    let total = subtotal - discount + shipping;

    // 2. Point Spending (1 point = 1000 UZS)
    if (use_points && user_id) {
      const userRes = await client.query('SELECT points FROM users WHERE id = $1', [user_id]);
      const availablePoints = userRes.rows[0].points || 0;
      const pointsToUse = Math.min(availablePoints, Math.floor(total / 1000));
      if (pointsToUse > 0) {
        total -= pointsToUse * 1000;
        await client.query('UPDATE users SET points = points - $1 WHERE id = $2', [pointsToUse, user_id]);
      }
    }

    const payment_status = payment_method === 'card' ? 'paid' : 'unpaid';
    
    const { rows } = await client.query(
      'INSERT INTO orders (user_id, customer_name, customer_phone, customer_address, total_amount, payment_method, payment_status, delivery_method, delivery_cost) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
      [user_id || null, customer_name, customer_phone, customer_address, total, payment_method || 'cash', payment_status, delivery_method || 'standard', shipping]
    );
    const orderId = rows[0].id;
    
    // 3. Earn New Points (1 point per 10,000 UZS of net total)
    if (user_id) {
      const pointsEarned = Math.floor(total / 10000);
      if (pointsEarned > 0) {
        await client.query('UPDATE users SET points = COALESCE(points, 0) + $1 WHERE id = $2', [pointsEarned, user_id]);
      }
    }
    
    for (const item of items) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
        [orderId, item.id, item.quantity, item.price]
      );
    }
    await client.query('COMMIT');
    
    // Order Notification Trigger
    if (user_id) {
      createNotification(user_id, `Buyurtmangiz muvaffaqiyatli qabul qilindi! Buyurtma raqami: #${orderId}`, 'success');
    }
    
    res.json({ success: true, order_id: orderId });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// One-click buy requests
app.post('/api/orders/one-click', async (req, res) => {
  const { name, phone, product_id, product_name } = req.body;
  try {
    // For now, we'll store this as a specialized order or just log it
    // In a real app, this might send a Telegram/Email alert to the shop owner
    console.log(`[ONE-CLICK BUY] User ${name} (${phone}) interested in: ${product_name} (ID: ${product_id})`);
    
    // We could also insert into a 'quick_orders' table if it exists, or just the orders table with minimal info
    const { rows } = await pool.query(
      'INSERT INTO orders (customer_name, customer_phone, customer_address, total_amount, status, payment_method) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [name, phone, 'Quick Buy', 0, 'pending', 'one-click']
    );
    
    res.json({ success: true, order_id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/orders/:id/status', authenticateAdmin, async (req, res) => {
  const { status } = req.body;
  try {
    await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, req.params.id]);
    
    await logActivity(req.user.id, 'ORDER_STATUS_UPDATE', `Updated order ID: ${req.params.id} to status: ${status}`);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/orders/:id/cancel', authenticateToken, async (req, res) => {
  const orderId = req.params.id;
  const userId = req.user.id;
  
  try {
    // Verify order ownership and status
    const { rows } = await pool.query(
      'SELECT id, status FROM orders WHERE id = $1 AND user_id = $2',
      [orderId, userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Order not found or access denied' });
    }
    
    if (rows[0].status !== 'pending') {
      return res.status(400).json({ error: `Cannot cancel order with status: ${rows[0].status}` });
    }
    
    // Update status to cancelled
    await pool.query(
      'UPDATE orders SET status = \'cancelled\' WHERE id = $1',
      [orderId]
    );
    
    res.json({ success: true, message: 'Order cancelled successfully' });
  } catch (err) {
    console.error('Order cancel error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Auth
app.post('/api/auth/register', async (req, res) => {
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

app.post('/api/auth/login', async (req, res) => {
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

app.post('/api/auth/forgot-password', async (req, res) => {
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

app.post('/api/auth/verify-reset-code', async (req, res) => {
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

app.post('/api/auth/reset-password', async (req, res) => {
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


const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URL || 'http://localhost:5001/auth/google/callback'
);

app.get('/auth/google', (req, res) => {
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'],
    prompt: 'select_account'
  });
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
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

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, username, email, full_name, role, image, phone, points, notifications_enabled, privacy_private, address_list, saved_cards FROM users WHERE id = $1', [req.user.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get all users
app.get('/api/users', authenticateAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, username, email, full_name, role, image, created_at FROM users ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Super Admin: Role Management
app.patch('/api/super-admin/users/:id/role', authenticateSuperAdmin, async (req, res) => {
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
app.get('/api/super-admin/logs', authenticateSuperAdmin, async (req, res) => {
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

// Admin: Delete user
app.delete('/api/users/:id', authenticateAdmin, async (req, res) => {
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

app.put('/api/auth/profile', authenticateToken, async (req, res) => {
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

// User reviews
app.get('/api/auth/my-reviews', authenticateToken, async (req, res) => {
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

// Advanced Stats
app.get('/api/stats', authenticateAdmin, async (req, res) => {
  try {
    const productsRes = await pool.query('SELECT COUNT(*) as count FROM products');
    const ordersRes = await pool.query('SELECT COUNT(*) as count FROM orders');
    const revenueRes = await pool.query('SELECT SUM(total_amount) as total FROM orders');
    const pendingRes = await pool.query('SELECT COUNT(*) as count FROM orders WHERE status = $1', ['pending']);
    
    // Revenue trend (last 6 months)
    const trendRes = await pool.query(`
      SELECT 
        TO_CHAR(created_at, 'Mon') as label,
        SUM(total_amount) as val
      FROM orders
      WHERE created_at > NOW() - INTERVAL '6 months'
      GROUP BY TO_CHAR(created_at, 'Mon'), DATE_TRUNC('month', created_at)
      ORDER BY DATE_TRUNC('month', created_at)
    `);

    // Most Wishlisted Products
    const wishlistStatsRes = await pool.query(`
       SELECT p.name, COUNT(w.id) as wishlist_count
       FROM wishlist w
       JOIN products p ON w.product_id = p.id
       GROUP BY p.id, p.name
       ORDER BY wishlist_count DESC
       LIMIT 5
    `);

    // Status distribution
    const statusRes = await pool.query(`
      SELECT status as label, COUNT(*) as count
      FROM orders
      GROUP BY status
    `);

    // Recent orders
    const recentOrdersRes = await pool.query(`
      SELECT o.id, o.customer_name, o.total_amount, o.status, o.created_at
      FROM orders o
      ORDER BY o.created_at DESC
      LIMIT 5
    `);
    
    // Low stock products
    const lowStockRes = await pool.query(`
      SELECT id, name, stock_count
      FROM products
      WHERE stock_count < 5
      ORDER BY stock_count ASC
      LIMIT 10
    `);
    
    res.json({
      totalProducts: parseInt(productsRes.rows[0].count),
      totalOrders: parseInt(ordersRes.rows[0].count),
      totalRevenue: parseFloat(revenueRes.rows[0].total) || 0,
      pendingOrders: parseInt(pendingRes.rows[0].count),
      revenueTrend: trendRes.rows.map(r => ({ label: r.label, val: parseFloat(r.val) })),
      statusDistribution: statusRes.rows,
      recentOrders: recentOrdersRes.rows,
      lowStockProducts: lowStockRes.rows,
      popularWishlist: wishlistStatsRes.rows
    });
  } catch (err) {
     res.status(500).json({ error: err.message });
  }
});

// Wishlist
app.get('/api/wishlist', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT p.* FROM products p JOIN wishlist w ON p.id = w.product_id WHERE w.user_id = $1',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/wishlist/:productId', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'INSERT INTO wishlist (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.id, req.params.productId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/wishlist/:productId', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM wishlist WHERE user_id = $1 AND product_id = $2', [req.user.id, req.params.productId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Blogs
app.get('/api/blogs', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM blogs ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/blogs/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM blogs WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Blog post not found' });
    
    // Increment views
    await pool.query('UPDATE blogs SET views = views + 1 WHERE id = $1', [req.params.id]);
    
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/blogs', authenticateAdmin, async (req, res) => {
  const { title, content, image, tags } = req.body;
  const processedImage = saveBase64Image(image);
  try {
    const { rows } = await pool.query(
      'INSERT INTO blogs (title, content, image, tags) VALUES ($1, $2, $3, $4) RETURNING id',
      [title, content, processedImage, JSON.stringify(tags || [])]
    );
    res.json({ id: rows[0].id, title, content, image: processedImage, tags });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Demo data insertion API
app.post('/api/demo/seed', async (req, res) => {
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

const PORT = process.env.PORT || 5001;

// Database initialization and admin seeding on startup
const startServer = async () => {
  try {
    await initializeDB();
    console.log('PostgreSQL initialized successfully');
    await ensureAdminExists();
    await ensureSuperAdminExists();
    
    app.listen(PORT, () => {
      console.log(`\n🚀 ShopSRY Backend is running!`);
      console.log(`   - Port: ${PORT}`);
      console.log(`   - Local: http://localhost:${PORT}`);
      console.log(`   - Uploads: http://localhost:${PORT}/uploads\n`);
    });
  } catch (err) {
    console.error('CRITICAL: Server failed to start!', err);
  }
};

startServer();