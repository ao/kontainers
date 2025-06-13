import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  role: text('role', { enum: ['admin', 'user', 'viewer'] }).notNull().default('user'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  lastLogin: text('last_login'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});

export const passwordResetTokens = sqliteTable('password_reset_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  token: text('token').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  used: integer('used', { mode: 'boolean' }).notNull().default(false),
});

export const proxyRules = sqliteTable('proxy_rules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sourceHost: text('source_host').notNull(),
  sourcePath: text('source_path').notNull().default('/'),
  targetContainer: text('target_container').notNull(),
  targetPort: integer('target_port').notNull(),
  protocol: text('protocol', { enum: ['HTTP', 'HTTPS', 'TCP', 'UDP'] }).notNull(),
  sslEnabled: integer('ssl_enabled', { mode: 'boolean' }).notNull().default(false),
  sslCertPath: text('ssl_cert_path'),
  sslKeyPath: text('ssl_key_path'),
  domain: text('domain'),
  headers: text('headers'), // JSON string
  responseHeaders: text('response_headers'), // JSON string
  healthCheck: text('health_check'), // JSON string
  loadBalancing: text('load_balancing'), // JSON string
  advancedConfig: text('advanced_config'), // JSON string
  customNginxConfig: text('custom_nginx_config'),
  created: text('created').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  letsEncryptEnabled: integer('lets_encrypt_enabled', { mode: 'boolean' }).default(false),
  letsEncryptEmail: text('lets_encrypt_email'),
  letsEncryptStatus: text('lets_encrypt_status', { enum: ['PENDING', 'VALID', 'EXPIRED', 'ERROR'] }),
  letsEncryptLastRenewal: text('lets_encrypt_last_renewal'),
});

export const sslCertificates = sqliteTable('ssl_certificates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  domain: text('domain').notNull(),
  certificate: text('certificate').notNull(),
  privateKey: text('private_key').notNull(),
  chainCertificate: text('chain_certificate'),
  expiryDate: text('expiry_date').notNull(),
  created: text('created').notNull(),
  isLetsEncrypt: integer('is_lets_encrypt', { mode: 'boolean' }).default(false),
  letsEncryptEmail: text('lets_encrypt_email'),
});

export const proxyTraffic = sqliteTable('proxy_traffic', {
  id: text('id').primaryKey(),
  ruleId: text('rule_id').notNull().references(() => proxyRules.id),
  timestamp: text('timestamp').notNull(),
  method: text('method').notNull(),
  path: text('path').notNull(),
  statusCode: integer('status_code'),
  responseTime: integer('response_time'),
  bytesSent: integer('bytes_sent'),
  bytesReceived: integer('bytes_received'),
  clientIp: text('client_ip'),
  userAgent: text('user_agent'),
});

export const proxyErrors = sqliteTable('proxy_errors', {
  id: text('id').primaryKey(),
  ruleId: text('rule_id').notNull().references(() => proxyRules.id),
  timestamp: text('timestamp').notNull(),
  type: text('type').notNull(),
  code: integer('code'),
  message: text('message'),
  path: text('path'),
  resolved: integer('resolved', { mode: 'boolean' }).notNull().default(false),
  resolvedAt: text('resolved_at'),
  resolution: text('resolution'),
});

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  action: text('action').notNull(),
  resource: text('resource').notNull(),
  resourceId: text('resource_id'),
  timestamp: text('timestamp').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  details: text('details'),
});

export const rateLimits = sqliteTable('rate_limits', {
  id: text('id').primaryKey(),
  ipAddress: text('ip_address').notNull(),
  endpoint: text('endpoint').notNull(),
  count: integer('count').notNull().default(0),
  resetAt: text('reset_at').notNull(),
});