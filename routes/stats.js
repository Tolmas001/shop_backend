const express = require('express');
const { pool } = require('../database');
const { authenticateAdmin } = require('../middleware/auth');
const { getCache, setCache, deletePattern } = require('../services/cacheService');

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

// Analytics - Overview
router.get('/api/admin/analytics/overview', authenticateAdmin, async (req, res) => {
  try {
    const cacheKey = 'analytics:overview';
    const cached = await getCache(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }
    
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    
    const lastMonth = new Date(today);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    
    // Today's stats
    const todayRes = await pool.query(
      'SELECT COUNT(*) as orders, COALESCE(SUM(total_amount), 0) as revenue FROM orders WHERE DATE(created_at) = CURRENT_DATE'
    );
    
    // Yesterday's stats
    const yesterdayRes = await pool.query(
      'SELECT COUNT(*) as orders, COALESCE(SUM(total_amount), 0) as revenue FROM orders WHERE DATE(created_at) = CURRENT_DATE - INTERVAL \'1 day\''
    );
    
    // Last 7 days
    const weekRes = await pool.query(
      'SELECT COUNT(*) as orders, COALESCE(SUM(total_amount), 0) as revenue FROM orders WHERE created_at >= NOW() - INTERVAL \'7 days\''
    );
    
    // Last 30 days
    const monthRes = await pool.query(
      'SELECT COUNT(*) as orders, COALESCE(SUM(total_amount), 0) as revenue FROM orders WHERE created_at >= NOW() - INTERVAL \'30 days\''
    );
    
    // Active users (users who made orders in last 30 days)
    const activeUsersRes = await pool.query(
      'SELECT COUNT(DISTINCT user_id) as count FROM orders WHERE created_at >= NOW() - INTERVAL \'30 days\' AND user_id IS NOT NULL'
    );
    
    // Average order value
    const avgOrderRes = await pool.query(
      'SELECT AVG(total_amount) as avg FROM orders WHERE created_at >= NOW() - INTERVAL \'30 days\''
    );
    
    const result = {
      today: {
        orders: parseInt(todayRes.rows[0].orders),
        revenue: parseFloat(todayRes.rows[0].revenue)
      },
      yesterday: {
        orders: parseInt(yesterdayRes.rows[0].orders),
        revenue: parseFloat(yesterdayRes.rows[0].revenue)
      },
      last7Days: {
        orders: parseInt(weekRes.rows[0].orders),
        revenue: parseFloat(weekRes.rows[0].revenue)
      },
      last30Days: {
        orders: parseInt(monthRes.rows[0].orders),
        revenue: parseFloat(monthRes.rows[0].revenue)
      },
      activeUsers: parseInt(activeUsersRes.rows[0].count),
      averageOrderValue: parseFloat(avgOrderRes.rows[0].avg) || 0
    };
    
    // Cache for 5 minutes
    await setCache(cacheKey, result, 300);
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Analytics - Sales with date range
router.get('/api/admin/analytics/sales', authenticateAdmin, async (req, res) => {
  try {
    const { range } = req.query;
    let interval = '7 days';
    
    if (range === '1d') interval = '1 day';
    else if (range === '7d') interval = '7 days';
    else if (range === '30d') interval = '30 days';
    else if (range === '90d') interval = '90 days';
    
    const { rows } = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as orders,
        COALESCE(SUM(total_amount), 0) as revenue
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);
    
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Analytics - Revenue with custom date range
router.get('/api/admin/analytics/revenue', authenticateAdmin, async (req, res) => {
  try {
    const { from, to } = req.query;
    
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to dates are required' });
    }
    
    const { rows } = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as orders,
        COALESCE(SUM(total_amount), 0) as revenue,
        COUNT(DISTINCT user_id) as unique_customers
      FROM orders
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `, [from, to]);
    
    // Total revenue for the period
    const totalRes = await pool.query(`
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COUNT(DISTINCT user_id) as total_customers,
        AVG(total_amount) as avg_order_value
      FROM orders
      WHERE created_at >= $1 AND created_at <= $2
    `, [from, to]);
    
    res.json({
      daily: rows,
      summary: totalRes.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Analytics - Top Products
router.get('/api/admin/analytics/top-products', authenticateAdmin, async (req, res) => {
  try {
    const { limit = 10, period = '30d' } = req.query;
    let interval = '30 days';
    
    if (period === '7d') interval = '7 days';
    else if (period === '90d') interval = '90 days';
    
    const cacheKey = `analytics:top-products:${period}:${limit}`;
    const cached = await getCache(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }
    
    const { rows } = await pool.query(`
      SELECT 
        p.id,
        p.name,
        p.brand,
        p.price,
        p.image,
        COUNT(oi.id) as total_sold,
        SUM(oi.quantity) as total_quantity,
        SUM(oi.price * oi.quantity) as total_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN products p ON oi.product_id = p.id
      WHERE o.created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY p.id, p.name, p.brand, p.price, p.image
      ORDER BY total_revenue DESC
      LIMIT $1
    `, [limit]);
    
    // Cache for 10 minutes
    await setCache(cacheKey, rows, 600);
    
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Analytics - Coupons Stats
router.get('/api/admin/coupons/stats', authenticateAdmin, async (req, res) => {
  try {
    const cacheKey = 'analytics:coupons:stats';
    const cached = await getCache(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }
    
    const { rows } = await pool.query(`
      SELECT 
        pc.code,
        pc.discount_percent,
        pc.usage_limit,
        pc.used_count,
        pc.is_active,
        COUNT(DISTINCT o.id) as orders_used,
        COALESCE(SUM(o.total_amount), 0) as total_revenue_generated,
        ROUND((pc.used_count::float / NULLIF(pc.usage_limit, 0)) * 100, 2) as usage_percentage
      FROM promo_codes pc
      LEFT JOIN orders o ON pc.code = ANY(
        SELECT DISTINCT promo_code 
        FROM orders 
        WHERE promo_code IS NOT NULL
      ) AND o.promo_code = pc.code
      GROUP BY pc.id, pc.code, pc.discount_percent, pc.usage_limit, pc.used_count, pc.is_active
      ORDER BY pc.used_count DESC
    `);
    
    // Cache for 15 minutes
    await setCache(cacheKey, rows, 900);
    
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Analytics - Wishlist Stats
router.get('/api/admin/wishlist/stats', authenticateAdmin, async (req, res) => {
  try {
    const cacheKey = 'analytics:wishlist:stats';
    const cached = await getCache(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }
    
    const totalWishlist = await pool.query('SELECT COUNT(*) as count FROM wishlist');
    
    const popularProducts = await pool.query(`
      SELECT 
        p.id,
        p.name,
        p.brand,
        p.price,
        p.image,
        COUNT(w.id) as wishlist_count
      FROM wishlist w
      JOIN products p ON w.product_id = p.id
      GROUP BY p.id, p.name, p.brand, p.price, p.image
      ORDER BY wishlist_count DESC
      LIMIT 20
    `);
    
    const conversionRate = await pool.query(`
      SELECT 
        COUNT(DISTINCT w.user_id) as total_users_with_wishlist,
        COUNT(DISTINCT o.user_id) as users_who_purchased
      FROM wishlist w
      LEFT JOIN orders o ON w.user_id = o.user_id
    `);
    
    const result = {
      total_wishlist_items: parseInt(totalWishlist.rows[0].count),
      popular_products: popularProducts.rows,
      conversion: conversionRate.rows[0]
    };
    
    // Cache for 10 minutes
    await setCache(cacheKey, result, 600);
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Analytics - Search Stats
router.get('/api/admin/search/stats', authenticateAdmin, async (req, res) => {
  try {
    const cacheKey = 'analytics:search:stats';
    const cached = await getCache(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }
    
    const totalSearches = await pool.query('SELECT COUNT(*) as count FROM search_logs');
    
    const trendingSearches = await pool.query(`
      SELECT 
        keyword,
        COUNT(*) as search_count,
        AVG(result_count) as avg_results,
        MAX(created_at) as last_searched
      FROM search_logs
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY keyword
      ORDER BY search_count DESC
      LIMIT 20
    `);
    
    const noResultsSearches = await pool.query(`
      SELECT 
        keyword,
        COUNT(*) as search_count
      FROM search_logs
      WHERE result_count = 0
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY keyword
      ORDER BY search_count DESC
      LIMIT 10
    `);
    
    const result = {
      total_searches: parseInt(totalSearches.rows[0].count),
      trending: trendingSearches.rows,
      no_results: noResultsSearches.rows
    };
    
    // Cache for 10 minutes
    await setCache(cacheKey, result, 600);
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
