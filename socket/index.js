const { Server } = require('socket.io');
const { pool } = require('../database');

let io;

const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Join user-specific room
    socket.on('join_user', (userId) => {
      socket.join(`user_${userId}`);
      console.log(`User ${userId} joined room`);
    });

    // Join admin room
    socket.on('join_admin', () => {
      socket.join('admins');
      console.log('Admin joined room');
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

// Emit functions for different events
const emitNewOrder = async (orderData) => {
  try {
    const io = getIO();
    io.to('admins').emit('new_order', orderData);
    
    // Also notify the user
    if (orderData.user_id) {
      io.to(`user_${orderData.user_id}`).emit('order_created', orderData);
    }
  } catch (err) {
    console.error('Socket emit error:', err);
  }
};

const emitNewNotification = async (userId, notificationData) => {
  try {
    const io = getIO();
    io.to(`user_${userId}`).emit('new_notification', notificationData);
  } catch (err) {
    console.error('Socket emit error:', err);
  }
};

const emitTicketCreated = async (ticketData) => {
  try {
    const io = getIO();
    io.to('admins').emit('ticket_created', ticketData);
    
    if (ticketData.user_id) {
      io.to(`user_${ticketData.user_id}`).emit('support_ticket_created', ticketData);
    }
  } catch (err) {
    console.error('Socket emit error:', err);
  }
};

const emitStockLow = async (productData) => {
  try {
    const io = getIO();
    io.to('admins').emit('stock_low', productData);
  } catch (err) {
    console.error('Socket emit error:', err);
  }
};

const emitDeliveryUpdated = async (orderId, status, userId) => {
  try {
    const io = getIO();
    const data = { order_id: orderId, status };
    
    io.to('admins').emit('delivery_updated', data);
    
    if (userId) {
      io.to(`user_${userId}`).emit('order_status_updated', data);
    }
  } catch (err) {
    console.error('Socket emit error:', err);
  }
};

const emitPaymentReceived = async (paymentData) => {
  try {
    const io = getIO();
    io.to('admins').emit('payment_received', paymentData);
    
    if (paymentData.user_id) {
      io.to(`user_${paymentData.user_id}`).emit('payment_success', paymentData);
    }
  } catch (err) {
    console.error('Socket emit error:', err);
  }
};

module.exports = {
  initializeSocket,
  getIO,
  emitNewOrder,
  emitNewNotification,
  emitTicketCreated,
  emitStockLow,
  emitDeliveryUpdated,
  emitPaymentReceived
};
