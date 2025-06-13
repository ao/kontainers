import React, { useState, useEffect } from 'react';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, Cell
} from 'recharts';
import { 
  ProxyTrafficSummary, 
  ProxyErrorSummary,
  ProxyTrafficTimeSeries,
  ProxyRule
} from '../../../shared/src/models';
import { proxyService } from '../../services/proxyService';
import LoadingIndicator from '../common/LoadingIndicator';
import Card from '../common/Card';
import Button from '../common/Button';
import Alert from '../common/Alert';

// Color palette for charts
const COLORS = [
  '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28BFF',
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'
];

interface DomainTrafficDashboardProps {
  ruleId: string;
}

const DomainTrafficDashboard: React.FC<DomainTrafficDashboardProps> = ({ ruleId }) => {
  const [rule, setRule] = useState<ProxyRule | null>(null);
  const [trafficSummary, setTrafficSummary] = useState<ProxyTrafficSummary | null>(null);
  const [errorSummary, setErrorSummary] = useState<ProxyErrorSummary | null>(null);
  const [trafficTimeSeries, setTrafficTimeSeries] = useState<ProxyTrafficTimeSeries | null>(null);
  const [timeRange, setTimeRange] = useState<string>('24h');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<number | null>(null);

  // Fetch data on component mount and when timeRange changes
  useEffect(() => {
    fetchData();
    
    // Set up auto-refresh
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
    
    const interval = window.setInterval(() => {
      fetchData();
    }, 60000); // Refresh every minute
    
    setRefreshInterval(interval);
    
    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [ruleId, timeRange]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch rule details
      const ruleData = await proxyService.getRule(ruleId);
      setRule(ruleData);
      
      // Fetch traffic summary
      const trafficData = await proxyService.getTrafficSummary(ruleId);
      setTrafficSummary(trafficData);
      
      // Fetch error summary
      const errorData = await proxyService.getErrorSummary(ruleId);
      setErrorSummary(errorData);
      
      // Calculate time range for time series
      const endTime = Date.now();
      let startTime = endTime;
      let interval = 3600000; // 1 hour in milliseconds
      
      switch (timeRange) {
        case '1h':
          startTime = endTime - 3600000;
          interval = 60000; // 1 minute
          break;
        case '6h':
          startTime = endTime - 21600000;
          interval = 300000; // 5 minutes
          break;
        case '24h':
          startTime = endTime - 86400000;
          interval = 3600000; // 1 hour
          break;
        case '7d':
          startTime = endTime - 604800000;
          interval = 86400000; // 1 day
          break;
        case '30d':
          startTime = endTime - 2592000000;
          interval = 86400000; // 1 day
          break;
      }
      
      // Fetch traffic time series
      const timeSeriesData = await proxyService.getTrafficTimeSeries(ruleId, startTime, endTime, interval);
      setTrafficTimeSeries(timeSeriesData);
      
      setLoading(false);
    } catch (err: any) {
      setError(`Error fetching traffic data: ${err.message}`);
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const renderTrafficOverview = () => {
    if (!trafficSummary) return null;
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <h3 className="text-lg font-semibold text-gray-700">Total Requests</h3>
          <p className="text-3xl font-bold text-blue-600">{trafficSummary.totalRequests.toLocaleString()}</p>
        </Card>
        
        <Card className="p-4">
          <h3 className="text-lg font-semibold text-gray-700">Avg Response Time</h3>
          <p className="text-3xl font-bold text-green-600">{formatTime(trafficSummary.avgResponseTime)}</p>
        </Card>
        
        <Card className="p-4">
          <h3 className="text-lg font-semibold text-gray-700">Data Transferred</h3>
          <p className="text-3xl font-bold text-purple-600">{formatBytes(trafficSummary.totalBytesSent)}</p>
        </Card>
        
        <Card className="p-4">
          <h3 className="text-lg font-semibold text-gray-700">Error Rate</h3>
          <p className="text-3xl font-bold text-red-600">
            {errorSummary ? `${(errorSummary.errorRate * 100).toFixed(2)}%` : '0.00%'}
          </p>
        </Card>
      </div>
    );
  };

  const renderTrafficChart = () => {
    if (!trafficTimeSeries || trafficTimeSeries.dataPoints.length === 0) {
      return (
        <Card className="p-4 mb-6">
          <h3 className="text-lg font-semibold mb-2">Traffic Over Time</h3>
          <p className="text-gray-500">No traffic data available for the selected time period.</p>
        </Card>
      );
    }
    
    // Format data for chart
    const chartData = trafficTimeSeries.dataPoints.map(point => ({
      time: formatDate(point.timestamp),
      timestamp: point.timestamp,
      requests: point.requestCount,
      responseTime: point.avgResponseTime,
      bytesSent: point.bytesSent / 1024, // Convert to KB for better visualization
    }));
    
    return (
      <Card className="p-4 mb-6">
        <h3 className="text-lg font-semibold mb-2">Traffic Over Time</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="time" 
                tick={{ fontSize: 12 }} 
                tickFormatter={(value, index) => {
                  // Show fewer ticks for better readability
                  if (chartData.length > 24 && index % 3 !== 0) return '';
                  
                  const date = new Date(chartData[index].timestamp);
                  if (timeRange === '1h' || timeRange === '6h') {
                    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  } else if (timeRange === '24h') {
                    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  } else {
                    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                  }
                }}
              />
              <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
              <Tooltip 
                formatter={(value: any, name: string) => {
                  if (name === 'requests') return [value.toLocaleString(), 'Requests'];
                  if (name === 'responseTime') return [formatTime(value), 'Avg Response Time'];
                  if (name === 'bytesSent') return [formatBytes(value * 1024), 'Data Transferred'];
                  return [value, name];
                }}
                labelFormatter={(label) => {
                  const item = chartData.find(d => d.time === label);
                  if (item) {
                    return new Date(item.timestamp).toLocaleString();
                  }
                  return label;
                }}
              />
              <Legend />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="requests" 
                stroke="#0088FE" 
                name="Requests" 
                strokeWidth={2}
                dot={false}
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="responseTime" 
                stroke="#00C49F" 
                name="Response Time (ms)" 
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    );
  };

  const renderStatusCodeDistribution = () => {
    if (!trafficSummary || !trafficSummary.statusCodeDistribution) {
      return null;
    }
    
    const statusData = Object.entries(trafficSummary.statusCodeDistribution)
      .map(([code, count]) => ({
        name: code,
        value: count,
        color: parseInt(code) >= 500 ? '#FF6B6B' : 
               parseInt(code) >= 400 ? '#FFBB28' : 
               parseInt(code) >= 300 ? '#00C49F' : '#0088FE'
      }));
    
    if (statusData.length === 0) {
      return null;
    }
    
    return (
      <Card className="p-4 mb-6">
        <h3 className="text-lg font-semibold mb-2">Status Code Distribution</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={statusData}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip 
                formatter={(value: any) => [value.toLocaleString(), 'Requests']}
              />
              <Legend />
              <Bar dataKey="value" name="Requests">
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    );
  };

  const renderTopPaths = () => {
    if (!trafficSummary || !trafficSummary.topPaths || trafficSummary.topPaths.length === 0) {
      return null;
    }
    
    const pathData = trafficSummary.topPaths.map(([path, count], index) => ({
      name: path.length > 30 ? path.substring(0, 27) + '...' : path,
      fullPath: path,
      value: count,
      color: COLORS[index % COLORS.length]
    }));
    
    return (
      <Card className="p-4 mb-6">
        <h3 className="text-lg font-semibold mb-2">Top Requested Paths</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={pathData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis 
                type="category" 
                dataKey="name" 
                width={150}
                tick={{ fontSize: 12 }}
              />
              <Tooltip 
                formatter={(value: any) => [value.toLocaleString(), 'Requests']}
                labelFormatter={(label) => {
                  const item = pathData.find(d => d.name === label);
                  return item ? item.fullPath : label;
                }}
              />
              <Legend />
              <Bar dataKey="value" name="Requests">
                {pathData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    );
  };

  const renderErrorDistribution = () => {
    if (!errorSummary || !errorSummary.errorsByType || Object.keys(errorSummary.errorsByType).length === 0) {
      return null;
    }
    
    const errorData = Object.entries(errorSummary.errorsByType)
      .map(([type, count], index) => ({
        name: type,
        value: count,
        color: COLORS[index % COLORS.length]
      }));
    
    return (
      <Card className="p-4 mb-6">
        <h3 className="text-lg font-semibold mb-2">Error Distribution</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={errorData}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                nameKey="name"
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              >
                {errorData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: any) => [value.toLocaleString(), 'Errors']}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Card>
    );
  };

  const renderTimeRangeSelector = () => {
    return (
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">
          {rule ? `Traffic Analytics: ${rule.name}` : 'Traffic Analytics'}
        </h2>
        <div className="flex space-x-2">
          <Button 
            onClick={() => setTimeRange('1h')}
            variant={timeRange === '1h' ? 'primary' : 'secondary'}
            size="sm"
          >
            1h
          </Button>
          <Button 
            onClick={() => setTimeRange('6h')}
            variant={timeRange === '6h' ? 'primary' : 'secondary'}
            size="sm"
          >
            6h
          </Button>
          <Button 
            onClick={() => setTimeRange('24h')}
            variant={timeRange === '24h' ? 'primary' : 'secondary'}
            size="sm"
          >
            24h
          </Button>
          <Button 
            onClick={() => setTimeRange('7d')}
            variant={timeRange === '7d' ? 'primary' : 'secondary'}
            size="sm"
          >
            7d
          </Button>
          <Button 
            onClick={() => setTimeRange('30d')}
            variant={timeRange === '30d' ? 'primary' : 'secondary'}
            size="sm"
          >
            30d
          </Button>
          <Button 
            onClick={fetchData}
            variant="secondary"
            size="sm"
          >
            Refresh
          </Button>
        </div>
      </div>
    );
  };

  if (loading && !trafficSummary) {
    return <LoadingIndicator />;
  }

  return (
    <div className="container mx-auto px-4 py-6">
      {error && <Alert type="error" message={error} className="mb-4" />}
      
      {renderTimeRangeSelector()}
      {renderTrafficOverview()}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderTrafficChart()}
        {renderStatusCodeDistribution()}
        {renderTopPaths()}
        {renderErrorDistribution()}
      </div>
    </div>
  );
};

export default DomainTrafficDashboard;