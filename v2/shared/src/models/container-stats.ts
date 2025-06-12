/**
 * Container statistics models for Kontainers application
 */

import { HealthStatus } from './health';

/**
 * Represents container resource usage statistics.
 */
export interface ContainerStats {
  containerId: string;
  timestamp: number;
  cpuUsage: number;
  memoryUsage: number;
  memoryLimit: number;
  networkRx: number;
  networkTx: number;
  blockRead: number;
  blockWrite: number;
  
  // Calculated properties
  memoryUsagePercentage?: number;
}

/**
 * Represents detailed container resource usage statistics.
 * Extends the basic ContainerStats with additional metrics for enhanced monitoring.
 */
export interface DetailedContainerStats extends Pick<ContainerStats, 
  'containerId' | 'timestamp' | 'cpuUsage' | 'memoryUsage' | 'memoryLimit' | 
  'networkRx' | 'networkTx' | 'blockRead' | 'blockWrite'> {
  
  // Enhanced metrics
  cpuKernelUsage: number;
  cpuUserUsage: number;
  cpuSystemUsage: number;
  cpuOnlineCpus: number;
  memoryCache: number;
  memorySwap: number;
  memorySwapLimit: number;
  networkPacketsRx: number;
  networkPacketsTx: number;
  networkDroppedRx: number;
  networkDroppedTx: number;
  networkErrorsRx: number;
  networkErrorsTx: number;
  blockReadOps: number;
  blockWriteOps: number;
  pids: number;
  restartCount: number;
  healthStatus: HealthStatus;
  healthCheckLogs: string[];
  
  // Calculated properties
  memoryUsagePercentage?: number;
  swapUsagePercentage?: number;
  networkThroughput?: number;
  blockThroughput?: number;
}