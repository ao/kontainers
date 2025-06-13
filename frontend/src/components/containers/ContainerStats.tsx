import React, { useState, useEffect } from 'react';
import { DetailedContainerStats, HealthStatus } from '../../../shared/src/models';
import Card from '../common/Card';
import LoadingIndicator from '../common/LoadingIndicator';
import { useQuery } from '@tanstack/react-query';
import { fetchDetailedContainerStats } from '../../services/containerService';

interface ContainerStatsProps {
  stats?: DetailedContainerStats;
  isLoading?: boolean;
  containerId: string;
}

const ContainerStats: React.FC<ContainerStatsProps> = ({ 
  stats: initialStats, 
  isLoading: initialLoading,
  containerId 
}) => {
  const [historicalData, setHistoricalData] = useState<{
    cpu: { timestamp: number; value: number }[];
    memory: { timestamp: number; value: number }[];
    network: { timestamp: number; rx: number; tx: number }[];
    disk: { timestamp: number; read: number; write: number }[];
  }>({
    cpu: [],
    memory: [],
    network: [],
    disk: []
  });

  // Use the provided stats or fetch them if not provided
  const { 
    data: stats, 
    isLoading,
    refetch
  } = useQuery<DetailedContainerStats>({
    queryKey: ['containerDetailedStats', containerId],
    queryFn: () => fetchDetailedContainerStats(containerId),
    enabled: !initialStats,
    refetchInterval: 5000, // Refresh every 5 seconds
    initialData: initialStats,
  });

  // Update historical data when stats change
  useEffect(() => {
    if (stats) {
      const now = Date.now();
      
      setHistoricalData(prev => {
        // Keep only the last 60 data points (5 minutes at 5-second intervals)
        const maxDataPoints = 60;
        
        // Add new data points
        const newCpu = [...prev.cpu, { timestamp: now, value: stats.cpuUsage }];
        const newMemory = [...prev.memory, { timestamp: now, value: stats.memoryUsagePercentage || 0 }];
        const newNetwork = [...prev.network, { timestamp: now, rx: stats.networkRx, tx: stats.networkTx }];
        const newDisk = [...prev.disk, { timestamp: now, read: stats.blockRead, write: stats.blockWrite }];
        
        // Trim to keep only the last maxDataPoints
        return {
          cpu: newCpu.slice(-maxDataPoints),
          memory: newMemory.slice(-maxDataPoints),
          network: newNetwork.slice(-maxDataPoints),
          disk: newDisk.slice(-maxDataPoints)
        };
      });
    }
  }, [stats]);

  const loading = initialLoading || isLoading;

  if (loading) {
    return <LoadingIndicator text="Loading container statistics..." />;
  }

  if (!stats) {
    return <div className="text-center py-4 text-gray-500">No statistics available</div>;
  }

  // Format bytes to human-readable format
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Get health status color
  const getHealthStatusColor = (status: HealthStatus) => {
    switch (status) {
      case HealthStatus.HEALTHY:
        return 'text-green-500';
      case HealthStatus.DEGRADED:
        return 'text-yellow-500';
      case HealthStatus.UNHEALTHY:
        return 'text-red-500';
      case HealthStatus.STARTING:
        return 'text-blue-500';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPU Usage */}
        <Card>
          <div className="flex flex-col">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wider">CPU Usage</div>
            <div className="mt-2 flex items-baseline">
              <div className="text-3xl font-semibold">{stats.cpuUsage.toFixed(2)}%</div>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              <span>Kernel: {stats.cpuKernelUsage.toFixed(2)}%</span>
              <span className="ml-2">User: {stats.cpuUserUsage.toFixed(2)}%</span>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              <span>System: {stats.cpuSystemUsage.toFixed(2)}%</span>
              <span className="ml-2">CPUs: {stats.cpuOnlineCpus}</span>
            </div>
          </div>
        </Card>

        {/* Memory Usage */}
        <Card>
          <div className="flex flex-col">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wider">Memory Usage</div>
            <div className="mt-2 flex items-baseline">
              <div className="text-3xl font-semibold">{(stats.memoryUsagePercentage || 0).toFixed(2)}%</div>
              <div className="ml-2 text-sm text-gray-500">
                {formatBytes(stats.memoryUsage)} / {formatBytes(stats.memoryLimit)}
              </div>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              <span>Cache: {formatBytes(stats.memoryCache)}</span>
              <span className="ml-2">Swap: {formatBytes(stats.memorySwap)} / {formatBytes(stats.memorySwapLimit)}</span>
            </div>
          </div>
        </Card>

        {/* Network Usage */}
        <Card>
          <div className="flex flex-col">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wider">Network I/O</div>
            <div className="mt-2 flex items-baseline">
              <div className="text-3xl font-semibold">{formatBytes(stats.networkThroughput || 0)}/s</div>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              <span>Rx: {formatBytes(stats.networkRx)}</span>
              <span className="ml-2">Tx: {formatBytes(stats.networkTx)}</span>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              <span>Packets Rx: {stats.networkPacketsRx}</span>
              <span className="ml-2">Tx: {stats.networkPacketsTx}</span>
            </div>
          </div>
        </Card>

        {/* Disk Usage */}
        <Card>
          <div className="flex flex-col">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wider">Block I/O</div>
            <div className="mt-2 flex items-baseline">
              <div className="text-3xl font-semibold">{formatBytes(stats.blockThroughput || 0)}/s</div>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              <span>Read: {formatBytes(stats.blockRead)}</span>
              <span className="ml-2">Write: {formatBytes(stats.blockWrite)}</span>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              <span>Read Ops: {stats.blockReadOps}</span>
              <span className="ml-2">Write Ops: {stats.blockWriteOps}</span>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Health Status */}
        <Card title="Health Status">
          <div className="flex items-center">
            <div className={`text-xl font-semibold ${getHealthStatusColor(stats.healthStatus)}`}>
              {stats.healthStatus}
            </div>
            <div className="ml-4 text-sm text-gray-500">
              <div>PIDs: {stats.pids}</div>
              <div>Restart Count: {stats.restartCount}</div>
            </div>
          </div>
          {stats.healthCheckLogs && stats.healthCheckLogs.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700">Health Check Logs</h4>
              <div className="mt-2 bg-gray-50 p-2 rounded-md max-h-40 overflow-y-auto">
                {stats.healthCheckLogs.map((log, index) => (
                  <div key={index} className="text-xs font-mono whitespace-pre-wrap">{log}</div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Charts */}
        <Card title="Resource Usage Over Time">
          <div className="text-center py-4 text-gray-500 italic">
            Charts would be displayed here using a library like Chart.js or Recharts
          </div>
        </Card>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => refetch()}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Refresh Stats
        </button>
      </div>
    </div>
  );
};

export default ContainerStats;