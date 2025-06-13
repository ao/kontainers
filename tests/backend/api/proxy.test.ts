import { describe, expect, it, beforeEach, jest, afterEach } from 'bun:test';
import { Elysia } from 'elysia';
import { proxyRoutes } from '@backend/src/api/proxy';
import { proxyService } from '@backend/src/services/proxy';
import { ProxyProtocol } from '@shared/src/models';

// Mock the proxy service
jest.mock('@backend/src/services/proxy', () => ({
  proxyService: {
    getRules: jest.fn(),
    getRule: jest.fn(),
    createRule: jest.fn(),
    updateRule: jest.fn(),
    deleteRule: jest.fn(),
    toggleRule: jest.fn(),
    testRule: jest.fn(),
    getTrafficData: jest.fn(),
    getErrors: jest.fn(),
    resolveError: jest.fn(),
    getNginxStatus: jest.fn()
  }
}));

describe('Proxy API Routes', () => {
  let app: Elysia;
  
  beforeEach(() => {
    // Reset all mocks
    jest.resetAllMocks();
    
    // Create a new Elysia app with the proxy routes
    app = new Elysia().use(proxyRoutes);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /rules', () => {
    it('should return all proxy rules', async () => {
      const mockRules = [
        { id: 'rule-1', name: 'Rule 1', sourceHost: 'example.com' },
        { id: 'rule-2', name: 'Rule 2', sourceHost: 'test.com' }
      ];
      
      (proxyService.getRules as jest.Mock).mockResolvedValue(mockRules);
      
      const response = await app.handle(new Request('http://localhost/proxy/rules'));
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({ rules: mockRules });
      expect(proxyService.getRules).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /rules/:id', () => {
    it('should return a proxy rule by ID', async () => {
      const mockRule = { id: 'rule-1', name: 'Rule 1', sourceHost: 'example.com' };
      
      (proxyService.getRule as jest.Mock).mockResolvedValue(mockRule);
      
      const response = await app.handle(new Request('http://localhost/proxy/rules/rule-1'));
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual(mockRule);
      expect(proxyService.getRule).toHaveBeenCalledWith('rule-1');
    });

    it('should return 404 when rule is not found', async () => {
      (proxyService.getRule as jest.Mock).mockResolvedValue(null);
      
      const response = await app.handle(new Request('http://localhost/proxy/rules/non-existent'));
      const body = await response.json();
      
      expect(response.status).toBe(404);
      expect(body).toEqual({ error: 'Rule not found' });
      expect(proxyService.getRule).toHaveBeenCalledWith('non-existent');
    });
  });

  describe('POST /rules', () => {
    it('should create a new proxy rule', async () => {
      const mockRule = { 
        id: 'rule-1', 
        name: 'Rule 1', 
        sourceHost: 'example.com',
        sourcePath: '/',
        targetContainer: 'container-1',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        enabled: true
      };
      
      const mockRequest = {
        name: 'Rule 1',
        sourceHost: 'example.com',
        targetContainer: 'container-1',
        targetPort: 8080
      };
      
      (proxyService.createRule as jest.Mock).mockResolvedValue(mockRule);
      
      const response = await app.handle(
        new Request('http://localhost/proxy/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mockRequest)
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual(mockRule);
      expect(proxyService.createRule).toHaveBeenCalledWith({
        name: 'Rule 1',
        sourceHost: 'example.com',
        sourcePath: '/',
        targetContainer: 'container-1',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        sslEnabled: false,
        sslCertPath: undefined,
        sslKeyPath: undefined,
        headers: undefined,
        responseHeaders: undefined,
        healthCheck: undefined,
        loadBalancing: undefined,
        advancedConfig: undefined,
        customNginxConfig: undefined,
        enabled: true
      });
    });
  });

  describe('PUT /rules/:id', () => {
    it('should update a proxy rule', async () => {
      const mockRule = { 
        id: 'rule-1', 
        name: 'Updated Rule', 
        sourceHost: 'example.com',
        targetContainer: 'container-1',
        targetPort: 8080
      };
      
      const mockRequest = {
        name: 'Updated Rule'
      };
      
      (proxyService.updateRule as jest.Mock).mockResolvedValue(mockRule);
      
      const response = await app.handle(
        new Request('http://localhost/proxy/rules/rule-1', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mockRequest)
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual(mockRule);
      expect(proxyService.updateRule).toHaveBeenCalledWith('rule-1', mockRequest);
    });

    it('should return 404 when rule to update is not found', async () => {
      const mockRequest = {
        name: 'Updated Rule'
      };
      
      (proxyService.updateRule as jest.Mock).mockRejectedValue(new Error('Rule not found'));
      
      const response = await app.handle(
        new Request('http://localhost/proxy/rules/non-existent', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mockRequest)
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(404);
      expect(body).toEqual({ error: 'Rule not found' });
      expect(proxyService.updateRule).toHaveBeenCalledWith('non-existent', mockRequest);
    });
  });

  describe('DELETE /rules/:id', () => {
    it('should delete a proxy rule', async () => {
      (proxyService.deleteRule as jest.Mock).mockResolvedValue(undefined);
      
      const response = await app.handle(
        new Request('http://localhost/proxy/rules/rule-1', {
          method: 'DELETE'
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({ success: true, id: 'rule-1' });
      expect(proxyService.deleteRule).toHaveBeenCalledWith('rule-1');
    });

    it('should return 404 when rule to delete is not found', async () => {
      (proxyService.deleteRule as jest.Mock).mockRejectedValue(new Error('Rule not found'));
      
      const response = await app.handle(
        new Request('http://localhost/proxy/rules/non-existent', {
          method: 'DELETE'
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(404);
      expect(body).toEqual({ error: 'Rule not found' });
      expect(proxyService.deleteRule).toHaveBeenCalledWith('non-existent');
    });
  });

  describe('POST /rules/:id/toggle', () => {
    it('should toggle a proxy rule', async () => {
      const mockRule = { 
        id: 'rule-1', 
        name: 'Rule 1', 
        enabled: false
      };
      
      (proxyService.toggleRule as jest.Mock).mockResolvedValue(mockRule);
      
      const response = await app.handle(
        new Request('http://localhost/proxy/rules/rule-1/toggle', {
          method: 'POST'
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({ success: true, id: 'rule-1', enabled: false });
      expect(proxyService.toggleRule).toHaveBeenCalledWith('rule-1');
    });

    it('should return 404 when rule to toggle is not found', async () => {
      (proxyService.toggleRule as jest.Mock).mockRejectedValue(new Error('Rule not found'));
      
      const response = await app.handle(
        new Request('http://localhost/proxy/rules/non-existent/toggle', {
          method: 'POST'
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(404);
      expect(body).toEqual({ error: 'Rule not found' });
      expect(proxyService.toggleRule).toHaveBeenCalledWith('non-existent');
    });
  });

  describe('GET /rules/:id/traffic', () => {
    it('should get traffic data for a rule', async () => {
      const mockTraffic = {
        totalRequests: 100,
        totalResponses: 95,
        avgResponseTime: 120.5
      };
      
      (proxyService.getTrafficData as jest.Mock).mockReturnValue(mockTraffic);
      
      const response = await app.handle(
        new Request('http://localhost/proxy/rules/rule-1/traffic?limit=100&since=1622505600000')
      );
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({ id: 'rule-1', traffic: mockTraffic });
      expect(proxyService.getTrafficData).toHaveBeenCalledWith('rule-1', {
        limit: 100,
        since: 1622505600000
      });
    });
  });

  describe('GET /rules/:id/errors', () => {
    it('should get errors for a rule', async () => {
      const mockErrors = [
        { id: 'error-1', message: 'Connection refused', timestamp: 1622505600000 },
        { id: 'error-2', message: 'Timeout', timestamp: 1622505700000 }
      ];
      
      (proxyService.getErrors as jest.Mock).mockReturnValue(mockErrors);
      
      const response = await app.handle(
        new Request('http://localhost/proxy/rules/rule-1/errors?limit=100&since=1622505600000&resolved=false')
      );
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({ id: 'rule-1', errors: mockErrors });
      expect(proxyService.getErrors).toHaveBeenCalledWith('rule-1', {
        limit: 100,
        since: 1622505600000,
        resolved: false
      });
    });
  });

  describe('POST /errors/:id/resolve', () => {
    it('should resolve an error', async () => {
      const mockError = { 
        id: 'error-1', 
        message: 'Connection refused', 
        resolved: true,
        resolution: 'Fixed connection issue'
      };
      
      (proxyService.resolveError as jest.Mock).mockReturnValue(mockError);
      
      const response = await app.handle(
        new Request('http://localhost/proxy/errors/error-1/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resolution: 'Fixed connection issue' })
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({ success: true, error: mockError });
      expect(proxyService.resolveError).toHaveBeenCalledWith('error-1', 'Fixed connection issue');
    });

    it('should return 404 when error to resolve is not found', async () => {
      (proxyService.resolveError as jest.Mock).mockReturnValue(null);
      
      const response = await app.handle(
        new Request('http://localhost/proxy/errors/non-existent/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resolution: 'Fixed connection issue' })
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(404);
      expect(body).toEqual({ error: 'Error not found' });
      expect(proxyService.resolveError).toHaveBeenCalledWith('non-existent', 'Fixed connection issue');
    });
  });

  describe('GET /status', () => {
    it('should get Nginx status', async () => {
      const mockStatus = {
        running: true,
        version: '1.21.0',
        connections: {
          active: 10,
          reading: 2,
          writing: 3,
          waiting: 5
        }
      };
      
      (proxyService.getNginxStatus as jest.Mock).mockResolvedValue(mockStatus);
      
      const response = await app.handle(new Request('http://localhost/proxy/status'));
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual(mockStatus);
      expect(proxyService.getNginxStatus).toHaveBeenCalledTimes(1);
    });
  });
});