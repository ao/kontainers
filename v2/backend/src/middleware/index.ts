import { Elysia } from 'elysia';
import { corsMiddleware } from './cors';
import { loggingMiddleware } from './logging';
import { errorMiddleware } from './error';

/**
 * Combines all middleware into a single Elysia plugin
 */
export const middleware = new Elysia()
  .use(corsMiddleware)
  .use(loggingMiddleware)
  .use(errorMiddleware);

export default middleware;