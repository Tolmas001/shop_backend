/**
 * Seed realistic marketplace data:
 *  - assigns high-quality category-matched product images
 *  - creates ~45 test customers (Uzbek names)
 *  - generates ~220 orders spread across the last 30 days with an
 *    upward sales trend, weighted statuses, and matching order_items
 *
 * Run:  node scratch/seed_market.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        host: process.env.PGHOST || '127.0.0.1',
        port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
        database: process.env.PGDATABASE || 'shop',
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || ''
      }
);

// ---- High-quality Unsplash cosmetics images, grouped by category ----
const IMG = (id) => `https://images.unsplash.com/photo-${id}?w=700&h=770&fit=crop&crop=entropy&q=80&auto=format`;
const CATEGORY_IMAGES = {
  'Makiyaj': ['1503236823255-94609f598e71', '1512496015851-a90fb38ba796', '1522335789203-aabd1fc54bc9', '1487412947147-5cebf100ffc2', '1571875257727-256c39da42af'],
  'Yuz kremlari': ['1620916566398-39f1143ab7be', '1556228578-8c89e6adf883', '1600428877878-1a0fd85beda8', '1608248543803-ba4f8c70ae0b', '1611930022073-b7a4ba5fcccd'],
  'Tana kremlari': ['1556228720-195a672e8a03', '1601049541289-9b1b7bbbfe19', '1598440947619-2c35fc9aa908', '1615397349754-cfa2066a298e', '1612817288484-6f916006741a'],
  "Qo'l kremlari": ['1556228453-efd6c1ff04f6', '1574621100236-d25b64cfd647', '1585232004423-244e0e6904e3', '1570172619644-dfd03ed5d881'],
  'Quyoshdan himoya kremlari': ['1556229162-5c63ed9c4efb', '1512207736890-6ffed8a84e8d', '1610705267928-1b9f2fa7f1c5', '1590439471364-192aa70c0b53'],
  'Parfyumeriya': ['1541643600914-78b084683601', '1592945403244-b3fbafd7f539', '1594035910387-fea47794261f', '1615634260167-c8cdede054de', '1523293182086-7651a899d37f'],
  'Soch parvarishi': ['1522338242992-e1a54906a8da', '1526947425960-945c6e72858f', '1599305445671-ac291c95aaa9', '1535585209827-a15fcdbc4c2d', '1608571423902-eed4a5ad8108']
};
const FALLBACK_IMAGES = ['1503236823255-94609f598e71', '1556228720-195a672e8a03', '1541643600914-78b084683601'];

// ---- Uzbek customer name pools ----
const FEMALE = ['Dilnoza', 'Malika', 'Nilufar', 'Zarina', 'Kamola', 'Sevara', 'Feruza', 'Gulnora', 'Madina', 'Shahnoza', 'Umida', 'Nigora', 'Charos', 'Munisa', 'Dilfuza', 'Ozoda', 'Mavluda', 'Gulbahor', "Ra'no", 'Yulduz', 'Iroda', 'Zebo'];
const MALE = ['Aziz', 'Sardor', 'Jasur', 'Bekzod', 'Farrux', 'Sherzod', 'Otabek', "Ulug'bek", 'Doston', 'Shohruh', 'Akmal', 'Rustam', 'Botir', 'Javohir', 'Diyor', 'Sanjar', 'Nodir', 'Islom', 'Temur', 'Alisher', 'Kamron', 'Bahodir'];
const SURNAME = ['Karimov', 'Yusupov', 'Rahimov', 'Toshmatov', 'Ergashev', 'Nazarov', 'Aliyev', 'Sobirov', 'Umarov', 'Xolmatov', "Yo'ldoshev", 'Qodirov', 'Islomov', 'Tursunov', 'Yusupova', 'Saidova'];
const REGIONS = ['Toshkent sh., Chilonzor tumani', 'Toshkent sh., Yunusobod tumani', 'Toshkent sh., Mirzo Ulugbek tumani', 'Samarqand sh., Registon ko\'chasi', 'Buxoro sh., Mustaqillik ko\'chasi', 'Andijon sh., Bobur shoh ko\'chasi', 'Farg\'ona sh., Marg\'ilon yo\'li', 'Namangan sh., Uychi ko\'chasi', 'Qo\'qon sh., Istiqlol ko\'chasi', 'Nukus sh., Dosnazarov ko\'chasi'];

const rint = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const transliterate = (s) => s.toLowerCase().replace(/'/g, '').replace(/o‘/g, 'o').replace(/g‘/g, 'g').replace(/[^a-z0-9]/g, '');

async function main() {
  const client = await pool.connect();
  try {
    console.log('▶ Seed boshlandi...');

    // 1) Assign category-matched, high-quality images to every product
    const { rows: products } = await client.query('SELECT id, category FROM products ORDER BY id');
    let imgUpdated = 0;
    for (const p of products) {
      const pool_ = CATEGORY_IMAGES[p.category] || FALLBACK_IMAGES;
      const id = pool_[p.id % pool_.length];
      await client.query('UPDATE products SET image = $1 WHERE id = $2', [IMG(id), p.id]);
      imgUpdated++;
    }
    console.log(`✓ ${imgUpdated} ta mahsulotga sifatli rasm biriktirildi`);

    // 2) Create ~45 test customers with created_at spread over the last ~40 days
    const hashed = await bcrypt.hash('test1234', 8);
    const usedUsernames = new Set();
    const customerIds = [];
    const CUSTOMER_COUNT = 45;
    for (let i = 0; i < CUSTOMER_COUNT; i++) {
      const isFemale = Math.random() > 0.42;
      const first = isFemale ? pick(FEMALE) : pick(MALE);
      const last = pick(SURNAME);
      const fullName = `${first} ${last}`;
      let base = `${transliterate(first)}_${transliterate(last)}`;
      let username = base;
      let n = 1;
      while (usedUsernames.has(username)) username = `${base}${++n}`;
      usedUsernames.add(username);
      const email = `${username}${rint(1, 99)}@gmail.com`;
      const phone = `+9989${rint(0, 9)}${String(rint(0, 9999999)).padStart(7, '0')}`;
      const points = rint(0, 45) * 100;
      const daysAgo = rint(1, 40);
      const createdAt = new Date(Date.now() - daysAgo * 86400000 - rint(0, 86400) * 1000);
      const { rows } = await client.query(
        `INSERT INTO users (username, email, full_name, password, role, phone, points, created_at)
         VALUES ($1,$2,$3,$4,'user',$5,$6,$7)
         ON CONFLICT (username) DO NOTHING RETURNING id`,
        [username, email, fullName, hashed, phone, points, createdAt]
      );
      if (rows[0]) customerIds.push({ id: rows[0].id, name: fullName, phone });
    }
    console.log(`✓ ${customerIds.length} ta test mijoz yaratildi`);

    // 3) Generate orders over the last 30 days with an upward trend
    const { rows: prodFull } = await client.query('SELECT id, price FROM products');
    const STATUS = [
      ...Array(64).fill('delivered'),
      ...Array(12).fill('processing'),
      ...Array(10).fill('pending'),
      ...Array(8).fill('shipped'),
      ...Array(6).fill('cancelled')
    ];
    const PAYMENT = ['cash', 'cash', 'click', 'payme', 'click'];
    let orderCount = 0, itemCount = 0, revenue = 0;

    for (let day = 29; day >= 0; day--) {
      // trend: fewer orders 30 days ago, more recently (5..13 per day)
      const base = 5 + Math.round((29 - day) * 0.28);
      const ordersToday = rint(Math.max(3, base - 2), base + 3);
      for (let o = 0; o < ordersToday; o++) {
        const cust = pick(customerIds);
        const createdAt = new Date(Date.now() - day * 86400000 - rint(0, 86399) * 1000);
        const status = pick(STATUS);
        const payment = pick(PAYMENT);
        const paymentStatus = (status === 'delivered' || status === 'shipped') ? 'paid'
          : (status === 'cancelled' ? 'unpaid' : (Math.random() > 0.5 ? 'paid' : 'unpaid'));
        const deliveryCost = Math.random() > 0.6 ? 0 : 15000;

        const itemN = rint(1, 4);
        const chosen = [];
        let total = 0;
        for (let k = 0; k < itemN; k++) {
          const prod = pick(prodFull);
          const qty = rint(1, 3);
          chosen.push({ id: prod.id, qty, price: Number(prod.price) });
          total += Number(prod.price) * qty;
        }
        total += deliveryCost;

        const { rows: ord } = await client.query(
          `INSERT INTO orders (user_id, customer_name, customer_phone, customer_address,
             total_amount, status, payment_method, payment_status, delivery_method, delivery_cost, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'standard',$9,$10) RETURNING id`,
          [cust.id, cust.name, cust.phone, pick(REGIONS), total, status, payment, paymentStatus, deliveryCost, createdAt]
        );
        const orderId = ord[0].id;
        for (const it of chosen) {
          await client.query(
            'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1,$2,$3,$4)',
            [orderId, it.id, it.qty, it.price]
          );
          itemCount++;
        }
        orderCount++;
        if (status !== 'cancelled') revenue += total;
      }
    }
    console.log(`✓ ${orderCount} ta buyurtma, ${itemCount} ta mahsulot qatori yaratildi`);
    console.log(`✓ Umumiy tushum (bekor qilinmagan): ${revenue.toLocaleString('ru-RU')} so'm`);
    console.log('✔ Seed muvaffaqiyatli yakunlandi');
  } catch (e) {
    console.error('✗ Xato:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
