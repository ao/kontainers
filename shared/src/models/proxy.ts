/**
 * Proxy-related models for Kontainers application
 */

/**
 * Represents a proxy rule for routing traffic to a container.
 */
export interface ProxyRule {
  id: string;
  name: string;
  sourceHost: string;
  sourcePath: string;
  targetContainer: string;
  targetPort: number;
  protocol: ProxyProtocol;
  sslEnabled: boolean;
  sslCertPath?: string;
  sslKeyPath?: string;
  headers?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  healthCheck?: HealthCheck;
  loadBalancing?: LoadBalancingConfig;
  advancedConfig?: AdvancedProxyConfig;
  customNginxConfig?: string;
  created: number;
  enabled: boolean;
}

/**
 * Represents the protocol for a proxy rule.
 */
export enum ProxyProtocol {
  HTTP = 'HTTP',
  HTTPS = 'HTTPS',
  TCP = 'TCP',
  UDP = 'UDP'
}

/**
 * Represents a health check configuration for a proxy rule.
 */
export interface HealthCheck {
  path: string;
  interval: number;
  timeout: number;
  retries: number;
  successCodes: string;
}

/**
 * Represents load balancing configuration for a proxy rule.
 */
export interface LoadBalancingConfig {
  method: LoadBalancingMethod;
  targets: LoadBalancingTarget[];
  sticky: boolean;
  cookieName?: string;
  cookieExpiry?: number;
}

/**
 * Represents a load balancing target.
 */
export interface LoadBalancingTarget {
  container: string;
  port: number;
  weight: number;
}

/**
 * Represents the load balancing method.
 */
export enum LoadBalancingMethod {
  ROUND_ROBIN = 'ROUND_ROBIN',
  LEAST_CONN = 'LEAST_CONN',
  IP_HASH = 'IP_HASH',
  RANDOM = 'RANDOM'
}

/**
 * Represents advanced proxy configuration options.
 */
export interface AdvancedProxyConfig {
  clientMaxBodySize?: string;
  proxyConnectTimeout: number;
  proxySendTimeout: number;
  proxyReadTimeout: number;
  proxyBufferSize?: string;
  proxyBuffers?: string;
  proxyBusyBuffersSize?: string;
  cacheEnabled: boolean;
  cacheDuration?: string;
  corsEnabled: boolean;
  corsAllowOrigin?: string;
  corsAllowMethods?: string;
  corsAllowHeaders?: string;
  corsAllowCredentials: boolean;
  rateLimit?: RateLimitConfig;
  rewriteRules: RewriteRule[];
}

/**
 * Represents a rate limit configuration.
 */
export interface RateLimitConfig {
  requestsPerSecond: number;
  burstSize: number;
  nodelay: boolean;
}

/**
 * Represents a URL rewrite rule.
 */
export interface RewriteRule {
  pattern: string;
  replacement: string;
  flag: string;
}