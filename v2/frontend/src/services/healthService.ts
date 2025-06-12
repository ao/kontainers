import axios from 'axios';
import { HealthStatus, HealthCheckResult, SystemResourceMetrics } from '../../../shared/src/models';

const API_BASE_URL = '/api/health';

/**
 * Fetches system health status and metrics
 */
export const fetchSystemHealth = async (): Promise<{
  status: HealthStatus;
  metrics: SystemResourceMetrics;
}> => {
  const response = await axios.get<{
    status: HealthStatus;
    metrics: SystemResourceMetrics;
  }>(API_BASE_URL);
  return response.data;
};

/**
 * Fetches health check results for all components
 */
export const fetchComponentHealth = async (): Promise<HealthCheckResult[]> => {
  const response = await axios.get<HealthCheckResult[]>(`${API_BASE_URL}/components`);
  return response.data;
};

/**
 * Fetches health check result for a specific component
 */
export const fetchComponentHealthById = async (componentId: string): Promise<HealthCheckResult> => {
  const response = await axios.get<HealthCheckResult>(`${API_BASE_URL}/components/${componentId}`);
  return response.data;
};

/**
 * Fetches historical system resource metrics
 */
export const fetchHistoricalMetrics = async (
  startTime?: number,
  endTime?: number,
  interval: number = 60000 // Default to 1 minute intervals
): Promise<SystemResourceMetrics[]> => {
  const params = { startTime, endTime, interval };
  const response = await axios.get<SystemResourceMetrics[]>(`${API_BASE_URL}/metrics/history`, { params });
  return response.data;
};

/**
 * Triggers a manual health check
 */
export const triggerHealthCheck = async (): Promise<{
  status: HealthStatus;
  components: HealthCheckResult[];
}> => {
  const response = await axios.post<{
    status: HealthStatus;
    components: HealthCheckResult[];
  }>(`${API_BASE_URL}/check`);
  return response.data;
};

/**
 * Fetches system resource metrics for a specific time range
 */
export const fetchMetricsForRange = async (
  metric: 'cpu' | 'memory' | 'disk' | 'network',
  startTime: number,
  endTime: number,
  resolution: number = 100 // Number of data points to return
): Promise<{
  timestamps: number[];
  values: number[];
}> => {
  const params = { metric, startTime, endTime, resolution };
  const response = await axios.get<{
    timestamps: number[];
    values: number[];
  }>(`${API_BASE_URL}/metrics/range`, { params });
  return response.data;
};

/**
 * Fetches current alerts
 */
export const fetchAlerts = async (
  status?: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'
): Promise<{
  componentId: string;
  componentName: string;
  status: HealthStatus;
  message: string;
  timestamp: number;
}[]> => {
  const params = status ? { status } : {};
  const response = await axios.get<{
    componentId: string;
    componentName: string;
    status: HealthStatus;
    message: string;
    timestamp: number;
  }[]>(`${API_BASE_URL}/alerts`, { params });
  return response.data;
};

/**
 * Acknowledges an alert
 */
export const acknowledgeAlert = async (alertId: string): Promise<void> => {
  await axios.post(`${API_BASE_URL}/alerts/${alertId}/acknowledge`);
};

/**
 * Resolves an alert
 */
export const resolveAlert = async (alertId: string): Promise<void> => {
  await axios.post(`${API_BASE_URL}/alerts/${alertId}/resolve`);
};