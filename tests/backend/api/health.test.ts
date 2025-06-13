import { describe, expect, it, beforeEach, jest, afterEach } from 'bun:test';
import { Elysia } from 'elysia';
import { healthRoutes } from '@backend/src/api/health';
import { db } from '@backend/src/db';
import { HealthStatus } from '@shared/src/models';
import os from 'os';

// Mock the database
jest.mock('@backend/src/db', () => ({
  db: {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    fn: {
      count: jest.fn()
    },
    dynamic: jest.fn()
  }
}));

// Mock os module
jest.mock('os', () => ({
  totalmem: jest.fn(),
  freemem: jest.fn(),
  loadavg: jest.fn(),
  cpus: jest.fn(),
  hostname: jest.fn()
}));

// Mock the auth middleware
jest.mock('@backend/src/middleware/auth', () => ({
  adminOnly: {
    handle: (req: any) => req,
    onRequest: (req: any) => req
  }
}));

describe('Health API Routes', () => {
  let app: Elysia;
  
  beforeEach(() => {
    // Reset all mocks
    jest.resetAllMocks();
    
    // Create a new Elysia app with the health routes
    app = new Elysia().use(healthRoutes);
    
    // Mock os functions
    (os.totalmem as jest.Mock).mockReturnValue(8589934592); // 8GB
    (os.freemem as jest.Mock).mockReturnValue(4294967296); // 4GB
    (os.loadavg as jest.Mock).mockReturnValue([1.5, 1.2, 0.8]);
    (os.cpus as jest.Mock).mockReturnValue([
      { model: 'Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz', speed: 2600 },
      { model: 'Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz', speed: 2600 },
      { model: 'Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz', speed: 2600 },
      { model: 'Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz', speed: 2600 }
    ]);
    (os.hostname as jest.Mock).mockReturnValue('test-host');
    
    // Mock db query
    (db.select as jest.Mock).mockReturnThis();
    (db.from as jest.Mock).mockResolvedValue([{ count: 1 }]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /', () => {
    it('should return basic health status', async () => {
      const response = await app.handle(new Request('http://localhost/health'));
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({
        status: 'ok',
        timestamp: expect.any(String),
        version: expect.any(String)
      });
    });
  });

  describe('GET /detailed', () => {
    it('should return detailed health status when database is healthy', async () => {
      const response = await app.handle(new Request('http://localhost/health/detailed'));
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({
        status: HealthStatus.HEALTHY,
        timestamp: expect.any(String),
        version: expect.any(String),
        uptime: expect.any(Number),
        components: {
          database: {
            status: HealthStatus.HEALTHY,
            message: 'Database connection is healthy'
          },
          system: {
            status: HealthStatus.HEALTHY,
            cpu: {
              cores: 4,
              model: 'Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz',
              load: 0.375 // 1.5 / 4
            },
            memory: {
              total: 8589934592,
              free: 4294967296,
              usage: 0.5
            }
          },
          disk: {
            status: HealthStatus.HEALTHY
          }
        }
      });
      
      expect(db.select).toHaveBeenCalled();
      expect(db.from).toHaveBeenCalled();
      expect(os.totalmem).toHaveBeenCalled();
      expect(os.freemem).toHaveBeenCalled();
      expect(os.loadavg).toHaveBeenCalled();
      expect(os.cpus).toHaveBeenCalled();
    });

    it('should return degraded status when memory usage is high', async () => {
      // Mock high memory usage (90%)
      (os.freemem as jest.Mock).mockReturnValue(858993459); // 10% free
      
      const response = await app.handle(new Request('http://localhost/health/detailed'));
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body.status).toBe(HealthStatus.DEGRADED);
      expect(body.components.system.status).toBe(HealthStatus.DEGRADED);
    });

    it('should return unhealthy status when memory usage is critical', async () => {
      // Mock critical memory usage (96%)
      (os.freemem as jest.Mock).mockReturnValue(343597384); // 4% free
      
      const response = await app.handle(new Request('http://localhost/health/detailed'));
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body.status).toBe(HealthStatus.UNHEALTHY);
      expect(body.components.system.status).toBe(HealthStatus.UNHEALTHY);
    });

    it('should return unhealthy status when CPU load is critical', async () => {
      // Mock critical CPU load (96%)
      (os.loadavg as jest.Mock).mockReturnValue([3.84, 3.5, 3.0]); // 3.84 / 4 = 0.96
      
      const response = await app.handle(new Request('http://localhost/health/detailed'));
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body.status).toBe(HealthStatus.UNHEALTHY);
      expect(body.components.system.status).toBe(HealthStatus.UNHEALTHY);
    });

    it('should return unhealthy status when database connection fails', async () => {
      // Mock database connection failure
      (db.from as jest.Mock).mockRejectedValue(new Error('Database connection error'));
      
      const response = await app.handle(new Request('http://localhost/health/detailed'));
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body.status).toBe(HealthStatus.UNHEALTHY);
      expect(body.components.database.status).toBe(HealthStatus.UNHEALTHY);
      expect(body.components.database.message).toContain('Database connection error');
    });
  });

  describe('GET /metrics', () => {
    it('should return metrics in Prometheus format', async () => {
      const response = await app.handle(new Request('http://localhost/health/metrics'));
      const text = await response.text();
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/plain; version=0.0.4');
      
      // Check that the response contains Prometheus-formatted metrics
      expect(text).toContain('# HELP kontainers_uptime_seconds');
      expect(text).toContain('# TYPE kontainers_uptime_seconds gauge');
      expect(text).toContain('kontainers_uptime_seconds');
      
      expect(text).toContain('# HELP kontainers_cpu_count');
      expect(text).toContain('kontainers_cpu_count 4');
      
      expect(text).toContain('# HELP kontainers_cpu_load');
      expect(text).toContain('kontainers_cpu_load 1.5');
      
      expect(text).toContain('# HELP kontainers_memory_total_bytes');
      expect(text).toContain('kontainers_memory_total_bytes 8589934592');
      
      expect(text).toContain('# HELP kontainers_memory_free_bytes');
      expect(text).toContain('kontainers_memory_free_bytes 4294967296');
      
      expect(text).toContain('# HELP kontainers_memory_usage');
      expect(text).toContain('kontainers_memory_usage 0.5');
    });
  });
});