const express = require('express');
const { pool } = require('../database');
const { authenticateAdmin, authenticateToken } = require('../middleware/auth');
const { createNotification, logActivity } = require('../utils/helpers');
const { emitDeliveryUpdated } = require('../socket');

const router = express.Router();

// Get all deliveries (based on orders)
router.get('/api/admin/delivery', authenticateAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT 
        o.*,
        u.username,
        u.email,
        COALESCE(json_agg(json_build_object('name', p.name, 'quantity', oi.quantity)) FILTER (WHERE p.id IS NOT NULL), '[]') as items
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
    `;
    const params = [];
    
    if (status) {
      query += ' WHERE o.status = $1';
      params.push(status);
    }
    
    query += ' GROUP BY o.id, u.username, u.email ORDER BY o.created_at DESC';
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update delivery status
router.patch('/api/admin/delivery/:id/status', authenticateAdmin, async (req, res) => {
  const { status } = req.body;
  const orderId = req.params.id;
  const adminId = req.user.id;
  
  try {
    const validStatuses = ['pending', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const { rows } = await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [status, orderId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    await logActivity(adminId, 'DELIVERY_STATUS_UPDATE', `Updated order ${orderId} status to ${status}`);
    
    // Emit socket event for delivery update
    emitDeliveryUpdated(orderId, status, rows[0].user_id);
    
    // Notify user
    if (rows[0].user_id) {
      const statusMessages = {
        'shipped': 'Buyurtmangiz yuborildi!',
        'out_for_delivery': 'Kuryer sizga yo\'lga chiqdi!',
        'delivered': 'Buyurtmangiz yetkazib berildi!',
        'cancelled': 'Buyurtmangiz bekor qilindi.'
      };
      
      if (statusMessages[status]) {
        createNotification(rows[0].user_id, `Buyurtma #${orderId}: ${statusMessages[status]}`, status === 'delivered' ? 'success' : 'info');
      }
    }
    
    res.json({ success: true, order: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get delivery timeline for an order
router.get('/api/admin/delivery/:id/timeline', authenticateAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM orders WHERE id = $1',
      [req.params.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const order = rows[0];
    
    // Build timeline based on order status and timestamps
    const timeline = [
      {
        status: 'pending',
        timestamp: order.created_at,
        completed: true
      }
    ];
    
    if (order.status === 'processing' || order.status === 'shipped' || order.status === 'out_for_delivery' || order.status === 'delivered') {
      timeline.push({
        status: 'processing',
        timestamp: order.created_at,
        completed: true
      });
    }
    
    if (order.status === 'shipped' || order.status === 'out_for_delivery' || order.status === 'delivered') {
      timeline.push({
        status: 'shipped',
        timestamp: order.updated_at || order.created_at,
        completed: true
      });
    }
    
    if (order.status === 'out_for_delivery' || order.status === 'delivered') {
      timeline.push({
        status: 'out_for_delivery',
        timestamp: order.updated_at || order.created_at,
        completed: true
      });
    }
    
    if (order.status === 'delivered') {
      timeline.push({
        status: 'delivered',
        timestamp: order.updated_at || order.created_at,
        completed: true
      });
    }
    
    res.json(timeline);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User: Get their delivery status
router.get('/api/delivery/my-orders', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User: Get delivery timeline for their order
router.get('/api/delivery/:id/timeline', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const order = rows[0];
    
    // Build timeline
    const timeline = [
      {
        status: 'pending',
        timestamp: order.created_at,
        completed: true
      }
    ];
    
    if (order.status === 'processing' || order.status === 'shipped' || order.status === 'out_for_delivery' || order.status === 'delivered') {
      timeline.push({
        status: 'processing',
        timestamp: order.created_at,
        completed: true
      });
    }
    
    if (order.status === 'shipped' || order.status === 'out_for_delivery' || order.status === 'delivered') {
      timeline.push({
        status: 'shipped',
        timestamp: order.updated_at || order.created_at,
        completed: true
      });
    }
    
    if (order.status === 'out_for_delivery' || order.status === 'delivered') {
      timeline.push({
        status: 'out_for_delivery',
        timestamp: order.updated_at || order.created_at,
        completed: true
      });
    }
    
    if (order.status === 'delivered') {
      timeline.push({
        status: 'delivered',
        timestamp: order.updated_at || order.created_at,
        completed: true
      });
    }
    
    res.json(timeline);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
