const express = require('express');
const { pool } = require('../database');
const { authenticateAdmin } = require('../middleware/auth');
const { saveBase64Image } = require('../utils/helpers');

const router = express.Router();

// Get all blogs (public)
router.get('/api/blogs', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM blogs ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get specific blog post and increment views (public)
router.get('/api/blogs/:id', async (req, res) => {
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

// Create blog post (admin)
router.post('/api/blogs', authenticateAdmin, async (req, res) => {
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

module.exports = router;
