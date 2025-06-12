import os from 'os';
import { SystemResourceMetrics, HealthStatus, HealthCheckResult } from '../../../shared/src/models';
import { dockerClient } from '../integrations/docker';
import { nginxManager } from '../integrations/nginx';
import { configService } from './config';

/**
 * Service for monitoring system health and resources
 */
export class MonitoringService {
  private metricsInterval: number | null = null;
  private healthCheckInterval: number | null = null;
  private eventHandlers: Map<string, Function[]> = new Map();
  private lastMetrics: SystemResourceMetrics | null = null;
  private healthStatus: Map<string, HealthCheckResult> = new Map();

  constructor() {
    // Initialize event handlers
    this.eventHandlers = new Map();
  }

  /**
   * Register event handler
   */
  on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)?.push(handler);
  }

  /**
   * Emit event
   */
  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  /**
   * Initialize monitoring service
   */
  async initialize(): Promise<void> {
    try {
      // Perform initial health check
      await this.checkHealth();
      
      // Start monitoring
      this.startMonitoring();
      
      this.emit('monitoring:initialized', { success: true });
    } catch (error: any) {
      console.error('Error initializing monitoring service:', error);
      this.emit('monitoring:initialized', { success: false, error: error.message });
      throw error;
    }
  }

  /**
   * Start monitoring
   */
  startMonitoring(metricsInterval: number = 5000, healthCheckInterval: number = 30000): void {
    // Stop any existing monitoring
    this.stopMonitoring();
    
    // Start metrics collection
    this.metricsInterval = setInterval(async () => {
      try {
        const metrics = await this.collectSystemMetrics();
        this.lastMetrics = metrics;
        this.emit('monitoring:metrics', metrics);
      } catch (error) {
        console.error('Error collecting system metrics:', error);
      }
    }, metricsInterval) as unknown as number;
    
    // Start health checks
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.checkHealth();
      } catch (error) {
        console.error('Error performing health check:', error);
      }
    }, healthCheckInterval) as unknown as number;
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.metricsInterval !== null) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    
    if (this.healthCheckInterval !== null) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Collect system resource metrics
   */
  async collectSystemMetrics(): Promise<SystemResourceMetrics> {
    // CPU usage
    const cpus = os.cpus();
    const cpuCount = cpus.length;
    
    // Calculate CPU usage based on average of all cores
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach((cpu: any) => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    });
    
    const idlePercent = totalIdle / totalTick;
    const cpuUsage = 100 - (idlePercent * 100);
    
    // Memory usage
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;
    
    // Disk usage (this is a simplified version, in a real app you'd use a library like diskusage)
    // For now, we'll use placeholder values
    const diskTotal = 1000 * 1024 * 1024 * 1024; // 1TB in bytes
    const diskUsed = 250 * 1024 * 1024 * 1024;  // 250GB in bytes
    const diskUsagePercent = (diskUsed / diskTotal) * 100;
    
    // Network usage (simplified, in a real app you'd track this over time)
    // For now, we'll use placeholder values or values from previous metrics
    const networkRxKBps = this.lastMetrics?.networkRxKBps || 0;
    const networkTxKBps = this.lastMetrics?.networkTxKBps || 0;
    
    const metrics: SystemResourceMetrics = {
      cpuUsage,
      cpuUsagePercent: cpuUsage,
      memoryUsage: usedMemory,
      memoryTotal: totalMemory,
      memoryUsagePercent,
      memoryUsedMB: Math.round(usedMemory / (1024 * 1024)),
      memoryTotalMB: Math.round(totalMemory / (1024 * 1024)),
      diskUsage: diskUsed,
      diskTotal: diskTotal,
      diskUsagePercent,
      diskUsedGB: Math.round(diskUsed / (1024 * 1024 * 1024)),
      diskTotalGB: Math.round(diskTotal / (1024 * 1024 * 1024)),
      networkRxKBps,
      networkTxKBps,
      timestamp: Date.now()
    };
    
    return metrics;
  }

  /**
   * Check system health
   */
  async checkHealth(): Promise<Map<string, HealthCheckResult>> {
    const timestamp = Date.now();
    
    // Check Docker health
    try {
      const dockerInfo = await dockerClient.getInfo();
      this.healthStatus.set('docker', {
        componentId: 'docker',
        componentName: 'Docker',
        status: HealthStatus.HEALTHY,
        details: {
          version: dockerInfo.ServerVersion,
          containers: dockerInfo.Containers.toString(),
          running: dockerInfo.ContainersRunning.toString()
        },
        timestamp
      });
    } catch (error: any) {
      this.healthStatus.set('docker', {
        componentId: 'docker',
        componentName: 'Docker',
        status: HealthStatus.UNHEALTHY,
        message: error.message,
        timestamp
      });
    }
    
    // Check Nginx health
    try {
      const nginxStatus = await nginxManager.getStatus();
      this.healthStatus.set('nginx', {
        componentId: 'nginx',
        componentName: 'Nginx',
        status: nginxStatus.running ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
        details: {
          version: nginxStatus.version,
          running: nginxStatus.running.toString()
        },
        timestamp
      });
    } catch (error: any) {
      this.healthStatus.set('nginx', {
        componentId: 'nginx',
        componentName: 'Nginx',
        status: HealthStatus.UNHEALTHY,
        message: error.message,
        timestamp
      });
    }
    
    // Check configuration service health
    try {
      const config = configService.getConfig();
      this.healthStatus.set('config', {
        componentId: 'config',
        componentName: 'Configuration',
        status: HealthStatus.HEALTHY,
        details: {
          version: config.version
        },
        timestamp
      });
    } catch (error: any) {
      this.healthStatus.set('config', {
        componentId: 'config',
        componentName: 'Configuration',
        status: HealthStatus.UNHEALTHY,
        message: error.message,
        timestamp
      });
    }
    
    // Check system resources
    try {
      const metrics = await this.collectSystemMetrics();
      
      // Determine health status based on resource usage
      let status = HealthStatus.HEALTHY;
      let message = 'System resources are within normal limits';
      
      if (metrics.cpuUsagePercent > 90) {
        status = HealthStatus.DEGRADED;
        message = 'High CPU usage detected';
      }
      
      if (metrics.memoryUsagePercent > 90) {
        status = HealthStatus.DEGRADED;
        message = 'High memory usage detected';
      }
      
      if (metrics.diskUsagePercent > 90) {
        status = HealthStatus.DEGRADED;
        message = 'High disk usage detected';
      }
      
      this.healthStatus.set('system', {
        componentId: 'system',
        componentName: 'System Resources',
        status,
        message,
        details: {
          cpuUsage: `${metrics.cpuUsagePercent.toFixed(1)}%`,
          memoryUsage: `${metrics.memoryUsagePercent.toFixed(1)}%`,
          diskUsage: `${metrics.diskUsagePercent.toFixed(1)}%`
        },
        timestamp
      });
    } catch (error: any) {
      this.healthStatus.set('system', {
        componentId: 'system',
        componentName: 'System Resources',
        status: HealthStatus.UNKNOWN,
        message: error.message,
        timestamp
      });
    }
    
    // Emit health status update
    this.emit('monitoring:health', Array.from(this.healthStatus.values()));
    
    return this.healthStatus;
  }

  /**
   * Get system health status
   */
  getHealthStatus(): HealthCheckResult[] {
    return Array.from(this.healthStatus.values());
  }

  /**
   * Get overall system health
   */
  getOverallHealth(): { status: HealthStatus; components: HealthCheckResult[] } {
    const components = this.getHealthStatus();
    
    // Determine overall status based on component statuses
    let overallStatus = HealthStatus.HEALTHY;
    
    for (const component of components) {
      if (component.status === HealthStatus.UNHEALTHY) {
        overallStatus = HealthStatus.UNHEALTHY;
        break;
      } else if (component.status === HealthStatus.DEGRADED) {
        overallStatus = HealthStatus.DEGRADED;
      }
    }
    
    return {
      status: overallStatus,
      components
    };
  }

  /**
   * Get latest system metrics
   */
  getLatestMetrics(): SystemResourceMetrics | null {
    return this.lastMetrics;
  }
}

// Export a singleton instance
export const monitoringService = new MonitoringService();