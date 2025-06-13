import { Elysia } from 'elysia';
import { corsMiddleware } from './cors';
import { loggingMiddleware } from './logging';
import { errorMiddleware } from './error';
import { rateLimiter } from './rateLimiter';
import { authenticate } from './auth';
import { securityHeaders } from './securityHeaders';
import { validateBody, validateQuery, validateParams } from './validation';

/**
 * Combines all middleware into a single Elysia plugin
 */
export const middleware = new Elysia()
  .use(corsMiddleware)
  .use(loggingMiddleware)
  .use(errorMiddleware)
  .use(rateLimiter)
  .use(securityHeaders);

// Export authentication middleware separately since it's used selectively
export { authenticate, adminOnly, adminAndUserOnly } from './auth';

// Export validation middleware
export { validateBody, validateQuery, validateParams } from './validation';

export default middleware;