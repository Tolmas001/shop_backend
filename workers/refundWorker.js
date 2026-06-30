const { Worker } = require('bullmq');
const { getRedisClient } = require('../services/cacheService');
const { pool } = require('../database');
const { emitPaymentReceived } = require('../socket');

const refundWorker = new Worker('refunds', async (job) => {
  const { refundId, orderId, userId, amount } = job.data;
  
  try {
    console.log(`Processing refund for refund ID: ${refundId}`);
    
    // Simulate payment provider refund processing
    // In production, this would call Payme/Click refund APIs
    const refundSuccess = await processProviderRefund(orderId, amount);
    
    if (refundSuccess) {
      // Update payment status
      await pool.query(
        'UPDATE payments SET status = $1 WHERE order_id = $2',
        ['refunded', orderId]
      );
      
      // Update order payment status
      await pool.query(
        'UPDATE orders SET payment_status = $1 WHERE id = $2',
        ['refunded', orderId]
      );
      
      // Emit socket event
      emitPaymentReceived({ orderId, status: 'refunded', userId });
      
      console.log(`Refund processed successfully for refund ID: ${refundId}`);
      return { success: true, refundId };
    } else {
      throw new Error('Provider refund failed');
    }
  } catch (error) {
    console.error('Refund processing error:', error);
    throw error;
  }
}, {
  connection: await getRedisClient(),
  concurrency: 3
});

// Simulate payment provider refund processing
async function processProviderRefund(orderId, amount) {
  // In production, integrate with Payme/Click refund APIs
  // For now, simulate success
  await new Promise(resolve => setTimeout(resolve, 2000));
  return true;
}

refundWorker.on('completed', (job) => {
  console.log(`Refund job ${job.id} completed`);
});

refundWorker.on('failed', (job, err) => {
  console.error(`Refund job ${job.id} failed:`, err.message);
});

module.exports = refundWorker;
