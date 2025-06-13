/**
 * Health-related models for Kontainers application
 */

/**
 * Enum representing the health status of a component.
 */
export enum HealthStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNHEALTHY = 'UNHEALTHY',
  UNKNOWN = 'UNKNOWN',
  STARTING = 'STARTING'
}

/**
 * Data class representing a health check result.
 */
export interface HealthCheckResult {
  componentId: string;
  componentName: string;
  status: HealthStatus;
  message?: string;
  details?: Record<string, string>;
  timestamp: number;
}

/**
 * Data class representing system resource metrics.
 */
export interface SystemResourceMetrics {
  cpuUsage: number;
  memoryUsage: number;
  memoryTotal: number;
  diskUsage: number;
  diskTotal: number;
  networkRxKBps: number;
  networkTxKBps: number;
  
  // Additional fields needed by JS components
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  memoryUsedMB: number;
  memoryTotalMB: number;
  diskUsagePercent: number;
  diskUsedGB: number;
  diskTotalGB: number;
  timestamp: number;
}