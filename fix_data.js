const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function fixData() {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT id, colors, sizes FROM products');
    for (const row of res.rows) {
      let colors = row.colors;
      let sizes = row.sizes;
      let updateNeeded = false;

      // Handle colors
      if (typeof colors === 'string' && !colors.startsWith('[')) {
        if (colors.includes(',')) {
          colors = JSON.stringify(colors.split(',').map(s => s.trim()));
        } else {
          colors = JSON.stringify([colors.trim()]);
        }
        updateNeeded = true;
      }

      // Handle sizes
      if (typeof sizes === 'string' && !sizes.startsWith('[')) {
        if (sizes.includes(',')) {
          sizes = JSON.stringify(sizes.split(',').map(s => s.trim()));
        } else {
          sizes = JSON.stringify([sizes.trim()]);
        }
        updateNeeded = true;
      }

      if (updateNeeded) {
        console.log(`Updating product ID ${row.id}`);
        await client.query('UPDATE products SET colors = $1, sizes = $2 WHERE id = $3', [colors, sizes, row.id]);
      }
    }
    console.log('Database cleanup completed.');
  } catch (err) {
    console.error('Error during cleanup:', err);
  } finally {
    client.release();
    pool.end();
  }
}

fixData();
