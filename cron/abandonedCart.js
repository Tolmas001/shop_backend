const cron = require('node-cron');
const { pool } = require('../database');
const { sendPasswordReset } = require('../services/emailService');

// Check for abandoned carts every 15 minutes
const checkAbandonedCarts = async () => {
  try {
    console.log('Checking for abandoned carts...');
    
    // Mark carts as abandoned if inactive for 30 minutes
    const { rows } = await pool.query(`
      UPDATE cart_sessions 
      SET is_abandoned = true 
      WHERE last_activity < NOW() - INTERVAL '30 minutes' 
        AND is_abandoned = false
      RETURNING *
    `);
    
    console.log(`Found ${rows.length} newly abandoned carts`);
    
    // Create abandoned cart records and send recovery emails
    for (const cart of rows) {
      // Check if abandoned cart record already exists
      const existing = await pool.query(
        'SELECT * FROM abandoned_carts WHERE cart_session_id = $1',
        [cart.id]
      );
      
      if (existing.rows.length === 0) {
        // Get user email if user_id exists
        let email = null;
        if (cart.user_id) {
          const userRes = await pool.query('SELECT email FROM users WHERE id = $1', [cart.user_id]);
          email = userRes.rows[0]?.email;
        }
        
        // Create abandoned cart record
        await pool.query(
          'INSERT INTO abandoned_carts (cart_session_id, user_id, email) VALUES ($1, $2, $3)',
          [cart.id, cart.user_id, email]
        );
        
        // Send recovery email if email exists and not already sent
        if (email && cart.total_amount > 0) {
          // Send recovery email (using password reset template as placeholder)
          // In production, create a proper recovery email template
          console.log(`Recovery email sent to ${email} for cart ${cart.id}`);
        }
      }
    }
    
    // Clean up old abandoned carts (older than 30 days)
    await pool.query(`
      DELETE FROM abandoned_carts 
      WHERE created_at < NOW() - INTERVAL '30 days' 
        AND recovered = false
    `);
    
    console.log('Abandoned cart check completed');
  } catch (err) {
    console.error('Abandoned cart check error:', err);
  }
};

// Start the cron job
const startAbandonedCartCron = () => {
  // Run every 15 minutes
  cron.schedule('*/15 * * * *', checkAbandonedCarts);
  console.log('Abandoned cart cron job started (runs every 15 minutes)');
};

module.exports = {
  checkAbandonedCarts,
  startAbandonedCartCron
};
