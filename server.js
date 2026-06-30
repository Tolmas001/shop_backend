const dotenv = require('dotenv');
const path = require('path');
// Load environment variables early
dotenv.config({ path: path.join(__dirname, '.env') });

const helmet = require('helmet');
const express = require('express');
const asyncErrors = require('express-async-errors'); // must be required before routes
const rateLimiter = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const adminLogger = require('./middleware/adminLogger');
const { sanitizeInput } = require('./middleware/sanitize');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
const logger = require('./utils/logger');
const cors = require('cors');

const { initializeDB } = require('./database');
const { ensureAdminExists, ensureSuperAdminExists } = require('./utils/helpers');
const { initializeSocket } = require('./socket');
const { startAbandonedCartCron } = require('./cron/abandonedCart');
const { initSentry, sentryErrorHandler } = require('./middleware/sentry');
const { errorTrackerMiddleware } = require('./middleware/errorTracker');
const { ipBlockerMiddleware, cleanupExpiredBlocks } = require('./middleware/ipBlocker');
const searchLogger = require('./middleware/searchLogger');

const app = express();
app.set('trust proxy', 1);
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://shop-frontend-dun.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Mobil ilovalar, postman yoki origin yo'q so'rovlarga ruxsat berish
    if (!origin) return callback(null, true);
    
    // Agar origin ruxsat etilganlar ro'yxatida bo'lsa yoki .vercel.app bo'lsa ruxsat berish
    if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('CORS xatoligi: Bu domen ruxsat etilmagan!'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
};
app.use(cors(corsOptions));

app.use(
  helmet({
    crossOriginResourcePolicy: false, // Rasmlar cross-origin orqali o'qilishiga ruxsat berish
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://www.gstatic.com"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "http:", "https:"],
        connectSrc: ["'self'", "*"]
      }
    }
  })
);
app.use(rateLimiter);
app.use(ipBlockerMiddleware);
app.use(sanitizeInput);
app.use(searchLogger);
app.use(adminLogger);
app.use((req, res, next) => { logger.info(`${req.method} ${req.originalUrl}`); next(); });
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Import Routes
const authRouter = require('./routes/auth');
const productsRouter = require('./routes/products');
const ordersRouter = require('./routes/orders');
const promoRouter = require('./routes/promo');
const adsRouter = require('./routes/ads');
const blogsRouter = require('./routes/blogs');
const notificationsRouter = require('./routes/notifications');
const statsRouter = require('./routes/stats');
const wishlistRouter = require('./routes/wishlist');
const demoRouter = require('./routes/demo');
const faqRouter = require('./routes/faq');
const inventoryRouter = require('./routes/inventory');
const adminNotificationsRouter = require('./routes/admin-notifications');
const deliveryRouter = require('./routes/delivery');
const supportRouter = require('./routes/support');
const securityRouter = require('./routes/security');
const refundsRouter = require('./routes/refunds');
const paymentsRouter = require('./routes/payments');
const backupsRouter = require('./routes/backups');
const pushRouter = require('./routes/push');

// Register Routes
app.use(authRouter);
app.use(productsRouter);
app.use(ordersRouter);
app.use(promoRouter);
app.use(adsRouter);
app.use(blogsRouter);
app.use(notificationsRouter);
app.use(statsRouter);
app.use(wishlistRouter);
app.use(faqRouter);
app.use(demoRouter);
app.use(inventoryRouter);
app.use(adminNotificationsRouter);
app.use(deliveryRouter);
app.use(supportRouter);
app.use(securityRouter);
app.use(refundsRouter);
app.use(paymentsRouter);
app.use(backupsRouter);
app.use(pushRouter);

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Root (/) route
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>ShopSRY Backend</title>
        <style>
          body { font-family: sans-serif; text-align: center; padding: 50px; background-color: #f4f4f9; color: #333; }
          h1 { color: #2563EB; }
          p { font-size: 1.2rem; }
        </style>
      </head>
      <body>
        <h1>🚀 ShopSRY Backend</h1>
        <p>Backend server muvaffaqiyatli ishlayapti!</p>
        <p>Status: <b style="color: green;">Online</b></p>
      </body>
    </html>
  `);
});

if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, 'client', 'build');
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

app.use(errorHandler);
app.use(sentryErrorHandler);
app.use(errorTrackerMiddleware);

const PORT = process.env.PORT || 5001;

const startServer = async () => {
  // Initialize Sentry
  initSentry();

  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const superUser = process.env.SUPERADMIN_USERNAME || 'superadmin';
  const superPass = process.env.SUPERADMIN_PASSWORD || 'superadmin123';

  console.log('========================================');
  console.log('🔐 ADMIN KIRISH MA\'LUMOTLARI:');
  console.log(`   Username: ${adminUser}`);
  console.log(`   Password: ********`);
  console.log(`   Role: admin`);
  console.log('========================================');
  console.log('🔐 SUPER ADMIN KIRISH MA\'LUMOTLARI:');
  console.log(`   Username: ${superUser}`);
  console.log(`   Password: ********`);
  console.log(`   Role: superadmin`);
  console.log('========================================');

  try {
    await initializeDB();

    const adminCreds = await ensureAdminExists();
    if (adminCreds) {
      console.log('✅ Admin ma\'lumotlari bazaga yozildi');
    }

    const superCreds = await ensureSuperAdminExists();
    if (superCreds) {
      console.log('✅ Superadmin ma\'lumotlari bazaga yozildi');
    }

    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      console.log(`Server muvaffaqiyali ishga tushdi: http://localhost:${PORT}`);
    });
    
    // Initialize Socket.IO
    initializeSocket(server);
    
    // Start cron jobs
    startAbandonedCartCron();
    
    // Clean up expired IP blocks every hour
    setInterval(cleanupExpiredBlocks, 60 * 60 * 1000);
  } catch (err) {
    console.error('Server ishga tushirishda xatolik:', err);
    process.exit(1);
  }
};

startServer();