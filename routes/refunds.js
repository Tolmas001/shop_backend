const express = require('express');
const { pool } = require('../database');
const { authenticateAdmin, authenticateToken } = require('../middleware/auth');
const { createNotification, logActivity } = require('../utils/helpers');
const { addRefundJob } = require('../queues');

const router = express.Router();

// User: Create refund request
router.post('/api/refunds/create', authenticateToken, async (req, res) => {
  const { order_id, reason, amount } = req.body;
  const userId = req.user.id;
  
  try {
    // Check if order exists and belongs to user
    const orderRes = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
      [order_id, userId]
    );
    
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const order = orderRes.rows[0];
    
    // Check if refund already exists for this order
    const existingRefund = await pool.query(
      'SELECT * FROM refund_requests WHERE order_id = $1 AND status != $2',
      [order_id, 'rejected']
    );
    
    if (existingRefund.rows.length > 0) {
      return res.status(400).json({ error: 'Refund request already exists for this order' });
    }
    
    const { rows } = await pool.query(
      'INSERT INTO refund_requests (order_id, user_id, reason, amount) VALUES ($1, $2, $3, $4) RETURNING *',
      [order_id, userId, reason, amount]
    );
    
    // Notify admins
    await pool.query(
      'INSERT INTO admin_notifications (title, message, type, priority) VALUES ($1, $2, $3, $4)',
      ['Yangi refund so\'rovi', `Buyurtma #${order_id} uchun refund so\'rovi: ${amount} UZS`, 'warning', 'high']
    );
    
    res.status(201).json({ success: true, refund: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get all refund requests
router.get('/api/admin/refunds', authenticateAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT 
        rr.*,
        o.customer_name,
        o.total_amount as order_total,
        u.username,
        u.email
      FROM refund_requests rr
      LEFT JOIN orders o ON rr.order_id = o.id
      LEFT JOIN users u ON rr.user_id = u.id
    `;
    const params = [];
    
    if (status) {
      query += ' WHERE rr.status = $1';
      params.push(status);
    }
    
    query += ' ORDER BY rr.created_at DESC';
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Approve refund
router.patch('/api/admin/refunds/:id/approve', authenticateAdmin, async (req, res) => {
  const refundId = req.params.id;
  const adminId = req.user.id;
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const { rows } = await client.query(
        'UPDATE refund_requests SET status = \'approved\', processed_by = $1, processed_at = NOW() WHERE id = $2 RETURNING *',
        [adminId, refundId]
      );
      
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Refund request not found' });
      }
      
      const refund = rows[0];
      
      // Update order status
      await client.query(
        'UPDATE orders SET status = \'refunded\' WHERE id = $1',
        [refund.order_id]
      );
      
      await client.query('COMMIT');
      
      await logActivity(adminId, 'REFUND_APPROVED', `Approved refund request ID: ${refundId} for order ${refund.order_id}`);
      
      // Add refund processing job to queue
      await addRefundJob({
        refundId: refund.id,
        orderId: refund.order_id,
        userId: refund.user_id,
        amount: refund.amount
      });
      
      // Notify user
      if (refund.user_id) {
        createNotification(refund.user_id, `Refund so'rovingiz tasdiqlandi! Buyurtma #${refund.order_id}`, 'success');
      }
      
      res.json({ success: true, refund: rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Reject refund
router.patch('/api/admin/refunds/:id/reject', authenticateAdmin, async (req, res) => {
  const refundId = req.params.id;
  const adminId = req.user.id;
  
  try {
    const { rows } = await pool.query(
      'UPDATE refund_requests SET status = \'rejected\', processed_by = $1, processed_at = NOW() WHERE id = $2 RETURNING *',
      [adminId, refundId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Refund request not found' });
    }
    
    const refund = rows[0];
    
    await logActivity(adminId, 'REFUND_REJECTED', `Rejected refund request ID: ${refundId} for order ${refund.order_id}`);
    
    // Notify user
    if (refund.user_id) {
      createNotification(refund.user_id, `Refund so'rovingiz rad qilindi. Buyurtma #${refund.order_id}`, 'error');
    }
    
    res.json({ success: true, refund: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User: Get their refund requests
router.get('/api/refunds/my-requests', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
        rr.*,
        o.customer_name,
        o.total_amount as order_total
       FROM refund_requests rr
       LEFT JOIN orders o ON rr.order_id = o.id
       WHERE rr.user_id = $1
       ORDER BY rr.created_at DESC`,
      [req.user.id]
    );
    
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
