import { Elysia, t } from 'elysia';
import { monitoringService } from '../services/monitoring';
import { containerService } from '../services/container';
import { proxyService } from '../services/proxy';
import { configService } from '../services/config';

export const healthRoutes = new Elysia({ prefix: '/health' })
  // Get overall system health status
  .get('/', async () => {
    const health = monitoringService.getOverallHealth();
    return {
      status: health.status,
      timestamp: new Date().toISOString(),
      components: health.components
    };
  })
  
  // Get Docker health status
  .get('/docker', async () => {
    try {
      const dockerInfo = await containerService.getDockerInfo();
      const dockerVersion = await containerService.getDockerVersion();
      const containers = await containerService.getContainers(true);
      
      const runningContainers = containers.filter(c => c.state === 'RUNNING').length;
      const stoppedContainers = containers.filter(c => c.state === 'STOPPED').length;
      
      return {
        status: 'healthy',
        version: dockerVersion.Version,
        apiVersion: dockerVersion.ApiVersion,
        containers: {
          running: runningContainers,
          stopped: stoppedContainers,
          total: containers.length
        }
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  })
  
  // Get proxy health status
  .get('/proxy', async () => {
    try {
      const nginxStatus = await proxyService.getNginxStatus();
      const rules = await proxyService.getRules();
      
      return {
        status: nginxStatus.running ? 'healthy' : 'unhealthy',
        type: 'nginx',
        version: nginxStatus.version,
        rules: rules.length,
        activeRules: rules.filter(r => r.enabled).length
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  })
  
  // Get system resource metrics
  .get('/resources', async () => {
    try {
      const metrics = await monitoringService.collectSystemMetrics();
      return metrics;
    } catch (error: any) {
      return {
        status: 'error',
        error: error.message
      };
    }
  })
  
  // Get configuration health status
  .get('/config', async () => {
    try {
      const config = configService.getConfig();
      const backups = await configService.getBackups();
      
      return {
        status: 'healthy',
        version: config.version,
        backups: backups.length
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  })
  
  // WebSocket for streaming health updates
  .ws('/stream', {
    open(ws) {
      // Register event handler for health updates
      monitoringService.on('monitoring:health', (health) => {
        ws.send(JSON.stringify({ type: 'health', data: health }));
      });
      
      // Register event handler for metrics updates
      monitoringService.on('monitoring:metrics', (metrics) => {
        ws.send(JSON.stringify({ type: 'metrics', data: metrics }));
      });
      
      // Send initial data
      const health = monitoringService.getOverallHealth();
      const metrics = monitoringService.getLatestMetrics();
      
      ws.send(JSON.stringify({ type: 'health', data: health }));
      if (metrics) {
        ws.send(JSON.stringify({ type: 'metrics', data: metrics }));
      }
    },
    message(ws, message) {
      // Handle client messages if needed
      try {
        const data = JSON.parse(message as string);
        
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch (error) {
        // Ignore invalid messages
      }
    },
    close(ws) {
      // Clean up if needed
    }
  });