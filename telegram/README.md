# ShopSRY Telegram Bot

ShopSRY e-commerce platformi uchun to'liq funksional Telegram bot integratsiyasi.

## Xususiyatlar

### 🛍️ Mahsulotlar
- 📸 Mahsulot rasmlarini ko'rsatish
- 🔍 Mahsulot qidirish (nomi, brand, kategoriya bo'yicha)
- 📋 Mahsulot detallari va xarakteristikalar
- 📦 Mahsulot mavjudligini ko'rsatish
- 📊 Mahsulotlarni solishtirish
- ❤️ Wishlistga qo'shish

### 📦 Kategoriyalar
- 🗂️ Kategoriya bo'yicha filtirlash
- 📁 Subkategoriya tizimi
- � Easy navigation

### �🛒 Savat tizimi
- ➕➕➖➖ Miqdorni o'zgartirish
- 🎟️ Promo kodlar qo'llash
- 💰 Real vaqtda hisoblash
- 🚚 Yetkazib berish variantlari

### 📋 Buyurtmalar
- � Buyurtma berish (to'liq flow)
- 📍 Yetkazib berish manzili
- ⏰ Yetkazib berish vaqti va narxi
- 🔄 Buyurtma statusini kuzatish
- ❌ Buyurtmani bekor qilish
- � Buyurtma tarixi

### �👤 Profil
- ✏️ Profilni tahrirlash (ism, telefon)
- 🏠 Manzillar kitobi
- 💳 Loyiha ballari tizimi
- ❤️ Wishlist boshqaruvi

### 👨‍� Admin Panel
- 📊 Sotuv statistikasi
- 📢 Barcha foydalanuvchilarga xabar yuborish
- ⚡ Buyurtma statusini tez o'zgartirish
- 👥 Foydalanuvcharni ko'rish

### 🔒 Xavfsizlik
- ⚡ Rate limiting (30 so'rov/daqiqa)
- 🛡️ Token asosida autentifikatsiya
- 🔐 Admin rol tekshiruvi

### 🔔 Notifications
- � Buyurtma status o'zgarganda xabar
- 🎯 Telegram orqali real vaqtda bildirishnoma

## O'rnatish

### 1. Telegram Bot yaratish

1. Telegramda [@BotFather](https://t.me/BotFather) botini toping
2. `/newbot` buyrug'ini yuboring
3. Bot nomi va username kiriting
4. Bot tokenini oling (masalan: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Environment sozlamalari

`.env` fayliga quyidagini qo'shing:

```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_from_botfather
```

### 3. Database migratsiyalari

Bot quyidagi databas jadvallarini qo'shadi:
- `users.telegram_user_id` - Telegram ID bilan bog'lash uchun
- `orders.source` - Buyurtma manbasini kuzatish uchun (website/telegram)

## Bot komandalari

### Asosiy komandalar
- `/start` - Botni boshlash va ro'yxatdan o'tish
- `/help` - Yordam ma'lumotlari
- `/admin` - Admin panel (faqat adminlar uchun)

### Tugmalar orqali
- 🛍️ Mahsulotlar - Mahsulotlar ro'yxati
- 🔍 Qidirish - Mahsulot qidirish
- 📦 Kategoriyalar - Kategoriyalar ro'yxati
- 🛒 Savat - Savatni ko'rish va boshqarish
- 📋 Buyurtmalarim - Mening buyurtmalarim
- ❤️ Wishlist - Istaklar ro'yxati
- 👤 Profil - Profil ma'lumotlari
- ❓ Yordam - Yordam va bog'lanish

### Admin tugmalari
- 📊 Statistika - Sotuv statistikasi
- 📢 Xabar yuborish - Barcha foydalanuvchilarga xabar
- ⚡ Buyurtma statusi - Statusni tez o'zgartirish
- 👥 Foydalanuvchilar - Foydalanuvchilar ro'yxati

## Texnik arxitektura

### Fayl tuzilishi
```
telegram/
├── bot.js                 # Asosiy bot logikasi
├── notifications.js       # Buyurtma holati xabarlari
├── keyboards/
│   └── keyboards.js      # Klaviatura tugmalari
└── README.md            # Hujjatlar
```

### Asosiy komponentlar

#### 1. Bot Initialization (`bot.js`)
- Botni ishga tushirish
- Foydalanuvchi sessiyalari
- Savat boshqaruvi (xotirada)
- Telegram foydalanuvchilarini ShopSRY tizimi bilan bog'lash

#### 2. Notifications (`notifications.js`)
- Buyurtma holati o'zgarganda Telegram xabarlari
- Admin panel o'zgarishlarini kuzatish

#### 3. Keyboards (`keyboards/keyboards.js`)
- Asosiy menyu
- Kategoriyalar
- Mahsulotlar
- Savat
- Buyurtma tasdiqlash

## Integratsiya

### Backend bilan integratsiya

Bot quyidagi API endpointlaridan foydalanadi:
- `GET /api/products` - Mahsulotlarni olish
- `GET /api/categories` - Kategoriyalarni olish
- `POST /api/orders` - Buyurtma yaratish

### Admin panel bilan integratsiya

Admin panel buyurtma holatini o'zgartirganda:
1. `PUT /api/orders/:id/status` endpoint chaqiriladi
2. `sendOrderStatusNotification()` funksiyasi ishlaydi
3. Telegram foydalanuvchisiga xabar yuboriladi

## Foydalanuvchi flow

1. **Ro'yxatdan o'tish**: `/start` buyrug'i orqali
2. **Mahsulotlarni ko'rish**: "🛍️ Mahsulotlar" tugmasi
3. **Savatga qo'shish**: Mahsulotni tanlash va "🛒 Savatga qo'shish"
4. **Buyurtma berish**: "✅ Buyurtma berish" va ma'lumotlarni kiritish
5. **Buyurtmani kuzatish**: "📋 Buyurtmalarim" orqali

## Xavfsizlik

- Bot tokeni `.env` faylida saqlanadi
- Telegram foydalanuvchilari avtomatik ravishda ShopSRY tizimida yaratiladi
- Buyurtmalar `source='telegram'` belgisi bilan belgilanadi

## Monitoring

Bot loglari server console-da ko'rsatiladi:
- `Telegram bot ishga tushdi...` - Bot muvaffaqiyatli ishga tushdi
- `[Polling error]` - Polling xatoliklari
- `Error sending Telegram notification` - Xabar yuborish xatoliklari

## Kelgusida rivojlanish

- [ ] Redis asosida saqlash (hozircha xotirada)
- [ ] Online to'lov integratsiyasi (Click, Payme, Uzum)
- [ ] Buyurtmani o'zgartirish (muddati ichida)
- [ ] Mahsulot baholash va sharhlar
- [ ] QR kod orqali buyurtma
- [ ] Ko'p tilli qo'llab-quvvatlash
- [ ] Push notifications
- [ ] Analytics va tracking

## Qo'llab-quvvatlash

Agar muammolar yuz bersa:
1. `.env` faylida `TELEGRAM_BOT_TOKEN` to'g'ri ekanligini tekshiring
2. Database migratsiyalari bajarilganligini tekshiring
3. Server loglarini ko'ring
4. @BotFather orqali bot tokenini qayta oling