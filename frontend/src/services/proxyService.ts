import axios from 'axios';
import { 
  ProxyRule, 
  ProxyTrafficData, 
  ProxyTrafficTimeSeries, 
  ProxyTrafficSummary,
  ProxyError,
  ProxyErrorSummary,
  RequestResponseLog
} from '../../../shared/src/models';

const API_BASE_URL = '/api/proxy';

/**
 * Fetches all proxy rules
 */
export const fetchProxyRules = async (): Promise<ProxyRule[]> => {
  const response = await axios.get<ProxyRule[]>(API_BASE_URL);
  return response.data;
};

/**
 * Fetches a specific proxy rule by ID
 */
export const fetchProxyRuleById = async (id: string): Promise<ProxyRule> => {
  const response = await axios.get<ProxyRule>(`${API_BASE_URL}/${id}`);
  return response.data;
};

/**
 * Creates a new proxy rule
 */
export const createProxyRule = async (ruleData: Omit<ProxyRule, 'id' | 'created'>): Promise<ProxyRule> => {
  const response = await axios.post<ProxyRule>(API_BASE_URL, ruleData);
  return response.data;
};

/**
 * Updates a proxy rule
 */
export const updateProxyRule = async (id: string, ruleData: Partial<ProxyRule>): Promise<ProxyRule> => {
  const response = await axios.put<ProxyRule>(`${API_BASE_URL}/${id}`, ruleData);
  return response.data;
};

/**
 * Deletes a proxy rule
 */
export const deleteProxyRule = async (id: string): Promise<void> => {
  await axios.delete(`${API_BASE_URL}/${id}`);
};

/**
 * Enables a proxy rule
 */
export const enableProxyRule = async (id: string): Promise<ProxyRule> => {
  const response = await axios.post<ProxyRule>(`${API_BASE_URL}/${id}/enable`);
  return response.data;
};

/**
 * Disables a proxy rule
 */
export const disableProxyRule = async (id: string): Promise<ProxyRule> => {
  const response = await axios.post<ProxyRule>(`${API_BASE_URL}/${id}/disable`);
  return response.data;
};

/**
 * Fetches traffic data for a proxy rule
 */
export const fetchProxyTrafficData = async (
  ruleId: string, 
  startTime?: number, 
  endTime?: number
): Promise<ProxyTrafficData[]> => {
  const params = { startTime, endTime };
  const response = await axios.get<ProxyTrafficData[]>(
    `${API_BASE_URL}/${ruleId}/traffic`, 
    { params }
  );
  return response.data;
};

/**
 * Fetches traffic time series data for a proxy rule
 */
export const fetchProxyTrafficTimeSeries = async (
  ruleId: string,
  interval: number,
  startTime?: number,
  endTime?: number
): Promise<ProxyTrafficTimeSeries> => {
  const params = { interval, startTime, endTime };
  const response = await axios.get<ProxyTrafficTimeSeries>(
    `${API_BASE_URL}/${ruleId}/traffic/timeseries`,
    { params }
  );
  return response.data;
};

/**
 * Fetches traffic summary for a proxy rule
 */
export const fetchProxyTrafficSummary = async (
  ruleId: string,
  period: string = 'last_hour'
): Promise<ProxyTrafficSummary> => {
  const params = { period };
  const response = await axios.get<ProxyTrafficSummary>(
    `${API_BASE_URL}/${ruleId}/traffic/summary`,
    { params }
  );
  return response.data;
};

/**
 * Fetches errors for a proxy rule
 */
export const fetchProxyErrors = async (
  ruleId: string,
  startTime?: number,
  endTime?: number,
  limit: number = 100,
  offset: number = 0
): Promise<ProxyError[]> => {
  const params = { startTime, endTime, limit, offset };
  const response = await axios.get<ProxyError[]>(
    `${API_BASE_URL}/${ruleId}/errors`,
    { params }
  );
  return response.data;
};

/**
 * Fetches error summary for a proxy rule
 */
export const fetchProxyErrorSummary = async (
  ruleId: string,
  period: string = 'last_hour'
): Promise<ProxyErrorSummary> => {
  const params = { period };
  const response = await axios.get<ProxyErrorSummary>(
    `${API_BASE_URL}/${ruleId}/errors/summary`,
    { params }
  );
  return response.data;
};

/**
 * Fetches request/response logs for a proxy rule
 */
export const fetchRequestResponseLogs = async (
  ruleId: string,
  startTime?: number,
  endTime?: number,
  limit: number = 100,
  offset: number = 0
): Promise<RequestResponseLog[]> => {
  const params = { startTime, endTime, limit, offset };
  const response = await axios.get<RequestResponseLog[]>(
    `${API_BASE_URL}/${ruleId}/logs`,
    { params }
  );
  return response.data;
};

/**
 * Tests a proxy rule configuration
 */
export const testProxyRule = async (ruleData: Partial<ProxyRule>): Promise<{
  success: boolean;
  message: string;
  responseTime?: number;
  statusCode?: number;
}> => {
  const response = await axios.post<{
    success: boolean;
    message: string;
    responseTime?: number;
    statusCode?: number;
  }>(`${API_BASE_URL}/test`, ruleData);
  return response.data;
};