const { pool } = require('../database');

const adminLogger = async (req, res, next) => {
  // Only log admin actions
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'superadmin')) {
    return next();
  }

  const originalSend = res.send;
  
  res.send = function(data) {
    // Log after response is sent
    setImmediate(async () => {
      try {
        const method = req.method;
        const path = req.path;
        const statusCode = res.statusCode;
        
        // Determine action based on method and path
        let action = 'ADMIN_ACTION';
        let entityType = null;
        let entityId = null;
        let details = null;
        
        // Extract entity info from path
        const pathParts = path.split('/').filter(p => p);
        
        if (pathParts.includes('products')) {
          entityType = 'product';
          if (method === 'POST') action = 'PRODUCT_CREATED';
          else if (method === 'PUT' || method === 'PATCH') action = 'PRODUCT_UPDATED';
          else if (method === 'DELETE') action = 'PRODUCT_DELETED';
          
          // Try to extract product ID
          const idIndex = pathParts.indexOf('products') + 1;
          if (idIndex < pathParts.length && !isNaN(pathParts[idIndex])) {
            entityId = parseInt(pathParts[idIndex]);
          }
        }
        else if (pathParts.includes('orders')) {
          entityType = 'order';
          if (method === 'PATCH') action = 'ORDER_STATUS_UPDATED';
          
          const idIndex = pathParts.indexOf('orders') + 1;
          if (idIndex < pathParts.length && !isNaN(pathParts[idIndex])) {
            entityId = parseInt(pathParts[idIndex]);
          }
        }
        else if (pathParts.includes('users')) {
          entityType = 'user';
          if (method === 'DELETE') action = 'USER_DELETED';
          else if (method === 'PATCH') action = 'USER_UPDATED';
          
          const idIndex = pathParts.indexOf('users') + 1;
          if (idIndex < pathParts.length && !isNaN(pathParts[idIndex])) {
            entityId = parseInt(pathParts[idIndex]);
          }
        }
        else if (pathParts.includes('support')) {
          entityType = 'support_ticket';
          if (method === 'PATCH') action = 'SUPPORT_TICKET_UPDATED';
          
          const idIndex = pathParts.indexOf('support') + 1;
          if (idIndex < pathParts.length && !isNaN(pathParts[idIndex])) {
            entityId = parseInt(pathParts[idIndex]);
          }
        }
        else if (pathParts.includes('refunds')) {
          entityType = 'refund';
          if (method === 'PATCH') action = 'REFUND_PROCESSED';
          
          const idIndex = pathParts.indexOf('refunds') + 1;
          if (idIndex < pathParts.length && !isNaN(pathParts[idIndex])) {
            entityId = parseInt(pathParts[idIndex]);
          }
        }
        else if (pathParts.includes('inventory')) {
          entityType = 'inventory';
          if (method === 'PATCH') action = 'INVENTORY_UPDATED';
          
          const idIndex = pathParts.indexOf('inventory') + 1;
          if (idIndex < pathParts.length && !isNaN(pathParts[idIndex])) {
            entityId = parseInt(pathParts[idIndex]);
          }
        }
        else if (pathParts.includes('payments')) {
          entityType = 'payment';
          if (method === 'POST') action = 'PAYMENT_PROCESSED';
          else if (method === 'PATCH') action = 'PAYMENT_REFUNDED';
          
          const idIndex = pathParts.indexOf('payments') + 1;
          if (idIndex < pathParts.length && !isNaN(pathParts[idIndex])) {
            entityId = parseInt(pathParts[idIndex]);
          }
        }
        else if (pathParts.includes('backups')) {
          entityType = 'backup';
          if (method === 'POST') action = 'BACKUP_CREATED';
          else if (method === 'DELETE') action = 'BACKUP_DELETED';
        }
        else if (pathParts.includes('notifications')) {
          entityType = 'notification';
          if (method === 'POST') action = 'NOTIFICATION_SENT';
          else if (method === 'PATCH') action = 'NOTIFICATION_UPDATED';
        }
        else if (pathParts.includes('coupons') || pathParts.includes('promo')) {
          entityType = 'coupon';
          if (method === 'POST') action = 'COUPON_CREATED';
          else if (method === 'PUT' || method === 'PATCH') action = 'COUPON_UPDATED';
          else if (method === 'DELETE') action = 'COUPON_DELETED';
          
          const idIndex = pathParts.indexOf('coupons') > -1 ? pathParts.indexOf('coupons') + 1 : pathParts.indexOf('promo') + 1;
          if (idIndex < pathParts.length && !isNaN(pathParts[idIndex])) {
            entityId = parseInt(pathParts[idIndex]);
          }
        }
        else if (pathParts.includes('categories')) {
          entityType = 'category';
          if (method === 'POST') action = 'CATEGORY_CREATED';
          else if (method === 'PUT' || method === 'PATCH') action = 'CATEGORY_UPDATED';
          else if (method === 'DELETE') action = 'CATEGORY_DELETED';
          
          const idIndex = pathParts.indexOf('categories') + 1;
          if (idIndex < pathParts.length && !isNaN(pathParts[idIndex])) {
            entityId = parseInt(pathParts[idIndex]);
          }
        }
        else if (pathParts.includes('security')) {
          entityType = 'security';
          if (method === 'POST') action = 'IP_BLOCKED';
          else if (method === 'DELETE') action = 'IP_UNBLOCKED';
        }
        
        // Build details object
        details = {
          method,
          path,
          status_code: statusCode,
          ip: req.ip || req.connection.remoteAddress,
          user_agent: req.get('user-agent')
        };
        
        // Add request body if it's a modification action (safely)
        if (req.body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
          // Only include non-sensitive fields
          const safeBody = {};
          const sensitiveFields = ['password', 'token', 'secret', 'credit_card', 'ssn'];
          
          for (const key in req.body) {
            if (!sensitiveFields.includes(key.toLowerCase())) {
              safeBody[key] = req.body[key];
            }
          }
          
          if (Object.keys(safeBody).length > 0) {
            details.request_body = safeBody;
          }
        }
        
        // Only log successful modification actions
        if (statusCode >= 200 && statusCode < 300 && 
            (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')) {
          await pool.query(
            'INSERT INTO admin_activity_logs (admin_id, action, entity_type, entity_id, details, ip_address) VALUES ($1, $2, $3, $4, $5, $6)',
            [req.user.id, action, entityType, entityId, JSON.stringify(details), req.ip || req.connection.remoteAddress]
          );
        }
      } catch (err) {
        console.error('Admin logger error:', err);
        // Don't block the response if logging fails
      }
    });
    
    originalSend.call(this, data);
  };
  
  next();
};

module.exports = adminLogger;
