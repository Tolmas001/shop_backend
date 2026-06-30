const express = require('express');
const { authenticateAdmin } = require('../middleware/auth');
const { createBackup, restoreBackup, listBackups, deleteBackup } = require('../scripts/backup');

const router = express.Router();

// Create backup
router.post('/api/admin/backups/create', authenticateAdmin, async (req, res) => {
  try {
    const { backup_type = 'manual' } = req.body;
    const result = await createBackup(backup_type);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List all backups
router.get('/api/admin/backups', authenticateAdmin, async (req, res) => {
  try {
    const backups = await listBackups();
    res.json(backups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Restore backup
router.post('/api/admin/backups/restore', authenticateAdmin, async (req, res) => {
  try {
    const { filename } = req.body;
    const result = await restoreBackup(filename);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete backup
router.delete('/api/admin/backups/:filename', authenticateAdmin, async (req, res) => {
  try {
    const result = await deleteBackup(req.params.filename);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
