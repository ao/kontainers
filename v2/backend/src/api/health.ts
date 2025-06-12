import { Elysia, t } from 'elysia';
import { db } from '../db';
import { HealthStatus } from 'kontainers-shared';
import os from 'os';
import { adminOnly } from '../middleware/auth';

/**
 * Health check and monitoring endpoints
 */
export const healthRoutes = new Elysia({ prefix: '/health' })
  // Public basic health check
  .get('/', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || '2.0.0'
    };
  })
  
  // Detailed health check (requires authentication)
  .use(adminOnly)
  .get('/detailed', async () => {
    // Check database connection
    let dbStatus: HealthStatus = HealthStatus.HEALTHY;
    let dbMessage = 'Database connection is healthy';
    
    try {
      // Simple query to check if database is responsive
      await db.select({ count: db.fn.count() }).from(db.dynamic('sqlite_master'));
    } catch (error) {
      dbStatus = HealthStatus.UNHEALTHY;
      dbMessage = `Database connection error: ${(error as Error).message}`;
    }
    
    // Check system resources
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const memoryUsage = 1 - (freeMemory / totalMemory);
    
    let systemStatus: HealthStatus = HealthStatus.HEALTHY;
    if (memoryUsage > 0.9) {
      systemStatus = HealthStatus.DEGRADED;
    }
    if (memoryUsage > 0.95) {
      systemStatus = HealthStatus.UNHEALTHY;
    }
    
    // Check CPU load
    const cpuLoad = os.loadavg()[0] / os.cpus().length;
    if (cpuLoad > 0.8) {
      systemStatus = HealthStatus.DEGRADED;
    }
    if (cpuLoad > 0.95) {
      systemStatus = HealthStatus.UNHEALTHY;
    }
    
    // Check disk space (simplified - would need a proper implementation)
    const diskStatus: HealthStatus = HealthStatus.HEALTHY;
    
    // Determine overall status (worst of all components)
    const overallStatus = [dbStatus, systemStatus, diskStatus].reduce((worst, current) => {
      if (current === HealthStatus.UNHEALTHY) return HealthStatus.UNHEALTHY;
      if (current === HealthStatus.DEGRADED && worst !== HealthStatus.UNHEALTHY) return HealthStatus.DEGRADED;
      return worst;
    }, HealthStatus.HEALTHY);
    
    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || '2.0.0',
      uptime: process.uptime(),
      components: {
        database: {
          status: dbStatus,
          message: dbMessage
        },
        system: {
          status: systemStatus,
          cpu: {
            cores: os.cpus().length,
            model: os.cpus()[0].model,
            load: cpuLoad
          },
          memory: {
            total: totalMemory,
            free: freeMemory,
            usage: memoryUsage
          }
        },
        disk: {
          status: diskStatus
        }
      }
    };
  })
  
  // Metrics endpoint (Prometheus compatible)
  .get('/metrics', async () => {
    // CPU metrics
    const cpuCount = os.cpus().length;
    const cpuLoad = os.loadavg()[0];
    const cpuUsage = cpuLoad / cpuCount;
    
    // Memory metrics
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    
    // System metrics
    const uptime = process.uptime();
    
    // Format metrics in Prometheus format
    const metrics = [
      '# HELP kontainers_uptime_seconds The uptime of the Kontainers service in seconds',
      '# TYPE kontainers_uptime_seconds gauge',
      `kontainers_uptime_seconds ${uptime}`,
      
      '# HELP kontainers_cpu_count Number of CPU cores',
      '# TYPE kontainers_cpu_count gauge',
      `kontainers_cpu_count ${cpuCount}`,
      
      '# HELP kontainers_cpu_load System load average (1 minute)',
      '# TYPE kontainers_cpu_load gauge',
      `kontainers_cpu_load ${cpuLoad}`,
      
      '# HELP kontainers_cpu_usage CPU usage (load/cores)',
      '# TYPE kontainers_cpu_usage gauge',
      `kontainers_cpu_usage ${cpuUsage}`,
      
      '# HELP kontainers_memory_total_bytes Total memory in bytes',
      '# TYPE kontainers_memory_total_bytes gauge',
      `kontainers_memory_total_bytes ${totalMemory}`,
      
      '# HELP kontainers_memory_free_bytes Free memory in bytes',
      '# TYPE kontainers_memory_free_bytes gauge',
      `kontainers_memory_free_bytes ${freeMemory}`,
      
      '# HELP kontainers_memory_used_bytes Used memory in bytes',
      '# TYPE kontainers_memory_used_bytes gauge',
      `kontainers_memory_used_bytes ${usedMemory}`,
      
      '# HELP kontainers_memory_usage Memory usage ratio',
      '# TYPE kontainers_memory_usage gauge',
      `kontainers_memory_usage ${usedMemory / totalMemory}`
    ].join('\n');
    
    return new Response(metrics, {
      headers: {
        'Content-Type': 'text/plain; version=0.0.4'
      }
    });
  });

export default healthRoutes;