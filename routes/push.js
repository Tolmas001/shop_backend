const express = require('express');
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const {
  subscribeUser,
  unsubscribeUser,
  sendPushNotification,
  getVapidPublicKey
} = require('../services/pushService');

const router = express.Router();

// Get VAPID public key
router.get('/api/push/vapid-public-key', (req, res) => {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return res.status(500).json({ error: 'Push notifications not configured' });
  }
  res.json({ publicKey });
});

// Subscribe to push notifications
router.post('/api/push/subscribe', authenticateToken, async (req, res) => {
  const { subscription } = req.body;
  const userId = req.user.id;
  
  try {
    await subscribeUser(userId, subscription);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unsubscribe from push notifications
router.post('/api/push/unsubscribe', authenticateToken, async (req, res) => {
  const { endpoint } = req.body;
  const userId = req.user.id;
  
  try {
    await unsubscribeUser(userId, endpoint);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send test notification (for testing)
router.post('/api/push/test', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  
  try {
    await sendPushNotification(userId, {
      title: 'Test Notification',
      body: 'This is a test push notification from ShopSRY',
      icon: '/icon-192x192.png'
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user's subscriptions
router.get('/api/push/subscriptions', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, endpoint, created_at FROM push_subscriptions WHERE user_id = $1',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
