const { pool } = require('../database');

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

async function isIPBlocked(ip) {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM blocked_ips WHERE ip = $1 AND (is_permanent = true OR expires_at > NOW())',
      [ip]
    );
    return rows.length > 0;
  } catch (err) {
    console.error('IP block check error:', err);
    return false;
  }
}

async function blockIP(ip, reason, blockedBy = null, isPermanent = false, expiresAt = null) {
  try {
    await pool.query(
      `INSERT INTO blocked_ips (ip, reason, blocked_by, is_permanent, expires_at) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (ip) DO UPDATE SET 
         reason = $2, 
         blocked_by = $3, 
         is_permanent = $4, 
         expires_at = $5`,
      [ip, reason, blockedBy, isPermanent, expiresAt]
    );
    return true;
  } catch (err) {
    console.error('IP block error:', err);
    return false;
  }
}

async function unblockIP(ip) {
  try {
    await pool.query('DELETE FROM blocked_ips WHERE ip = $1', [ip]);
    return true;
  } catch (err) {
    console.error('IP unblock error:', err);
    return false;
  }
}

async function recordFailedLogin(ip, username = null) {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM failed_login_attempts WHERE ip = $1',
      [ip]
    );

    if (rows.length === 0) {
      await pool.query(
        'INSERT INTO failed_login_attempts (ip, username, attempt_count) VALUES ($1, $2, 1)',
        [ip, username]
      );
    } else {
      const attempt = rows[0];
      const newCount = attempt.attempt_count + 1;
      
      if (newCount >= MAX_LOGIN_ATTEMPTS) {
        // Lock the IP
        const lockUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000);
        await pool.query(
          'UPDATE failed_login_attempts SET attempt_count = $1, is_locked = true, locked_until = $2, last_attempt = NOW() WHERE ip = $3',
          [newCount, lockUntil, ip]
        );
        
        // Also add to blocked_ips
        await blockIP(ip, 'Too many failed login attempts', null, false, lockUntil);
      } else {
        await pool.query(
          'UPDATE failed_login_attempts SET attempt_count = $1, last_attempt = NOW() WHERE ip = $2',
          [newCount, ip]
        );
      }
    }
  } catch (err) {
    console.error('Failed login record error:', err);
  }
}

async function isIPLocked(ip) {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM failed_login_attempts WHERE ip = $1 AND is_locked = true AND locked_until > NOW()',
      [ip]
    );
    return rows.length > 0;
  } catch (err) {
    console.error('IP lock check error:', err);
    return false;
  }
}

async function resetFailedLoginAttempts(ip) {
  try {
    await pool.query('DELETE FROM failed_login_attempts WHERE ip = $1', [ip]);
    return true;
  } catch (err) {
    console.error('Reset failed attempts error:', err);
    return false;
  }
}

async function getBlockedIPs() {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM blocked_ips ORDER BY blocked_at DESC'
    );
    return rows;
  } catch (err) {
    console.error('Get blocked IPs error:', err);
    return [];
  }
}

async function getFailedLoginAttempts() {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM failed_login_attempts ORDER BY last_attempt DESC'
    );
    return rows;
  } catch (err) {
    console.error('Get failed attempts error:', err);
    return [];
  }
}

// Middleware to check if IP is blocked
const ipBlockerMiddleware = async (req, res, next) => {
  const ip = req.ip;
  
  const blocked = await isIPBlocked(ip);
  if (blocked) {
    return res.status(403).json({ 
      error: 'Your IP has been blocked. Please contact support if you believe this is an error.' 
    });
  }
  
  next();
};

// Clean up expired blocks and locks
async function cleanupExpiredBlocks() {
  try {
    await pool.query('DELETE FROM blocked_ips WHERE is_permanent = false AND expires_at < NOW()');
    await pool.query('UPDATE failed_login_attempts SET is_locked = false, locked_until = NULL WHERE locked_until < NOW()');
    console.log('Cleaned up expired IP blocks and locks');
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}

module.exports = {
  isIPBlocked,
  blockIP,
  unblockIP,
  recordFailedLogin,
  isIPLocked,
  resetFailedLoginAttempts,
  getBlockedIPs,
  getFailedLoginAttempts,
  ipBlockerMiddleware,
  cleanupExpiredBlocks
};
