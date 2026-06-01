const express = require('express');
const { pool } = require('../database');
const { authenticateAdmin } = require('../middleware/auth');

const router = express.Router();

// Get Admin Stats Dashboard
router.get('/api/stats', authenticateAdmin, async (req, res) => {
  try {
    const productsRes = await pool.query('SELECT COUNT(*) as count FROM products');
    const ordersRes = await pool.query('SELECT COUNT(*) as count FROM orders');
    const revenueRes = await pool.query('SELECT SUM(total_amount) as total FROM orders');
    const pendingRes = await pool.query('SELECT COUNT(*) as count FROM orders WHERE status = $1', ['pending']);
    
    // Revenue trend (last 6 months)
    const trendRes = await pool.query(`
      SELECT 
        TO_CHAR(created_at, 'Mon') as label,
        SUM(total_amount) as val
      FROM orders
      WHERE created_at > NOW() - INTERVAL '6 months'
      GROUP BY TO_CHAR(created_at, 'Mon'), DATE_TRUNC('month', created_at)
      ORDER BY DATE_TRUNC('month', created_at)
    `);

    // Most Wishlisted Products
    const wishlistStatsRes = await pool.query(`
       SELECT p.name, COUNT(w.id) as wishlist_count
       FROM wishlist w
       JOIN products p ON w.product_id = p.id
       GROUP BY p.id, p.name
       ORDER BY wishlist_count DESC
       LIMIT 5
    `);

    // Status distribution
    const statusRes = await pool.query(`
      SELECT status as label, COUNT(*) as count
      FROM orders
      GROUP BY status
    `);

    // Recent orders
    const recentOrdersRes = await pool.query(`
      SELECT o.id, o.customer_name, o.total_amount, o.status, o.created_at
      FROM orders o
      ORDER BY o.created_at DESC
      LIMIT 5
    `);
    
    // Low stock products
    const lowStockRes = await pool.query(`
      SELECT id, name, stock_count
      FROM products
      WHERE stock_count < 5
      ORDER BY stock_count ASC
      LIMIT 10
    `);
    
    res.json({
      totalProducts: parseInt(productsRes.rows[0].count),
      totalOrders: parseInt(ordersRes.rows[0].count),
      totalRevenue: parseFloat(revenueRes.rows[0].total) || 0,
      pendingOrders: parseInt(pendingRes.rows[0].count),
      revenueTrend: trendRes.rows.map(r => ({ label: r.label, val: parseFloat(r.val) })),
      statusDistribution: statusRes.rows,
      recentOrders: recentOrdersRes.rows,
      lowStockProducts: lowStockRes.rows,
      popularWishlist: wishlistStatsRes.rows
    });
  } catch (err) {
     res.status(500).json({ error: err.message });
  }
});

module.exports = router;
