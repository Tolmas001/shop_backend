const { Pool } = require('pg');
require('dotenv').config({ path: 'backend/.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkImages() {
  try {
    const res = await pool.query('SELECT id, name, image FROM products');
    console.log('--- Product Images ---');
    res.rows.forEach(r => {
      console.log(`ID: ${r.id}, Name: ${r.name}, Image: ${r.image}`);
    });
    console.log('----------------------');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkImages();
