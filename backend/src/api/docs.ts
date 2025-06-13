import { Elysia } from 'elysia';
import { swagger } from '@elysiajs/swagger';

/**
 * API Documentation configuration
 * Uses Swagger UI to provide interactive API documentation
 */
export const apiDocs = new Elysia()
  .use(swagger({
    documentation: {
      info: {
        title: 'Kontainers API',
        version: '2.0.0',
        description: 'API for Kontainers - Container Management and Reverse Proxy Platform',
        contact: {
          name: 'Kontainers Team',
          url: 'https://github.com/ao/kontainers'
        },
        license: {
          name: 'MIT',
          url: 'https://opensource.org/licenses/MIT'
        }
      },
      tags: [
        {
          name: 'Auth',
          description: 'Authentication and user management endpoints'
        },
        {
          name: 'Containers',
          description: 'Container management endpoints'
        },
        {
          name: 'Proxy',
          description: 'Proxy rule management endpoints'
        },
        {
          name: 'Config',
          description: 'System configuration endpoints'
        },
        {
          name: 'Health',
          description: 'Health check and monitoring endpoints'
        }
      ],
      servers: [
        {
          url: '/',
          description: 'Current server'
        }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT token authentication'
          }
        }
      },
      security: [
        {
          bearerAuth: []
        }
      ]
    },
    // Swagger UI configuration
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha'
    }
  }));

export default apiDocs;