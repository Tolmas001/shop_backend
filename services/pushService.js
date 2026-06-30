const webpush = require('web-push');
const { pool } = require('../database');

// Configure VAPID keys
const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;

if (!publicVapidKey || !privateVapidKey) {
  console.warn('VAPID keys not configured. Push notifications will not work.');
} else {
  webpush.setVapidDetails(
    'mailto:' + (process.env.VAPID_EMAIL || 'support@shopsry.uz'),
    publicVapidKey,
    privateVapidKey
  );
}

// Subscribe user to push notifications
async function subscribeUser(userId, subscription) {
  try {
    const { endpoint, keys } = subscription;
    
    // Check if subscription already exists
    const existing = await pool.query(
      'SELECT * FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
      [userId, endpoint]
    );
    
    if (existing.rows.length === 0) {
      await pool.query(
        'INSERT INTO push_subscriptions (user_id, endpoint, keys) VALUES ($1, $2, $3)',
        [userId, endpoint, JSON.stringify(keys)]
      );
    }
    
    return { success: true };
  } catch (err) {
    console.error('Push subscription error:', err);
    throw err;
  }
}

// Unsubscribe user from push notifications
async function unsubscribeUser(userId, endpoint) {
  try {
    await pool.query(
      'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
      [userId, endpoint]
    );
    return { success: true };
  } catch (err) {
    console.error('Push unsubscription error:', err);
    throw err;
  }
}

// Send push notification to a specific user
async function sendPushNotification(userId, notification) {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM push_subscriptions WHERE user_id = $1',
      [userId]
    );
    
    if (rows.length === 0) {
      return { success: false, message: 'No subscriptions found for user' };
    }
    
    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      icon: notification.icon || '/icon-192x192.png',
      badge: notification.badge || '/badge-72x72.png',
      data: notification.data || {}
    });
    
    const results = [];
    
    for (const subscription of rows) {
      try {
        const pushSubscription = {
          endpoint: subscription.endpoint,
          keys: subscription.keys
        };
        
        await webpush.sendNotification(pushSubscription, payload);
        results.push({ success: true, endpoint: subscription.endpoint });
      } catch (err) {
        console.error('Push send error:', err);
        // Remove invalid subscription
        if (err.statusCode === 410 || err.statusCode === 404) {
          await pool.query(
            'DELETE FROM push_subscriptions WHERE endpoint = $1',
            [subscription.endpoint]
          );
        }
        results.push({ success: false, endpoint: subscription.endpoint, error: err.message });
      }
    }
    
    return { success: true, results };
  } catch (err) {
    console.error('Push notification error:', err);
    throw err;
  }
}

// Send push notification to multiple users
async function sendPushNotificationToUsers(userIds, notification) {
  try {
    const { rows } = await pool.query(
      'SELECT DISTINCT user_id, endpoint, keys FROM push_subscriptions WHERE user_id = ANY($1)',
      [userIds]
    );
    
    if (rows.length === 0) {
      return { success: false, message: 'No subscriptions found' };
    }
    
    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      icon: notification.icon || '/icon-192x192.png',
      badge: notification.badge || '/badge-72x72.png',
      data: notification.data || {}
    });
    
    const results = [];
    
    for (const subscription of rows) {
      try {
        const pushSubscription = {
          endpoint: subscription.endpoint,
          keys: subscription.keys
        };
        
        await webpush.sendNotification(pushSubscription, payload);
        results.push({ success: true, userId: subscription.user_id });
      } catch (err) {
        console.error('Push send error:', err);
        if (err.statusCode === 410 || err.statusCode === 404) {
          await pool.query(
            'DELETE FROM push_subscriptions WHERE endpoint = $1',
            [subscription.endpoint]
          );
        }
        results.push({ success: false, userId: subscription.user_id, error: err.message });
      }
    }
    
    return { success: true, results };
  } catch (err) {
    console.error('Push notification error:', err);
    throw err;
  }
}

// Send push notification to all admins
async function sendPushNotificationToAdmins(notification) {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ps.user_id, ps.endpoint, ps.keys 
       FROM push_subscriptions ps
       JOIN users u ON ps.user_id = u.id
       WHERE u.role IN ('admin', 'superadmin')`
    );
    
    if (rows.length === 0) {
      return { success: false, message: 'No admin subscriptions found' };
    }
    
    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      icon: notification.icon || '/icon-192x192.png',
      badge: notification.badge || '/badge-72x72.png',
      data: notification.data || {}
    });
    
    const results = [];
    
    for (const subscription of rows) {
      try {
        const pushSubscription = {
          endpoint: subscription.endpoint,
          keys: subscription.keys
        };
        
        await webpush.sendNotification(pushSubscription, payload);
        results.push({ success: true, userId: subscription.user_id });
      } catch (err) {
        console.error('Push send error:', err);
        if (err.statusCode === 410 || err.statusCode === 404) {
          await pool.query(
            'DELETE FROM push_subscriptions WHERE endpoint = $1',
            [subscription.endpoint]
          );
        }
        results.push({ success: false, userId: subscription.user_id, error: err.message });
      }
    }
    
    return { success: true, results };
  } catch (err) {
    console.error('Push notification error:', err);
    throw err;
  }
}

// Get VAPID public key for frontend
function getVapidPublicKey() {
  return publicVapidKey;
}

module.exports = {
  subscribeUser,
  unsubscribeUser,
  sendPushNotification,
  sendPushNotificationToUsers,
  sendPushNotificationToAdmins,
  getVapidPublicKey
};
