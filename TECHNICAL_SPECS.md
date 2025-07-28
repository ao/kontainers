# Kontainers Technical Specifications

This document provides detailed technical requirements, architecture specifications, and implementation guidelines for the Kontainers MVP development.

## 🏗️ System Architecture

### High-Level Architecture

![HLD](./architecture_diagrams/hld.svg)

## 🛠️ Technology Stack Specifications

### Frontend (React + TypeScript)

#### Core Dependencies
```javascript
// frontend/package.json
{
  "dependencies": {
    "@tanstack/react-query": "^5.8.4",
    "axios": "^1.6.2",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "socket.io-client": "^4.7.2",
    "zustand": "^4.4.6",
    "kontainers-shared": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/react": "^18.2.37",
    "@types/react-dom": "^18.2.15",
    "@typescript-eslint/eslint-plugin": "^6.12.0",
    "@typescript-eslint/parser": "^6.12.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.16",
    "eslint": "^8.54.0",
    "eslint-plugin-react": "^7.33.2",
    "eslint-plugin-react-hooks": "^4.6.0",
    "postcss": "^8.4.31",
    "prettier": "^3.1.0",
    "tailwindcss": "^3.3.5",
    "typescript": "^5.3.2",
    "vite": "^5.0.0"
  }
}
```

#### UI Component Architecture
```typescript
// Component Structure
// Main application screens
import { Dashboard } from './components/dashboard/Dashboard';
import { ContainerList } from './components/containers/ContainerList';
import { ProxyRuleList } from './components/proxy/ProxyRuleList';
import { Settings } from './components/settings/Settings';

// State Management with Zustand
interface AppState {
  currentScreen: string;
  containers: Container[];
  proxyRules: ProxyRule[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setCurrentScreen: (screen: string) => void;
  fetchContainers: () => Promise<void>;
  fetchProxyRules: () => Promise<void>;
  startContainer: (id: string) => Promise<boolean>;
  stopContainer: (id: string) => Promise<boolean>;
}

// API Client
class ContainerService {
  private api: AxiosInstance;
  
  constructor(baseURL: string) {
    this.api = axios.create({ baseURL });
  }
  
  async getContainers(): Promise<Container[]> {
    const response = await this.api.get('/api/containers');
    return response.data;
  }
  
  async startContainer(id: string): Promise<boolean> {
    const response = await this.api.post(`/api/containers/${id}/start`);
    return response.status === 200;
  }
  
  async stopContainer(id: string): Promise<boolean> {
    const response = await this.api.post(`/api/containers/${id}/stop`);
    return response.status === 200;
  }
}
```

### Backend (Bun + Elysia)

#### Core Dependencies
```javascript
// backend/package.json
{
  "dependencies": {
    "elysia": "^0.7.30",
    "@elysiajs/cors": "^0.7.2",
    "@elysiajs/swagger": "^0.7.3",
    "@elysiajs/websocket": "^0.7.3",
    "dockerode": "^4.0.0",
    "zod": "^3.22.4",
    "kontainers-shared": "workspace:*"
  },
  "devDependencies": {
    "@types/dockerode": "^3.3.23",
    "@types/node": "^20.10.0",
    "@typescript-eslint/eslint-plugin": "^6.12.0",
    "@typescript-eslint/parser": "^6.12.0",
    "bun-types": "^1.2.16",
    "eslint": "^8.54.0",
    "prettier": "^3.1.0",
    "typescript": "^5.3.2"
  }
}
```

#### Server Configuration
```typescript
// backend/src/index.ts
import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { websocket } from '@elysiajs/websocket';

// Import routes
import { containerRoutes } from './api/containers';
import { proxyRoutes } from './api/proxy';
import { healthRoutes } from './api/health';
import { configRoutes } from './api/config';
import { authRoutes } from './api/auth';

// Import middleware
import { errorMiddleware } from './middleware/error';
import { loggingMiddleware } from './middleware/logging';
import { securityHeadersMiddleware } from './middleware/securityHeaders';
import { rateLimiterMiddleware } from './middleware/rateLimiter';

// Create Elysia app
const app = new Elysia()
  // Install plugins
  .use(cors())
  .use(swagger())
  .use(websocket())
  
  // Apply middleware
  .use(errorMiddleware)
  .use(loggingMiddleware)
  .use(securityHeadersMiddleware)
  .use(rateLimiterMiddleware)
  
  // Mount routes
  .use(containerRoutes)
  .use(proxyRoutes)
  .use(healthRoutes)
  .use(configRoutes)
  .use(authRoutes)
  
  // Global error handler
  .onError(({ code, error, set }) => {
    console.error(`Error ${code}:`, error);
    set.status = code === 'NOT_FOUND' ? 404 : 500;
    return {
      success: false,
      error: error.message || 'Internal Server Error'
    };
  });

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
```

## 📊 Data Models

### Core Domain Models
```typescript
// Container.ts
export interface Container {
  id: string;
  name: string;
  image: string;
  state: ContainerState;
  status: string;
  ports: PortMapping[];
  volumes: VolumeMount[];
  networks: string[];
  created: number;
  labels?: Record<string, string>;
  env?: string[];
}

export enum ContainerState {
  RUNNING = 'RUNNING',
  STOPPED = 'STOPPED',
  PAUSED = 'PAUSED',
  RESTARTING = 'RESTARTING',
  REMOVING = 'REMOVING',
  DEAD = 'DEAD',
  CREATED = 'CREATED'
}

export interface PortMapping {
  privatePort: number;
  publicPort?: number;
  type: string;
  ip: string;
}

export interface VolumeMount {
  source: string;
  destination: string;
  mode: string;
}

// ProxyRule.ts
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
  domain?: string;
  letsEncryptEnabled?: boolean;
  letsEncryptEmail?: string;
  letsEncryptStatus?: LetsEncryptStatus;
  letsEncryptLastRenewal?: number;
}

export enum ProxyProtocol {
  HTTP = 'HTTP',
  HTTPS = 'HTTPS',
  TCP = 'TCP',
  UDP = 'UDP'
}

export interface HealthCheck {
  path: string;
  interval: number;
  timeout: number;
  retries: number;
  successCodes: string;
}

// ContainerStats.ts
export interface ContainerStats {
  containerId: string;
  timestamp: number;
  cpuUsage: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryUsagePercentage: number;
  networkRx: number;
  networkTx: number;
  blockRead: number;
  blockWrite: number;
}

export interface DetailedContainerStats extends ContainerStats {
  cpuKernelUsage: number;
  cpuUserUsage: number;
  cpuSystemUsage: number;
  cpuOnlineCpus: number;
  memoryCache: number;
  memorySwap: number;
  memorySwapLimit: number;
  swapUsagePercentage: number;
  networkThroughput: number;
  networkPacketsRx: number;
  networkPacketsTx: number;
  networkDroppedRx: number;
  networkDroppedTx: number;
  networkErrorsRx: number;
  networkErrorsTx: number;
  blockThroughput: number;
  blockReadOps: number;
  blockWriteOps: number;
  pids: number;
  restartCount: number;
  healthStatus: HealthStatus;
  healthCheckLogs: string[];
}
```

## 🔌 API Specifications

### REST API Endpoints

#### Container Management
```typescript
// Container Routes
GET    /api/containers              // List all containers
GET    /api/containers/{id}         // Get container details
POST   /api/containers/{id}/start   // Start container
POST   /api/containers/{id}/stop    // Stop container
POST   /api/containers/{id}/restart // Restart container
DELETE /api/containers/{id}         // Remove container
GET    /api/containers/{id}/logs    // Get container logs
GET    /api/containers/{id}/stats   // Get container statistics

// Container Creation
POST   /api/containers              // Create new container
PUT    /api/containers/{id}         // Update container configuration
```

#### Proxy Management
```typescript
// Proxy Routes
GET    /api/proxy/rules             // List all proxy rules
GET    /api/proxy/rules/{id}        // Get proxy rule details
POST   /api/proxy/rules             // Create new proxy rule
PUT    /api/proxy/rules/{id}        // Update proxy rule
DELETE /api/proxy/rules/{id}        // Delete proxy rule
POST   /api/proxy/rules/{id}/test   // Test proxy rule
GET    /api/proxy/config            // Get current proxy configuration
POST   /api/proxy/reload            // Reload proxy configuration
```

#### System Management
```typescript
// System Routes
GET    /api/system/info             // System information
GET    /api/system/health           // Health check
GET    /api/system/version          // Application version
GET    /api/system/config           // Configuration
PUT    /api/system/config           // Update configuration
```

### WebSocket Events
```typescript
// WebSocket Message Types
export type WebSocketMessage =
  | ContainerEvent
  | ProxyEvent
  | StatsUpdate
  | LogEntry;

export interface ContainerEvent {
  type: EventType;
  container: Container;
}

export interface ProxyEvent {
  type: EventType;
  rule: ProxyRule;
}

export interface StatsUpdate {
  stats: ContainerStats[];
}

export interface LogEntry {
  containerId: string;
  timestamp: number;
  message: string;
  level: LogLevel;
}

export enum EventType {
  CREATED = 'CREATED',
  STARTED = 'STARTED',
  STOPPED = 'STOPPED',
  REMOVED = 'REMOVED',
  UPDATED = 'UPDATED'
}

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}
```

## 🐳 Docker Integration

### Docker API Client Configuration
```typescript
// DockerClient.ts
import Dockerode from 'dockerode';
import { Container, ContainerState, PortMapping, VolumeMount, ContainerStats } from '../models';

export class DockerClient {
  private docker: Dockerode;

  constructor(socketPath: string = '/var/run/docker.sock') {
    this.docker = new Dockerode({ socketPath });
  }

  async getContainers(all: boolean = true): Promise<Container[]> {
    try {
      const containers = await this.docker.listContainers({ all });
      return containers.map(this.mapDockerContainerToModel);
    } catch (error: any) {
      console.error('Error fetching containers:', error);
      throw new Error(`Failed to fetch containers: ${error.message}`);
    }
  }

  async startContainer(id: string): Promise<void> {
    try {
      const container = this.docker.getContainer(id);
      await container.start();
    } catch (error: any) {
      console.error(`Error starting container ${id}:`, error);
      throw new Error(`Failed to start container ${id}: ${error.message}`);
    }
  }

  async getContainerLogs(id: string, options: { tail?: number; since?: number; until?: number } = {}): Promise<string> {
    try {
      const container = this.docker.getContainer(id);
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: options.tail || 100,
        since: options.since,
        until: options.until,
        timestamps: true
      });
      
      return logs.toString('utf-8');
    } catch (error: any) {
      console.error(`Error fetching logs for container ${id}:`, error);
      throw new Error(`Failed to fetch logs for container ${id}: ${error.message}`);
    }
  }

  // Additional methods for container management...
}
```

## 🔄 Reverse Proxy Integration

### Nginx Configuration Management
```typescript
// NginxManager.ts
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ProxyRule, ProxyProtocol } from '../models';

const execAsync = promisify(exec);

export class NginxManager {
  private configDir: string;
  private sitesDir: string;
  private templatePath: string;
  private mainConfigPath: string;

  constructor(options: {
    configDir?: string;
    sitesDir?: string;
    templatePath?: string;
    mainConfigPath?: string;
  } = {}) {
    this.configDir = options.configDir || '/etc/nginx';
    this.sitesDir = options.sitesDir || path.join(this.configDir, 'sites-enabled');
    this.templatePath = options.templatePath || path.join(this.configDir, 'nginx.conf.template');
    this.mainConfigPath = options.mainConfigPath || path.join(this.configDir, 'nginx.conf');
  }

  async createOrUpdateProxyRule(rule: ProxyRule): Promise<void> {
    try {
      const configPath = path.join(this.sitesDir, `${rule.id}.conf`);
      const configContent = this.generateProxyRuleConfig(rule);
      
      await fs.writeFile(configPath, configContent);
      await this.reloadNginx();
    } catch (error: any) {
      console.error(`Error creating/updating proxy rule ${rule.id}:`, error);
      throw new Error(`Failed to create/update proxy rule ${rule.id}: ${error.message}`);
    }
  }

  private generateProxyRuleConfig(rule: ProxyRule): string {
    // Generate Nginx configuration based on proxy rule
    // Implementation details...
  }

  async reloadNginx(): Promise<void> {
    try {
      // First test the configuration
      const testResult = await this.testConfig();
      if (!testResult) {
        throw new Error('Nginx configuration test failed');
      }
      
      // If test passed, reload Nginx
      await execAsync('nginx -s reload');
    } catch (error: any) {
      console.error('Error reloading Nginx:', error);
      throw new Error(`Failed to reload Nginx: ${error.message}`);
    }
  }

  // Additional methods for Nginx management...
}
```

## 📊 Database Schema

### Database Configuration
```typescript
// Database.ts
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from './schema';

// Create SQLite database connection
const sqlite = new Database('kontainers.db');
export const db = drizzle(sqlite, { schema });

// Schema.ts
import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'user', 'viewer'] }).notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

export const proxyRules = sqliteTable('proxy_rules', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  name: text('name').notNull(),
  sourceHost: text('source_host').notNull(),
  sourcePath: text('source_path').notNull().default('/'),
  targetContainer: text('target_container').notNull(),
  targetPort: integer('target_port').notNull(),
  protocol: text('protocol', { enum: ['HTTP', 'HTTPS', 'TCP', 'UDP'] }).notNull(),
  sslEnabled: integer('ssl_enabled', { mode: 'boolean' }).notNull().default(false),
  sslCertPath: text('ssl_cert_path'),
  sslKeyPath: text('ssl_key_path'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  created: integer('created').notNull(),
  config: text('config', { mode: 'json' })
});
```

## 🔒 Security Specifications

### Authentication & Authorization
```typescript
// Auth.ts
import jwt from 'jsonwebtoken';
import { Elysia, t } from 'elysia';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '../utils/password';

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = '1h';

export const authRoutes = new Elysia({ prefix: '/api/auth' })
  // Login route
  .post('/login', 
    async ({ body, set }) => {
      const { username, password } = body;
      
      // Find user
      const user = await db.query.users.findFirst({
        where: eq(users.username, username)
      });
      
      if (!user) {
        set.status = 401;
        return { success: false, message: 'Invalid credentials' };
      }
      
      // Verify password
      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        set.status = 401;
        return { success: false, message: 'Invalid credentials' };
      }
      
      // Generate token
      const token = jwt.sign(
        { 
          id: user.id, 
          username: user.username, 
          role: user.role 
        }, 
        JWT_SECRET, 
        { expiresIn: JWT_EXPIRES_IN }
      );
      
      return { 
        success: true, 
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      };
    },
    {
      body: t.Object({
        username: t.String(),
        password: t.String()
      })
    }
  )
  
  // Register route
  .post('/register',
    async ({ body, set }) => {
      const { username, email, password } = body;
      
      // Check if user exists
      const existingUser = await db.query.users.findFirst({
        where: eq(users.username, username)
      });
      
      if (existingUser) {
        set.status = 409;
        return { success: false, message: 'Username already exists' };
      }
      
      // Hash password
      const passwordHash = await hashPassword(password);
      
      // Create user
      const now = Date.now();
      await db.insert(users).values({
        id: crypto.randomUUID(),
        username,
        email,
        passwordHash,
        role: 'user',
        createdAt: now,
        updatedAt: now
      });
      
      return { success: true, message: 'User registered successfully' };
    },
    {
      body: t.Object({
        username: t.String(),
        email: t.String(),
        password: t.String()
      })
    }
  );

// Auth middleware
export const authMiddleware = new Elysia()
  .derive(({ headers, set }) => {
    const authHeader = headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      set.status = 401;
      return { isAuthenticated: false, user: null };
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      return { isAuthenticated: true, user: decoded };
    } catch (error) {
      set.status = 401;
      return { isAuthenticated: false, user: null };
    }
  });
```

## 📈 Current Progress (June 13, 2025)

### ✅ Completed
- **Project Foundation** - All tasks completed
  - React + TypeScript project structure set up
  - Bun runtime configured for optimal performance
  - Docker API integration implemented
  - Frontend with React and Tailwind CSS
  - WebSocket support for real-time updates
- **Frontend Components** - All tasks completed
  - Proxy Management Components
  - Metrics and Monitoring Components
  - Settings Components
- **Backend Infrastructure** - All tasks completed
  - Bun server with routing
  - Docker API integration
  - REST API endpoints for container operations
  - WebSocket server for real-time updates
  - CORS and middleware configuration

### 🚧 In Progress
- **Multi-User & API** - Completing final features
  - Team/organization support
  - Resource quotas and limits
  - API client libraries
  - Webhook support
  - CLI tool for power users
- **Operations & Maintenance** - Implementing remaining features
  - Automated backup procedures
  - Update and migration system
- **Scalability & Performance** - Finalizing
  - Horizontal scaling support

### 📈 Progress Metrics
- Frontend Components: 100% complete
- Backend Integration: 100% complete
- Docker Integration: 100% complete
- Security & Authentication: 100% complete
- API Documentation: 100% complete
- Multi-User Support: 60% complete
- Operations & Maintenance: 60% complete
- Scalability & Performance: 80% complete
- Overall Progress: 92% complete
