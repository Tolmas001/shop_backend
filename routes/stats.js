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

// Get Geospatial Data (Mock data for dashboard since users table doesn't store lat/lng currently)
router.get('/api/stats/geospatial', authenticateAdmin, async (req, res) => {
  try {
    // In a real scenario, this would query orders or users tables with actual coordinates
    const mockData = [
      { id: 1, lat: 41.2995, lng: 69.2401, city: 'Toshkent', orders: 150, value: 5000000 },
      { id: 2, lat: 39.6270, lng: 66.9749, city: 'Samarqand', orders: 85, value: 2500000 },
      { id: 3, lat: 40.7821, lng: 72.3442, city: 'Andijon', orders: 60, value: 1200000 },
      { id: 4, lat: 39.7747, lng: 64.4286, city: 'Buxoro', orders: 45, value: 900000 },
      { id: 5, lat: 40.3842, lng: 71.7843, city: "Farg'ona", orders: 70, value: 1800000 }
    ];
    res.json(mockData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
