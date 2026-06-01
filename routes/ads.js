const express = require('express');
const { pool } = require('../database');
const { authenticateAdmin } = require('../middleware/auth');
const { saveBase64Image, logActivity } = require('../utils/helpers');

const router = express.Router();

// Get active ads (public)
router.get('/api/ads', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM ads WHERE is_active = true ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all ads (admin)
router.get('/api/ads/admin', authenticateAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM ads ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create ad (admin)
router.post('/api/ads', authenticateAdmin, async (req, res) => {
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

// Update ad (admin)
router.put('/api/ads/:id', authenticateAdmin, async (req, res) => {
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

// Delete ad (admin)
router.delete('/api/ads/:id', authenticateAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM ads WHERE id = $1', [req.params.id]);
    await logActivity(req.user.id, 'AD_DELETE', `Deleted ad ID: ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
