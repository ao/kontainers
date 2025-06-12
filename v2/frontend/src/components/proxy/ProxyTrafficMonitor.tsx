import React, { useState, useEffect } from 'react';
import { useProxyStore } from '../../stores/proxyStore';
import { ProxyTrafficSummary } from '../../../shared/src/models';

interface ProxyTrafficMonitorProps {
  refreshInterval?: number; // in milliseconds
}

export const ProxyTrafficMonitor: React.FC<ProxyTrafficMonitorProps> = ({
  refreshInterval = 10000 // default to 10 seconds
}) => {
  const { getProxyTrafficData } = useProxyStore();
  const [trafficData, setTrafficData] = useState<Record<string, ProxyTrafficSummary>>({});
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('1h');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Function to format bytes into human-readable format
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Function to get color based on status code
  const getStatusCodeColor = (code: number): string => {
    if (code < 300) return 'bg-green-100 text-green-800';
    if (code < 400) return 'bg-blue-100 text-blue-800';
    if (code < 500) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  // Function to get bar color based on status code
  const getStatusCodeBarColor = (code: number): string => {
    if (code < 300) return 'bg-green-500';
    if (code < 400) return 'bg-blue-500';
    if (code < 500) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  // Function to get label based on status code
  const getStatusCodeLabel = (code: number): string => {
    if (code < 300) return 'Success';
    if (code < 400) return 'Redirect';
    if (code < 500) return 'Client Error';
    return 'Server Error';
  };

  // Function to fetch traffic data
  const fetchTrafficData = async () => {
    try {
      setIsLoading(true);
      const data = await getProxyTrafficData(selectedTimeframe);
      setTrafficData(data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch traffic data');
      console.error('Error fetching traffic data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch data on component mount and when timeframe changes
  useEffect(() => {
    fetchTrafficData();
    
    // Set up interval for refreshing data
    const intervalId = setInterval(fetchTrafficData, refreshInterval);
    
    // Clean up interval on component unmount
    return () => clearInterval(intervalId);
  }, [selectedTimeframe, refreshInterval]);

  // Calculate total requests and responses across all proxy rules
  const totalRequests = Object.values(trafficData).reduce(
    (sum, data) => sum + data.totalRequests, 
    0
  );
  
  const totalResponses = Object.values(trafficData).reduce(
    (sum, data) => sum + data.totalResponses, 
    0
  );
  
  const avgResponseTime = Object.values(trafficData).reduce(
    (sum, data) => sum + data.avgResponseTime, 
    0
  ) / (Object.values(trafficData).length || 1);
  
  const totalDataTransferred = Object.values(trafficData).reduce(
    (sum, data) => sum + data.bytesTransferred, 
    0
  );

  // Aggregate status codes across all proxy rules
  const statusCodeDistribution: Record<string, number> = {};
  Object.values(trafficData).forEach(data => {
    Object.entries(data.statusCodeDistribution).forEach(([code, count]) => {
      statusCodeDistribution[code] = (statusCodeDistribution[code] || 0) + count;
    });
  });

  // Aggregate request methods across all proxy rules
  const methodDistribution: Record<string, number> = {};
  Object.values(trafficData).forEach(data => {
    Object.entries(data.methodDistribution).forEach(([method, count]) => {
      methodDistribution[method] = (methodDistribution[method] || 0) + count;
    });
  });

  // Get top paths across all proxy rules
  const allPaths: [string, number][] = [];
  Object.values(trafficData).forEach(data => {
    data.topPaths.forEach(([path, count]) => {
      const existingPath = allPaths.find(([p]) => p === path);
      if (existingPath) {
        existingPath[1] += count;
      } else {
        allPaths.push([path, count]);
      }
    });
  });
  
  const topPaths = allPaths
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Get top client IPs across all proxy rules
  const allClientIps: [string, number][] = [];
  Object.values(trafficData).forEach(data => {
    data.topClientIps.forEach(([ip, count]) => {
      const existingIp = allClientIps.find(([i]) => i === ip);
      if (existingIp) {
        existingIp[1] += count;
      } else {
        allClientIps.push([ip, count]);
      }
    });
  });
  
  const topClientIps = allClientIps
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (isLoading && Object.keys(trafficData).length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error && Object.keys(trafficData).length === 0) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium">Error loading traffic data</h3>
            <p className="mt-2 text-sm">{error}</p>
            <div className="mt-4">
              <button
                type="button"
                onClick={fetchTrafficData}
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
        <h2 className="text-xl font-semibold">Proxy Traffic Monitor</h2>
        <div className="flex items-center space-x-4">
          <div>
            <label htmlFor="timeframe" className="block text-sm font-medium text-gray-700 mr-2">
              Timeframe:
            </label>
            <select
              id="timeframe"
              value={selectedTimeframe}
              onChange={(e) => setSelectedTimeframe(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            >
              <option value="15m">Last 15 minutes</option>
              <option value="1h">Last hour</option>
              <option value="6h">Last 6 hours</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
            </select>
          </div>
          <button
            onClick={fetchTrafficData}
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white shadow rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-500">Total Requests</h4>
          <p className="text-2xl font-bold">{totalRequests.toLocaleString()}</p>
        </div>
        <div className="bg-white shadow rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-500">Total Responses</h4>
          <p className="text-2xl font-bold">{totalResponses.toLocaleString()}</p>
        </div>
        <div className="bg-white shadow rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-500">Avg Response Time</h4>
          <p className="text-2xl font-bold">{avgResponseTime.toFixed(2)} ms</p>
        </div>
        <div className="bg-white shadow rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-500">Data Transferred</h4>
          <p className="text-2xl font-bold">{formatBytes(totalDataTransferred)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-medium mb-4">Status Code Distribution</h3>
          <div className="bg-gray-50 p-4 rounded-md">
            <div className="space-y-2">
              {Object.entries(statusCodeDistribution)
                .sort(([a], [b]) => parseInt(a) - parseInt(b))
                .map(([code, count]) => (
                  <div key={code} className="flex items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-2 ${getStatusCodeColor(parseInt(code))}`}>
                      {code.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">{getStatusCodeLabel(parseInt(code))}</span>
                        <span className="text-sm text-gray-500">
                          {count.toLocaleString()} ({((count / totalResponses) * 100).toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`${getStatusCodeBarColor(parseInt(code))} h-2 rounded-full`}
                          style={{ width: `${(count / totalResponses) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium mb-4">Request Method Distribution</h3>
          <div className="bg-gray-50 p-4 rounded-md">
            <div className="space-y-2">
              {Object.entries(methodDistribution)
                .sort(([, a], [, b]) => b - a)
                .map(([method, count]) => (
                  <div key={method} className="flex items-center">
                    <div className="w-16 text-xs font-medium text-center bg-blue-100 text-blue-800 py-1 px-2 rounded mr-2">
                      {method}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">{method}</span>
                        <span className="text-sm text-gray-500">
                          {count.toLocaleString()} ({((count / totalRequests) * 100).toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{ width: `${(count / totalRequests) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-medium mb-4">Top Paths</h3>
          <div className="bg-gray-50 p-4 rounded-md overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Path</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Hits</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">%</th>
                </tr>
              </thead>
              <tbody>
                {topPaths.map(([path, count], index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-2 text-sm font-mono truncate max-w-xs">{path}</td>
                    <td className="px-4 py-2 text-sm">{count.toLocaleString()}</td>
                    <td className="px-4 py-2 text-sm">
                      {((count / totalRequests) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium mb-4">Top Client IPs</h3>
          <div className="bg-gray-50 p-4 rounded-md overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">IP Address</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Requests</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">%</th>
                </tr>
              </thead>
              <tbody>
                {topClientIps.map(([ip, count], index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-2 text-sm font-mono">{ip}</td>
                    <td className="px-4 py-2 text-sm">{count.toLocaleString()}</td>
                    <td className="px-4 py-2 text-sm">
                      {((count / totalRequests) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-4">Traffic by Proxy Rule</h3>
        <div className="bg-gray-50 p-4 rounded-md overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rule Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Requests</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Responses</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Avg Response Time</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data Transferred</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Success Rate</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(trafficData).map(([ruleId, data], index) => {
                const successCount = Object.entries(data.statusCodeDistribution)
                  .filter(([code]) => parseInt(code) < 400)
                  .reduce((sum, [, count]) => sum + count, 0);
                
                const successRate = data.totalResponses > 0 
                  ? (successCount / data.totalResponses) * 100 
                  : 100;
                
                return (
                  <tr key={ruleId} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-2 text-sm font-medium">{data.ruleName}</td>
                    <td className="px-4 py-2 text-sm">{data.totalRequests.toLocaleString()}</td>
                    <td className="px-4 py-2 text-sm">{data.totalResponses.toLocaleString()}</td>
                    <td className="px-4 py-2 text-sm">{data.avgResponseTime.toFixed(2)} ms</td>
                    <td className="px-4 py-2 text-sm">{formatBytes(data.bytesTransferred)}</td>
                    <td className="px-4 py-2 text-sm">
                      <div className="flex items-center">
                        <div className="w-full bg-gray-200 rounded-full h-2 mr-2 max-w-[100px]">
                          <div
                            className={`h-2 rounded-full ${
                              successRate > 95 ? 'bg-green-500' : 
                              successRate > 90 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${successRate}%` }}
                          ></div>
                        </div>
                        <span>{successRate.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {Object.keys(trafficData).length === 0 && !isLoading && (
        <div className="text-center py-8">
          <p className="text-gray-500">No traffic data available.</p>
        </div>
      )}
    </div>
  );
};