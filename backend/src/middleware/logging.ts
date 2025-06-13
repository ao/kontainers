import { Elysia } from 'elysia';

/**
 * Logging middleware
 * Logs all incoming requests and their responses
 */
export const loggingMiddleware = new Elysia()
  .onRequest(({ request }) => {
    const timestamp = new Date().toISOString();
    const method = request.method;
    const url = request.url;
    
    console.log(`[${timestamp}] ${method} ${url}`);
  })
  .onResponse(({ request, response, set }) => {
    const timestamp = new Date().toISOString();
    const method = request.method;
    const url = request.url;
    const status = response.status || set.status;
    const responseTime = Date.now() - new Date(timestamp).getTime();
    
    console.log(`[${timestamp}] ${method} ${url} ${status} - ${responseTime}ms`);
  })
  .onError(({ request, error }) => {
    const timestamp = new Date().toISOString();
    const method = request.method;
    const url = request.url;
    
    console.error(`[${timestamp}] ${method} ${url} ERROR:`, error);
  });

export default loggingMiddleware;