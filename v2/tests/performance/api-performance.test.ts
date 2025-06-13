import { describe, expect, test, beforeAll, afterAll } from "bun:test";
// Use the built-in performance API

// Mock server or use a test instance of the actual server
let server: any;
const API_BASE_URL = "http://localhost:3000";

// Performance metrics
const metrics = {
  endpoints: {} as Record<string, {
    responseTime: number[],
    throughput: number
  }>
};

// Helper function to measure response time
async function measureResponseTime(url: string, method = "GET", body?: any) {
  const start = performance.now();
  const response = await fetch(`${API_BASE_URL}${url}`, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const end = performance.now();
  return {
    responseTime: end - start,
    status: response.status,
    ok: response.ok,
  };
}

// Helper function to measure throughput
async function measureThroughput(url: string, requestCount: number, concurrency: number) {
  const start = performance.now();
  const batches = Math.ceil(requestCount / concurrency);
  
  for (let i = 0; i < batches; i++) {
    const batchSize = Math.min(concurrency, requestCount - i * concurrency);
    const promises = Array(batchSize).fill(0).map(() => 
      fetch(`${API_BASE_URL}${url}`).then(res => res.ok)
    );
    await Promise.all(promises);
  }
  
  const end = performance.now();
  const totalTime = (end - start) / 1000; // in seconds
  return requestCount / totalTime; // requests per second
}

beforeAll(async () => {
  // Start a test server or connect to an existing one
  // server = await startTestServer();
  console.log("Performance tests starting...");
});

afterAll(async () => {
  // Shutdown the test server
  // await server.close();
  
  // Output performance metrics in a format that can be parsed by the GitHub Action
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    metrics: Object.entries(metrics.endpoints).map(([endpoint, data]) => ({
      name: `API ${endpoint}`,
      value: {
        avgResponseTime: data.responseTime.reduce((a, b) => a + b, 0) / data.responseTime.length,
        p95ResponseTime: data.responseTime.sort((a, b) => a - b)[Math.floor(data.responseTime.length * 0.95)],
        throughput: data.throughput
      }
    }))
  }, null, 2));
});

describe("API Performance Tests", () => {
  test("GET /api/containers - Response Time", async () => {
    const endpoint = "/api/containers";
    metrics.endpoints[endpoint] = metrics.endpoints[endpoint] || { responseTime: [], throughput: 0 };
    
    // Run multiple samples
    for (let i = 0; i < 10; i++) {
      const { responseTime, ok } = await measureResponseTime(endpoint);
      expect(ok).toBe(true);
      metrics.endpoints[endpoint].responseTime.push(responseTime);
    }
    
    // Calculate average response time
    const avgResponseTime = metrics.endpoints[endpoint].responseTime.reduce((a, b) => a + b, 0) / 
                           metrics.endpoints[endpoint].responseTime.length;
    
    console.log(`Average response time for ${endpoint}: ${avgResponseTime.toFixed(2)}ms`);
    
    // Assert that response time is within acceptable limits
    expect(avgResponseTime).toBeLessThan(200); // 200ms threshold
  });
  
  test("GET /api/containers - Throughput", async () => {
    const endpoint = "/api/containers";
    metrics.endpoints[endpoint] = metrics.endpoints[endpoint] || { responseTime: [], throughput: 0 };
    
    // Measure throughput with 100 requests, 10 concurrent
    const throughput = await measureThroughput(endpoint, 100, 10);
    metrics.endpoints[endpoint].throughput = throughput;
    
    console.log(`Throughput for ${endpoint}: ${throughput.toFixed(2)} requests/second`);
    
    // Assert that throughput is above minimum threshold
    expect(throughput).toBeGreaterThan(50); // 50 req/s threshold
  });
  
  test("GET /api/proxy/rules - Response Time", async () => {
    const endpoint = "/api/proxy/rules";
    metrics.endpoints[endpoint] = metrics.endpoints[endpoint] || { responseTime: [], throughput: 0 };
    
    // Run multiple samples
    for (let i = 0; i < 10; i++) {
      const { responseTime, ok } = await measureResponseTime(endpoint);
      expect(ok).toBe(true);
      metrics.endpoints[endpoint].responseTime.push(responseTime);
    }
    
    // Calculate average response time
    const avgResponseTime = metrics.endpoints[endpoint].responseTime.reduce((a, b) => a + b, 0) / 
                           metrics.endpoints[endpoint].responseTime.length;
    
    console.log(`Average response time for ${endpoint}: ${avgResponseTime.toFixed(2)}ms`);
    
    // Assert that response time is within acceptable limits
    expect(avgResponseTime).toBeLessThan(200); // 200ms threshold
  });
  
  test("GET /api/proxy/rules - Throughput", async () => {
    const endpoint = "/api/proxy/rules";
    metrics.endpoints[endpoint] = metrics.endpoints[endpoint] || { responseTime: [], throughput: 0 };
    
    // Measure throughput with 100 requests, 10 concurrent
    const throughput = await measureThroughput(endpoint, 100, 10);
    metrics.endpoints[endpoint].throughput = throughput;
    
    console.log(`Throughput for ${endpoint}: ${throughput.toFixed(2)} requests/second`);
    
    // Assert that throughput is above minimum threshold
    expect(throughput).toBeGreaterThan(50); // 50 req/s threshold
  });
});