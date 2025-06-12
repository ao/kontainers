import { Elysia } from 'elysia';

// Import routes and middleware
import { router } from './routes';
import { middleware } from './middleware';
import { websocketServer } from './websocket';
import { apiDocs } from './api/docs';

// Import services
import { configService } from './services/config';
import { containerService } from './services/container';
import { proxyService } from './services/proxy';
import { monitoringService } from './services/monitoring';
import { initializeDatabase } from './db';

// Initialize services
async function initializeServices() {
  try {
    console.log('Initializing database...');
    await initializeDatabase();
    
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
    .use(apiDocs) // API documentation with Swagger UI
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