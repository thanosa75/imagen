const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Imagen API',
      version: '1.0.0',
      description: 'API documentation for the Imagen image processing service',
    },
    servers: [
      {
        url: 'http://localhost:3000', // Update this based on your environment if needed
        description: 'Local server',
      },
    ],
    components: {
      schemas: {
        Job: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The auto-generated id of the job',
            },
            status: {
              type: 'string',
              enum: ['pending', 'processing', 'completed', 'failed'],
              description: 'The status of the job',
            },
            result: {
              type: 'object',
              description: 'The result of the job processing',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'The date the job was created',
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                },
                message: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.js'], // Path to the API docs
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
