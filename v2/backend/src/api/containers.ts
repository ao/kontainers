import { Elysia, t } from 'elysia';
import { containerService } from '../services/container';

export const containersRoutes = new Elysia({ prefix: '/containers' })
  // Get all containers
  .get('/', async () => {
    const containers = await containerService.getContainers();
    return { containers };
  })
  
  // Get container by ID
  .get('/:id', async ({ params: { id } }) => {
    const container = await containerService.getContainer(id);
    return container;
  }, {
    params: t.Object({
      id: t.String()
    })
  })
  
  // Create a new container
  .post('/', async ({ body }) => {
    const container = await containerService.createContainer({
      name: body.name,
      image: body.image,
      ports: body.ports,
      volumes: body.volumes,
      env: body.env,
      labels: body.labels
    });
    return container;
  }, {
    body: t.Object({
      name: t.String(),
      image: t.String(),
      ports: t.Optional(t.Array(t.Object({
        internal: t.Number(),
        external: t.Number()
      }))),
      volumes: t.Optional(t.Array(t.Object({
        source: t.String(),
        destination: t.String(),
        mode: t.Optional(t.String())
      }))),
      env: t.Optional(t.Array(t.String())),
      labels: t.Optional(t.Record(t.String(), t.String()))
    })
  })
  
  // Start a container
  .post('/:id/start', async ({ params: { id } }) => {
    await containerService.startContainer(id);
    return { success: true, id };
  }, {
    params: t.Object({
      id: t.String()
    })
  })
  
  // Stop a container
  .post('/:id/stop', async ({ params: { id } }) => {
    await containerService.stopContainer(id);
    return { success: true, id };
  }, {
    params: t.Object({
      id: t.String()
    })
  })
  
  // Restart a container
  .post('/:id/restart', async ({ params: { id } }) => {
    await containerService.restartContainer(id);
    return { success: true, id };
  }, {
    params: t.Object({
      id: t.String()
    })
  })
  
  // Get container logs
  .get('/:id/logs', async ({ params: { id }, query }) => {
    const logs = await containerService.getContainerLogs(id, {
      tail: query.tail ? parseInt(query.tail) : 100,
      since: query.since ? parseInt(query.since) : undefined,
      until: query.until ? parseInt(query.until) : undefined
    });
    return { id, logs };
  }, {
    params: t.Object({
      id: t.String()
    }),
    query: t.Object({
      tail: t.Optional(t.String()),
      since: t.Optional(t.String()),
      until: t.Optional(t.String())
    })
  })
  
  // Get container stats
  .get('/:id/stats', async ({ params: { id }, query }) => {
    const detailed = query.detailed === 'true';
    
    if (detailed) {
      const stats = await containerService.getDetailedContainerStats(id);
      return { id, stats };
    } else {
      const stats = await containerService.getContainerStats(id);
      return { id, stats };
    }
  }, {
    params: t.Object({
      id: t.String()
    }),
    query: t.Object({
      detailed: t.Optional(t.String())
    })
  })
  
  // Delete a container
  .delete('/:id', async ({ params: { id }, query }) => {
    const force = query.force === 'true';
    await containerService.removeContainer(id, force);
    return { success: true, id };
  }, {
    params: t.Object({
      id: t.String()
    }),
    query: t.Object({
      force: t.Optional(t.String())
    })
  })
  
  // WebSocket for streaming logs
  .ws('/:id/logs/stream', {
    open(ws) {
      const id = ws.data.params.id;
      
      // Start streaming logs
      containerService.startLogStreaming(id, (log) => {
        ws.send(JSON.stringify({ type: 'log', id, log }));
      }).catch(error => {
        ws.send(JSON.stringify({ type: 'error', message: error.message }));
        ws.close();
      });
    },
    close(ws) {
      const id = ws.data.params.id;
      containerService.stopLogStreaming(id);
    },
    message(ws, message) {
      // Handle client messages if needed
    }
  }, {
    params: t.Object({
      id: t.String()
    })
  })
  
  // WebSocket for streaming stats
  .ws('/:id/stats/stream', {
    open(ws) {
      const id = ws.data.params.id;
      
      // Start monitoring stats
      containerService.on('container:stats', (stats) => {
        if (stats.containerId === id) {
          ws.send(JSON.stringify({ type: 'stats', id, stats }));
        }
      });
      
      containerService.startStatsMonitoring(id, 1000);
    },
    close(ws) {
      const id = ws.data.params.id;
      containerService.stopStatsMonitoring(id);
    },
    message(ws, message) {
      // Handle client messages if needed
    }
  }, {
    params: t.Object({
      id: t.String()
    })
  });