import { Elysia, t } from 'elysia';
import { configService } from '../services/config';

export const configRoutes = new Elysia({ prefix: '/config' })
  // Get current configuration
  .get('/', async () => {
    const config = configService.getConfig();
    return config;
  })
  
  // Update configuration
  .put('/', async ({ body }) => {
    try {
      const updatedConfig = await configService.updateConfig(body);
      return {
        success: true,
        config: updatedConfig
      };
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }, {
    body: t.Object({
      dockerEndpoint: t.Optional(t.String()),
      proxyType: t.Optional(t.Union([t.Literal('nginx'), t.Literal('traefik')])),
      sslEnabled: t.Optional(t.Boolean()),
      autoStartContainers: t.Optional(t.Boolean()),
      logLevel: t.Optional(t.String()),
      maxLogSize: t.Optional(t.Number()),
      uiSettings: t.Optional(t.Object({
        theme: t.Optional(t.String()),
        refreshInterval: t.Optional(t.Number()),
        showSystemContainers: t.Optional(t.Boolean())
      }))
    })
  })
  
  // Create a configuration backup
  .post('/backup', async ({ body }) => {
    try {
      const backup = await configService.createBackup(body?.description);
      return {
        success: true,
        backup
      };
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }, {
    body: t.Optional(t.Object({
      description: t.Optional(t.String())
    }))
  })
  
  // Get all configuration backups
  .get('/backups', async () => {
    try {
      const backups = await configService.getBackups();
      return { backups };
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  })
  
  // Restore configuration from backup
  .post('/restore', async ({ body }) => {
    try {
      const config = await configService.restoreBackup(body.backupId);
      return {
        success: true,
        backupId: body.backupId,
        config
      };
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }, {
    body: t.Object({
      backupId: t.String()
    })
  })
  
  // Delete a configuration backup
  .delete('/backups/:id', async ({ params: { id } }) => {
    try {
      await configService.deleteBackup(id);
      return {
        success: true,
        backupId: id
      };
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }, {
    params: t.Object({
      id: t.String()
    })
  });