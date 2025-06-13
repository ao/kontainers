/**
 * Proxy error models for Kontainers application
 */

/**
 * Represents an error that occurred in the proxy.
 */
export interface ProxyError {
  id: string;
  ruleId: string;
  timestamp: number;
  errorType: ProxyErrorType;
  statusCode?: number;
  message: string;
  clientIp?: string;
  method?: string;
  path?: string;
  requestId?: string;
  stackTrace?: string;
  resolved: boolean;
  resolvedAt?: number;
  resolution?: string;
}

/**
 * Represents the type of proxy error.
 */
export enum ProxyErrorType {
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
  TIMEOUT = 'TIMEOUT',
  SSL_ERROR = 'SSL_ERROR',
  BAD_GATEWAY = 'BAD_GATEWAY',
  GATEWAY_TIMEOUT = 'GATEWAY_TIMEOUT',
  CLIENT_ERROR = 'CLIENT_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Represents a summary of errors for a proxy rule.
 */
export interface ProxyErrorSummary {
  ruleId: string;
  totalErrors: number;
  errorsByType: Record<ProxyErrorType, number>;
  errorsByStatusCode: Record<number, number>;
  errorRate: number; // errors / total requests
  period: string; // e.g., "last_hour", "last_day", "last_week"
  topErrorPaths: Array<[string, number]>;
  topErrorClients: Array<[string, number]>;
}

/**
 * Represents an alert configuration for proxy errors.
 */
export interface ErrorAlertConfig {
  id: string;
  ruleId?: string;  // null means all rules
  name: string;
  errorType?: ProxyErrorType;  // null means all error types
  statusCode?: number;  // null means all status codes
  threshold: number;  // error rate threshold to trigger alert
  timeWindow: number;  // time window in milliseconds to calculate error rate
  minRequests: number;  // minimum number of requests to consider for alerting
  enabled: boolean;
  notificationChannels: NotificationChannel[];
}

/**
 * Represents a notification channel for alerts.
 */
export interface NotificationChannel {
  type: NotificationType;
  destination: string;  // email address, webhook URL, etc.
  enabled: boolean;
}

/**
 * Represents the type of notification.
 */
export enum NotificationType {
  EMAIL = 'EMAIL',
  WEBHOOK = 'WEBHOOK',
  SLACK = 'SLACK',
  TEAMS = 'TEAMS',
  SMS = 'SMS'
}

/**
 * Represents an alert triggered by proxy errors.
 */
export interface ErrorAlert {
  id: string;
  configId: string;
  ruleId?: string;
  timestamp: number;
  errorRate: number;
  errorCount: number;
  requestCount: number;
  message: string;
  status: AlertStatus;
  acknowledgedAt?: number;
  acknowledgedBy?: string;
  resolvedAt?: number;
}

/**
 * Represents the status of an alert.
 */
export enum AlertStatus {
  ACTIVE = 'ACTIVE',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  RESOLVED = 'RESOLVED'
}