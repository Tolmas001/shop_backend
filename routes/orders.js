const express = require('express');
const { pool } = require('../database');
const { authenticateToken, authenticateAdmin } = require('../middleware/auth');
const { createNotification, logActivity } = require('../utils/helpers');
const multer = require('multer');
const path = require('path');

const router = express.Router();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/receipts/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'receipt-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only images (jpeg, jpg, png) and PDF files are allowed'));
    }
  }
});

// Orders - Get User Orders
router.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.*, 
       COALESCE(json_agg(json_build_object('name', p.name, 'image', p.image, 'quantity', oi.quantity, 'price', oi.price)) FILTER (WHERE p.id IS NOT NULL), '[]') as items_list
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE o.user_id = $1
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Orders - Admin Get All
router.get('/api/orders/admin', authenticateAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.*, 
       COALESCE(json_agg(json_build_object('name', p.name, 'image', p.image, 'quantity', oi.quantity, 'price', oi.price)) FILTER (WHERE p.id IS NOT NULL), '[]') as items_list
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN products p ON oi.product_id = p.id
       GROUP BY o.id
       ORDER BY o.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Orders - Get Specific Order
router.get('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.*, 
       COALESCE(json_agg(json_build_object('name', p.name, 'image', p.image, 'quantity', oi.quantity, 'price', oi.price)) FILTER (WHERE p.id IS NOT NULL), '[]') as items_list
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE o.id = $1 AND (o.user_id = $2 OR $3 = 'admin')
       GROUP BY o.id`,
      [req.params.id, req.user.id, req.user.role]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Orders - Place standard order
router.post('/api/orders', authenticateToken, async (req, res) => {
  const { customer_name, customer_phone, customer_address, items, payment_method, promo_code, use_points, delivery_method, delivery_cost } = req.body;
  const user_id = req.user.id;
  
  let subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  let discount = 0;
  let shipping = parseFloat(delivery_cost) || 0;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Calculate Promo Discount
    if (promo_code) {
      const promoRes = await client.query('SELECT * FROM promo_codes WHERE code = $1 AND is_active = true', [promo_code]);
      if (promoRes.rows.length > 0) {
        const promo = promoRes.rows[0];
        discount = (subtotal * promo.discount_percent) / 100;
        await client.query('UPDATE promo_codes SET used_count = used_count + 1 WHERE id = $1', [promo.id]);
      }
    }

    let total = subtotal - discount + shipping;

    // 2. Point Spending (1 point = 1000 UZS)
    if (use_points && user_id) {
      const userRes = await client.query('SELECT points FROM users WHERE id = $1', [user_id]);
      const availablePoints = userRes.rows[0].points || 0;
      const pointsToUse = Math.min(availablePoints, Math.floor(total / 1000));
      if (pointsToUse > 0) {
        total -= pointsToUse * 1000;
        await client.query('UPDATE users SET points = points - $1 WHERE id = $2', [pointsToUse, user_id]);
      }
    }

    const payment_status = payment_method === 'card' ? 'paid' : 'pending';
    
    const { rows } = await client.query(
      'INSERT INTO orders (user_id, customer_name, customer_phone, customer_address, total_amount, payment_method, payment_status, delivery_method, delivery_cost) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
      [user_id || null, customer_name, customer_phone, customer_address, total, payment_method || 'cash', payment_status, delivery_method || 'standard', shipping]
    );
    const orderId = rows[0].id;
    
    // 3. Earn New Points (1 point per 10,000 UZS of net total)
    if (user_id) {
      const pointsEarned = Math.floor(total / 10000);
      if (pointsEarned > 0) {
        await client.query('UPDATE users SET points = COALESCE(points, 0) + $1 WHERE id = $2', [pointsEarned, user_id]);
      }
    }
    
    for (const item of items) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
        [orderId, item.id, item.quantity, item.price]
      );
    }
    await client.query('COMMIT');
    
    // Order Notification Trigger
    if (user_id) {
      createNotification(user_id, `Buyurtmangiz muvaffaqiyatli qabul qilindi! Buyurtma raqami: #${orderId}`, 'success');
    }
    
    res.json({ success: true, order_id: orderId });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Orders - One click / Quick Buy
router.post('/api/orders/one-click', async (req, res) => {
  const { name, phone, product_id, product_name } = req.body;
  try {
    console.log(`[ONE-CLICK BUY] User ${name} (${phone}) interested in: ${product_name} (ID: ${product_id})`);
    
    const { rows } = await pool.query(
      'INSERT INTO orders (customer_name, customer_phone, customer_address, total_amount, status, payment_method) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [name, phone, 'Quick Buy', 0, 'pending', 'one-click']
    );
    
    res.json({ success: true, order_id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Orders - Admin Update Status
router.put('/api/orders/:id/status', authenticateAdmin, async (req, res) => {
  const { status } = req.body;
  try {
    await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, req.params.id]);
    
    await logActivity(req.user.id, 'ORDER_STATUS_UPDATE', `Updated order ID: ${req.params.id} to status: ${status}`);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Orders - User Cancel Order
router.put('/api/orders/:id/cancel', authenticateToken, async (req, res) => {
  const orderId = req.params.id;
  const userId = req.user.id;
  
  try {
    // Verify order ownership and status
    const { rows } = await pool.query(
      'SELECT id, status FROM orders WHERE id = $1 AND user_id = $2',
      [orderId, userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Order not found or access denied' });
    }
    
    if (rows[0].status !== 'pending') {
      return res.status(400).json({ error: `Cannot cancel order with status: ${rows[0].status}` });
    }
    
    // Update status to cancelled
    await pool.query(
      'UPDATE orders SET status = \'cancelled\' WHERE id = $1',
      [orderId]
    );
    
    res.json({ success: true, message: 'Order cancelled successfully' });
  } catch (err) {
    console.error('Order cancel error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Orders - Upload Receipt
router.post('/api/orders/:id/upload-receipt', authenticateToken, upload.single('receipt'), async (req, res) => {
  const orderId = req.params.id;
  const userId = req.user.id;
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Verify order ownership
    const { rows } = await pool.query(
      'SELECT id, payment_status FROM orders WHERE id = $1 AND user_id = $2',
      [orderId, userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Order not found or access denied' });
    }
    
    if (rows[0].payment_status !== 'pending') {
      return res.status(400).json({ error: `Cannot upload receipt for order with payment status: ${rows[0].payment_status}` });
    }
    
    const receiptUrl = `/uploads/receipts/${req.file.filename}`;
    
    await pool.query(
      'UPDATE orders SET payment_receipt = $1, payment_status = \'waiting_verification\' WHERE id = $2',
      [receiptUrl, orderId]
    );
    
    res.json({ success: true, receipt_url: receiptUrl });
  } catch (err) {
    console.error('Upload receipt error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin - Get Pending Payments
router.get('/api/admin/payments/pending', authenticateAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.*, 
       COALESCE(json_agg(json_build_object('name', p.name, 'image', p.image, 'quantity', oi.quantity, 'price', oi.price)) FILTER (WHERE p.id IS NOT NULL), '[]') as items_list,
       u.username, u.email
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN products p ON oi.product_id = p.id
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.payment_status = 'waiting_verification'
       GROUP BY o.id, u.username, u.email
       ORDER BY o.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin - Approve Payment
router.patch('/api/admin/orders/:id/approve', authenticateAdmin, async (req, res) => {
  const orderId = req.params.id;
  const adminId = req.user.id;
  
  try {
    const { rows } = await pool.query(
      'UPDATE orders SET payment_status = \'paid\', verified_by = $1, verified_at = NOW(), status = \'processing\' WHERE id = $2 RETURNING *',
      [adminId, orderId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    await logActivity(adminId, 'PAYMENT_APPROVED', `Approved payment for order ID: ${orderId}`);
    
    if (rows[0].user_id) {
      createNotification(rows[0].user_id, `Buyurtma #${orderId} to\'lovi tasdiqlandi!`, 'success');
    }
    
    res.json({ success: true, order: rows[0] });
  } catch (err) {
    console.error('Approve payment error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin - Reject Payment
router.patch('/api/admin/orders/:id/reject', authenticateAdmin, async (req, res) => {
  const orderId = req.params.id;
  const adminId = req.user.id;
  
  try {
    const { rows } = await pool.query(
      'UPDATE orders SET payment_status = \'rejected\', status = \'payment_failed\' WHERE id = $2 RETURNING *',
      [adminId, orderId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    await logActivity(adminId, 'PAYMENT_REJECTED', `Rejected payment for order ID: ${orderId}`);
    
    if (rows[0].user_id) {
      createNotification(rows[0].user_id, `Buyurtma #${orderId} to\'lovi rad qilindi. Iltimos, qayta urinib ko\'ring.`, 'error');
    }
    
    res.json({ success: true, order: rows[0] });
  } catch (err) {
    console.error('Reject payment error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
