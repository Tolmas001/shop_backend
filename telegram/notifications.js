const { pool } = require('../database');

// Store bot instance for notifications
let botInstance = null;

// Set bot instance (called from bot.js)
const setBotInstance = (bot) => {
  botInstance = bot;
};

// Send order status notification to Telegram user
const sendOrderStatusNotification = async (orderId, newStatus) => {
  if (!botInstance) {
    console.log('Bot instance not available for notifications');
    return;
  }

  try {
    // Get order details with user info
    const { rows } = await pool.query(
      `SELECT o.*, u.telegram_user_id, u.username 
       FROM orders o 
       LEFT JOIN users u ON o.user_id = u.id 
       WHERE o.id = $1`,
      [orderId]
    );

    if (rows.length === 0) {
      console.log(`Order ${orderId} not found`);
      return;
    }

    const order = rows[0];

    // Only send notification if order came from Telegram and user has telegram_user_id
    if (order.source !== 'telegram' || !order.telegram_user_id) {
      console.log(`Order ${orderId} is not a Telegram order or user has no telegram_user_id`);
      return;
    }

    // Prepare status message
    const statusMessages = {
      'pending': '🟡 Buyurtmangiz qabul qilindi va tasdiqlashni kutmoqda.',
      'confirmed': '✅ Buyurtmangiz tasdiqlandi! Tez orada yetkazib berishga tayyorlanadi.',
      'processing': '🔵 Buyurtmangiz tayyorlanmoqda.',
      'shipped': '🚚 Buyurtmangiz yo\'lda!',
      'delivered': '✅ Buyurtmangiz muvaffaqiyatli yetkazib berildi!',
      'cancelled': '❌ Buyurtmangiz bekor qilindi.',
      'payment_failed': '❌ To\'lov amalga oshmadi. Iltimos, qayta urinib ko\'ring.'
    };

    const message = statusMessages[newStatus] || `Buyurtma holati o'zgardi: ${newStatus}`;

    // Send notification to user
    await botInstance.sendMessage(order.telegram_user_id, `
📋 Buyurtma #${orderId}

${message}

💰 Summa: ${formatPrice(order.total_amount)}
📱 Telegram bot orqali
    `);

    console.log(`Telegram notification sent to user ${order.telegram_user_id} for order ${orderId}`);
  } catch (error) {
    console.error('Error sending Telegram notification:', error);
  }
};

// Helper function to format price
const formatPrice = (price) => {
  return new Intl.NumberFormat('uz-UZ').format(price) + ' so\'m';
};

module.exports = {
  setBotInstance,
  sendOrderStatusNotification
};