import { describe, expect, it, beforeEach, jest, afterEach } from 'bun:test';
import { Elysia } from 'elysia';
import { containersRoutes } from '@backend/src/api/containers';
import { containerService } from '@backend/src/services/container';
import { WebSocket } from 'ws';

// Mock the container service
jest.mock('@backend/src/services/container', () => ({
  containerService: {
    getContainers: jest.fn(),
    getContainer: jest.fn(),
    createContainer: jest.fn(),
    startContainer: jest.fn(),
    stopContainer: jest.fn(),
    restartContainer: jest.fn(),
    pauseContainer: jest.fn(),
    unpauseContainer: jest.fn(),
    removeContainer: jest.fn(),
    getContainerLogs: jest.fn(),
    getContainerStats: jest.fn(),
    getDetailedContainerStats: jest.fn(),
    startLogStreaming: jest.fn(),
    stopLogStreaming: jest.fn(),
    startStatsMonitoring: jest.fn(),
    stopStatsMonitoring: jest.fn(),
    on: jest.fn()
  }
}));

// Mock WebSocket
jest.mock('ws', () => ({
  WebSocket: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    send: jest.fn(),
    close: jest.fn()
  }))
}));

describe('Container Creation and Monitoring Integration', () => {
  let app: Elysia;
  
  const mockContainer = {
    id: 'container-1',
    name: 'test-nginx',
    image: 'nginx:latest',
    state: 'RUNNING',
    status: 'Up 2 minutes',
    created: new Date().toISOString(),
    ports: [
      { privatePort: 80, publicPort: 8080, type: 'tcp', ip: '0.0.0.0' }
    ],
    networks: ['bridge'],
    volumes: [
      { source: '/host/path', destination: '/container/path', mode: 'rw' }
    ],
    env: ['NGINX_VERSION=1.21.0'],
    labels: { 'com.example.vendor': 'ACME' }
  };
  
  const mockContainerStats = {
    cpuUsage: 5.2,
    memoryUsage: 52428800, // 50MB
    memoryLimit: 1073741824, // 1GB
    memoryUsagePercentage: 4.88,
    networkRx: 1024000, // 1MB
    networkTx: 512000, // 0.5MB
    blockRead: 2048000, // 2MB
    blockWrite: 1024000 // 1MB
  };
  
  const mockDetailedStats = {
    ...mockContainerStats,
    cpuKernelUsage: 1.3,
    cpuUserUsage: 3.9,
    cpuSystemUsage: 0.5,
    cpuOnlineCpus: 4,
    memoryCache: 10485760, // 10MB
    memorySwap: 0,
    memorySwapLimit: 2147483648, // 2GB
    networkPacketsRx: 1000,
    networkPacketsTx: 500,
    networkThroughput: 10240, // 10KB/s
    blockReadOps: 200,
    blockWriteOps: 100,
    blockThroughput: 5120, // 5KB/s
    pids: 5,
    restartCount: 0,
    healthStatus: 'HEALTHY',
    healthCheckLogs: ['Health check passed']
  };
  
  const mockLogs = 'Line 1: Starting nginx\nLine 2: Nginx started successfully\nLine 3: Handling connection';
  
  beforeEach(() => {
    // Reset all mocks
    jest.resetAllMocks();
    
    // Create a new Elysia app with the containers routes
    app = new Elysia().use(containersRoutes);
    
    // Default mock implementations
    (containerService.getContainers as jest.Mock).mockResolvedValue([mockContainer]);
    (containerService.getContainer as jest.Mock).mockResolvedValue(mockContainer);
    (containerService.createContainer as jest.Mock).mockResolvedValue(mockContainer);
    (containerService.startContainer as jest.Mock).mockResolvedValue(undefined);
    (containerService.stopContainer as jest.Mock).mockResolvedValue(undefined);
    (containerService.restartContainer as jest.Mock).mockResolvedValue(undefined);
    (containerService.pauseContainer as jest.Mock).mockResolvedValue(undefined);
    (containerService.unpauseContainer as jest.Mock).mockResolvedValue(undefined);
    (containerService.removeContainer as jest.Mock).mockResolvedValue(undefined);
    (containerService.getContainerLogs as jest.Mock).mockResolvedValue(mockLogs);
    (containerService.getContainerStats as jest.Mock).mockResolvedValue(mockContainerStats);
    (containerService.getDetailedContainerStats as jest.Mock).mockResolvedValue(mockDetailedStats);
    (containerService.startLogStreaming as jest.Mock).mockReturnValue(undefined);
    (containerService.stopLogStreaming as jest.Mock).mockReturnValue(undefined);
    (containerService.startStatsMonitoring as jest.Mock).mockReturnValue(undefined);
    (containerService.stopStatsMonitoring as jest.Mock).mockReturnValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create a container and monitor its lifecycle', async () => {
    // Step 1: Create a new container
    const createResponse = await app.handle(
      new Request('http://localhost/containers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test-nginx',
          image: 'nginx:latest',
          ports: [{ internal: 80, external: 8080 }]
        })
      })
    );
    
    const createBody = await createResponse.json();
    
    expect(createResponse.status).toBe(200);
    expect(createBody).toEqual(mockContainer);
    expect(containerService.createContainer).toHaveBeenCalledWith({
      name: 'test-nginx',
      image: 'nginx:latest',
      ports: [{ internal: 80, external: 8080 }]
    });
    
    // Step 2: Get container details
    const detailsResponse = await app.handle(
      new Request(`http://localhost/containers/${mockContainer.id}`)
    );
    
    const detailsBody = await detailsResponse.json();
    
    expect(detailsResponse.status).toBe(200);
    expect(detailsBody).toEqual(mockContainer);
    expect(containerService.getContainer).toHaveBeenCalledWith(mockContainer.id);
    
    // Step 3: Get container logs
    const logsResponse = await app.handle(
      new Request(`http://localhost/containers/${mockContainer.id}/logs?tail=100`)
    );
    
    const logsBody = await logsResponse.json();
    
    expect(logsResponse.status).toBe(200);
    expect(logsBody).toEqual({ id: mockContainer.id, logs: mockLogs });
    expect(containerService.getContainerLogs).toHaveBeenCalledWith(mockContainer.id, {
      tail: 100,
      since: undefined,
      until: undefined
    });
    
    // Step 4: Get container stats
    const statsResponse = await app.handle(
      new Request(`http://localhost/containers/${mockContainer.id}/stats`)
    );
    
    const statsBody = await statsResponse.json();
    
    expect(statsResponse.status).toBe(200);
    expect(statsBody).toEqual({ id: mockContainer.id, stats: mockContainerStats });
    expect(containerService.getContainerStats).toHaveBeenCalledWith(mockContainer.id);
    
    // Step 5: Get detailed container stats
    const detailedStatsResponse = await app.handle(
      new Request(`http://localhost/containers/${mockContainer.id}/stats?detailed=true`)
    );
    
    const detailedStatsBody = await detailedStatsResponse.json();
    
    expect(detailedStatsResponse.status).toBe(200);
    expect(detailedStatsBody).toEqual({ id: mockContainer.id, stats: mockDetailedStats });
    expect(containerService.getDetailedContainerStats).toHaveBeenCalledWith(mockContainer.id);
    
    // Step 6: Stop the container
    const stopResponse = await app.handle(
      new Request(`http://localhost/containers/${mockContainer.id}/stop`, {
        method: 'POST'
      })
    );
    
    const stopBody = await stopResponse.json();
    
    expect(stopResponse.status).toBe(200);
    expect(stopBody).toEqual({ success: true, id: mockContainer.id });
    expect(containerService.stopContainer).toHaveBeenCalledWith(mockContainer.id);
    
    // Step 7: Start the container
    const startResponse = await app.handle(
      new Request(`http://localhost/containers/${mockContainer.id}/start`, {
        method: 'POST'
      })
    );
    
    const startBody = await startResponse.json();
    
    expect(startResponse.status).toBe(200);
    expect(startBody).toEqual({ success: true, id: mockContainer.id });
    expect(containerService.startContainer).toHaveBeenCalledWith(mockContainer.id);
    
    // Step 8: Restart the container
    const restartResponse = await app.handle(
      new Request(`http://localhost/containers/${mockContainer.id}/restart`, {
        method: 'POST'
      })
    );
    
    const restartBody = await restartResponse.json();
    
    expect(restartResponse.status).toBe(200);
    expect(restartBody).toEqual({ success: true, id: mockContainer.id });
    expect(containerService.restartContainer).toHaveBeenCalledWith(mockContainer.id);
  });

  it('should handle real-time log streaming via WebSocket', async () => {
    // Mock the WebSocket connection
    const mockWs = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn()
    };
    
    // Mock the WebSocket context
    const mockContext = {
      ws: mockWs,
      query: { id: mockContainer.id }
    };
    
    // Get the WebSocket handler
    const wsHandler = app.routes.find(r => r.path === '/containers/:id/logs/stream')?.handler;
    
    // Call the handler with the mock context
    if (wsHandler) {
      await wsHandler(mockContext);
    }
    
    // Verify log streaming was started
    expect(containerService.startLogStreaming).toHaveBeenCalledWith(mockContainer.id, expect.any(Function));
    
    // Simulate receiving log data
    const logCallback = (containerService.startLogStreaming as jest.Mock).mock.calls[0][1];
    logCallback('New log line');
    
    // Verify data was sent to the client
    expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ log: 'New log line' }));
    
    // Simulate connection close
    const closeHandler = mockWs.on.mock.calls.find(call => call[0] === 'close')[1];
    closeHandler();
    
    // Verify log streaming was stopped
    expect(containerService.stopLogStreaming).toHaveBeenCalledWith(mockContainer.id);
  });

  it('should handle real-time stats monitoring via WebSocket', async () => {
    // Mock the WebSocket connection
    const mockWs = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn()
    };
    
    // Mock the WebSocket context
    const mockContext = {
      ws: mockWs,
      query: { id: mockContainer.id }
    };
    
    // Get the WebSocket handler
    const wsHandler = app.routes.find(r => r.path === '/containers/:id/stats/stream')?.handler;
    
    // Call the handler with the mock context
    if (wsHandler) {
      await wsHandler(mockContext);
    }
    
    // Verify stats monitoring was started
    expect(containerService.startStatsMonitoring).toHaveBeenCalledWith(mockContainer.id, expect.any(Function));
    
    // Simulate receiving stats data
    const statsCallback = (containerService.startStatsMonitoring as jest.Mock).mock.calls[0][1];
    statsCallback(mockContainerStats);
    
    // Verify data was sent to the client
    expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ stats: mockContainerStats }));
    
    // Simulate connection close
    const closeHandler = mockWs.on.mock.calls.find(call => call[0] === 'close')[1];
    closeHandler();
    
    // Verify stats monitoring was stopped
    expect(containerService.stopStatsMonitoring).toHaveBeenCalledWith(mockContainer.id);
  });

  it('should handle container removal', async () => {
    const removeResponse = await app.handle(
      new Request(`http://localhost/containers/${mockContainer.id}`, {
        method: 'DELETE'
      })
    );
    
    const removeBody = await removeResponse.json();
    
    expect(removeResponse.status).toBe(200);
    expect(removeBody).toEqual({ success: true, id: mockContainer.id });
    expect(containerService.removeContainer).toHaveBeenCalledWith(mockContainer.id, false);
    
    // Test force removal
    const forceRemoveResponse = await app.handle(
      new Request(`http://localhost/containers/${mockContainer.id}?force=true`, {
        method: 'DELETE'
      })
    );
    
    const forceRemoveBody = await forceRemoveResponse.json();
    
    expect(forceRemoveResponse.status).toBe(200);
    expect(forceRemoveBody).toEqual({ success: true, id: mockContainer.id });
    expect(containerService.removeContainer).toHaveBeenCalledWith(mockContainer.id, true);
  });

  it('should handle error scenarios gracefully', async () => {
    // Mock a container not found error
    (containerService.getContainer as jest.Mock).mockRejectedValue(new Error('Container not found'));
    
    const response = await app.handle(
      new Request(`http://localhost/containers/non-existent-id`)
    );
    
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Container not found');
  });
});