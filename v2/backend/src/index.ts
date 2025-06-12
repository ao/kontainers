import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { websocket } from '@elysiajs/websocket';

// Import API routes
import { containersRoutes } from './api/containers';
import { proxyRoutes } from './api/proxy';
import { configRoutes } from './api/config';
import { healthRoutes } from './api/health';

// Import services
import { configService } from './services/config';
import { containerService } from './services/container';
import { proxyService } from './services/proxy';
import { monitoringService } from './services/monitoring';

// Initialize services
async function initializeServices() {
  try {
    console.log('Initializing configuration service...');
    await configService.initialize();
    
    console.log('Initializing proxy service...');
    await proxyService.initialize();
    
    console.log('Initializing monitoring service...');
    await monitoringService.initialize();
    
    console.log('All services initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing services:', error);
    return false;
  }
}

// Create and start the application
async function startApp() {
  // Initialize services first
  await initializeServices();
  
  const app = new Elysia()
    .use(cors())
    .use(swagger({
      documentation: {
        info: {
          title: 'Kontainers API',
          version: '2.0.0',
          description: 'API for Kontainers v2'
        }
      }
    }))
    .use(websocket())
    .group('/api', app => app
      .use(containersRoutes)
      .use(proxyRoutes)
      .use(configRoutes)
      .use(healthRoutes)
    )
    .get('/', () => 'Kontainers v2 API is running')
    .listen(3001);

  console.log(`🚀 Kontainers v2 API is running at ${app.server?.hostname}:${app.server?.port}`);
  
  return app;
}

// Start the application
const app = await startApp();

export type App = typeof app;