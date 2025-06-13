/**
 * types.ts
 * 
 * Type definitions for the Kontainers testing demo
 */

/**
 * Status of a proxy rule
 */
export enum ProxyRuleStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error'
}

/**
 * Proxy rule configuration
 */
export interface ProxyRule {
  /**
   * Unique identifier for the rule
   */
  id: string;
  
  /**
   * Domain name for the rule (e.g., example.com)
   */
  domain: string;
  
  /**
   * Target port to forward traffic to
   */
  targetPort: number;
  
  /**
   * Optional container ID to associate with this rule
   */
  targetContainer?: string;
  
  /**
   * Optional path prefix for the rule (e.g., /api)
   */
  path?: string;
  
  /**
   * Current status of the rule
   */
  status: ProxyRuleStatus;
  
  /**
   * Whether SSL is enabled for this rule
   */
  sslEnabled?: boolean;
  
  /**
   * Optional HTTP headers to add to proxied requests
   */
  headers?: Record<string, string>;
  
  /**
   * Rate limit in requests per second (0 means no limit)
   */
  rateLimit?: number;
  
  /**
   * Created timestamp
   */
  createdAt?: number;
  
  /**
   * Last updated timestamp
   */
  updatedAt?: number;
}

/**
 * Traffic statistics for a proxy rule
 */
export interface ProxyTrafficStats {
  /**
   * Rule ID
   */
  ruleId: string;
  
  /**
   * Total number of requests
   */
  requests: number;
  
  /**
   * Number of successful requests (2xx, 3xx)
   */
  successful: number;
  
  /**
   * Number of client errors (4xx)
   */
  clientErrors: number;
  
  /**
   * Number of server errors (5xx)
   */
  serverErrors: number;
  
  /**
   * Average response time in milliseconds
   */
  avgResponseTime: number;
  
  /**
   * Total bytes transferred
   */
  bytesTransferred: number;
  
  /**
   * Timestamp of the last request
   */
  lastRequestTime?: number;
}

/**
 * Error response from the proxy rule manager
 */
export interface ProxyRuleError {
  /**
   * Error code
   */
  code: string;
  
  /**
   * Error message
   */
  message: string;
  
  /**
   * Optional details about the error
   */
  details?: any;
}