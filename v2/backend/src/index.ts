import { Elysia } from 'elysia';
import { swagger } from '@elysiajs/swagger';

// Import routes and middleware
import { router } from './routes';
import { middleware } from './middleware';
import { websocketServer } from './websocket';

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
    .use(middleware) // Apply middleware (CORS, logging, error handling)
    .use(swagger({
      documentation: {
        info: {
          title: 'Kontainers API',
          version: '2.0.0',
          description: 'API for Kontainers v2'
        }
      }
    }))
    .use(websocketServer) // Set up WebSocket server
    .use(router) // Apply API routes
    .get('/', () => 'Kontainers v2 API is running')
    .listen(3001);

  console.log(`🚀 Kontainers v2 API is running at ${app.server?.hostname}:${app.server?.port}`);
  
  return app;
}

// Start the application
const app = await startApp();

export type App = typeof app;