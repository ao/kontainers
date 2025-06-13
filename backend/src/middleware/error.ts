import { Elysia } from 'elysia';

/**
 * Error handling middleware
 * Provides consistent error responses for the API
 */
export const errorMiddleware = new Elysia()
  .onError(({ code, error, set }) => {
    console.error(`Error [${code}]:`, error);
    
    // Set appropriate status code based on error type
    switch (code) {
      case 'NOT_FOUND':
        set.status = 404;
        return { error: 'Not Found', message: error.message };
        
      case 'VALIDATION':
        set.status = 400;
        return { error: 'Bad Request', message: error.message };
        
      case 'PARSE':
        set.status = 400;
        return { error: 'Bad Request', message: 'Invalid request body' };
        
      case 'UNAUTHORIZED':
        set.status = 401;
        return { error: 'Unauthorized', message: error.message };
        
      case 'FORBIDDEN':
        set.status = 403;
        return { error: 'Forbidden', message: error.message };
        
      default:
        // For unexpected errors, return 500
        set.status = 500;
        return {
          error: 'Internal Server Error',
          message: 'An unexpected error occurred',
          details: error.message
        };
    }
  });

export default errorMiddleware;