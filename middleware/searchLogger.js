const { pool } = require('../database');

const searchLogger = async (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    setImmediate(async () => {
      try {
        // Only log search requests
        if (!req.path.includes('/search') && !req.path.includes('/products')) {
          return;
        }

        const keyword = req.query.q || req.query.search || req.query.keyword;
        
        if (!keyword || keyword.length < 2) {
          return;
        }

        const resultCount = data?.results?.length || data?.length || 0;
        
        await pool.query(
          `INSERT INTO search_logs (keyword, result_count, user_id, ip) 
           VALUES ($1, $2, $3, $4)`,
          [keyword, resultCount, req.user?.id || null, req.ip]
        );
      } catch (err) {
        console.error('Search logger error:', err);
      }
    });
    
    originalSend.call(this, data);
  };
  
  next();
};

module.exports = searchLogger;
