/**
 * Proxy traffic data models for Kontainers application
 */

/**
 * Represents traffic data for a proxy rule.
 */
export interface ProxyTrafficData {
  id: string;
  ruleId: string;
  timestamp: number;
  requestCount: number;
  responseCount: number;
  bytesReceived: number;
  bytesSent: number;
  avgResponseTime: number;
  statusCodes?: Record<number, number>;
  requestMethods?: Record<string, number>;
  clientIps?: Record<string, number>;
  userAgents?: Record<string, number>;
  pathHits?: Record<string, number>;
}

/**
 * Represents a time-series collection of traffic data.
 */
export interface ProxyTrafficTimeSeries {
  ruleId: string;
  interval: number; // interval in milliseconds
  startTime: number;
  endTime: number;
  dataPoints: ProxyTrafficData[];
}

/**
 * Represents a summary of traffic data for a proxy rule.
 */
export interface ProxyTrafficSummary {
  ruleId: string;
  totalRequests: number;
  totalResponses: number;
  totalBytesReceived: number;
  totalBytesSent: number;
  avgResponseTime: number;
  statusCodeDistribution: Record<number, number>;
  requestMethodDistribution: Record<string, number>;
  topClientIps: Array<[string, number]>;
  topUserAgents: Array<[string, number]>;
  topPaths: Array<[string, number]>;
  period: string; // e.g., "last_hour", "last_day", "last_week"
}

/**
 * Represents a single request/response log entry.
 */
export interface RequestResponseLog {
  id: string;
  ruleId: string;
  timestamp: number;
  clientIp: string;
  method: string;
  path: string;
  queryString?: string;
  statusCode: number;
  responseTime: number;
  bytesReceived: number;
  bytesSent: number;
  userAgent?: string;
  referer?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
}