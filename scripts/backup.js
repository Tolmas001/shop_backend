const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pool } = require('../database');

const BACKUP_DIR = path.join(__dirname, '../backups');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const createBackup = async (backupType = 'manual') => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${timestamp}.sql`;
  const filePath = path.join(BACKUP_DIR, filename);
  
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'shop',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD
  };
  
  const pgDumpCommand = `PGPASSWORD="${dbConfig.password}" pg_dump -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} > "${filePath}"`;
  
  try {
    // Log backup start
    const { rows } = await pool.query(
      'INSERT INTO backup_logs (filename, file_path, backup_type, status) VALUES ($1, $2, $3, $4) RETURNING id',
      [filename, filePath, backupType, 'in_progress']
    );
    const backupId = rows[0].id;
    
    // Execute pg_dump
    await new Promise((resolve, reject) => {
      exec(pgDumpCommand, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      });
    });
    
    // Get file size
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    
    // Update backup log
    await pool.query(
      'UPDATE backup_logs SET file_size = $1, status = $2, completed_at = NOW() WHERE id = $3',
      [fileSize, 'completed', backupId]
    );
    
    console.log(`Backup created successfully: ${filename}`);
    return { success: true, filename, filePath, fileSize };
  } catch (err) {
    console.error('Backup error:', err);
    
    // Update backup log with error
    await pool.query(
      'UPDATE backup_logs SET status = $1, error_message = $2, completed_at = NOW() WHERE filename = $3',
      ['failed', err.message, filename]
    );
    
    throw err;
  }
};

const restoreBackup = async (filename) => {
  const filePath = path.join(BACKUP_DIR, filename);
  
  if (!fs.existsSync(filePath)) {
    throw new Error('Backup file not found');
  }
  
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'shop',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD
  };
  
  const psqlCommand = `PGPASSWORD="${dbConfig.password}" psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} < "${filePath}"`;
  
  try {
    await new Promise((resolve, reject) => {
      exec(psqlCommand, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      });
    });
    
    console.log(`Backup restored successfully: ${filename}`);
    return { success: true };
  } catch (err) {
    console.error('Restore error:', err);
    throw err;
  }
};

const listBackups = async () => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM backup_logs ORDER BY created_at DESC'
    );
    return rows;
  } catch (err) {
    console.error('List backups error:', err);
    throw err;
  }
};

const deleteBackup = async (filename) => {
  const filePath = path.join(BACKUP_DIR, filename);
  
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    await pool.query('DELETE FROM backup_logs WHERE filename = $1', [filename]);
    
    console.log(`Backup deleted: ${filename}`);
    return { success: true };
  } catch (err) {
    console.error('Delete backup error:', err);
    throw err;
  }
};

module.exports = {
  createBackup,
  restoreBackup,
  listBackups,
  deleteBackup
};
