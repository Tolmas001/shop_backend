// Simple rate limiter for Telegram bot
const rateLimits = new Map();

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // 30 requests per minute

const checkRateLimit = (userId) => {
  const now = Date.now();
  const userLimit = rateLimits.get(userId);
  
  if (!userLimit) {
    rateLimits.set(userId, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW
    });
    return true;
  }
  
  if (now > userLimit.resetTime) {
    // Reset the counter
    rateLimits.set(userId, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW
    });
    return true;
  }
  
  if (userLimit.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  userLimit.count++;
  return true;
};

const getRemainingRequests = (userId) => {
  const userLimit = rateLimits.get(userId);
  if (!userLimit) return RATE_LIMIT_MAX_REQUESTS;
  
  const now = Date.now();
  if (now > userLimit.resetTime) return RATE_LIMIT_MAX_REQUESTS;
  
  return RATE_LIMIT_MAX_REQUESTS - userLimit.count;
};

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [userId, limit] of rateLimits.entries()) {
    if (now > limit.resetTime) {
      rateLimits.delete(userId);
    }
  }
}, RATE_LIMIT_WINDOW);

module.exports = {
  checkRateLimit,
  getRemainingRequests
};