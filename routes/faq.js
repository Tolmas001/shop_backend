const express = require('express');
const { pool } = require('../database');
const { authenticateAdmin } = require('../middleware/auth');
const { logActivity } = require('../utils/helpers');

const router = express.Router();

// Get all FAQs (Public)
router.get('/api/faq', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM faq ORDER BY order_index ASC, created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new FAQ (Admin only)
router.post('/api/faq', authenticateAdmin, async (req, res) => {
  const { question, answer, is_active, order_index } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO faq (question, answer, is_active, order_index) VALUES ($1, $2, $3, $4) RETURNING *',
      [question, answer, is_active !== false, order_index || 0]
    );
    
    await logActivity(req.user.id, 'FAQ_CREATE', `Created FAQ: ${question}`);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update FAQ (Admin only)
router.put('/api/faq/:id', authenticateAdmin, async (req, res) => {
  const { question, answer, is_active, order_index } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE faq SET question = $1, answer = $2, is_active = $3, order_index = $4 WHERE id = $5 RETURNING *',
      [question, answer, is_active, order_index, req.params.id]
    );
    
    if (rows.length === 0) return res.status(404).json({ error: 'FAQ topilmadi' });
    
    await logActivity(req.user.id, 'FAQ_UPDATE', `Updated FAQ ID: ${req.params.id}`);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete FAQ (Admin only)
router.delete('/api/faq/:id', authenticateAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM faq WHERE id = $1', [req.params.id]);
    await logActivity(req.user.id, 'FAQ_DELETE', `Deleted FAQ ID: ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
