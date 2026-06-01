const express = require('express');
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get Wishlist
router.get('/api/wishlist', authenticateToken, async (req, res) => {
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

// Add to Wishlist
router.post('/api/wishlist/:productId', authenticateToken, async (req, res) => {
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

// Remove from Wishlist
router.delete('/api/wishlist/:productId', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM wishlist WHERE user_id = $1 AND product_id = $2', [req.user.id, req.params.productId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
