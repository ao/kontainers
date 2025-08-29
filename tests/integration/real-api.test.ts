import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { spawn, ChildProcess } from 'child_process';

describe('Real API Integration', () => {
  let serverProcess: ChildProcess;
  const baseUrl = 'http://localhost:3000';

  beforeAll(async () => {
    // Start the real server
    serverProcess = spawn('bun', ['run', 'dev'], {
      stdio: 'pipe',
      cwd: process.cwd()
    });

    // Wait for server to start
    await waitForServer(baseUrl, 10000);
  });

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  it('should respond to health check', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.status).toBe('healthy');
    expect(data.version).toBe('1.0.0');
  });

  it('should serve the main application', async () => {
    const response = await fetch(baseUrl);
    expect(response.status).toBe(200);
    
    const text = await response.text();
    expect(text).toContain('Kontainers Container Management');
  });

  it('should handle Docker API calls', async () => {
    const response = await fetch(`${baseUrl}/api/containers`);
    expect(response.status).toBe(200);
    
    const containers = await response.json();
    expect(Array.isArray(containers)).toBe(true);
  });

  it('should create and manage real containers via API', async () => {
    // Create a container via API
    const createResponse = await fetch(`${baseUrl}/api/containers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'api-test-container',
        image: 'alpine:latest',
        command: ['echo', 'hello from api']
      })
    });

    expect(createResponse.status).toBe(200);
    const container = await createResponse.json();
    expect(container.id).toBeTruthy();
    expect(container.name).toBe('api-test-container');

    try {
      // Start the container
      const startResponse = await fetch(`${baseUrl}/api/containers/${container.id}/start`, {
        method: 'PUT'
      });
      expect(startResponse.status).toBe(200);

      // Get container logs
      const logsResponse = await fetch(`${baseUrl}/api/containers/${container.id}/logs`);
      expect(logsResponse.status).toBe(200);

    } finally {
      // Clean up
      await fetch(`${baseUrl}/api/containers/${container.id}`, {
        method: 'DELETE'
      });
    }
  });

  it('should handle authentication endpoints', async () => {
    // Test login
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'password123'
      })
    });

    expect(loginResponse.status).toBe(200);
    const loginData = await loginResponse.json();
    expect(loginData.token).toBeTruthy();
    expect(loginData.user.email).toBe('admin@example.com');

    // Test registration
    const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      })
    });

    expect(registerResponse.status).toBe(200);
    const registerData = await registerResponse.json();
    expect(registerData.name).toBe('Test User');
    expect(registerData.email).toBe('test@example.com');
  });

  it('should handle proxy management endpoints', async () => {
    // Test proxy rules listing
    const listResponse = await fetch(`${baseUrl}/api/proxy/rules`);
    expect(listResponse.status).toBe(200);
    
    const rules = await listResponse.json();
    expect(Array.isArray(rules)).toBe(true);

    // Test proxy rule creation
    const createResponse = await fetch(`${baseUrl}/api/proxy/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: 'test.example.com',
        target: 'http://localhost:3001',
        ssl: true
      })
    });

    expect(createResponse.status).toBe(200);
    const rule = await createResponse.json();
    expect(rule.domain).toBe('test.example.com');
    expect(rule.ssl).toBe(true);
  });

  it('should handle system monitoring endpoints', async () => {
    // Test system info
    const infoResponse = await fetch(`${baseUrl}/api/system/info`);
    expect(infoResponse.status).toBe(200);
    
    const info = await infoResponse.json();
    expect(info.version).toBe('1.0.0');
    expect(info.uptime).toBeGreaterThanOrEqual(0);

    // Test system metrics
    const metricsResponse = await fetch(`${baseUrl}/api/system/metrics`);
    expect(metricsResponse.status).toBe(200);
    
    const metrics = await metricsResponse.json();
    expect(metrics.cpu.usage).toBeGreaterThanOrEqual(0);
    expect(metrics.memory.total).toBeGreaterThan(0);
  });
});

async function waitForServer(url: string, timeout: number): Promise<void> {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      if (response.status === 200) {
        return;
      }
    } catch (error) {
      // Server not ready yet
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  throw new Error(`Server did not start within ${timeout}ms`);
}
