import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';

/**
 * CORS middleware configuration
 * Allows cross-origin requests from specified origins
 */
export const corsMiddleware = new Elysia()
  .use(cors({
    origin: (origin) => {
      // Allow requests from localhost development servers
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173'
      ];
      
      // In production, you might want to restrict this further
      return allowedOrigins.includes(origin) || origin.startsWith('http://localhost:');
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400 // 24 hours
  }));

export default corsMiddleware;