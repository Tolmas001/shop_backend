const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ShopSRY API',
      version: '1.0.0',
      description: 'ShopSRY e-commerce backend API documentation',
      contact: {
        name: 'ShopSRY Support',
        email: 'support@shopsry.uz'
      }
    },
    servers: [
      {
        url: 'http://localhost:5001',
        description: 'Development server'
      },
      {
        url: process.env.API_URL || 'https://api.shopsry.uz',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            username: { type: 'string' },
            email: { type: 'string' },
            role: { type: 'string', enum: ['user', 'admin', 'superadmin'] }
          }
        },
        Product: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            brand: { type: 'string' },
            category: { type: 'string' },
            price: { type: 'number' },
            stock: { type: 'integer' },
            image: { type: 'string' }
          }
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            user_id: { type: 'integer' },
            customer_name: { type: 'string' },
            customer_phone: { type: 'string' },
            customer_address: { type: 'string' },
            total_amount: { type: 'number' },
            status: { type: 'string' },
            payment_status: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  },
  apis: ['./routes/*.js', './swagger-docs/*.js']
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
