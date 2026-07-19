const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const categories = [
  'Elektronika',
  'Kiyim-kechak',
  'Uy-ro\'zg\'or buyumlari',
  'Aksessuarlar',
  'O\'yinchoqlar',
  'Avto jihozlar',
  'Go\'zallik va salomatlik'
];

const brands = [
  'Xiaomi', 'Huawei', 'Lenovo', 'Baseus', 'Ugreen', 'Anker', 
  'Hoco', 'Borofone', 'Yison', 'Haylou', 'QCY', 'Realme', 'Oppo', 'Vivo'
];

const productNames = [
  'Simsiz quloqchin', 'Tezkor quvvatlagich', 'Smart soat', 'Telefon g\'ilofi', 
  'Powerbank 10000mAh', 'Powerbank 20000mAh', 'Stol chirog\'i LED', 'Erkaklar sumkasi', 
  'Ayollar sumkasi', 'Futbolka (Paxta)', 'Avto ushlagich', 'Type-C kabel', 
  'Aqlli tarozi', 'Robot changyutgich', 'Portativ blender', 'Quyosh ko\'zoynagi', 
  'Havo namlantiruvchi', 'Mini ventilyator', 'Stol stendi', 'Elektr choynak', 
  'Aqlli termos', 'Velosiped chirog\'i', 'Krossovka', 'Soch quritgich'
];

async function seed() {
  try {
    console.log('Seeding 200 Chinese products...');
    
    // Ensure categories exist
    for (const cat of categories) {
      await pool.query('INSERT INTO categories (name) VALUES ($1) ON CONFLICT DO NOTHING', [cat]);
    }

    for (let i = 0; i < 200; i++) {
      const nameBase = productNames[Math.floor(Math.random() * productNames.length)];
      const brand = brands[Math.floor(Math.random() * brands.length)];
      const category = categories[Math.floor(Math.random() * categories.length)];
      const price = (Math.floor(Math.random() * 500) + 10) * 1000; // 10,000 to 510,000 UZS
      const stock = Math.floor(Math.random() * 500) + 20;
      const name = `${brand} ${nameBase} Model-${i + 1}`;
      const description = `Yangi ${brand} brendidan ajoyib ${nameBase.toLowerCase()}. Xitoydan to'g'ridan-to'g'ri yetkazib berilgan eng sara sifatli mahsulot. Kundalik foydalanish uchun juda qulay va hamyonbop.`;
      
      const images = [
        'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=500', // smartwatch
        'https://images.unsplash.com/photo-1572569433602-6b99671f253a?w=500', // earphones
        'https://images.unsplash.com/photo-1583394838153-605d3b6441ea?w=500', // powerbank/device
        'https://images.unsplash.com/photo-1542496658-e33a6d0d50f6?w=500', // watch
        'https://images.unsplash.com/photo-1620987278429-ab178d6eb547?w=500', // gadget
        'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500', // headphones
        'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500', // product
        'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=500'  // generic electronics
      ];
      const image = images[Math.floor(Math.random() * images.length)];

      await pool.query(
        'INSERT INTO products (name, brand, category, description, price, image, stock_count) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [name, brand, category, description, price, image, stock]
      );
    }

    console.log('✅ Successfully seeded 200 products!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding products:', err.message);
    process.exit(1);
  }
}

seed();
