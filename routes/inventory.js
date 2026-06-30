const express = require('express');
const { pool } = require('../database');
const { authenticateAdmin } = require('../middleware/auth');
const { createNotification } = require('../utils/helpers');
const { emitStockLow } = require('../socket');

const router = express.Router();

// Get all inventory
router.get('/api/admin/inventory', authenticateAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        p.*,
        COALESCE(SUM(oi.quantity), 0) as total_sold
      FROM products p
      LEFT JOIN order_items oi ON p.id = oi.product_id
      LEFT JOIN orders o ON oi.order_id = o.id AND o.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY p.id
      ORDER BY p.stock_count ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get low stock products
router.get('/api/admin/inventory/low-stock', authenticateAdmin, async (req, res) => {
  try {
    const { threshold = 5 } = req.query;
    const { rows } = await pool.query(`
      SELECT 
        p.*,
        COALESCE(SUM(oi.quantity), 0) as total_sold
      FROM products p
      LEFT JOIN order_items oi ON p.id = oi.product_id
      LEFT JOIN orders o ON oi.order_id = o.id AND o.created_at >= NOW() - INTERVAL '30 days'
      WHERE p.stock_count < $1
      GROUP BY p.id
      ORDER BY p.stock_count ASC
    `, [threshold]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update inventory
router.patch('/api/admin/inventory/:id', authenticateAdmin, async (req, res) => {
  const { stock_count, notes } = req.body;
  const productId = req.params.id;
  const adminId = req.user.id;
  
  try {
    // Get current stock
    const currentRes = await pool.query(
      'SELECT stock_count FROM products WHERE id = $1',
      [productId]
    );
    
    if (currentRes.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const previousStock = currentRes.rows[0].stock_count;
    const changeType = stock_count > previousStock ? 'restock' : 'sale';
    
    // Update product stock
    await pool.query(
      'UPDATE products SET stock_count = $1 WHERE id = $2',
      [stock_count, productId]
    );
    
    // Log the change
    await pool.query(
      'INSERT INTO inventory_logs (product_id, previous_stock, new_stock, change_type, changed_by, notes) VALUES ($1, $2, $3, $4, $5, $6)',
      [productId, previousStock, stock_count, changeType, adminId, notes]
    );
    
    // Check if stock is low and send notification
    if (stock_count < 5) {
      await pool.query(
        'INSERT INTO admin_notifications (title, message, type, priority) VALUES ($1, $2, $3, $4)',
        ['Past zaxira ogohlantirish', `Mahsulot ID ${productId} zaxirasi past: ${stock_count} dona`, 'warning', 'high']
      );
      
      // Emit socket event for low stock
      const productRes = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
      if (productRes.rows.length > 0) {
        emitStockLow(productRes.rows[0]);
      }
    }
    
    res.json({ success: true, previous_stock: previousStock, new_stock: stock_count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get inventory logs
router.get('/api/admin/inventory/logs', authenticateAdmin, async (req, res) => {
  try {
    const { limit = 50, product_id } = req.query;
    let query = `
      SELECT 
        il.*,
        p.name as product_name,
        u.username as changed_by_username
      FROM inventory_logs il
      JOIN products p ON il.product_id = p.id
      LEFT JOIN users u ON il.changed_by = u.id
    `;
    const params = [];
    
    if (product_id) {
      query += ' WHERE il.product_id = $1';
      params.push(product_id);
    }
    
    query += ' ORDER BY il.created_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get inventory analytics
router.get('/api/admin/inventory/analytics', authenticateAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        COUNT(*) as total_products,
        SUM(CASE WHEN stock_count = 0 THEN 1 ELSE 0 END) as out_of_stock,
        SUM(CASE WHEN stock_count < 5 THEN 1 ELSE 0 END) as low_stock,
        SUM(CASE WHEN stock_count >= 5 THEN 1 ELSE 0 END) as in_stock,
        SUM(stock_count) as total_stock,
        AVG(stock_count) as avg_stock
      FROM products
    `);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auto-adjust stock based on orders
router.post('/api/admin/inventory/auto-adjust', authenticateAdmin, async (req, res) => {
  const { order_id } = req.body;
  const adminId = req.user.id;
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get order items
      const itemsRes = await client.query(
        'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
        [order_id]
      );
      
      for (const item of itemsRes.rows) {
        // Get current stock
        const stockRes = await client.query(
          'SELECT stock_count FROM products WHERE id = $1',
          [item.product_id]
        );
        
        if (stockRes.rows.length > 0) {
          const previousStock = stockRes.rows[0].stock_count;
          const newStock = Math.max(0, previousStock - item.quantity);
          
          // Update stock
          await client.query(
            'UPDATE products SET stock_count = $1 WHERE id = $2',
            [newStock, item.product_id]
          );
          
          // Log the change
          await client.query(
            'INSERT INTO inventory_logs (product_id, previous_stock, new_stock, change_type, changed_by, notes) VALUES ($1, $2, $3, $4, $5, $6)',
            [item.product_id, previousStock, newStock, 'sale', adminId, `Auto-adjusted for order ${order_id}`]
          );
          
          // Check if stock is low
          if (newStock < 5 && previousStock >= 5) {
            const productRes = await client.query('SELECT * FROM products WHERE id = $1', [item.product_id]);
            if (productRes.rows.length > 0) {
              emitStockLow(productRes.rows[0]);
            }
          }
        }
      }
      
      await client.query('COMMIT');
      res.json({ success: true, adjusted: itemsRes.rows.length });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
