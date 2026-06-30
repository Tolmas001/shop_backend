const express = require('express');
const { pool } = require('../database');
const { authenticateAdmin, authenticateToken } = require('../middleware/auth');
const { createNotification } = require('../utils/helpers');
const { emitTicketCreated } = require('../socket');

const router = express.Router();

// User: Create support ticket
router.post('/api/support/create', authenticateToken, async (req, res) => {
  const { subject, message } = req.body;
  const userId = req.user.id;
  
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const { rows } = await client.query(
        'INSERT INTO support_tickets (user_id, subject) VALUES ($1, $2) RETURNING *',
        [userId, subject]
      );
      
      const ticketId = rows[0].id;
      
      await client.query(
        'INSERT INTO ticket_messages (ticket_id, user_id, message, is_admin) VALUES ($1, $2, $3, false)',
        [ticketId, userId, message]
      );
      
      await client.query('COMMIT');
      
      // Emit socket event for new ticket
      emitTicketCreated(rows[0]);
      
      // Notify admins
      await pool.query(
        'INSERT INTO admin_notifications (title, message, type, priority) VALUES ($1, $2, $3, $4)',
        ['Yangi support ticket', `Foydalanuvchi yangi ticket yaratdi: ${subject}`, 'info', 'normal']
      );
      
      res.status(201).json({ success: true, ticket: rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get all support tickets
router.get('/api/admin/support', authenticateAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT 
        st.*,
        u.username,
        u.email,
        COUNT(tm.id) as message_count
      FROM support_tickets st
      LEFT JOIN users u ON st.user_id = u.id
      LEFT JOIN ticket_messages tm ON st.id = tm.ticket_id
    `;
    const params = [];
    
    if (status) {
      query += ' WHERE st.status = $1';
      params.push(status);
    }
    
    query += ' GROUP BY st.id, u.username, u.email ORDER BY st.created_at DESC';
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get ticket details with messages
router.get('/api/admin/support/:id', authenticateAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT st.*, u.username, u.email 
       FROM support_tickets st 
       LEFT JOIN users u ON st.user_id = u.id 
       WHERE st.id = $1`,
      [req.params.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    const ticket = rows[0];
    
    // Get messages
    const messagesRes = await pool.query(
      `SELECT tm.*, u.username 
       FROM ticket_messages tm 
       LEFT JOIN users u ON tm.user_id = u.id 
       WHERE tm.ticket_id = $1 
       ORDER BY tm.created_at ASC`,
      [req.params.id]
    );
    
    res.json({
      ticket,
      messages: messagesRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Reply to ticket
router.post('/api/admin/support/:id/reply', authenticateAdmin, async (req, res) => {
  const { message } = req.body;
  const ticketId = req.params.id;
  const adminId = req.user.id;
  
  try {
    // Check if ticket exists
    const ticketRes = await pool.query(
      'SELECT * FROM support_tickets WHERE id = $1',
      [ticketId]
    );
    
    if (ticketRes.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    const ticket = ticketRes.rows[0];
    
    // Add message
    await pool.query(
      'INSERT INTO ticket_messages (ticket_id, user_id, message, is_admin) VALUES ($1, $2, $3, true)',
      [ticketId, adminId, message]
    );
    
    // Update ticket status if it was open
    if (ticket.status === 'open') {
      await pool.query(
        'UPDATE support_tickets SET status = \'pending\', updated_at = NOW() WHERE id = $1',
        [ticketId]
      );
    }
    
    // Notify user
    if (ticket.user_id) {
      createNotification(ticket.user_id, `Support ticket #${ticketId} ga javob yuborildi`, 'info');
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Resolve ticket
router.patch('/api/admin/support/:id/resolve', authenticateAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE support_tickets SET status = \'closed\', updated_at = NOW() WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    const ticket = rows[0];
    
    // Notify user
    if (ticket.user_id) {
      createNotification(ticket.user_id, `Support ticket #${ticket.id} yopildi`, 'success');
    }
    
    res.json({ success: true, ticket: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User: Get their tickets
router.get('/api/support/my-tickets', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT st.*, COUNT(tm.id) as message_count
       FROM support_tickets st
       LEFT JOIN ticket_messages tm ON st.id = tm.ticket_id
       WHERE st.user_id = $1
       GROUP BY st.id
       ORDER BY st.created_at DESC`,
      [req.user.id]
    );
    
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User: Get ticket details
router.get('/api/support/:id', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM support_tickets WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    const ticket = rows[0];
    
    // Get messages
    const messagesRes = await pool.query(
      `SELECT tm.*, u.username 
       FROM ticket_messages tm 
       LEFT JOIN users u ON tm.user_id = u.id 
       WHERE tm.ticket_id = $1 
       ORDER BY tm.created_at ASC`,
      [req.params.id]
    );
    
    res.json({
      ticket,
      messages: messagesRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// User: Reply to their ticket
router.post('/api/support/:id/reply', authenticateToken, async (req, res) => {
  const { message } = req.body;
  const ticketId = req.params.id;
  const userId = req.user.id;
  
  try {
    // Check if ticket exists and belongs to user
    const ticketRes = await pool.query(
      'SELECT * FROM support_tickets WHERE id = $1 AND user_id = $2',
      [ticketId, userId]
    );
    
    if (ticketRes.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    const ticket = ticketRes.rows[0];
    
    // Add message
    await pool.query(
      'INSERT INTO ticket_messages (ticket_id, user_id, message, is_admin) VALUES ($1, $2, $3, false)',
      [ticketId, userId, message]
    );
    
    // Update ticket status
    if (ticket.status === 'closed') {
      await pool.query(
        'UPDATE support_tickets SET status = \'open\', updated_at = NOW() WHERE id = $1',
        [ticketId]
      );
    }
    
    // Notify admins
    await pool.query(
      'INSERT INTO admin_notifications (title, message, type, priority) VALUES ($1, $2, $3, $4)',
      ['Ticket yangi xabar', `Ticket #${ticketId} ga foydalanuvchi javob yubordi`, 'info', 'normal']
    );
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
