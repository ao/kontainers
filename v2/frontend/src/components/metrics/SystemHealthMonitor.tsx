import React, { useState, useEffect } from 'react';
import { useMetricsStore } from '../../stores/metricsStore';

interface SystemHealthMonitorProps {
  refreshInterval?: number; // in milliseconds
}

export const SystemHealthMonitor: React.FC<SystemHealthMonitorProps> = ({
  refreshInterval = 10000 // default to 10 seconds
}) => {
  const { getSystemHealth } = useMetricsStore();
  const [healthData, setHealthData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Function to fetch health data
  const fetchHealthData = async () => {
    try {
      setIsLoading(true);
      const data = await getSystemHealth();
      setHealthData(data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch system health data');
      console.error('Error fetching system health data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch data on component mount and at regular intervals
  useEffect(() => {
    fetchHealthData();
    
    // Set up interval for refreshing data
    const intervalId = setInterval(fetchHealthData, refreshInterval);
    
    // Clean up interval on component unmount
    return () => clearInterval(intervalId);
  }, [refreshInterval]);

  // Helper function to determine status color
  const getStatusColor = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'healthy':
      case 'ok':
      case 'good':
      case 'normal':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'warning':
      case 'degraded':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'critical':
      case 'error':
      case 'unhealthy':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Helper function to determine status icon
  const getStatusIcon = (status: string): JSX.Element => {
    switch (status.toLowerCase()) {
      case 'healthy':
      case 'ok':
      case 'good':
      case 'normal':
        return (
          <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'warning':
      case 'degraded':
        return (
          <svg className="h-5 w-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case 'critical':
      case 'error':
      case 'unhealthy':
        return (
          <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      default:
        return (
          <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  // Helper function to format uptime
  const formatUptime = (uptimeSeconds: number): string => {
    const days = Math.floor(uptimeSeconds / (24 * 60 * 60));
    const hours = Math.floor((uptimeSeconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((uptimeSeconds % (60 * 60)) / 60);
    
    let result = '';
    if (days > 0) result += `${days}d `;
    if (hours > 0 || days > 0) result += `${hours}h `;
    result += `${minutes}m`;
    
    return result;
  };

  // Helper function to format memory
  const formatMemory = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  if (isLoading && !healthData) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error && !healthData) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium">Error loading system health data</h3>
            <p className="mt-2 text-sm">{error}</p>
            <div className="mt-4">
              <button
                type="button"
                onClick={fetchHealthData}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">System Health Monitor</h2>
        <div className="flex items-center">
          <button
            onClick={fetchHealthData}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="absolute inset-0 bg-white bg-opacity-50 flex items-center justify-center z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      )}

      {healthData && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={`rounded-lg shadow p-4 border ${getStatusColor(healthData.status)}`}>
              <div className="flex items-center">
                <div className="flex-shrink-0 mr-3">
                  {getStatusIcon(healthData.status)}
                </div>
                <div>
                  <p className="text-sm font-medium">System Status</p>
                  <p className="text-2xl font-bold">{healthData.status}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm font-medium text-gray-500">Uptime</p>
              <p className="text-2xl font-bold">{formatUptime(healthData.uptime)}</p>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm font-medium text-gray-500">CPU Usage</p>
              <div className="flex items-center">
                <p className="text-2xl font-bold">{healthData.cpu.usagePercent.toFixed(1)}%</p>
                <div className="ml-4 flex-1">
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className={`h-2.5 rounded-full ${
                        healthData.cpu.usagePercent > 90 ? 'bg-red-500' :
                        healthData.cpu.usagePercent > 70 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${healthData.cpu.usagePercent}%` }}
                    ></div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {healthData.cpu.cores} cores / {healthData.cpu.threads} threads
              </p>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm font-medium text-gray-500">Memory Usage</p>
              <div className="flex items-center">
                <p className="text-2xl font-bold">
                  {(healthData.memory.usedPercent).toFixed(1)}%
                </p>
                <div className="ml-4 flex-1">
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className={`h-2.5 rounded-full ${
                        healthData.memory.usedPercent > 90 ? 'bg-red-500' :
                        healthData.memory.usedPercent > 70 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${healthData.memory.usedPercent}%` }}
                    ></div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {formatMemory(healthData.memory.used)} / {formatMemory(healthData.memory.total)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="text-lg font-medium mb-4">Disk Usage</h3>
              <div className="space-y-4">
                {healthData.disks.map((disk: any, index: number) => (
                  <div key={index} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">{disk.mountPoint}</span>
                      <span className="text-sm text-gray-500">
                        {formatMemory(disk.used)} / {formatMemory(disk.total)} ({disk.usedPercent.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${
                          disk.usedPercent > 90 ? 'bg-red-500' :
                          disk.usedPercent > 70 ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${disk.usedPercent}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {disk.fsType} - {disk.device}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="text-lg font-medium mb-4">Network</h3>
              <div className="space-y-4">
                {healthData.network.interfaces.map((iface: any, index: number) => (
                  <div key={index} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">{iface.name}</span>
                      <span className={`text-xs px-2 py-1 rounded-full ${iface.up ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {iface.up ? 'UP' : 'DOWN'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-gray-500">Received</p>
                        <p className="text-sm">{formatMemory(iface.bytesRecv)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Sent</p>
                        <p className="text-sm">{formatMemory(iface.bytesSent)}</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {iface.addrs.map((addr: any) => addr.addr).join(', ')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-lg font-medium mb-4">Services Status</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Service
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Uptime
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Memory
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      CPU
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {healthData.services.map((service: any, index: number) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{service.name}</div>
                        <div className="text-sm text-gray-500">{service.description}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(service.status)}`}>
                          {service.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatUptime(service.uptime)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatMemory(service.memory)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {service.cpu.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-lg font-medium mb-4">System Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Hostname</p>
                <p className="text-sm">{healthData.hostname}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">OS</p>
                <p className="text-sm">{healthData.os.platform} {healthData.os.version}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Kernel</p>
                <p className="text-sm">{healthData.os.kernel}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Architecture</p>
                <p className="text-sm">{healthData.os.arch}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Boot Time</p>
                <p className="text-sm">{new Date(healthData.bootTime).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Load Average</p>
                <p className="text-sm">
                  {healthData.loadAverage.map((load: number) => load.toFixed(2)).join(' / ')}
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};