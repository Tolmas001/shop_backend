const jwt = require('jsonwebtoken');
const { pool } = require('../database');

const SECRET_KEY = process.env.JWT_SECRET || 'secret';

async function isTokenBlacklisted(token) {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM jwt_blacklist WHERE token = $1 AND expires_at > NOW()',
      [token]
    );
    return rows.length > 0;
  } catch (err) {
    console.error('Blacklist check error:', err);
    return false;
  }
}

async function addToBlacklist(token, expiresIn) {
  try {
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    await pool.query(
      'INSERT INTO jwt_blacklist (token, expires_at) VALUES ($1, $2)',
      [token, expiresAt]
    );
  } catch (err) {
    console.error('Blacklist add error:', err);
  }
}

async function cleanExpiredTokens() {
  try {
    await pool.query('DELETE FROM jwt_blacklist WHERE expires_at < NOW()');
  } catch (err) {
    console.error('Blacklist cleanup error:', err);
  }
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  
  jwt.verify(token, SECRET_KEY, async (err, user) => {
    if (err) return res.sendStatus(403);
    
    // Check if token is blacklisted
    const isBlacklisted = await isTokenBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }
    
    req.user = user;
    req.token = token;
    next();
  });
}

function authenticateAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  
  jwt.verify(token, SECRET_KEY, async (err, user) => {
    // Both admin and superadmin can access standard admin routes
    if (err || (user.role !== 'admin' && user.role !== 'superadmin')) return res.sendStatus(403);
    
    // Check if token is blacklisted
    const isBlacklisted = await isTokenBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }
    
    req.user = user;
    req.token = token;
    next();
  });
}

function authenticateSuperAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  
  jwt.verify(token, SECRET_KEY, async (err, user) => {
    if (err || user.role !== 'superadmin') return res.sendStatus(403);
    
    // Check if token is blacklisted
    const isBlacklisted = await isTokenBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }
    
    req.user = user;
    req.token = token;
    next();
  });
}

// Role-based access control middleware
function authorizeRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    next();
  };
}

// Check if user owns the resource or is admin
function authorizeResourceOwnerOrAdmin(userIdField = 'user_id') {
  return async (req, res, next) => {
    const userId = req.user.id;
    const resourceUserId = parseInt(req.params[userIdField] || req.body[userIdField]);
    
    // Admin and superadmin can access any resource
    if (req.user.role === 'admin' || req.user.role === 'superadmin') {
      return next();
    }
    
    // Regular users can only access their own resources
    if (userId === resourceUserId) {
      return next();
    }
    
    return res.status(403).json({ error: 'Access denied' });
  };
}

module.exports = {
  SECRET_KEY,
  authenticateToken,
  authenticateAdmin,
  authenticateSuperAdmin,
  authorizeRole,
  authorizeResourceOwnerOrAdmin,
  addToBlacklist,
  cleanExpiredTokens
};
