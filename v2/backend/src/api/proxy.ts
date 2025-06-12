import { Elysia, t } from 'elysia';
import { proxyService } from '../services/proxy';
import { ProxyProtocol } from '../../../shared/src/models';

export const proxyRoutes = new Elysia({ prefix: '/proxy' })
  // Get all proxy rules
  .get('/rules', async () => {
    const rules = await proxyService.getRules();
    return { rules };
  })
  
  // Get proxy rule by ID
  .get('/rules/:id', async ({ params: { id } }) => {
    const rule = await proxyService.getRule(id);
    if (!rule) {
      return new Response(JSON.stringify({ error: 'Rule not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return rule;
  }, {
    params: t.Object({
      id: t.String()
    })
  })
  
  // Create a new proxy rule
  .post('/rules', async ({ body }) => {
    const rule = await proxyService.createRule({
      name: body.name,
      sourceHost: body.sourceHost,
      sourcePath: body.sourcePath || '/',
      targetContainer: body.targetContainer,
      targetPort: body.targetPort,
      protocol: body.protocol || ProxyProtocol.HTTP,
      sslEnabled: body.sslEnabled || false,
      sslCertPath: body.sslCertPath,
      sslKeyPath: body.sslKeyPath,
      headers: body.headers,
      responseHeaders: body.responseHeaders,
      healthCheck: body.healthCheck,
      loadBalancing: body.loadBalancing,
      advancedConfig: body.advancedConfig,
      customNginxConfig: body.customNginxConfig,
      enabled: body.enabled !== undefined ? body.enabled : true
    });
    return rule;
  }, {
    body: t.Object({
      name: t.String(),
      sourceHost: t.String(),
      sourcePath: t.Optional(t.String()),
      targetContainer: t.String(),
      targetPort: t.Number(),
      protocol: t.Optional(t.Enum(ProxyProtocol)),
      sslEnabled: t.Optional(t.Boolean()),
      sslCertPath: t.Optional(t.String()),
      sslKeyPath: t.Optional(t.String()),
      headers: t.Optional(t.Record(t.String(), t.String())),
      responseHeaders: t.Optional(t.Record(t.String(), t.String())),
      healthCheck: t.Optional(t.Object({
        path: t.String(),
        interval: t.Number(),
        timeout: t.Number(),
        retries: t.Number(),
        successCodes: t.String()
      })),
      loadBalancing: t.Optional(t.Any()),
      advancedConfig: t.Optional(t.Any()),
      customNginxConfig: t.Optional(t.String()),
      enabled: t.Optional(t.Boolean())
    })
  })
  
  // Update a proxy rule
  .put('/rules/:id', async ({ params: { id }, body }) => {
    try {
      const rule = await proxyService.updateRule(id, body);
      return rule;
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }, {
    params: t.Object({
      id: t.String()
    }),
    body: t.Object({
      name: t.Optional(t.String()),
      sourceHost: t.Optional(t.String()),
      sourcePath: t.Optional(t.String()),
      targetContainer: t.Optional(t.String()),
      targetPort: t.Optional(t.Number()),
      protocol: t.Optional(t.Enum(ProxyProtocol)),
      sslEnabled: t.Optional(t.Boolean()),
      sslCertPath: t.Optional(t.String()),
      sslKeyPath: t.Optional(t.String()),
      headers: t.Optional(t.Record(t.String(), t.String())),
      responseHeaders: t.Optional(t.Record(t.String(), t.String())),
      healthCheck: t.Optional(t.Any()),
      loadBalancing: t.Optional(t.Any()),
      advancedConfig: t.Optional(t.Any()),
      customNginxConfig: t.Optional(t.String()),
      enabled: t.Optional(t.Boolean())
    })
  })
  
  // Delete a proxy rule
  .delete('/rules/:id', async ({ params: { id } }) => {
    try {
      await proxyService.deleteRule(id);
      return { success: true, id };
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }, {
    params: t.Object({
      id: t.String()
    })
  })
  
  // Toggle a proxy rule (enable/disable)
  .post('/rules/:id/toggle', async ({ params: { id } }) => {
    try {
      const rule = await proxyService.toggleRule(id);
      return { success: true, id, enabled: rule.enabled };
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }, {
    params: t.Object({
      id: t.String()
    })
  })
  
  // Test a proxy rule
  .post('/rules/test', async ({ body }) => {
    const result = await proxyService.testRule(body);
    return result;
  }, {
    body: t.Object({
      sourceHost: t.String(),
      sourcePath: t.Optional(t.String()),
      targetContainer: t.String(),
      targetPort: t.Number(),
      protocol: t.Optional(t.Enum(ProxyProtocol)),
      sslEnabled: t.Optional(t.Boolean()),
      sslCertPath: t.Optional(t.String()),
      sslKeyPath: t.Optional(t.String())
    })
  })
  
  // Get traffic data for a rule
  .get('/rules/:id/traffic', async ({ params: { id }, query }) => {
    try {
      const traffic = proxyService.getTrafficData(id, {
        limit: query.limit ? parseInt(query.limit) : undefined,
        since: query.since ? parseInt(query.since) : undefined
      });
      return { id, traffic };
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }, {
    params: t.Object({
      id: t.String()
    }),
    query: t.Object({
      limit: t.Optional(t.String()),
      since: t.Optional(t.String())
    })
  })
  
  // Get errors for a rule
  .get('/rules/:id/errors', async ({ params: { id }, query }) => {
    try {
      const errors = proxyService.getErrors(id, {
        limit: query.limit ? parseInt(query.limit) : undefined,
        since: query.since ? parseInt(query.since) : undefined,
        resolved: query.resolved === 'true' ? true :
                 query.resolved === 'false' ? false : undefined
      });
      return { id, errors };
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }, {
    params: t.Object({
      id: t.String()
    }),
    query: t.Object({
      limit: t.Optional(t.String()),
      since: t.Optional(t.String()),
      resolved: t.Optional(t.String())
    })
  })
  
  // Resolve an error
  .post('/errors/:id/resolve', async ({ params: { id }, body }) => {
    try {
      const error = proxyService.resolveError(id, body.resolution);
      if (!error) {
        return new Response(JSON.stringify({ error: 'Error not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return { success: true, error };
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }, {
    params: t.Object({
      id: t.String()
    }),
    body: t.Object({
      resolution: t.String()
    })
  })
  
  // Get Nginx status
  .get('/status', async () => {
    const status = await proxyService.getNginxStatus();
    return status;
  });