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