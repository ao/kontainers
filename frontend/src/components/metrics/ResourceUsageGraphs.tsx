import React, { useState, useEffect } from 'react';
import { useMetricsStore } from '../../stores/metricsStore';

interface ResourceUsageGraphsProps {
  refreshInterval?: number; // in milliseconds
  timeRange?: string; // e.g., '1h', '24h', '7d'
}

export const ResourceUsageGraphs: React.FC<ResourceUsageGraphsProps> = ({
  refreshInterval = 30000, // default to 30 seconds
  timeRange = '1h' // default to 1 hour
}) => {
  const { getResourceMetrics } = useMetricsStore();
  const [metrics, setMetrics] = useState<any>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>(timeRange);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Function to fetch resource metrics
  const fetchResourceMetrics = async () => {
    try {
      setIsLoading(true);
      const data = await getResourceMetrics(selectedTimeRange);
      setMetrics(data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch resource metrics');
      console.error('Error fetching resource metrics:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch data on component mount and at regular intervals
  useEffect(() => {
    fetchResourceMetrics();
    
    // Set up interval for refreshing data
    const intervalId = setInterval(fetchResourceMetrics, refreshInterval);
    
    // Clean up interval on component unmount
    return () => clearInterval(intervalId);
  }, [selectedTimeRange, refreshInterval]);

  // Helper function to format memory
  const formatMemory = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Helper function to format date for x-axis
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Helper function to get max value from array
  const getMaxValue = (data: number[]): number => {
    return Math.max(...data) * 1.1; // Add 10% padding
  };

  // Helper function to generate SVG path for a line chart
  const generateLinePath = (data: number[], maxValue: number, width: number, height: number): string => {
    if (data.length === 0) return '';
    
    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - (value / maxValue) * height;
      return `${x},${y}`;
    });
    
    return `M${points.join(' L')}`;
  };

  // Helper function to generate SVG area path for a line chart
  const generateAreaPath = (data: number[], maxValue: number, width: number, height: number): string => {
    if (data.length === 0) return '';
    
    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - (value / maxValue) * height;
      return `${x},${y}`;
    });
    
    return `M0,${height} L${points.join(' L')} L${width},${height} Z`;
  };

  if (isLoading && !metrics) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium">Error loading resource metrics</h3>
            <p className="mt-2 text-sm">{error}</p>
            <div className="mt-4">
              <button
                type="button"
                onClick={fetchResourceMetrics}
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
        <h2 className="text-xl font-semibold">Resource Usage Graphs</h2>
        <div className="flex items-center space-x-4">
          <div>
            <label htmlFor="timeRange" className="block text-sm font-medium text-gray-700 mr-2">
              Time Range:
            </label>
            <select
              id="timeRange"
              value={selectedTimeRange}
              onChange={(e) => setSelectedTimeRange(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            >
              <option value="1h">Last hour</option>
              <option value="6h">Last 6 hours</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </div>
          <button
            onClick={fetchResourceMetrics}
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

      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* CPU Usage Graph */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-lg font-medium mb-4">CPU Usage</h3>
            <div className="h-64 relative">
              <svg className="w-full h-full" viewBox={`0 0 800 300`} preserveAspectRatio="none">
                {/* Grid lines */}
                <g className="grid">
                  {[0, 25, 50, 75, 100].map((tick, i) => (
                    <g key={i}>
                      <line
                        x1="0"
                        y1={300 - (tick / 100) * 300}
                        x2="800"
                        y2={300 - (tick / 100) * 300}
                        stroke="#e5e7eb"
                        strokeWidth="1"
                      />
                      <text
                        x="5"
                        y={300 - (tick / 100) * 300 - 5}
                        fontSize="12"
                        fill="#6b7280"
                      >
                        {tick}%
                      </text>
                    </g>
                  ))}
                </g>
                
                {/* CPU Usage Area */}
                <path
                  d={generateAreaPath(metrics.cpu.usage, 100, 800, 300)}
                  fill="rgba(59, 130, 246, 0.2)"
                />
                
                {/* CPU Usage Line */}
                <path
                  d={generateLinePath(metrics.cpu.usage, 100, 800, 300)}
                  stroke="#3b82f6"
                  strokeWidth="2"
                  fill="none"
                />
                
                {/* Data points */}
                {metrics.cpu.usage.map((value: number, index: number) => {
                  const x = (index / (metrics.cpu.usage.length - 1)) * 800;
                  const y = 300 - (value / 100) * 300;
                  return (
                    <circle
                      key={index}
                      cx={x}
                      cy={y}
                      r="3"
                      fill="#3b82f6"
                    />
                  );
                })}
              </svg>
              
              {/* X-axis labels */}
              <div className="flex justify-between mt-2 text-xs text-gray-500">
                {metrics.timestamps.filter((_: any, i: number) => i % Math.ceil(metrics.timestamps.length / 5) === 0 || i === metrics.timestamps.length - 1).map((timestamp: number, i: number) => (
                  <div key={i}>{formatDate(timestamp)}</div>
                ))}
              </div>
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <div>
                <span className="font-medium">Current:</span> {metrics.cpu.usage[metrics.cpu.usage.length - 1].toFixed(1)}%
              </div>
              <div>
                <span className="font-medium">Average:</span> {(metrics.cpu.usage.reduce((a: number, b: number) => a + b, 0) / metrics.cpu.usage.length).toFixed(1)}%
              </div>
              <div>
                <span className="font-medium">Max:</span> {Math.max(...metrics.cpu.usage).toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Memory Usage Graph */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-lg font-medium mb-4">Memory Usage</h3>
            <div className="h-64 relative">
              <svg className="w-full h-full" viewBox={`0 0 800 300`} preserveAspectRatio="none">
                {/* Grid lines */}
                <g className="grid">
                  {[0, 25, 50, 75, 100].map((tick, i) => (
                    <g key={i}>
                      <line
                        x1="0"
                        y1={300 - (tick / 100) * 300}
                        x2="800"
                        y2={300 - (tick / 100) * 300}
                        stroke="#e5e7eb"
                        strokeWidth="1"
                      />
                      <text
                        x="5"
                        y={300 - (tick / 100) * 300 - 5}
                        fontSize="12"
                        fill="#6b7280"
                      >
                        {tick}%
                      </text>
                    </g>
                  ))}
                </g>
                
                {/* Memory Usage Area */}
                <path
                  d={generateAreaPath(metrics.memory.usagePercent, 100, 800, 300)}
                  fill="rgba(16, 185, 129, 0.2)"
                />
                
                {/* Memory Usage Line */}
                <path
                  d={generateLinePath(metrics.memory.usagePercent, 100, 800, 300)}
                  stroke="#10b981"
                  strokeWidth="2"
                  fill="none"
                />
                
                {/* Data points */}
                {metrics.memory.usagePercent.map((value: number, index: number) => {
                  const x = (index / (metrics.memory.usagePercent.length - 1)) * 800;
                  const y = 300 - (value / 100) * 300;
                  return (
                    <circle
                      key={index}
                      cx={x}
                      cy={y}
                      r="3"
                      fill="#10b981"
                    />
                  );
                })}
              </svg>
              
              {/* X-axis labels */}
              <div className="flex justify-between mt-2 text-xs text-gray-500">
                {metrics.timestamps.filter((_: any, i: number) => i % Math.ceil(metrics.timestamps.length / 5) === 0 || i === metrics.timestamps.length - 1).map((timestamp: number, i: number) => (
                  <div key={i}>{formatDate(timestamp)}</div>
                ))}
              </div>
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <div>
                <span className="font-medium">Current:</span> {formatMemory(metrics.memory.usage[metrics.memory.usage.length - 1])}
              </div>
              <div>
                <span className="font-medium">Total:</span> {formatMemory(metrics.memory.total)}
              </div>
              <div>
                <span className="font-medium">Max Used:</span> {formatMemory(Math.max(...metrics.memory.usage))}
              </div>
            </div>
          </div>

          {/* Disk I/O Graph */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-lg font-medium mb-4">Disk I/O</h3>
            <div className="h-64 relative">
              <svg className="w-full h-full" viewBox={`0 0 800 300`} preserveAspectRatio="none">
                {/* Grid lines */}
                <g className="grid">
                  {[0, 25, 50, 75, 100].map((tick, i) => (
                    <g key={i}>
                      <line
                        x1="0"
                        y1={300 - (tick / 100) * 300}
                        x2="800"
                        y2={300 - (tick / 100) * 300}
                        stroke="#e5e7eb"
                        strokeWidth="1"
                      />
                      <text
                        x="5"
                        y={300 - (tick / 100) * 300 - 5}
                        fontSize="12"
                        fill="#6b7280"
                      >
                        {(tick / 100 * getMaxValue(metrics.disk.readBytes.concat(metrics.disk.writeBytes))).toFixed(0)} MB/s
                      </text>
                    </g>
                  ))}
                </g>
                
                {/* Read I/O Line */}
                <path
                  d={generateLinePath(
                    metrics.disk.readBytes,
                    getMaxValue(metrics.disk.readBytes.concat(metrics.disk.writeBytes)),
                    800,
                    300
                  )}
                  stroke="#3b82f6"
                  strokeWidth="2"
                  fill="none"
                />
                
                {/* Write I/O Line */}
                <path
                  d={generateLinePath(
                    metrics.disk.writeBytes,
                    getMaxValue(metrics.disk.readBytes.concat(metrics.disk.writeBytes)),
                    800,
                    300
                  )}
                  stroke="#ef4444"
                  strokeWidth="2"
                  fill="none"
                />
                
                {/* Legend */}
                <g transform="translate(650, 20)">
                  <rect x="0" y="0" width="15" height="15" fill="#3b82f6" />
                  <text x="20" y="12" fontSize="12" fill="#6b7280">Read</text>
                  <rect x="0" y="20" width="15" height="15" fill="#ef4444" />
                  <text x="20" y="32" fontSize="12" fill="#6b7280">Write</text>
                </g>
              </svg>
              
              {/* X-axis labels */}
              <div className="flex justify-between mt-2 text-xs text-gray-500">
                {metrics.timestamps.filter((_: any, i: number) => i % Math.ceil(metrics.timestamps.length / 5) === 0 || i === metrics.timestamps.length - 1).map((timestamp: number, i: number) => (
                  <div key={i}>{formatDate(timestamp)}</div>
                ))}
              </div>
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <div>
                <span className="font-medium">Current Read:</span> {formatMemory(metrics.disk.readBytes[metrics.disk.readBytes.length - 1])}/s
              </div>
              <div>
                <span className="font-medium">Current Write:</span> {formatMemory(metrics.disk.writeBytes[metrics.disk.writeBytes.length - 1])}/s
              </div>
            </div>
          </div>

          {/* Network Traffic Graph */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-lg font-medium mb-4">Network Traffic</h3>
            <div className="h-64 relative">
              <svg className="w-full h-full" viewBox={`0 0 800 300`} preserveAspectRatio="none">
                {/* Grid lines */}
                <g className="grid">
                  {[0, 25, 50, 75, 100].map((tick, i) => (
                    <g key={i}>
                      <line
                        x1="0"
                        y1={300 - (tick / 100) * 300}
                        x2="800"
                        y2={300 - (tick / 100) * 300}
                        stroke="#e5e7eb"
                        strokeWidth="1"
                      />
                      <text
                        x="5"
                        y={300 - (tick / 100) * 300 - 5}
                        fontSize="12"
                        fill="#6b7280"
                      >
                        {(tick / 100 * getMaxValue(metrics.network.received.concat(metrics.network.sent))).toFixed(0)} MB/s
                      </text>
                    </g>
                  ))}
                </g>
                
                {/* Received Traffic Line */}
                <path
                  d={generateLinePath(
                    metrics.network.received,
                    getMaxValue(metrics.network.received.concat(metrics.network.sent)),
                    800,
                    300
                  )}
                  stroke="#8b5cf6"
                  strokeWidth="2"
                  fill="none"
                />
                
                {/* Sent Traffic Line */}
                <path
                  d={generateLinePath(
                    metrics.network.sent,
                    getMaxValue(metrics.network.received.concat(metrics.network.sent)),
                    800,
                    300
                  )}
                  stroke="#f59e0b"
                  strokeWidth="2"
                  fill="none"
                />
                
                {/* Legend */}
                <g transform="translate(650, 20)">
                  <rect x="0" y="0" width="15" height="15" fill="#8b5cf6" />
                  <text x="20" y="12" fontSize="12" fill="#6b7280">Received</text>
                  <rect x="0" y="20" width="15" height="15" fill="#f59e0b" />
                  <text x="20" y="32" fontSize="12" fill="#6b7280">Sent</text>
                </g>
              </svg>
              
              {/* X-axis labels */}
              <div className="flex justify-between mt-2 text-xs text-gray-500">
                {metrics.timestamps.filter((_: any, i: number) => i % Math.ceil(metrics.timestamps.length / 5) === 0 || i === metrics.timestamps.length - 1).map((timestamp: number, i: number) => (
                  <div key={i}>{formatDate(timestamp)}</div>
                ))}
              </div>
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <div>
                <span className="font-medium">Current Received:</span> {formatMemory(metrics.network.received[metrics.network.received.length - 1])}/s
              </div>
              <div>
                <span className="font-medium">Current Sent:</span> {formatMemory(metrics.network.sent[metrics.network.sent.length - 1])}/s
              </div>
            </div>
          </div>
        </div>
      )}

      {metrics && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-medium mb-4">Container Resource Usage</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Container
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    CPU Usage
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Memory Usage
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Disk Read/Write
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Network In/Out
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {metrics.containers.map((container: any, index: number) => (
                  <tr key={container.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{container.name}</div>
                      <div className="text-sm text-gray-500">{container.id.substring(0, 12)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-full bg-gray-200 rounded-full h-2.5 mr-2">
                          <div 
                            className={`h-2.5 rounded-full ${
                              container.cpu.percent > 90 ? 'bg-red-500' :
                              container.cpu.percent > 70 ? 'bg-yellow-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${container.cpu.percent}%` }}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-500">{container.cpu.percent.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-full bg-gray-200 rounded-full h-2.5 mr-2">
                          <div 
                            className={`h-2.5 rounded-full ${
                              container.memory.percent > 90 ? 'bg-red-500' :
                              container.memory.percent > 70 ? 'bg-yellow-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${container.memory.percent}%` }}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-500">
                          {formatMemory(container.memory.used)} / {formatMemory(container.memory.limit)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div>Read: {formatMemory(container.disk.read)}/s</div>
                      <div>Write: {formatMemory(container.disk.write)}/s</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div>In: {formatMemory(container.network.rx)}/s</div>
                      <div>Out: {formatMemory(container.network.tx)}/s</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};