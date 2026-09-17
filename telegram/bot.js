const TelegramBot = require('node-telegram-bot-api');

const { pool } = require('../database');
const { setBotInstance } = require('./notifications');
const { checkRateLimit } = require('./middleware/rateLimiter');
const { 
  getMainMenuKeyboard, 
  getCategoriesKeyboard, 
  getProductsKeyboard,
  getProductDetailKeyboard,
  getCartKeyboard,
  getOrderConfirmationKeyboard,
  getHelpKeyboard,
  getSearchKeyboard,
  getProfileSettingsKeyboard,
  getAddressKeyboard,
  getAdminKeyboard,
  getOrderStatusKeyboard,
  getComparisonKeyboard,
  getDeliveryKeyboard,
  formatPrice
} = require('./keyboards/keyboards');

// Replace with your bot token from @BotFather
const token = process.env.TELEGRAM_BOT_TOKEN;

let bot = null;

// In-memory cart storage (in production, use Redis or database)
const carts = new Map();

// User session storage for order flow
const userSessions = new Map();

// Product comparison storage
const productComparisons = new Map();

// Search results storage
const searchResults = new Map();

// Admin sessions
const adminSessions = new Map();

// Delivery options
const deliveryOptions = {
  standard: { name: 'Standart yetkazib berish', cost: 20000, time: '2-3 kun' },
  express: { name: 'Express yetkazib berish', cost: 50000, time: '1 kun' },
  pickup: { name: 'Olib ketish', cost: 0, time: 'Darhol' }
};

// Helper function to get or create user cart
const getUserCart = (userId) => {
  if (!carts.has(userId)) {
    carts.set(userId, []);
  }
  return carts.get(userId);
};

// Helper function to add item to cart
const addToCart = (userId, product) => {
  const cart = getUserCart(userId);
  const existingItem = cart.find(item => item.product_id === product.id);
  
  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({
      product_id: product.id,
      product_name: product.name,
      price: product.price,
      quantity: 1,
      image: product.image
    });
  }
  
  return cart;
};

// Helper function to increase cart item quantity
const increaseCartItem = (userId, productId) => {
  const cart = getUserCart(userId);
  const item = cart.find(item => item.product_id === productId);
  
  if (item) {
    item.quantity += 1;
  }
  
  return cart;
};

// Helper function to decrease cart item quantity
const decreaseCartItem = (userId, productId) => {
  const cart = getUserCart(userId);
  const item = cart.find(item => item.product_id === productId);
  
  if (item && item.quantity > 1) {
    item.quantity -= 1;
  }
  
  return cart;
};

// Helper function to remove item from cart
const removeFromCart = (userId, productId) => {
  const cart = getUserCart(userId);
  const index = cart.findIndex(item => item.product_id === productId);
  
  if (index > -1) {
    if (cart[index].quantity > 1) {
      cart[index].quantity -= 1;
    } else {
      cart.splice(index, 1);
    }
  }
  
  return cart;
};

// Helper function to get cart total
const getCartTotal = (cart) => {
  return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
};

// Helper function to find or create Telegram user in database
const findOrCreateTelegramUser = async (telegramId, telegramUser) => {
  try {
    // First try to find existing user by telegram_user_id
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE telegram_user_id = $1',
      [telegramId]
    );
    
    if (rows.length > 0) {
      return rows[0];
    }
    
    // If not found, create new user with telegram info
    const username = telegramUser.username || `telegram_${telegramId}`;
    const email = `${username}@telegram.temp`;
    
    const { rows: newUser } = await pool.query(
      'INSERT INTO users (username, email, full_name, telegram_user_id, role) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [username, email, telegramUser.first_name || 'Telegram User', telegramId, 'user']
    );
    
    return newUser[0];
  } catch (error) {
    console.error('Error finding/creating telegram user:', error);
    return null;
  }
};

// Helper function to validate phone number
const validatePhone = (phone) => {
  return /^\+998\d{9}$/.test(phone);
};

// Helper function to get status emoji
const getStatusEmoji = (status) => {
  const emojis = {
    'pending': '🟡',
    'confirmed': '🟢',
    'processing': '🔵',
    'shipped': '🚚',
    'delivered': '✅',
    'cancelled': '❌'
  };
  return emojis[status] || '⚪';
};

// Initialize Telegram bot
const initializeTelegramBot = () => {
  if (!token) {
    console.log('TELEGRAM_BOT_TOKEN not set, skipping Telegram bot initialization');
    return null;
  }

  try {
    // Create a bot instance
    bot = new TelegramBot(token, { polling: true });

    // Set bot instance for notifications
    setBotInstance(bot);

    console.log('Telegram bot initialization started...');
  } catch (error) {
    console.error('Failed to initialize Telegram bot:', error.message);
    return null;
  }

  // Only register handlers if bot was successfully created
  if (!bot) {
    console.log('Bot instance not available, skipping handler registration');
    return null;
  }

  // Start command handler
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    // Find or create user in database
    const user = await findOrCreateTelegramUser(telegramId, msg.from);
    
    // Check if user is admin
    if (user.role === 'admin' || user.role === 'superadmin') {
      const welcomeMessage = `
🎉 ShopSRY Admin Botiga xush kelibsiz!

Admin panel sifatida quyidagi imkoniyatlaringiz mavjud:
📊 Statistika
📢 Xabar yuborish
⚡ Buyurtma statusi
👥 Foydalanuvchilar

👨‍💼 Admin panel uchun /admin buyrug'ini kiriting.
🛍️ Oddiy foydalanuvchi sifatida ishlash uchun pastdagi tugmalardan foydalaning.
      `;
      
      await bot.sendMessage(chatId, welcomeMessage, getMainMenuKeyboard());
    } else {
      const welcomeMessage = `
🎉 ShopSRY botiga xush kelibsiz!

Biz bilan Xitoydan kelayotgan sifatli mahsulotlarni xarid qilishingiz mumkin.

🛍️ Mahsulotlarni ko'rish uchun pastdagi tugmalardan foydalaning.
      `;
      
      await bot.sendMessage(chatId, welcomeMessage, getMainMenuKeyboard());
    }
  });

  // Admin command
  bot.onText(/\/admin/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    try {
      const { rows } = await pool.query('SELECT * FROM users WHERE telegram_user_id = $1', [telegramId]);
      
      if (rows.length === 0 || (rows[0].role !== 'admin' && rows[0].role !== 'superadmin')) {
        await bot.sendMessage(chatId, '❌ Siz admin emassiz.');
        return;
      }
      
      await bot.sendMessage(chatId, '👨‍💼 Admin Panel', getAdminKeyboard());
    } catch (error) {
      console.error('Error checking admin status:', error);
      await bot.sendMessage(chatId, 'Admin statusini tekshirishda xatolik yuz berdi.');
    }
  });

  // Help command handler
  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    
    const helpMessage = `
🆘 Yordam

Bizning bot orqali quyidagilarni qilishingiz mumkin:
• 🛍️ Mahsulotlarni ko'rish va sotib olish
• 📦 Kategoriyalar bo'yicha filtirlash
• 🛒 Savatga mahsulot qo'shish
• 📋 Buyurtmalarni boshqarish
• 👤 Profil ma'lumotlarini ko'rish

❓ Savollaringiz bo'lsa, biz bilan bog'laning.
    `;
    
    await bot.sendMessage(chatId, helpMessage, getHelpKeyboard());
  });

  // Products button handler
  bot.onText(/🛍️ Mahsulotlar/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const { rows } = await pool.query('SELECT * FROM products ORDER BY created_at DESC LIMIT 20');
      
      if (rows.length === 0) {
        await bot.sendMessage(chatId, 'Hozircha mahsulotlar yo\'q.');
        return;
      }
      
      const message = '🛍️ Mahsulotlar ro\'yxati:';
      await bot.sendMessage(chatId, message, getProductsKeyboard(rows, 0));
    } catch (error) {
      console.error('Error fetching products:', error);
      await bot.sendMessage(chatId, 'Mahsulotlarni olishda xatolik yuz berdi.');
    }
  });

  // Search functionality
  bot.onText(/🔍 Qidirish/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, '🔍 Qidirish: Mahsulot nomini kiriting', getSearchKeyboard());
  });

  // Categories button handler
  bot.onText(/📦 Kategoriyalar/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const { rows } = await pool.query('SELECT * FROM categories ORDER BY name');
      
      if (rows.length === 0) {
        await bot.sendMessage(chatId, 'Hozircha kategoriyalar yo\'q.');
        return;
      }
      
      const message = '📦 Kategoriyalar:';
      await bot.sendMessage(chatId, message, getCategoriesKeyboard(rows));
    } catch (error) {
      console.error('Error fetching categories:', error);
      await bot.sendMessage(chatId, 'Kategoriyalarni olishda xatolik yuz berdi.');
    }
  });

  // Cart button handler
  bot.onText(/🛒 Savat/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const cart = getUserCart(userId);
    
    if (cart.length === 0) {
      await bot.sendMessage(chatId, '🛒 Savatingiz bo\'sh.', getMainMenuKeyboard());
      return;
    }
    
    const total = getCartTotal(cart);
    let message = '🛒 Savatingiz:\n\n';
    
    cart.forEach(item => {
      message += `${item.product_name} x${item.quantity} - ${formatPrice(item.price * item.quantity)}\n`;
    });
    
    message += `\nJami: ${formatPrice(total)}`;
    
    await bot.sendMessage(chatId, message, getCartKeyboard(cart));
  });

  // Orders button handler
  bot.onText(/📋 Buyurtmalarim/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    try {
      // Find user by telegram_user_id
      const { rows } = await pool.query('SELECT * FROM users WHERE telegram_user_id = $1', [telegramId]);
      
      if (rows.length === 0) {
        await bot.sendMessage(chatId, 'Avval ro\'yxatdan o\'ting (/start)');
        return;
      }
      
      const user = rows[0];
      const { rows: orders } = await pool.query(
        'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
        [user.id]
      );
      
      if (orders.length === 0) {
        await bot.sendMessage(chatId, 'Sizda hozircha buyurtmalar yo\'q.');
        return;
      }
      
      let message = '📋 Buyurtmalarim:\n\n';
      
      orders.forEach(order => {
        const statusEmoji = getStatusEmoji(order.status);
        const canCancel = order.status === 'pending';
        message += `${statusEmoji} #${order.id} - ${formatPrice(order.total_amount)} (${order.status}) ${canCancel ? '[❌ Bekor qilish]' : ''}\n`;
      });
      
      message += '\nBuyurtma #ID raqamini yuboring, detallarni ko\'rish uchun. Yoki "cancel_ID" formatida buyurtmani bekor qiling.';
      
      await bot.sendMessage(chatId, message);
    } catch (error) {
      console.error('Error fetching orders:', error);
      await bot.sendMessage(chatId, 'Buyurtmalarni olishda xatolik yuz berdi.');
    }
  });

  // Profile button handler
  bot.onText(/👤 Profil/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    try {
      const { rows } = await pool.query('SELECT * FROM users WHERE telegram_user_id = $1', [telegramId]);
      
      if (rows.length === 0) {
        await bot.sendMessage(chatId, 'Avval ro\'yxatdan o\'ting (/start)');
        return;
      }
      
      const user = rows[0];
      const message = `
👤 Profil ma'lumotlari:

👤 Ism: ${user.full_name || 'Ko\'rsatilmagan'}
📧 Email: ${user.email}
📱 Telefon: ${user.phone || 'Ko\'rsatilmagan'}
🎯 Rol: ${user.role}
💳 Ballar: ${user.points || 0}
      `;
      
      await bot.sendMessage(chatId, message, getProfileSettingsKeyboard());
    } catch (error) {
      console.error('Error fetching profile:', error);
      await bot.sendMessage(chatId, 'Profil ma\'lumotlarini olishda xatolik yuz berdi.');
    }
  });

  // Wishlist button handler
  bot.onText(/❤️ Wishlist/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    try {
      const { rows } = await pool.query('SELECT * FROM users WHERE telegram_user_id = $1', [telegramId]);
      
      if (rows.length === 0) {
        await bot.sendMessage(chatId, 'Avval ro\'yxatdan o\'ting (/start)');
        return;
      }
      
      const user = rows[0];
      const { rows: wishlist } = await pool.query(
        'SELECT p.* FROM wishlist w JOIN products p ON w.product_id = p.id WHERE w.user_id = $1',
        [user.id]
      );
      
      if (wishlist.length === 0) {
        await bot.sendMessage(chatId, '❤️ Wishlistingiz bo\'sh.', getMainMenuKeyboard());
        return;
      }
      
      let message = '❤️ Wishlist:\n\n';
      wishlist.forEach(item => {
        message += `${item.name} - ${formatPrice(item.price)}\n`;
      });
      
      await bot.sendMessage(chatId, message);
    } catch (error) {
      console.error('Error fetching wishlist:', error);
      await bot.sendMessage(chatId, 'Wishlistni olishda xatolik yuz berdi.');
    }
  });

  // Back button handler
  bot.onText(/🔙 Orqaga/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, 'Asosiy menyu:', getMainMenuKeyboard());
  });

  // Contact handler
  bot.onText(/📞 Biz bilan bog'lanish/, async (msg) => {
    const chatId = msg.chat.id;
    const message = `
📞 Biz bilan bog'lanish

📱 Telefon: +998 90 123 45 67
📧 Email: info@shopsry.uz
🌐 Website: https://shopsry.uz

Ish vaqti: 09:00 - 18:00
    `;
    
    await bot.sendMessage(chatId, message, getMainMenuKeyboard());
  });

  // Admin handlers
  bot.onText(/📊 Statistika/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    try {
      const { rows } = await pool.query('SELECT * FROM users WHERE telegram_user_id = $1', [telegramId]);
      
      if (rows.length === 0 || (rows[0].role !== 'admin' && rows[0].role !== 'superadmin')) {
        await bot.sendMessage(chatId, '❌ Siz admin emassiz.');
        return;
      }
      
      // Get statistics
      const { rows: productCount } = await pool.query('SELECT COUNT(*) as count FROM products');
      const { rows: orderCount } = await pool.query('SELECT COUNT(*) as count FROM orders');
      const { rows: userCount } = await pool.query('SELECT COUNT(*) as count FROM users');
      const { rows: totalRevenue } = await pool.query('SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE status = \'delivered\'');
      
      const statsMessage = `
📊 ShopSRY Statistikasi

📦 Mahsulotlar: ${productCount[0].count}
📋 Buyurtmalar: ${orderCount[0].count}
👥 Foydalanuvchilar: ${userCount[0].count}
💰 Umumiy daromad: ${formatPrice(totalRevenue[0].total)}
      `;
      
      await bot.sendMessage(chatId, statsMessage, getAdminKeyboard());
    } catch (error) {
      console.error('Error getting statistics:', error);
      await bot.sendMessage(chatId, 'Statistikani olishda xatolik yuz berdi.');
    }
  });

  bot.onText(/📢 Xabar yuborish/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    try {
      const { rows } = await pool.query('SELECT * FROM users WHERE telegram_user_id = $1', [telegramId]);
      
      if (rows.length === 0 || (rows[0].role !== 'admin' && rows[0].role !== 'superadmin')) {
        await bot.sendMessage(chatId, '❌ Siz admin emassiz.');
        return;
      }
      
      adminSessions.set(userId, { step: 'broadcast_message' });
      await bot.sendMessage(chatId, '📢 Xabar yuborish\n\nIltimos, yubormoqchi bo\'lgan xabaringizni kiriting:');
    } catch (error) {
      console.error('Error starting broadcast:', error);
      await bot.sendMessage(chatId, 'Xabar yuborishni boshlashda xatolik yuz berdi.');
    }
  });

  bot.onText(/⚡ Buyurtma statusi/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    try {
      const { rows } = await pool.query('SELECT * FROM users WHERE telegram_user_id = $1', [telegramId]);
      
      if (rows.length === 0 || (rows[0].role !== 'admin' && rows[0].role !== 'superadmin')) {
        await bot.sendMessage(chatId, '❌ Siz admin emassiz.');
        return;
      }
      
      adminSessions.set(userId, { step: 'select_order' });
      await bot.sendMessage(chatId, '⚡ Buyurtma statusi\n\nIltimos, buyurtma ID sini kiriting:');
    } catch (error) {
      console.error('Error starting order status change:', error);
      await bot.sendMessage(chatId, 'Buyurtma statusini o\'zgartirishni boshlashda xatolik yuz berdi.');
    }
  });

  bot.onText(/👥 Foydalanuvchilar/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    try {
      const { rows } = await pool.query('SELECT * FROM users WHERE telegram_user_id = $1', [telegramId]);
      
      if (rows.length === 0 || (rows[0].role !== 'admin' && rows[0].role !== 'superadmin')) {
        await bot.sendMessage(chatId, '❌ Siz admin emassiz.');
        return;
      }
      
      const { rows: users } = await pool.query('SELECT id, username, email, full_name, role, created_at FROM users ORDER BY created_at DESC LIMIT 10');
      
      let message = '👥 Foydalanuvchilar (oxirgi 10):\n\n';
      users.forEach(user => {
        message += `👤 ${user.full_name || user.username} (${user.role})\n`;
        message += `📧 ${user.email}\n`;
        message += `📅 ${new Date(user.created_at).toLocaleDateString('uz-UZ')}\n\n`;
      });
      
      await bot.sendMessage(chatId, message, getAdminKeyboard());
    } catch (error) {
      console.error('Error getting users:', error);
      await bot.sendMessage(chatId, 'Foydalanuvchilarni olishda xatolik yuz berdi.');
    }
  });

  bot.onText(/🔙 Orqaga/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, 'Asosiy menyu:', getMainMenuKeyboard());
  });

  // Callback query handler
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    
    // Answer callback query to remove loading state
    await bot.answerCallbackQuery(callbackQuery.id);
    
    // Category selection
    if (data.startsWith('category_')) {
      const categoryName = data.replace('category_', '');
      
      try {
        const { rows } = await pool.query(
          'SELECT * FROM products WHERE category = $1 ORDER BY created_at DESC LIMIT 20',
          [categoryName]
        );
        
        if (rows.length === 0) {
          await bot.sendMessage(chatId, `"${categoryName}" kategoriyasida mahsulotlar yo\'q.`);
          return;
        }
        
        let message = `📦 ${categoryName} kategoriyasi:\n\n`;
        rows.forEach(product => {
          message += `${product.name} - ${formatPrice(product.price)}\n`;
        });
        
        await bot.sendMessage(chatId, message, getProductsKeyboard(rows, 0));
      } catch (error) {
        console.error('Error fetching category products:', error);
        await bot.sendMessage(chatId, 'Kategoriya mahsulotlarini olishda xatolik yuz berdi.');
      }
    }
    // Product detail view
    if (data.startsWith('product_')) {
      const productId = parseInt(data.split('_')[1]);
      
      try {
        const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
        
        if (rows.length > 0) {
          const product = rows[0];
          
          // Check if in wishlist
          const user = await findOrCreateTelegramUser(userId, callbackQuery.from);
          const { rows: wishlistCheck } = await pool.query(
            'SELECT * FROM wishlist WHERE user_id = $1 AND product_id = $2',
            [user.id, productId]
          );
          const inWishlist = wishlistCheck.length > 0;
          
          // Send product photo if available
          if (product.image) {
            try {
              await bot.sendPhoto(chatId, product.image, {
                caption: `
📱 ${product.name}
💰 ${formatPrice(product.price)}
📦 Mavjud: ${product.stock_count || 0} dona
🏷️ Brand: ${product.brand}
📁 Kategoriya: ${product.category}
                `,
                parse_mode: 'HTML'
              });
            } catch (photoError) {
              // If photo fails, send text message
              await bot.sendMessage(chatId, `
📱 ${product.name}
💰 ${formatPrice(product.price)}
📦 Mavjud: ${product.stock_count || 0} dona
🏷️ Brand: ${product.brand}
📁 Kategoriya: ${product.category}
              `);
            }
          } else {
            await bot.sendMessage(chatId, `
📱 ${product.name}
💰 ${formatPrice(product.price)}
📦 Mavjud: ${product.stock_count || 0} dona
🏷️ Brand: ${product.brand}
📁 Kategoriya: ${product.category}
            `);
          }
          
          await bot.sendMessage(chatId, 'Mahsulot detallari:', getProductDetailKeyboard(productId, inWishlist));
        }
      } catch (error) {
        console.error('Error showing product detail:', error);
        await bot.sendMessage(chatId, 'Mahsulotni ko\'rsatishda xatolik yuz berdi.');
      }
    }
    // Add to comparison
    else if (data.startsWith('add_compare_')) {
      const productId = parseInt(data.split('_')[2]);
      
      const comparisons = productComparisons.get(userId) || [];
      if (!comparisons.includes(productId)) {
        comparisons.push(productId);
        productComparisons.set(userId, comparisons);
        
        await bot.sendMessage(chatId, '📊 Mahsulot solishtirishga qo\'shildi!');
        
        if (comparisons.length >= 2) {
          await bot.sendMessage(chatId, 'Solishtirish uchun kamida 2 ta mahsulot tanlandi.', getComparisonKeyboard(comparisons));
        }
      } else {
        await bot.sendMessage(chatId, 'Bu mahsulot allaqachon solishtirishda.');
      }
    }
    // Remove from comparison
    else if (data.startsWith('remove_compare_')) {
      const productId = parseInt(data.split('_')[2]);
      const comparisons = productComparisons.get(userId) || [];
      const index = comparisons.indexOf(productId);
      
      if (index > -1) {
        comparisons.splice(index, 1);
        productComparisons.set(userId, comparisons);
        
        if (comparisons.length === 0) {
          productComparisons.delete(userId);
          await bot.sendMessage(chatId, '📊 Solishtirish bo\'sh.');
        } else {
          await bot.sendMessage(chatId, 'Mahsulot solishtirishdan olib tashlandi.', getComparisonKeyboard(comparisons));
        }
      }
    }
    // Do comparison
    else if (data === 'do_comparison') {
      const comparisons = productComparisons.get(userId) || [];
      
      if (comparisons.length < 2) {
        await bot.sendMessage(chatId, '❌ Kamida 2 ta mahsulot kerak.');
        return;
      }
      
      try {
        const { rows } = await pool.query(
          'SELECT * FROM products WHERE id = ANY($1)',
          [comparisons]
        );
        
        let comparisonMessage = '📊 Mahsulot solishtirish:\n\n';
        
        rows.forEach(product => {
          comparisonMessage += `📱 ${product.name}\n`;
          comparisonMessage += `💰 ${formatPrice(product.price)}\n`;
          comparisonMessage += `🏷️ ${product.brand}\n`;
          comparisonMessage += `📦 ${product.stock_count || 0} dona\n\n`;
        });
        
        await bot.sendMessage(chatId, comparisonMessage);
        productComparisons.delete(userId);
      } catch (error) {
        console.error('Error comparing products:', error);
        await bot.sendMessage(chatId, 'Solishtirishda xatolik yuz berdi.');
      }
    }
    // Add to cart
    else if (data.startsWith('add_to_cart_')) {
      const productId = parseInt(data.split('_')[3]);
      
      try {
        const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
        
        if (rows.length > 0) {
          const cart = addToCart(userId, rows[0]);
          await bot.sendMessage(chatId, `✅ ${rows[0].name} savatga qo'shildi!`);
          
          // Show updated cart
          const total = getCartTotal(cart);
          let cartMessage = '🛒 Savatingiz:\n\n';
          cart.forEach(item => {
            cartMessage += `${item.product_name} x${item.quantity} - ${formatPrice(item.price * item.quantity)}\n`;
          });
          cartMessage += `\nJami: ${formatPrice(total)}`;
          
          await bot.sendMessage(chatId, cartMessage, getCartKeyboard(cart));
        }
      } catch (error) {
        console.error('Error adding to cart:', error);
        await bot.sendMessage(chatId, 'Xatolik yuz berdi.');
      }
    }
    // Remove from cart
    else if (data.startsWith('remove_from_cart_')) {
      const productId = parseInt(data.split('_')[3]);
      const cart = removeFromCart(userId, productId);
      
      if (cart.length === 0) {
        await bot.sendMessage(chatId, '🛒 Savatingiz bo\'sh.', getMainMenuKeyboard());
      } else {
        const total = getCartTotal(cart);
        let cartMessage = '🛒 Savatingiz:\n\n';
        cart.forEach(item => {
          cartMessage += `${item.product_name} x${item.quantity} - ${formatPrice(item.price * item.quantity)}\n`;
        });
        cartMessage += `\nJami: ${formatPrice(total)}`;
        
        await bot.sendMessage(chatId, cartMessage, getCartKeyboard(cart));
      }
    }
    // Increase cart item quantity
    else if (data.startsWith('increase_cart_')) {
      const productId = parseInt(data.split('_')[2]);
      const cart = increaseCartItem(userId, productId);
      
      const total = getCartTotal(cart);
      let cartMessage = '🛒 Savatingiz:\n\n';
      cart.forEach(item => {
        cartMessage += `${item.product_name} x${item.quantity} - ${formatPrice(item.price * item.quantity)}\n`;
      });
      cartMessage += `\nJami: ${formatPrice(total)}`;
      
      await bot.sendMessage(chatId, cartMessage, getCartKeyboard(cart));
    }
    // Decrease cart item quantity
    else if (data.startsWith('decrease_cart_')) {
      const productId = parseInt(data.split('_')[2]);
      const cart = decreaseCartItem(userId, productId);
      
      const total = getCartTotal(cart);
      let cartMessage = '🛒 Savatingiz:\n\n';
      cart.forEach(item => {
        cartMessage += `${item.product_name} x${item.quantity} - ${formatPrice(item.price * item.quantity)}\n`;
      });
      cartMessage += `\nJami: ${formatPrice(total)}`;
      
      await bot.sendMessage(chatId, cartMessage, getCartKeyboard(cart));
    }
    // Apply promo code
    else if (data === 'apply_promo') {
      userSessions.set(userId, { step: 'promo_code' });
      await bot.sendMessage(chatId, '🎟️ Promo kodni kiriting:');
    }
    // Wishlist management
    else if (data.startsWith('add_wishlist_')) {
      const productId = parseInt(data.split('_')[2]);
      
      try {
        const user = await findOrCreateTelegramUser(userId, callbackQuery.from);
        
        await pool.query(
          'INSERT INTO wishlist (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [user.id, productId]
        );
        
        await bot.sendMessage(chatId, '❤️ Wishlistga qo\'shildi!');
        
        // Refresh product detail
        const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
        if (rows.length > 0) {
          await bot.sendMessage(chatId, 'Mahsulot detallari:', getProductDetailKeyboard(productId, true));
        }
      } catch (error) {
        console.error('Error adding to wishlist:', error);
        await bot.sendMessage(chatId, 'Wishlistga qo\'shishda xatolik yuz berdi.');
      }
    }
    else if (data.startsWith('remove_wishlist_')) {
      const productId = parseInt(data.split('_')[2]);
      
      try {
        const user = await findOrCreateTelegramUser(userId, callbackQuery.from);
        
        await pool.query(
          'DELETE FROM wishlist WHERE user_id = $1 AND product_id = $2',
          [user.id, productId]
        );
        
        await bot.sendMessage(chatId, '❌ Wishlistdan olib tashlandi!');
        
        // Refresh product detail
        const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
        if (rows.length > 0) {
          await bot.sendMessage(chatId, 'Mahsulot detallari:', getProductDetailKeyboard(productId, false));
        }
      } catch (error) {
        console.error('Error removing from wishlist:', error);
        await bot.sendMessage(chatId, 'Wishlistdan olib tashlashda xatolik yuz berdi.');
      }
    }
    // Quick order
    else if (data.startsWith('quick_order_')) {
      const productId = parseInt(data.split('_')[2]);
      
      try {
        const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
        
        if (rows.length > 0) {
          const product = rows[0];
          
          // Add to cart
          const cart = addToCart(userId, product);
          
          // Start checkout immediately
          userSessions.set(userId, {
            step: 'delivery',
            cart: cart
          });
          
          await bot.sendMessage(chatId, `✅ ${product.name} savatga qo'shildi!`);
          await bot.sendMessage(chatId, '🚚 Yetkazib berish usulini tanlang:', getDeliveryKeyboard());
        }
      } catch (error) {
        console.error('Error processing quick order:', error);
        await bot.sendMessage(chatId, 'Tezkor buyurtma berishda xatolik yuz berdi.');
      }
    }
    // Profile settings
    else if (data === 'edit_name') {
      userSessions.set(userId, { step: 'edit_name' });
      await bot.sendMessage(chatId, 'Iltimos, yangi ismingizni kiriting:');
    }
    else if (data === 'edit_phone') {
      userSessions.set(userId, { step: 'edit_phone' });
      await bot.sendMessage(chatId, 'Iltimos, yangi telefon raqamingizni kiriting (+998XXXXXXXXX):');
    }
    else if (data === 'manage_addresses') {
      try {
        const user = await findOrCreateTelegramUser(userId, callbackQuery.from);
        const addressList = user.address_list || [];
        
        if (addressList.length === 0) {
          await bot.sendMessage(chatId, 'Manzillar yo\'q. Yangi manzil qo\'shing.');
          userSessions.set(userId, { step: 'add_address' });
          await bot.sendMessage(chatId, 'Iltimos, manzilingizni kiriting:');
        } else {
          await bot.sendMessage(chatId, '📍 Manzillar:', getAddressKeyboard(addressList));
        }
      } catch (error) {
        console.error('Error managing addresses:', error);
        await bot.sendMessage(chatId, 'Manzillarni olishda xatolik yuz berdi.');
      }
    }
    else if (data === 'view_points') {
      try {
        const user = await findOrCreateTelegramUser(userId, callbackQuery.from);
        await bot.sendMessage(chatId, `💳 Sizda ${user.points || 0} ball bor!\n\n1 ball = 1000 so\'m chegirma.`);
      } catch (error) {
        console.error('Error viewing points:', error);
        await bot.sendMessage(chatId, 'Ballarni ko\'rishda xatolik yuz berdi.');
      }
    }
    else if (data === 'view_wishlist') {
      // Trigger wishlist button
      bot.emit('message', { text: '❤️ Wishlist', chat: { id: chatId }, from: { id: userId } });
    }
    else if (data === 'order_history') {
      // Trigger orders button
      bot.emit('message', { text: '📋 Buyurtmalarim', chat: { id: chatId }, from: { id: userId } });
    }
    else if (data === 'back_to_profile') {
      bot.emit('message', { text: '👤 Profil', chat: { id: chatId }, from: { id: userId } });
    }
    // Checkout
    else if (data === 'checkout') {
      // Start checkout process
      const cart = getUserCart(userId);
      
      if (cart.length === 0) {
        await bot.sendMessage(chatId, 'Savat bo\'sh.', getMainMenuKeyboard());
        return;
      }
      
      // Show delivery options first
      userSessions.set(userId, {
        step: 'delivery',
        cart: cart
      });
      
      await bot.sendMessage(chatId, '🚚 Yetkazib berish usulini tanlang:', getDeliveryKeyboard());
    }
    else if (data.startsWith('delivery_')) {
      const deliveryType = data.replace('delivery_', '');
      const session = userSessions.get(userId);
      
      if (session && session.step === 'delivery') {
        session.delivery = deliveryType;
        session.deliveryCost = deliveryOptions[deliveryType].cost;
        session.step = 'name';
        
        await bot.sendMessage(chatId, `✅ ${deliveryOptions[deliveryType].name} tanlandi (${formatPrice(deliveryOptions[deliveryType].cost)})`);
        await bot.sendMessage(chatId, 'Iltimos, ismingizni kiriting:');
      }
    }
    else if (data === 'back_to_cart') {
      const cart = getUserCart(userId);
      const total = getCartTotal(cart);
      let cartMessage = '🛒 Savatingiz:\n\n';
      cart.forEach(item => {
        cartMessage += `${item.product_name} x${item.quantity} - ${formatPrice(item.price * item.quantity)}\n`;
      });
      cartMessage += `\nJami: ${formatPrice(total)}`;
      
      await bot.sendMessage(chatId, cartMessage, getCartKeyboard(cart));
    }
    // Navigation
    else if (data === 'back_to_menu') {
      await bot.sendMessage(chatId, 'Asosiy menyu:', getMainMenuKeyboard());
    }
    else if (data === 'back_to_products') {
      // Show products again
      try {
        const { rows } = await pool.query('SELECT * FROM products ORDER BY created_at DESC LIMIT 20');
        if (rows.length > 0) {
          await bot.sendMessage(chatId, '🛍️ Mahsulotlar ro\'yxati:', getProductsKeyboard(rows, 0));
        } else {
          await bot.sendMessage(chatId, 'Hozircha mahsulotlar yo\'q.');
        }
      } catch (error) {
        console.error('Error fetching products:', error);
        await bot.sendMessage(chatId, 'Mahsulotlarni olishda xatolik yuz berdi.');
      }
    }
    // Order confirmation
    else if (data === 'confirm_order') {
      const session = userSessions.get(userId);
      
      if (!session || session.step !== 'confirm') {
        return;
      }
      
      try {
        // Find or create user
        const user = await findOrCreateTelegramUser(userId, callbackQuery.from);
        
        // Create order
        const total = getCartTotal(session.cart);
        const deliveryCost = session.deliveryCost || 0;
        const finalTotal = total + deliveryCost;
        const deliveryMethod = session.delivery || 'standard';
        
        const { rows } = await pool.query(
          'INSERT INTO orders (user_id, customer_name, customer_phone, customer_address, total_amount, status, source, delivery_method, delivery_cost) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
          [user.id, session.name, session.phone, session.address, finalTotal, 'pending', 'telegram', deliveryMethod, deliveryCost]
        );
        
        const orderId = rows[0].id;
        
        // Add order items
        for (const item of session.cart) {
          await pool.query(
            'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
            [orderId, item.product_id, item.quantity, item.price]
          );
        }
        
        // Clear cart and session
        carts.delete(userId);
        userSessions.delete(userId);
        
        await bot.sendMessage(chatId, `✅ Buyurtmangiz muvaffaqiyatli qabul qilindi! Buyurtma raqami: #${orderId}\n\n🚚 Yetkazib berish: ${deliveryOptions[deliveryMethod]?.name || 'Standart'}\n⏰ Vaqt: ${deliveryOptions[deliveryMethod]?.time || '2-3 kun'}`, getMainMenuKeyboard());
      } catch (error) {
        console.error('Error creating order:', error);
        await bot.sendMessage(chatId, 'Buyurtma yaratishda xatolik yuz berdi.');
      }
    }
    else if (data === 'cancel_order') {
      const userId = callbackQuery.from.id;
      userSessions.delete(userId);
      
      await bot.sendMessage(chatId, '❌ Buyurtma bekor qilindi.', getMainMenuKeyboard());
    }
    // Pagination
    else if (data.startsWith('page_')) {
      const page = parseInt(data.split('_')[1]);
      try {
        const { rows } = await pool.query('SELECT * FROM products ORDER BY created_at DESC LIMIT 20');
        if (rows.length > 0) {
          await bot.sendMessage(chatId, '🛍️ Mahsulotlar ro\'yxati:', getProductsKeyboard(rows, page));
        } else {
          await bot.sendMessage(chatId, 'Hozircha mahsulotlar yo\'q.');
        }
      } catch (error) {
        console.error('Error fetching products:', error);
        await bot.sendMessage(chatId, 'Mahsulotlarni olishda xatolik yuz berdi.');
      }
    }
    // Admin order status change
    else if (data.startsWith('status_')) {
      const parts = data.split('_');
      const orderId = parseInt(parts[1]);
      const newStatus = parts[2];
      
      try {
        const { rows } = await pool.query('SELECT * FROM users WHERE telegram_user_id = $1', [userId]);
        
        if (rows.length === 0 || (rows[0].role !== 'admin' && rows[0].role !== 'superadmin')) {
          await bot.sendMessage(chatId, '❌ Siz admin emassiz.');
          return;
        }
        
        await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [newStatus, orderId]);
        
        // Send notification to user if applicable
        await sendOrderStatusNotification(orderId, newStatus);
        
        await bot.sendMessage(chatId, `✅ Buyurtma #${orderId} statusi "${newStatus}" ga o\'zgartirildi!`, getAdminKeyboard());
      } catch (error) {
        console.error('Error changing order status:', error);
        await bot.sendMessage(chatId, 'Statusni o\'zgartirishda xatolik yuz berdi.');
      }
    }
    else if (data === 'back_to_admin') {
      await bot.sendMessage(chatId, '👨‍💼 Admin Panel', getAdminKeyboard());
    }
  });

  // Handle text messages for checkout flow and other interactions
  bot.on('message', async (msg) => {
    if (!msg.text) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    // Rate limiting check
    if (!checkRateLimit(userId)) {
      await bot.sendMessage(chatId, '⚠️ Siz juda ko\'p so\'rov yubordingiz. Iltimos, biroz kutib turing.');
      return;
    }
    
    // Check if user is in checkout session
    const session = userSessions.get(userId);
    
    if (session) {
      switch (session.step) {
        case 'name':
          session.name = text;
          session.step = 'phone';
          await bot.sendMessage(chatId, 'Iltimos, telefon raqamingizni kiriting (+998XXXXXXXXX formatida):');
          break;
          
        case 'phone':
          if (!validatePhone(text)) {
            await bot.sendMessage(chatId, 'Telefon raqami noto\'g\'ri formatda. Iltimos, qayta kiriting (+998XXXXXXXXX):');
            return;
          }
          session.phone = text;
          session.step = 'address';
          await bot.sendMessage(chatId, 'Iltimos, manzilingizni kiriting:');
          break;
          
        case 'address':
          session.address = text;
          session.step = 'confirm';
          
          // Show order summary
          const total = getCartTotal(session.cart);
          const deliveryCost = session.deliveryCost || 0;
          const finalTotal = total + deliveryCost;
          
          let summary = '📋 Buyurtma ma\'lumotlari:\n\n';
          summary += `👤 Ism: ${session.name}\n`;
          summary += `📱 Telefon: ${session.phone}\n`;
          summary += `📍 Manzil: ${session.address}\n`;
          summary += `🚚 Yetkazib berish: ${deliveryOptions[session.delivery]?.name || 'Standart'}\n`;
          summary += `⏰ Vaqt: ${deliveryOptions[session.delivery]?.time || '2-3 kun'}\n\n`;
          summary += '🛒 Mahsulotlar:\n';
          
          session.cart.forEach(item => {
            summary += `${item.product_name} x${item.quantity} - ${formatPrice(item.price * item.quantity)}\n`;
          });
          
          summary += `\n📦 Mahsulotlar: ${formatPrice(total)}`;
          summary += `\n🚚 Yetkazib berish: ${formatPrice(deliveryCost)}`;
          summary += `\n💰 Jami: ${formatPrice(finalTotal)}`;
          
          await bot.sendMessage(chatId, summary, getOrderConfirmationKeyboard());
          break;
          
        case 'edit_name':
          try {
            const user = await findOrCreateTelegramUser(userId, msg.from);
            await pool.query('UPDATE users SET full_name = $1 WHERE id = $2', [text, user.id]);
            await bot.sendMessage(chatId, '✅ Ism muvaffaqiyatli o\'zgartirildi!');
            userSessions.delete(userId);
            bot.emit('message', { text: '👤 Profil', chat: { id: chatId }, from: { id: userId } });
          } catch (error) {
            console.error('Error updating name:', error);
            await bot.sendMessage(chatId, 'Ismni o\'zgartirishda xatolik yuz berdi.');
          }
          break;
          
        case 'edit_phone':
          if (!validatePhone(text)) {
            await bot.sendMessage(chatId, 'Telefon raqami noto\'g\'ri formatda. Iltimos, qayta kiriting (+998XXXXXXXXX):');
            return;
          }
          try {
            const user = await findOrCreateTelegramUser(userId, msg.from);
            await pool.query('UPDATE users SET phone = $1 WHERE id = $2', [text, user.id]);
            await bot.sendMessage(chatId, '✅ Telefon muvaffaqiyatli o\'zgartirildi!');
            userSessions.delete(userId);
            bot.emit('message', { text: '👤 Profil', chat: { id: chatId }, from: { id: userId } });
          } catch (error) {
            console.error('Error updating phone:', error);
            await bot.sendMessage(chatId, 'Telefonni o\'zgartirishda xatolik yuz berdi.');
          }
          break;
          
        case 'add_address':
          try {
            const user = await findOrCreateTelegramUser(userId, msg.from);
            const addressList = user.address_list || [];
            addressList.push({ address: text, is_default: addressList.length === 0 });
            
            await pool.query('UPDATE users SET address_list = $1 WHERE id = $2', [JSON.stringify(addressList), user.id]);
            await bot.sendMessage(chatId, '✅ Manzil muvaffaqiyatli qo\'shildi!');
            userSessions.delete(userId);
            bot.emit('message', { text: '👤 Profil', chat: { id: chatId }, from: { id: userId } });
          } catch (error) {
            console.error('Error adding address:', error);
            await bot.sendMessage(chatId, 'Manzil qo\'shishda xatolik yuz berdi.');
          }
          break;
          
        case 'promo_code':
          try {
            const { rows } = await pool.query('SELECT * FROM promo_codes WHERE code = $1 AND is_active = true', [text]);
            
            if (rows.length === 0) {
              await bot.sendMessage(chatId, '❌ Promo kod topilmadi yoki amal qilmaydi.');
              userSessions.delete(userId);
              return;
            }
            
            const promo = rows[0];
            const discount = promo.discount_percent;
            
            await bot.sendMessage(chatId, `✅ Promo kod qo'llandi! ${discount}% chegirma.`);
            userSessions.delete(userId);
            
            // Show cart with discount
            const cart = getUserCart(userId);
            const total = getCartTotal(cart);
            const discountedTotal = total - (total * discount / 100);
            
            let cartMessage = '🛒 Savatingiz:\n\n';
            cart.forEach(item => {
              cartMessage += `${item.product_name} x${item.quantity} - ${formatPrice(item.price * item.quantity)}\n`;
            });
            cartMessage += `\n🎟️ Chegirma: ${discount}%`;
            cartMessage += `\nJami: ${formatPrice(discountedTotal)}`;
            
            await bot.sendMessage(chatId, cartMessage, getCartKeyboard(cart));
          } catch (error) {
            console.error('Error applying promo code:', error);
            await bot.sendMessage(chatId, 'Promo kodni qo\'llashda xatolik yuz berdi.');
          }
          break;
          
        default:
          break;
      }
      
      // Save updated session
      userSessions.set(userId, session);
    } else {
      // Handle admin sessions
      const adminSession = adminSessions.get(userId);
      if (adminSession) {
        switch (adminSession.step) {
          case 'broadcast_message':
            try {
              // Get all users with telegram_user_id
              const { rows: telegramUsers } = await pool.query('SELECT telegram_user_id FROM users WHERE telegram_user_id IS NOT NULL');
              
              let successCount = 0;
              for (const user of telegramUsers) {
                try {
                  await bot.sendMessage(user.telegram_user_id, text);
                  successCount++;
                } catch (error) {
                  console.error(`Failed to send message to ${user.telegram_user_id}:`, error);
                }
              }
              
              await bot.sendMessage(chatId, `✅ Xabar ${successCount}/${telegramUsers.length} foydalanuvchiga yuborildi!`);
              adminSessions.delete(userId);
            } catch (error) {
              console.error('Error broadcasting message:', error);
              await bot.sendMessage(chatId, 'Xabar yuborishda xatolik yuz berdi.');
            }
            break;
            
          case 'select_order':
            try {
              const orderId = parseInt(text);
              const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
              
              if (rows.length === 0) {
                await bot.sendMessage(chatId, '❌ Buyurtma topilmadi. Iltimos, to\'g\'ri ID kiriting:');
                return;
              }
              
              const order = rows[0];
              await bot.sendMessage(chatId, `📋 Buyurtma #${order.id}\n\nHozirgi status: ${order.status}`, getOrderStatusKeyboard(orderId));
              adminSessions.delete(userId);
            } catch (error) {
              console.error('Error selecting order:', error);
              await bot.sendMessage(chatId, 'Buyurtmani tanlashda xatolik yuz berdi.');
            }
            break;
            
          default:
            break;
        }
      } else {
        // Handle order management
        if (text.startsWith('cancel_')) {
          const orderId = parseInt(text.replace('cancel_', ''));
          try {
            const user = await findOrCreateTelegramUser(userId, msg.from);
            const { rows } = await pool.query(
              'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
              [orderId, user.id]
            );
            
            if (rows.length === 0) {
              await bot.sendMessage(chatId, '❌ Buyurtma topilmadi yoki sizga tegishli emas.');
              return;
            }
            
            const order = rows[0];
            if (order.status !== 'pending') {
              await bot.sendMessage(chatId, '❌ Faqat "pending" statusidagi buyurtmalarni bekor qilish mumkin.');
              return;
            }
            
            await pool.query('UPDATE orders SET status = \'cancelled\' WHERE id = $1', [orderId]);
            await bot.sendMessage(chatId, `✅ Buyurtma #${orderId} bekor qilindi.`);
          } catch (error) {
            console.error('Error cancelling order:', error);
            await bot.sendMessage(chatId, 'Buyurtmani bekor qilishda xatolik yuz berdi.');
          }
        }
        // Handle order detail view
        else if (/^\d+$/.test(text)) {
          const orderId = parseInt(text);
          try {
            const user = await findOrCreateTelegramUser(userId, msg.from);
            const { rows } = await pool.query(
              `SELECT o.*, 
               COALESCE(json_agg(json_build_object('name', p.name, 'image', p.image, 'quantity', oi.quantity, 'price', oi.price)) FILTER (WHERE p.id IS NOT NULL), '[]') as items_list
               FROM orders o
               LEFT JOIN order_items oi ON o.id = oi.order_id
               LEFT JOIN products p ON oi.product_id = p.id
               WHERE o.id = $1 AND o.user_id = $2
               GROUP BY o.id`,
              [orderId, user.id]
            );
            
            if (rows.length === 0) {
              await bot.sendMessage(chatId, '❌ Buyurtma topilmadi yoki sizga tegishli emas.');
              return;
            }
            
            const order = rows[0];
            const statusEmoji = getStatusEmoji(order.status);
            
            let message = `📋 Buyurtma #${order.id}\n\n`;
            message += `${statusEmoji} Status: ${order.status}\n`;
            message += `💰 Summa: ${formatPrice(order.total_amount)}\n`;
            message += `📱 Manba: ${order.source}\n`;
            message += `📅 Sana: ${new Date(order.created_at).toLocaleDateString('uz-UZ')}\n\n`;
            message += '🛒 Mahsulotlar:\n';
            
            order.items_list.forEach(item => {
              message += `${item.name} x${item.quantity} - ${formatPrice(item.price * item.quantity)}\n`;
            });
            
            if (order.status === 'pending') {
              message += `\n❌ Bekor qilish uchun "cancel_${orderId}" yuboring.`;
            }
            
            await bot.sendMessage(chatId, message);
          } catch (error) {
            console.error('Error fetching order details:', error);
            await bot.sendMessage(chatId, 'Buyurtma detallarini olishda xatolik yuz berdi.');
          }
        }
        // Handle search functionality
        else {
          try {
            const { rows } = await pool.query(
              'SELECT * FROM products WHERE name ILIKE $1 OR brand ILIKE $1 OR category ILIKE $1 ORDER BY created_at DESC LIMIT 10',
              [`%${text}%`]
            );
            
            if (rows.length > 0) {
              let message = `🔍 Qidirish natijalari "${text}":\n\n`;
              rows.forEach(product => {
                message += `${product.name} - ${formatPrice(product.price)}\n`;
              });
              await bot.sendMessage(chatId, message, getProductsKeyboard(rows, 0));
            } else {
              await bot.sendMessage(chatId, `"${text}" bo\'yicha mahsulotlar topilmadi.`);
            }
          } catch (error) {
            console.error('Error searching products:', error);
            await bot.sendMessage(chatId, 'Qidirishda xatolik yuz berdi.');
          }
        }
      }
    }
  });

  // Error handling
  bot.on('polling_error', (error) => {
    console.error(`[Polling error] ${error.code}: ${error.message}`);
  });

  console.log('Telegram bot ishga tushdi...');

  return bot;
};

module.exports = { initializeTelegramBot };