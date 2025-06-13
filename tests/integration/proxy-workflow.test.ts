import { describe, expect, it, beforeEach, jest, afterEach } from 'bun:test';
import { Elysia } from 'elysia';
import { proxyRoutes } from '@backend/src/api/proxy';
import { proxyService } from '@backend/src/services/proxy';
import { nginxService } from '@backend/src/integrations/nginx';
import { WebSocket } from 'ws';

// Mock the proxy service
jest.mock('@backend/src/services/proxy', () => ({
  proxyService: {
    createRule: jest.fn(),
    updateRule: jest.fn(),
    deleteRule: jest.fn(),
    getRules: jest.fn(),
    getRule: jest.fn(),
    testRule: jest.fn(),
    getTrafficData: jest.fn(),
    getErrorData: jest.fn(),
    subscribeToTrafficUpdates: jest.fn(),
    unsubscribeFromTrafficUpdates: jest.fn()
  }
}));

// Mock the nginx integration
jest.mock('@backend/src/integrations/nginx', () => ({
  nginxService: {
    applyConfig: jest.fn(),
    validateConfig: jest.fn(),
    reloadConfig: jest.fn(),
    getStatus: jest.fn()
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

describe('Proxy Rule Creation and Traffic Routing Integration', () => {
  let app: Elysia;
  
  const mockProxyRule = {
    id: 'rule-1',
    name: 'Test Rule',
    domain: 'test.example.com',
    targetUrl: 'http://localhost:8080',
    path: '/',
    pathRewrite: null,
    methods: ['GET', 'POST'],
    enabled: true,
    sslEnabled: false,
    authEnabled: false,
    rateLimitEnabled: false,
    rateLimitRequests: 100,
    rateLimitPeriod: 60,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  const mockTrafficData = {
    ruleId: 'rule-1',
    timestamp: new Date().toISOString(),
    requestCount: 100,
    responseTimeAvg: 45,
    statusCodes: {
      '200': 95,
      '404': 3,
      '500': 2
    },
    bandwidth: 1024000
  };
  
  const mockErrorData = {
    ruleId: 'rule-1',
    timestamp: new Date().toISOString(),
    errors: [
      {
        code: 'ERR_TIMEOUT',
        message: 'Connection timeout',
        count: 2,
        lastOccurred: new Date().toISOString()
      }
    ]
  };
  
  beforeEach(() => {
    // Reset all mocks
    jest.resetAllMocks();
    
    // Create a new Elysia app with the proxy routes
    app = new Elysia().use(proxyRoutes);
    
    // Default mock implementations
    (proxyService.createRule as jest.Mock).mockResolvedValue(mockProxyRule);
    (proxyService.updateRule as jest.Mock).mockResolvedValue(mockProxyRule);
    (proxyService.deleteRule as jest.Mock).mockResolvedValue(undefined);
    (proxyService.getRules as jest.Mock).mockResolvedValue([mockProxyRule]);
    (proxyService.getRule as jest.Mock).mockResolvedValue(mockProxyRule);
    (proxyService.testRule as jest.Mock).mockResolvedValue({ success: true, statusCode: 200, responseTime: 45 });
    (proxyService.getTrafficData as jest.Mock).mockResolvedValue(mockTrafficData);
    (proxyService.getErrorData as jest.Mock).mockResolvedValue(mockErrorData);
    
    (nginxService.applyConfig as jest.Mock).mockResolvedValue({ success: true });
    (nginxService.validateConfig as jest.Mock).mockResolvedValue({ valid: true });
    (nginxService.reloadConfig as jest.Mock).mockResolvedValue({ success: true });
    (nginxService.getStatus as jest.Mock).mockResolvedValue({ running: true, version: '1.20.0' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create a proxy rule and apply nginx configuration', async () => {
    // Step 1: Create a new proxy rule
    const createResponse = await app.handle(
      new Request('http://localhost/proxy/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Rule',
          domain: 'test.example.com',
          targetUrl: 'http://localhost:8080',
          path: '/',
          methods: ['GET', 'POST'],
          enabled: true
        })
      })
    );
    
    const createBody = await createResponse.json();
    
    expect(createResponse.status).toBe(200);
    expect(createBody).toEqual(mockProxyRule);
    expect(proxyService.createRule).toHaveBeenCalledWith({
      name: 'Test Rule',
      domain: 'test.example.com',
      targetUrl: 'http://localhost:8080',
      path: '/',
      methods: ['GET', 'POST'],
      enabled: true
    });
    
    // Step 2: Verify nginx configuration was applied
    expect(nginxService.validateConfig).toHaveBeenCalled();
    expect(nginxService.applyConfig).toHaveBeenCalled();
    expect(nginxService.reloadConfig).toHaveBeenCalled();
    
    // Step 3: Test the proxy rule
    const testResponse = await app.handle(
      new Request('http://localhost/proxy/rules/rule-1/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'GET',
          path: '/',
          headers: {}
        })
      })
    );
    
    const testBody = await testResponse.json();
    
    expect(testResponse.status).toBe(200);
    expect(testBody).toEqual({ success: true, statusCode: 200, responseTime: 45 });
    expect(proxyService.testRule).toHaveBeenCalledWith('rule-1', {
      method: 'GET',
      path: '/',
      headers: {}
    });
    
    // Step 4: Get traffic data for the rule
    const trafficResponse = await app.handle(
      new Request('http://localhost/proxy/rules/rule-1/traffic')
    );
    
    const trafficBody = await trafficResponse.json();
    
    expect(trafficResponse.status).toBe(200);
    expect(trafficBody).toEqual(mockTrafficData);
    expect(proxyService.getTrafficData).toHaveBeenCalledWith('rule-1');
    
    // Step 5: Get error data for the rule
    const errorResponse = await app.handle(
      new Request('http://localhost/proxy/rules/rule-1/errors')
    );
    
    const errorBody = await errorResponse.json();
    
    expect(errorResponse.status).toBe(200);
    expect(errorBody).toEqual(mockErrorData);
    expect(proxyService.getErrorData).toHaveBeenCalledWith('rule-1');
  });

  it('should handle proxy rule updates and configuration changes', async () => {
    // Update an existing proxy rule
    const updatedRule = {
      ...mockProxyRule,
      path: '/api',
      pathRewrite: '^/api',
      sslEnabled: true
    };
    
    (proxyService.updateRule as jest.Mock).mockResolvedValue(updatedRule);
    
    const updateResponse = await app.handle(
      new Request('http://localhost/proxy/rules/rule-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: '/api',
          pathRewrite: '^/api',
          sslEnabled: true
        })
      })
    );
    
    const updateBody = await updateResponse.json();
    
    expect(updateResponse.status).toBe(200);
    expect(updateBody).toEqual(updatedRule);
    expect(proxyService.updateRule).toHaveBeenCalledWith('rule-1', {
      path: '/api',
      pathRewrite: '^/api',
      sslEnabled: true
    });
    
    // Verify nginx configuration was reapplied
    expect(nginxService.validateConfig).toHaveBeenCalled();
    expect(nginxService.applyConfig).toHaveBeenCalled();
    expect(nginxService.reloadConfig).toHaveBeenCalled();
  });

  it('should handle proxy rule deletion and configuration changes', async () => {
    const deleteResponse = await app.handle(
      new Request('http://localhost/proxy/rules/rule-1', {
        method: 'DELETE'
      })
    );
    
    const deleteBody = await deleteResponse.json();
    
    expect(deleteResponse.status).toBe(200);
    expect(deleteBody).toEqual({ success: true, id: 'rule-1' });
    expect(proxyService.deleteRule).toHaveBeenCalledWith('rule-1');
    
    // Verify nginx configuration was reapplied
    expect(nginxService.validateConfig).toHaveBeenCalled();
    expect(nginxService.applyConfig).toHaveBeenCalled();
    expect(nginxService.reloadConfig).toHaveBeenCalled();
  });

  it('should handle real-time traffic monitoring via WebSocket', async () => {
    // Mock the WebSocket connection
    const mockWs = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn()
    };
    
    // Mock the WebSocket context
    const mockContext = {
      ws: mockWs,
      query: { ruleId: 'rule-1' }
    };
    
    // Get the WebSocket handler
    const wsHandler = app.routes.find(r => r.path === '/proxy/traffic')?.handler;
    
    // Call the handler with the mock context
    if (wsHandler) {
      await wsHandler(mockContext);
    }
    
    // Verify subscription was set up
    expect(proxyService.subscribeToTrafficUpdates).toHaveBeenCalledWith('rule-1', expect.any(Function));
    
    // Simulate receiving traffic data
    const trafficUpdateCallback = (proxyService.subscribeToTrafficUpdates as jest.Mock).mock.calls[0][1];
    trafficUpdateCallback(mockTrafficData);
    
    // Verify data was sent to the client
    expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify(mockTrafficData));
    
    // Simulate connection close
    const closeHandler = mockWs.on.mock.calls.find(call => call[0] === 'close')[1];
    closeHandler();
    
    // Verify unsubscribe was called
    expect(proxyService.unsubscribeFromTrafficUpdates).toHaveBeenCalledWith('rule-1');
  });

  it('should handle error scenarios gracefully', async () => {
    // Mock a validation error
    (nginxService.validateConfig as jest.Mock).mockResolvedValue({
      valid: false,
      errors: ['Invalid server_name directive']
    });
    
    const createResponse = await app.handle(
      new Request('http://localhost/proxy/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Invalid Rule',
          domain: 'invalid domain',
          targetUrl: 'http://localhost:8080',
          path: '/',
          methods: ['GET'],
          enabled: true
        })
      })
    );
    
    expect(createResponse.status).toBe(400);
    const createBody = await createResponse.json();
    expect(createBody.error).toBeDefined();
    
    // Nginx should not be reloaded if validation fails
    expect(nginxService.reloadConfig).not.toHaveBeenCalled();
  });
});