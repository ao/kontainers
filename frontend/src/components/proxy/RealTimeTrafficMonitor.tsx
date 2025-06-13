import React, { useState, useEffect, useRef } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { websocketService } from '../../services/websocketService';
import Card from '../common/Card';
import Button from '../common/Button';
import Alert from '../common/Alert';

interface RealTimeTrafficMonitorProps {
  ruleId: string;
  maxDataPoints?: number;
}

interface TrafficDataPoint {
  timestamp: number;
  requests: number;
  responseTime: number;
  errors: number;
}

const RealTimeTrafficMonitor: React.FC<RealTimeTrafficMonitorProps> = ({ 
  ruleId,
  maxDataPoints = 60 // Default to 60 data points (1 minute at 1s intervals)
}) => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [trafficData, setTrafficData] = useState<TrafficDataPoint[]>([]);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [alertThresholds, setAlertThresholds] = useState({
    responseTime: 1000, // ms
    errorRate: 0.05 // 5%
  });
  const [alerts, setAlerts] = useState<{
    responseTime: boolean;
    errorRate: boolean;
  }>({
    responseTime: false,
    errorRate: false
  });

  // Use refs to keep track of accumulated data between websocket messages
  const accumulatedDataRef = useRef({
    requests: 0,
    errors: 0,
    totalResponseTime: 0,
    totalRequests: 0
  });

  // Connect to WebSocket on component mount
  useEffect(() => {
    connectWebSocket();

    return () => {
      websocketService.disconnect();
    };
  }, [ruleId]);

  const connectWebSocket = () => {
    try {
      websocketService.connect();
      
      websocketService.subscribe(`proxy:traffic:${ruleId}`, handleTrafficUpdate);
      websocketService.subscribe(`proxy:error:${ruleId}`, handleErrorUpdate);
      
      websocketService.onConnect(() => {
        setIsConnected(true);
        setError(null);
      });
      
      websocketService.onDisconnect(() => {
        setIsConnected(false);
        setError('WebSocket connection lost. Attempting to reconnect...');
      });
      
      websocketService.onError((err) => {
        setError(`WebSocket error: ${err}`);
      });
      
      // Start data collection interval
      const interval = setInterval(() => {
        if (!isPaused) {
          addDataPoint();
        }
      }, 1000); // Collect data every second
      
      return () => {
        clearInterval(interval);
        websocketService.unsubscribe(`proxy:traffic:${ruleId}`);
        websocketService.unsubscribe(`proxy:error:${ruleId}`);
      };
    } catch (err: any) {
      setError(`Failed to connect to WebSocket: ${err.message}`);
    }
  };

  const handleTrafficUpdate = (data: any) => {
    if (isPaused) return;
    
    // Accumulate traffic data
    accumulatedDataRef.current.requests++;
    accumulatedDataRef.current.totalResponseTime += data.responseTime || 0;
    accumulatedDataRef.current.totalRequests++;
  };

  const handleErrorUpdate = (data: any) => {
    if (isPaused) return;
    
    // Accumulate error data
    accumulatedDataRef.current.errors++;
  };

  const addDataPoint = () => {
    const now = Date.now();
    const { requests, errors, totalResponseTime, totalRequests } = accumulatedDataRef.current;
    
    // Calculate average response time
    const avgResponseTime = totalRequests > 0 ? totalResponseTime / totalRequests : 0;
    
    // Create new data point
    const newDataPoint: TrafficDataPoint = {
      timestamp: now,
      requests,
      responseTime: avgResponseTime,
      errors
    };
    
    // Check for alerts
    const newAlerts = {
      responseTime: avgResponseTime > alertThresholds.responseTime,
      errorRate: totalRequests > 0 && (errors / totalRequests) > alertThresholds.errorRate
    };
    
    setAlerts(newAlerts);
    
    // Update traffic data state, keeping only the last maxDataPoints
    setTrafficData(prevData => {
      const newData = [...prevData, newDataPoint];
      if (newData.length > maxDataPoints) {
        return newData.slice(newData.length - maxDataPoints);
      }
      return newData;
    });
    
    // Reset accumulated data
    accumulatedDataRef.current = {
      requests: 0,
      errors: 0,
      totalResponseTime: 0,
      totalRequests: 0
    };
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const togglePause = () => {
    setIsPaused(!isPaused);
  };

  const clearData = () => {
    setTrafficData([]);
    setAlerts({
      responseTime: false,
      errorRate: false
    });
  };

  const renderConnectionStatus = () => {
    if (error) {
      return <Alert variant="error" message={error} />;
    }
    
    if (isConnected) {
      return (
        <div className="flex items-center text-green-600 mb-4">
          <div className="w-3 h-3 bg-green-600 rounded-full mr-2"></div>
          <span>Connected to real-time traffic feed</span>
        </div>
      );
    }
    
    return (
      <div className="flex items-center text-yellow-600 mb-4">
        <div className="w-3 h-3 bg-yellow-600 rounded-full mr-2"></div>
        <span>Connecting to real-time traffic feed...</span>
      </div>
    );
  };

  const renderAlerts = () => {
    if (!alerts.responseTime && !alerts.errorRate) return null;
    
    return (
      <div className="mb-4">
        {alerts.responseTime && (
          <Alert 
            variant="warning" 
            message={`High response time detected (threshold: ${alertThresholds.responseTime}ms)`} 
            className="mb-2"
          />
        )}
        
        {alerts.errorRate && (
          <Alert 
            variant="error" 
            message={`High error rate detected (threshold: ${(alertThresholds.errorRate * 100).toFixed(1)}%)`} 
          />
        )}
      </div>
    );
  };

  const renderTrafficChart = () => {
    if (trafficData.length === 0) {
      return (
        <div className="text-center text-gray-500 py-10">
          Waiting for traffic data...
        </div>
      );
    }
    
    // Format data for chart
    const chartData = trafficData.map(point => ({
      time: formatTime(point.timestamp),
      timestamp: point.timestamp,
      requests: point.requests,
      responseTime: point.responseTime,
      errors: point.errors
    }));
    
    return (
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
              interval={Math.ceil(chartData.length / 10)} // Show ~10 ticks
            />
            <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
            <Tooltip 
              formatter={(value: any, name: string) => {
                if (name === 'requests') return [value, 'Requests/sec'];
                if (name === 'responseTime') return [`${value.toFixed(2)} ms`, 'Avg Response Time'];
                if (name === 'errors') return [value, 'Errors/sec'];
                return [value, name];
              }}
            />
            <Legend />
            <Line 
              yAxisId="left"
              type="monotone" 
              dataKey="requests" 
              stroke="#0088FE" 
              name="Requests/sec" 
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line 
              yAxisId="right"
              type="monotone" 
              dataKey="responseTime" 
              stroke="#00C49F" 
              name="Response Time (ms)" 
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line 
              yAxisId="left"
              type="monotone" 
              dataKey="errors" 
              stroke="#FF6B6B" 
              name="Errors/sec" 
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <Card className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Real-Time Traffic Monitor</h3>
        <div className="flex space-x-2">
          <Button 
            onClick={togglePause}
            variant={isPaused ? 'primary' : 'secondary'}
            size="sm"
          >
            {isPaused ? 'Resume' : 'Pause'}
          </Button>
          <Button 
            onClick={clearData}
            variant="secondary"
            size="sm"
          >
            Clear
          </Button>
        </div>
      </div>
      
      {renderConnectionStatus()}
      {renderAlerts()}
      {renderTrafficChart()}
      
      <div className="mt-4 text-sm text-gray-500">
        Showing the last {maxDataPoints} seconds of traffic data
      </div>
    </Card>
  );
};

export default RealTimeTrafficMonitor;