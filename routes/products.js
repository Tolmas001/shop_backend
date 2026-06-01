const express = require('express');
const { pool } = require('../database');
const { authenticateToken, authenticateAdmin } = require('../middleware/auth');
const { saveBase64Image, logActivity } = require('../utils/helpers');

const router = express.Router();

// Categories - Get all
router.get('/api/categories', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM categories ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Categories - Create
router.post('/api/categories', authenticateAdmin, async (req, res) => {
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

// Categories - Update
router.put('/api/categories/:id', authenticateAdmin, async (req, res) => {
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

// Categories - Delete
router.delete('/api/categories/:id', authenticateAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    
    await logActivity(req.user.id, 'CATEGORY_DELETE', `Deleted category ID: ${req.params.id}`);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Products - Get with filtering and sorting
router.get('/api/products', async (req, res) => {
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

// Products - Get specific
router.get('/api/products/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Products - Create
router.post('/api/products', authenticateAdmin, async (req, res) => {
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

// Products - Update
router.put('/api/products/:id', authenticateAdmin, async (req, res) => {
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

// Products - Delete
router.delete('/api/products/:id', authenticateAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    
    await logActivity(req.user.id, 'PRODUCT_DELETE', `Deleted product ID: ${req.params.id}`);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Products - Like
router.post('/api/products/:id/like', authenticateToken, async (req, res) => {
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

// Products - Add Comment
router.post('/api/products/:id/comments', authenticateToken, async (req, res) => {
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

// Products - Admin Delete Comment
router.delete('/api/products/:id/comments/:index', authenticateAdmin, async (req, res) => {
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

module.exports = router;
