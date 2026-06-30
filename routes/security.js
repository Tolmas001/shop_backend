const express = require('express');
const { pool } = require('../database');
const { authenticateAdmin } = require('../middleware/auth');

const router = express.Router();

// Get login history
router.get('/api/admin/security/logins', authenticateAdmin, async (req, res) => {
  try {
    const { limit = 50, user_id } = req.query;
    let query = `
      SELECT 
        al.*,
        u.username
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.action LIKE '%LOGIN%'
    `;
    const params = [];
    
    if (user_id) {
      query += ' AND al.user_id = $1';
      params.push(user_id);
    }
    
    query += ' ORDER BY al.created_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get failed login attempts (from activity logs)
router.get('/api/admin/security/failed-attempts', authenticateAdmin, async (req, res) => {
  try {
    const { limit = 50, days = 7 } = req.query;
    
    const { rows } = await pool.query(
      `SELECT 
        al.*,
        u.username
       FROM activity_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.action LIKE '%FAILED%' 
         AND al.created_at >= NOW() - INTERVAL '${days} days'
       ORDER BY al.created_at DESC
       LIMIT $1`,
      [limit]
    );
    
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get suspicious activity
router.get('/api/admin/security/suspicious', authenticateAdmin, async (req, res) => {
  try {
    // Multiple failed login attempts from same IP
    const suspiciousIPs = await pool.query(
      `SELECT 
        details->>'ip' as ip_address,
        COUNT(*) as attempt_count,
        MAX(created_at) as last_attempt
       FROM activity_logs
       WHERE action LIKE '%FAILED%'
         AND created_at >= NOW() - INTERVAL '24 hours'
         AND details ? 'ip'
       GROUP BY details->>'ip'
       HAVING COUNT(*) >= 5
       ORDER BY attempt_count DESC`
    );
    
    // Rapid account creation attempts
    const rapidSignups = await pool.query(
      `SELECT 
        details->>'ip' as ip_address,
        COUNT(*) as signup_count,
        MAX(created_at) as last_signup
       FROM activity_logs
       WHERE action = 'USER_REGISTERED'
         AND created_at >= NOW() - INTERVAL '1 hour'
         AND details ? 'ip'
       GROUP BY details->>'ip'
       HAVING COUNT(*) >= 3
       ORDER BY signup_count DESC`
    );
    
    // Unusual order patterns (high value orders)
    const unusualOrders = await pool.query(
      `SELECT 
        o.*,
        u.username
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.total_amount > 5000000
         AND o.created_at >= NOW() - INTERVAL '24 hours'
       ORDER BY o.total_amount DESC
       LIMIT 20`
    );
    
    res.json({
      suspicious_ips: suspiciousIPs.rows,
      rapid_signups: rapidSignups.rows,
      unusual_orders: unusualOrders.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get security overview stats
router.get('/api/admin/security/overview', authenticateAdmin, async (req, res) => {
  try {
    const todayLogins = await pool.query(
      "SELECT COUNT(*) as count FROM activity_logs WHERE action LIKE '%LOGIN%' AND DATE(created_at) = CURRENT_DATE"
    );
    
    const todayFailed = await pool.query(
      "SELECT COUNT(*) as count FROM activity_logs WHERE action LIKE '%FAILED%' AND DATE(created_at) = CURRENT_DATE"
    );
    
    const activeUsers = await pool.query(
      "SELECT COUNT(DISTINCT user_id) as count FROM activity_logs WHERE created_at >= NOW() - INTERVAL '24 hours'"
    );
    
    const suspiciousActivity = await pool.query(
      "SELECT COUNT(*) as count FROM activity_logs WHERE action LIKE '%SUSPICIOUS%' AND created_at >= NOW() - INTERVAL '7 days'"
    );
    
    res.json({
      today_logins: parseInt(todayLogins.rows[0].count),
      today_failed_attempts: parseInt(todayFailed.rows[0].count),
      active_users_24h: parseInt(activeUsers.rows[0].count),
      suspicious_activity_7d: parseInt(suspiciousActivity.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
