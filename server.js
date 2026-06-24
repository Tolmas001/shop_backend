const helmet = require('helmet');
const express = require('express');
const asyncErrors = require('express-async-errors'); // must be required before routes
const rateLimiter = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const swaggerUi = require('swagger-ui-express');
const yaml = require('yamljs');
const logger = require('./utils/logger');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

const { initializeDB } = require('./database');
const { ensureAdminExists, ensureSuperAdminExists } = require('./utils/helpers');

// Load environment variables robustly
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const corsOptions = {
  origin: ['https://shop-frontend-dun.vercel.app'],
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  credentials: true,
};
app.use(cors(corsOptions));
app.use(helmet());
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
app.use(demoRouter);

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