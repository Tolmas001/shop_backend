const express = require('express');
const { pool } = require('../database');
const { authenticateToken, authenticateAdmin } = require('../middleware/auth');

const router = express.Router();

// Get user notifications (protected)
router.get('/api/notifications', authenticateToken, async (req, res) => {
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

// Broadcast notification to all users (admin)
router.post('/api/notifications/broadcast', authenticateAdmin, async (req, res) => {
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

// Mark single notification as read (protected)
router.patch('/api/notifications/:id/read', authenticateToken, async (req, res) => {
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

// Mark all notifications as read (protected)
router.patch('/api/notifications/read-all', authenticateToken, async (req, res) => {
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

module.exports = router;
