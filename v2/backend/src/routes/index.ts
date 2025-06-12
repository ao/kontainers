import { Elysia } from 'elysia';
import { containersRoutes } from '../api/containers';
import { proxyRoutes } from '../api/proxy';
import { configRoutes } from '../api/config';
import { healthRoutes } from '../api/health';

/**
 * Main router that combines all API routes
 */
export const router = new Elysia()
  .group('/api', (app: any) => app
    .use(containersRoutes)
    .use(proxyRoutes)
    .use(configRoutes)
    .use(healthRoutes)
  );

export default router;