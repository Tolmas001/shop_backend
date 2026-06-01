const express = require('express');
const { pool } = require('../database');
const { authenticateToken, authenticateAdmin } = require('../middleware/auth');
const { logActivity } = require('../utils/helpers');

const router = express.Router();

// Validate Promo Code (User Checkout)
router.post('/api/promo/validate', authenticateToken, async (req, res) => {
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
router.get('/api/promo/admin', authenticateAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM promo_codes ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Create promo code
router.post('/api/promo/admin', authenticateAdmin, async (req, res) => {
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
router.put('/api/promo/admin/:id', authenticateAdmin, async (req, res) => {
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
router.delete('/api/promo/admin/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM promo_codes WHERE id = $1', [id]);
    await logActivity(req.user.id, 'PROMO_DELETE', `Deleted promo code ID: ${id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
