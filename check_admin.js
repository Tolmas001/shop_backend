const pool = require('./database');

async function checkAdmin() {
  try {
    const { rows } = await pool.query("SELECT id, username, role FROM users WHERE role = 'admin'");
    console.log('Admins found:', rows);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkAdmin();
