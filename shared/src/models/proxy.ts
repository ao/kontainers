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
  sslCertificate?: SslCertificate;
  headers?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  healthCheck?: HealthCheck;
  loadBalancing?: LoadBalancingConfig;
  advancedConfig?: AdvancedProxyConfig;
  customNginxConfig?: string;
  created: number;
  enabled: boolean;
  
  /**
   * Domain name for domain-based routing
   */
  domain?: string;
}

/**
 * Represents an SSL certificate.
 */
export interface SslCertificate {
  id: string;
  name: string;
  domain: string;
  certificate: string;
  privateKey: string;
  chainCertificate?: string;
  expiryDate: string;
  created: number;
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
  securityHeaders?: SecurityHeadersConfig;
  wafConfig?: WafConfig;
  ipAccessControl?: IpAccessControlConfig;
}

/**
 * Represents a rate limit configuration.
 */
export interface RateLimitConfig {
  enabled: boolean;
  requestsPerSecond: number;
  burstSize: number;
  nodelay: boolean;
  perIp: boolean;
  zone?: string;
  logLevel?: RateLimitLogLevel;
  responseCode?: number;
}

/**
 * Represents the log level for rate limiting.
 */
export enum RateLimitLogLevel {
  INFO = 'info',
  NOTICE = 'notice',
  WARN = 'warn',
  ERROR = 'error'
}

/**
 * Represents security headers configuration.
 */
export interface SecurityHeadersConfig {
  xFrameOptions?: string;
  xContentTypeOptions?: string;
  xXssProtection?: string;
  strictTransportSecurity?: string;
  contentSecurityPolicy?: string;
  referrerPolicy?: string;
  permissionsPolicy?: string;
  customHeaders?: Record<string, string>;
}

/**
 * Represents Web Application Firewall configuration.
 */
export interface WafConfig {
  enabled: boolean;
  mode: WafMode;
  rulesets: WafRuleset[];
  customRules?: string;
}

/**
 * Represents WAF operation mode.
 */
export enum WafMode {
  DETECTION = 'detection',
  BLOCKING = 'blocking'
}

/**
 * Represents WAF ruleset to enable.
 */
export enum WafRuleset {
  CORE = 'core',
  SQL = 'sql',
  XSS = 'xss',
  LFI = 'lfi',
  RFI = 'rfi',
  SCANNER = 'scanner',
  SESSION = 'session',
  PROTOCOL = 'protocol',
  CUSTOM = 'custom'
}

/**
 * Represents IP access control configuration.
 */
export interface IpAccessControlConfig {
  enabled: boolean;
  defaultAction: IpAccessAction;
  rules: IpAccessRule[];
}

/**
 * Represents IP access control action.
 */
export enum IpAccessAction {
  ALLOW = 'allow',
  DENY = 'deny'
}

/**
 * Represents an IP access control rule.
 */
export interface IpAccessRule {
  ip: string;
  action: IpAccessAction;
  comment?: string;
}

/**
 * Represents a URL rewrite rule.
 */
export interface RewriteRule {
  pattern: string;
  replacement: string;
  flag: string;
}