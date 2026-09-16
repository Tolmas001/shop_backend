const TelegramBot = require('node-telegram-bot-api');

// Main menu keyboard
const getMainMenuKeyboard = () => {
  return {
    reply_markup: {
      keyboard: [
        ['🛍️ Mahsulotlar', '� Qidirish', '�📦 Kategoriyalar'],
        ['🛒 Savat', '📋 Buyurtmalarim', '❤️ Wishlist'],
        ['👤 Profil', '❓ Yordam']
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
};

// Categories keyboard
const getCategoriesKeyboard = (categories) => {
  const buttons = categories.map(cat => [{ text: cat.name, callback_data: `category_${cat.name}` }]);
  buttons.push([{ text: '🔙 Orqaga', callback_data: 'back_to_menu' }]);
  
  return {
    reply_markup: {
      inline_keyboard: buttons
    }
  };
};

// Products keyboard with pagination
const getProductsKeyboard = (products, currentPage = 0, itemsPerPage = 5) => {
  const buttons = [];
  const start = currentPage * itemsPerPage;
  const end = start + itemsPerPage;
  const pageProducts = products.slice(start, end);
  
  pageProducts.forEach(product => {
    buttons.push([{ text: `${product.name} - ${formatPrice(product.price)}`, callback_data: `product_${product.id}` }]);
  });
  
  // Navigation buttons
  const navButtons = [];
  if (currentPage > 0) {
    navButtons.push({ text: '⬅️ Oldingi', callback_data: `page_${currentPage - 1}` });
  }
  navButtons.push({ text: '🔙 Orqaga', callback_data: 'back_to_menu' });
  if (end < products.length) {
    navButtons.push({ text: 'Keyingi ➡️', callback_data: `page_${currentPage + 1}` });
  }
  buttons.push(navButtons);
  
  return {
    reply_markup: {
      inline_keyboard: buttons
    }
  };
};

// Product detail keyboard
const getProductDetailKeyboard = (productId, inWishlist = false) => {
  const keyboard = [
    [
      { text: '🛒 Savatga qo\'shish', callback_data: `add_to_cart_${productId}` }
    ],
    [
      { text: '⚡ Hozir buyurtma berish', callback_data: `quick_order_${productId}` }
    ],
    [
      { text: inWishlist ? '❌ Wishlistdan olib tashlash' : '❤️ Wishlistga qo\'shish', callback_data: inWishlist ? `remove_wishlist_${productId}` : `add_wishlist_${productId}` },
      { text: '📊 Solishtirish', callback_data: `add_compare_${productId}` }
    ],
    [
      { text: '🔙 Orqaga', callback_data: 'back_to_products' }
    ]
  ];
  
  return {
    reply_markup: {
      inline_keyboard: keyboard
    }
  };
};

// Cart keyboard
const getCartKeyboard = (cartItems) => {
  const buttons = [];
  
  cartItems.forEach(item => {
    buttons.push([
      { text: `${item.product_name} x${item.quantity}`, callback_data: `cart_item_${item.product_id}` },
      { text: '➖', callback_data: `decrease_cart_${item.product_id}` },
      { text: '➕', callback_data: `increase_cart_${item.product_id}` },
      { text: '❌', callback_data: `remove_from_cart_${item.product_id}` }
    ]);
  });
  
  if (cartItems.length > 0) {
    buttons.push([
      { text: '🎟️ Promo kod', callback_data: 'apply_promo' },
      { text: '✅ Buyurtma berish', callback_data: 'checkout' }
    ]);
  }
  
  buttons.push([
    { text: '🔙 Orqaga', callback_data: 'back_to_menu' }
  ]);
  
  return {
    reply_markup: {
      inline_keyboard: buttons
    }
  };
};

// Order confirmation keyboard
const getOrderConfirmationKeyboard = () => {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Tasdiqlash', callback_data: 'confirm_order' },
          { text: '❌ Bekor qilish', callback_data: 'cancel_order' }
        ]
      ]
    }
  };
};

// Delivery options keyboard
const getDeliveryKeyboard = () => {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🚚 Standart (2-3 kun, 20,000 so\'m)', callback_data: 'delivery_standard' }
        ],
        [
          { text: '⚡ Express (1 kun, 50,000 so\'m)', callback_data: 'delivery_express' }
        ],
        [
          { text: '🏪 Olib ketish (Bepul)', callback_data: 'delivery_pickup' }
        ],
        [
          { text: '🔙 Orqaga', callback_data: 'back_to_cart' }
        ]
      ]
    }
  };
};

// Help keyboard
const getHelpKeyboard = () => {
  return {
    reply_markup: {
      keyboard: [
        ['📞 Biz bilan bog\'lanish'],
        ['🔙 Orqaga']
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
};

// Search keyboard
const getSearchKeyboard = () => {
  return {
    reply_markup: {
      force_reply: true,
      input_field_placeholder: 'Mahsulot nomini kiriting...'
    }
  };
};

// Profile settings keyboard
const getProfileSettingsKeyboard = () => {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✏️ Ismni o\'zgartirish', callback_data: 'edit_name' },
          { text: '📱 Telefonni o\'zgartirish', callback_data: 'edit_phone' }
        ],
        [
          { text: '📍 Manzillar', callback_data: 'manage_addresses' },
          { text: '💳 Ballar', callback_data: 'view_points' }
        ],
        [
          { text: '❤️ Wishlist', callback_data: 'view_wishlist' },
          { text: '📋 Buyurtmalar tarixi', callback_data: 'order_history' }
        ],
        [
          { text: '🔙 Orqaga', callback_data: 'back_to_menu' }
        ]
      ]
    }
  };
};

// Address management keyboard
const getAddressKeyboard = (addresses) => {
  const buttons = addresses.map((addr, index) => [
    { text: `${addr.address} ${addr.is_default ? '✅' : ''}`, callback_data: `select_address_${index}` },
    { text: addr.is_default ? '⭐' : '⭐', callback_data: `set_default_${index}` },
    { text: '❌', callback_data: `delete_address_${index}` }
  ]);
  
  buttons.push([
    { text: '➕ Yangi manzil qo\'shish', callback_data: 'add_address' }
  ]);
  buttons.push([
    { text: '🔙 Orqaga', callback_data: 'back_to_profile' }
  ]);
  
  return {
    reply_markup: {
      inline_keyboard: buttons
    }
  };
};

// Admin keyboard
const getAdminKeyboard = () => {
  return {
    reply_markup: {
      keyboard: [
        ['📊 Statistika', '📢 Xabar yuborish'],
        ['⚡ Buyurtma statusi', '👥 Foydalanuvchilar'],
        ['🔙 Orqaga']
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
};

// Order status quick change keyboard
const getOrderStatusKeyboard = (orderId) => {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🟡 Pending', callback_data: `status_${orderId}_pending` },
          { text: '🟢 Confirmed', callback_data: `status_${orderId}_confirmed` }
        ],
        [
          { text: '🔵 Processing', callback_data: `status_${orderId}_processing` },
          { text: '🚚 Shipped', callback_data: `status_${orderId}_shipped` }
        ],
        [
          { text: '✅ Delivered', callback_data: `status_${orderId}_delivered` },
          { text: '❌ Cancelled', callback_data: `status_${orderId}_cancelled` }
        ],
        [
          { text: '🔙 Orqaga', callback_data: 'back_to_admin' }
        ]
      ]
    }
  };
};

// Product comparison keyboard
const getComparisonKeyboard = (productIds) => {
  const buttons = productIds.map(id => [
    { text: `Mahsulot #${id}`, callback_data: `remove_compare_${id}` }
  ]);
  
  buttons.push([
    { text: '📊 Solishtirish', callback_data: 'do_comparison' }
  ]);
  buttons.push([
    { text: '🔙 Orqaga', callback_data: 'back_to_products' }
  ]);
  
  return {
    reply_markup: {
      inline_keyboard: buttons
    }
  };
};

// Helper function to format price
const formatPrice = (price) => {
  return new Intl.NumberFormat('uz-UZ').format(price) + ' so\'m';
};

module.exports = {
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
};