const dotenv = require('dotenv');
const path = require('path');
// Load environment variables early
dotenv.config({ path: path.join(__dirname, '.env') });

const helmet = require('helmet');
const express = require('express');
const asyncErrors = require('express-async-errors'); // must be required before routes
const rateLimiter = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const swaggerUi = require('swagger-ui-express');
const yaml = require('yamljs');
const logger = require('./utils/logger');
const cors = require('cors');

const { initializeDB } = require('./database');
const { ensureAdminExists, ensureSuperAdminExists } = require('./utils/helpers');

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
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 5001;

// Database initialization and admin seeding on startup
const startServer = async () => {
  try {
    await initializeDB();
    console.log('PostgreSQL initialized successfully');
    await ensureAdminExists();
    await ensureSuperAdminExists();
    
    app.listen(PORT, () => {
      console.log(`\n🚀 ShopSRY Backend is running!`);
      console.log(`   - Port: ${PORT}`);
      console.log(`   - Local: http://localhost:${PORT}`);
      console.log(`   - Uploads: http://localhost:${PORT}/uploads\n`);
    });
  } catch (err) {
    console.error('CRITICAL: Server failed to start!', err);
  }
};

startServer();