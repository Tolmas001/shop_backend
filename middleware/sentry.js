const Sentry = require('@sentry/node');

const initSentry = () => {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      beforeSend(event, hint) {
        // Don't send errors from localhost in development
        if (process.env.NODE_ENV === 'development') {
          return null;
        }
        return event;
      }
    });
    console.log('Sentry initialized');
  } else {
    console.log('Sentry DSN not configured, skipping Sentry initialization');
  }
};

const captureException = (err, context = {}) => {
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err, {
      extra: context
    });
  }
};

const captureMessage = (message, level = 'info', context = {}) => {
  if (process.env.SENTRY_DSN) {
    Sentry.captureMessage(message, level, {
      extra: context
    });
  }
};

const sentryErrorHandler = (err, req, res, next) => {
  if (process.env.SENTRY_DSN) {
    Sentry.withScope((scope) => {
      scope.setUser({
        id: req.user?.id,
        username: req.user?.username,
        role: req.user?.role
      });
      scope.setExtra('request_body', req.body);
      scope.setExtra('request_params', req.params);
      scope.setExtra('request_query', req.query);
      scope.setTag('path', req.path);
      scope.setTag('method', req.method);
      
      Sentry.captureException(err);
    });
  }
  next(err);
};

module.exports = {
  initSentry,
  captureException,
  captureMessage,
  sentryErrorHandler
};
