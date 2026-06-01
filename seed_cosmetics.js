const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const categories = [
  'Yuz kremlari',
  'Qo\'l kremlari',
  'Tana kremlari',
  'Quyoshdan himoya kremlari',
  'Makiyaj',
  'Parfyumeriya',
  'Soch parvarishi'
];

const brands = [
  'L\'Oreal', 'Maybelline', 'Nivea', 'Dove', 'Vaseline', 'La Roche-Posay', 
  'Vichy', 'Estee Lauder', 'Clinique', 'MAC', 'Chanel', 'Dior', 'Lancome'
];

const productNames = [
  'Namlantiruvchi krem', 'Tungi krem', 'Kunduzgi krem', 'Anti-age zardob', 
  'Ko\'z atrofi kremi', 'Qo\'l va tirnoq balzami', 'Tana suti', 'Quyoshdan himoya suti SPF 30',
  'SPF 50+ Quyosh kremi', 'Lab bo\'yog\'i (Matte)', 'Tush (Hajm beruvchi)', 
  'Pudra (Tabiiy)', 'Atir (Gul isi)', 'Shampun (Qayta tiklovchi)', 'Soch maskasi'
];

async function seed() {
  try {
    console.log('Seeding 100 cosmetic products...');
    
    // Ensure categories exist
    for (const cat of categories) {
      await pool.query('INSERT INTO categories (name) VALUES ($1) ON CONFLICT DO NOTHING', [cat]);
    }

    for (let i = 0; i < 100; i++) {
      const nameBase = productNames[Math.floor(Math.random() * productNames.length)];
      const brand = brands[Math.floor(Math.random() * brands.length)];
      const category = categories[Math.floor(Math.random() * categories.length)];
      const price = (Math.floor(Math.random() * 200) + 20) * 1000; // 20,000 to 220,000 UZS
      const stock = Math.floor(Math.random() * 100) + 10;
      const name = `${brand} ${nameBase} #${i + 1}`;
      const description = `${brand} brendidan yuqori sifatli ${nameBase.toLowerCase()}. Professional parvarish uchun mo'ljallangan.`;
      const image = `https://images.unsplash.com/photo-${[
        '1556228578-0d85b1a4d571', '1594489428504-4c0c4807d541', '1612817288484-6f916006741a', 
        '1570172233541-ca359d296e83', '1596462502278-27bfdc4033c8', '1616394584738-fc6e612e71b9'
      ][Math.floor(Math.random() * 6)]}?w=500`;

      await pool.query(
        'INSERT INTO products (name, brand, category, description, price, image, stock_count) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [name, brand, category, description, price, image, stock]
      );
    }

    console.log('✅ Successfully seeded 100 products!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding products:', err.message);
    process.exit(1);
  }
}

seed();
