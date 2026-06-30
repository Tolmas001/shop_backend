const { Queue, Worker } = require('bullmq');
const { getRedisClient } = require('../services/cacheService');

let emailQueue;
let notificationQueue;
let refundQueue;
let backupQueue;

// Initialize queues
const initializeQueues = async () => {
  const connection = await getRedisClient();
  
  emailQueue = new Queue('emails', { connection });
  notificationQueue = new Queue('notifications', { connection });
  refundQueue = new Queue('refunds', { connection });
  backupQueue = new Queue('backups', { connection });
  
  console.log('Queues initialized successfully');
};

// Email queue
const addEmailJob = async (data) => {
  if (!emailQueue) {
    await initializeQueues();
  }
  return emailQueue.add('send-email', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  });
};

// Notification queue
const addNotificationJob = async (data) => {
  if (!notificationQueue) {
    await initializeQueues();
  }
  return notificationQueue.add('send-notification', data, {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 1000
    }
  });
};

// Refund queue
const addRefundJob = async (data) => {
  if (!refundQueue) {
    await initializeQueues();
  }
  return refundQueue.add('process-refund', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  });
};

// Backup queue
const addBackupJob = async (data) => {
  if (!backupQueue) {
    await initializeQueues();
  }
  return backupQueue.add('create-backup', data, {
    attempts: 1,
    removeOnComplete: 10,
    removeOnFail: 5
  });
};

module.exports = {
  initializeQueues,
  addEmailJob,
  addNotificationJob,
  addRefundJob,
  addBackupJob,
  getQueues: () => ({ emailQueue, notificationQueue, refundQueue, backupQueue })
};
