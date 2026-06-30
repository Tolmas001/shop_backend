const { pool } = require('../database');
const { captureException, captureMessage } = require('./sentry');

const logError = async (err, req, context = {}) => {
  try {
    const errorData = {
      message: err.message,
      stack: err.stack,
      name: err.name,
      path: req.path,
      method: req.method,
      user_id: req.user?.id,
      ip: req.ip,
      user_agent: req.get('user-agent'),
      timestamp: new Date().toISOString(),
      ...context
    };

    // Log to database
    await pool.query(
      `INSERT INTO error_logs (message, stack, path, method, user_id, ip, user_agent, context) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        errorData.message,
        errorData.stack,
        errorData.path,
        errorData.method,
        errorData.user_id,
        errorData.ip,
        errorData.user_agent,
        JSON.stringify(context)
      ]
    );

    // Log to Sentry
    captureException(err, errorData);
  } catch (logError) {
    console.error('Failed to log error:', logError);
  }
};

const logWarning = async (message, req, context = {}) => {
  try {
    const warningData = {
      message,
      path: req.path,
      method: req.method,
      user_id: req.user?.id,
      ip: req.ip,
      timestamp: new Date().toISOString(),
      ...context
    };

    // Log to Sentry
    captureMessage(message, 'warning', warningData);
  } catch (err) {
    console.error('Failed to log warning:', err);
  }
};

const logInfo = async (message, req, context = {}) => {
  try {
    const infoData = {
      message,
      path: req.path,
      method: req.method,
      user_id: req.user?.id,
      ip: req.ip,
      timestamp: new Date().toISOString(),
      ...context
    };

    // Log to Sentry (only in production for important events)
    if (process.env.NODE_ENV === 'production') {
      captureMessage(message, 'info', infoData);
    }
  } catch (err) {
    console.error('Failed to log info:', err);
  }
};

const errorTrackerMiddleware = (err, req, res, next) => {
  logError(err, req).catch(() => {});
  next(err);
};

module.exports = {
  logError,
  logWarning,
  logInfo,
  errorTrackerMiddleware
};
