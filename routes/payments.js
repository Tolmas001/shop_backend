const express = require('express');
const crypto = require('crypto');
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { createNotification, logActivity } = require('../utils/helpers');

const router = express.Router();

// Payme configuration
const PAYME_CONFIG = {
  merchantId: process.env.PAYME_MERCHANT_ID,
  key: process.env.PAYME_KEY,
  callbackUrl: process.env.PAYME_CALLBACK_URL || '/api/payment/payme/callback'
};

// Click configuration
const CLICK_CONFIG = {
  serviceId: process.env.CLICK_SERVICE_ID,
  merchantId: process.env.CLICK_MERCHANT_ID,
  secretKey: process.env.CLICK_SECRET_KEY,
  callbackUrl: process.env.CLICK_CALLBACK_URL || '/api/payment/click/callback'
};

// Helper: Generate Payme token
function generatePaymeToken(amount, orderId) {
  const timestamp = Math.floor(Date.now() / 1000);
  const data = `${timestamp}${PAYME_CONFIG.merchantId}${amount}${orderId}`;
  return crypto.createHmac('sha256', PAYME_CONFIG.key).update(data).digest('hex');
}

// Helper: Verify Payme callback
function verifyPaymeCallback(params, signature) {
  const data = Object.keys(params)
    .sort()
    .map(key => `${key}${params[key]}`)
    .join('');
  const expectedSignature = crypto.createHmac('sha256', PAYME_CONFIG.key).update(data).digest('hex');
  return expectedSignature === signature;
}

// Helper: Verify Click callback
function verifyClickCallback(params, signature) {
  const data = `${CLICK_CONFIG.serviceId}${params.merchant_trans_id}${CLICK_CONFIG.secretKey}${params.amount}${params.action}${params.sign_time}`;
  const expectedSignature = crypto.createMd5().update(data).digest('hex');
  return expectedSignature === signature;
}

// Create payment
router.post('/api/payment/create', authenticateToken, async (req, res) => {
  const { order_id, provider, amount, payment_method, return_url } = req.body;
  const userId = req.user.id;
  
  try {
    // Verify order exists and belongs to user
    const orderRes = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
      [order_id, userId]
    );
    
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const order = orderRes.rows[0];
    
    if (order.payment_status === 'paid') {
      return res.status(400).json({ error: 'Order already paid' });
    }
    
    // Create payment record
    const { rows } = await pool.query(
      'INSERT INTO payments (order_id, user_id, amount, provider, payment_method, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [order_id, userId, amount, provider, payment_method, 'pending']
    );
    
    const payment = rows[0];
    
    let paymentUrl = null;
    
    if (provider === 'payme') {
      // Payme integration
      const token = generatePaymeToken(amount, order_id);
      paymentUrl = `https://checkout.payme.uz?merchant_id=${PAYME_CONFIG.merchantId}&amount=${amount * 100}&order_id=${order_id}&token=${token}&callback_url=${encodeURIComponent(PAYME_CONFIG.callbackUrl)}`;
    } else if (provider === 'click') {
      // Click integration
      const timestamp = Math.floor(Date.now() / 1000);
      const data = `${CLICK_CONFIG.serviceId}${payment.id}${CLICK_CONFIG.secretKey}${amount}${timestamp}`;
      const signature = crypto.createMd5().update(data).digest('hex');
      paymentUrl = `https://my.click.uz/pay?service_id=${CLICK_CONFIG.serviceId}&merchant_id=${CLICK_CONFIG.merchantId}&amount=${amount}&transaction_id=${payment.id}&timestamp=${timestamp}&signature=${signature}&callback_url=${encodeURIComponent(CLICK_CONFIG.callbackUrl)}`;
    }
    
    res.json({
      success: true,
      payment_id: payment.id,
      payment_url: paymentUrl
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Payme callback
router.post('/api/payment/payme/callback', async (req, res) => {
  try {
    const { id, method, params, account } = req.body;
    
    // Log the callback
    await pool.query(
      'INSERT INTO payment_logs (order_id, provider, action, request_data, response_data) VALUES ($1, $2, $3, $4, $5)',
      [account?.order_id, 'payme', method, JSON.stringify(req.body), null]
    );
    
    let response = { error: { code: -32400, message: 'Invalid request' } };
    
    if (method === 'CheckPerformTransaction') {
      // Check if order exists
      const orderRes = await pool.query(
        'SELECT * FROM orders WHERE id = $1',
        [account?.order_id]
      );
      
      if (orderRes.rows.length > 0) {
        response = { result: { allow: true } };
      }
    } else if (method === 'CreateTransaction') {
      // Create transaction
      const { rows } = await pool.query(
        'UPDATE payments SET provider_transaction_id = $1, status = $2 WHERE order_id = $3 RETURNING *',
        [id, 'processing', account?.order_id]
      );
      
      if (rows.length > 0) {
        response = {
          result: {
            create_time: Math.floor(Date.now() / 1000),
            transaction: id,
            state: 1
          }
        };
      }
    } else if (method === 'PerformTransaction') {
      // Complete payment
      const { rows } = await pool.query(
        'SELECT * FROM payments WHERE provider_transaction_id = $1',
        [id]
      );
      
      if (rows.length > 0) {
        const payment = rows[0];
        
        await pool.query('BEGIN');
        try {
          await pool.query('UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2', ['paid', payment.id]);
          await pool.query('UPDATE orders SET payment_status = $1, status = $2 WHERE id = $3', ['paid', 'processing', payment.order_id]);
          await pool.query('COMMIT');
          
          response = {
            result: {
              perform_time: Math.floor(Date.now() / 1000),
              transaction: id,
              state: 2
            }
          };
          
          // Notify user
          createNotification(payment.user_id, `To'lov muvaffaqiyatli amalga oshdi! Buyurtma #${payment.order_id}`, 'success');
        } catch (err) {
          await pool.query('ROLLBACK');
          throw err;
        }
      }
    } else if (method === 'CancelTransaction') {
      // Cancel payment
      const { rows } = await pool.query(
        'SELECT * FROM payments WHERE provider_transaction_id = $1',
        [id]
      );
      
      if (rows.length > 0) {
        await pool.query('UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2', ['cancelled', rows[0].id]);
        
        response = {
          result: {
            cancel_time: Math.floor(Date.now() / 1000),
            transaction: id,
            state: -1
          }
        };
      }
    }
    
    res.json(response);
  } catch (err) {
    console.error('Payme callback error:', err);
    res.status(500).json({ error: { code: -32400, message: 'Internal server error' } });
  }
});

// Click callback
router.post('/api/payment/click/callback', async (req, res) => {
  try {
    const { action, merchant_trans_id, amount, sign_time, sign_string } = req.body;
    
    // Log the callback
    await pool.query(
      'INSERT INTO payment_logs (provider, action, request_data) VALUES ($1, $2, $3)',
      ['click', action, JSON.stringify(req.body)]
    );
    
    let response = { error: -1, error_note: 'Invalid request' };
    
    if (action === 0) {
      // Prepare payment
      response = { error: 0, error_note: 'OK', click_trans_id: Date.now(), merchant_trans_id, merchant_prepare_id: Date.now() };
    } else if (action === 1) {
      // Complete payment
      const { rows } = await pool.query(
        'SELECT * FROM payments WHERE id = $1',
        [merchant_trans_id]
      );
      
      if (rows.length > 0) {
        const payment = rows[0];
        
        await pool.query('BEGIN');
        try {
          await pool.query('UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2', ['paid', payment.id]);
          await pool.query('UPDATE orders SET payment_status = $1, status = $2 WHERE id = $3', ['paid', 'processing', payment.order_id]);
          await pool.query('COMMIT');
          
          response = { error: 0, error_note: 'OK', click_trans_id: Date.now(), merchant_trans_id };
          
          // Notify user
          createNotification(payment.user_id, `To'lov muvaffaqiyatli amalga oshdi! Buyurtma #${payment.order_id}`, 'success');
        } catch (err) {
          await pool.query('ROLLBACK');
          throw err;
        }
      }
    }
    
    res.json(response);
  } catch (err) {
    console.error('Click callback error:', err);
    res.status(500).json({ error: -1, error_note: 'Internal server error' });
  }
});

// Verify payment status
router.get('/api/payment/:id/status', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM payments WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Refund payment
router.post('/api/payment/:id/refund', authenticateToken, async (req, res) => {
  const { reason } = req.body;
  const paymentId = req.params.id;
  const userId = req.user.id;
  
  try {
    const { rows } = await pool.query(
      'SELECT * FROM payments WHERE id = $1 AND user_id = $2',
      [paymentId, userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    const payment = rows[0];
    
    if (payment.status !== 'paid') {
      return res.status(400).json({ error: 'Payment cannot be refunded' });
    }
    
    await pool.query('UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2', ['refunded', paymentId]);
    await pool.query('UPDATE orders SET payment_status = $1, status = $2 WHERE id = $3', ['refunded', 'cancelled', payment.order_id]);
    
    await logActivity(userId, 'PAYMENT_REFUNDED', `Refunded payment ID: ${paymentId} for order ${payment.order_id}`);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
