const jwt = require('jsonwebtoken');

const SECRET_KEY = process.env.JWT_SECRET || 'secret';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

function authenticateAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  
  jwt.verify(token, SECRET_KEY, (err, user) => {
    // Both admin and superadmin can access standard admin routes
    if (err || (user.role !== 'admin' && user.role !== 'superadmin')) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

function authenticateSuperAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err || user.role !== 'superadmin') return res.sendStatus(403);
    req.user = user;
    next();
  });
}

module.exports = {
  SECRET_KEY,
  authenticateToken,
  authenticateAdmin,
  authenticateSuperAdmin
};
