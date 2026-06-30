const redis = require('redis');

let client;

const getRedisClient = async () => {
  if (!client) {
    client = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('Redis reconnection failed after 10 attempts');
            return new Error('Redis reconnection failed');
          }
          return retries * 100;
        }
      }
    });

    client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    client.on('connect', () => {
      console.log('Redis Client Connected');
    });

    await client.connect();
  }
  return client;
};

const getCache = async (key) => {
  try {
    const redisClient = await getRedisClient();
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error('Cache get error:', err);
    return null;
  }
};

const setCache = async (key, data, ttl = 3600) => {
  try {
    const redisClient = await getRedisClient();
    await redisClient.setEx(key, ttl, JSON.stringify(data));
    return true;
  } catch (err) {
    console.error('Cache set error:', err);
    return false;
  }
};

const deleteCache = async (key) => {
  try {
    const redisClient = await getRedisClient();
    await redisClient.del(key);
    return true;
  } catch (err) {
    console.error('Cache delete error:', err);
    return false;
  }
};

const deletePattern = async (pattern) => {
  try {
    const redisClient = await getRedisClient();
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
    return true;
  } catch (err) {
    console.error('Cache delete pattern error:', err);
    return false;
  }
};

const flushAll = async () => {
  try {
    const redisClient = await getRedisClient();
    await redisClient.flushAll();
    return true;
  } catch (err) {
    console.error('Cache flush error:', err);
    return false;
  }
};

module.exports = {
  getCache,
  setCache,
  deleteCache,
  deletePattern,
  flushAll,
  getRedisClient
};
