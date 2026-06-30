const express = require('express');
const { pool } = require('../database');
const { authenticateAdmin } = require('../middleware/auth');

const router = express.Router();

// Get admin notifications
router.get('/api/admin/notifications', authenticateAdmin, async (req, res) => {
  try {
    const { unread_only = false } = req.query;
    let query = 'SELECT * FROM admin_notifications';
    const params = [];
    
    if (unread_only === 'true') {
      query += ' WHERE is_read = false';
    }
    
    query += ' ORDER BY created_at DESC LIMIT 50';
    
    const { rows } = await pool.query(query, params);
    
    // Get unread count
    const countRes = await pool.query(
      'SELECT COUNT(*) as count FROM admin_notifications WHERE is_read = false'
    );
    
    res.json({
      notifications: rows,
      unread_count: parseInt(countRes.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create admin notification
router.post('/api/admin/notifications', authenticateAdmin, async (req, res) => {
  const { title, message, type = 'info', priority = 'normal' } = req.body;
  
  try {
    const { rows } = await pool.query(
      'INSERT INTO admin_notifications (title, message, type, priority) VALUES ($1, $2, $3, $4) RETURNING *',
      [title, message, type, priority]
    );
    
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark notification as read
router.patch('/api/admin/notifications/:id/read', authenticateAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE admin_notifications SET is_read = true WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark all notifications as read
router.patch('/api/admin/notifications/read-all', authenticateAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE admin_notifications SET is_read = true WHERE is_read = false');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete notification
router.delete('/api/admin/notifications/:id', authenticateAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM admin_notifications WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
