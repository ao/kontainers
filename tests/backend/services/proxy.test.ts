/**
 * Unit tests for ProxyService
 */

import { describe, expect, it, beforeEach, afterEach, mock } from 'bun:test';
import { ProxyService } from '../../../backend/src/services/proxy';
import { 
  ProxyRule, 
  ProxyProtocol, 
  ProxyTrafficData, 
  ProxyError, 
  ProxyErrorType,
  RequestResponseLog
} from '../../../shared/src/models';
import { nginxManager } from '../../../backend/src/integrations/nginx';
import { nginxConfigService } from '../../../backend/src/services/nginxConfig';

// Mock the nginxManager
const mockCreateOrUpdateProxyRule = mock(() => Promise.resolve());
const mockDeleteProxyRule = mock(() => Promise.resolve());
const mockTestConfig = mock(() => Promise.resolve(true));
const mockInitialize = mock(() => Promise.resolve());

// Mock the nginxConfigService
const mockWriteDomainConfig = mock(() => Promise.resolve('/path/to/config'));
const mockDeleteDomainConfig = mock(() => Promise.resolve());
const mockReloadNginx = mock(() => Promise.resolve());
const mockInitializeConfig = mock(() => Promise.resolve());

// Replace the real methods with mocks
nginxManager.createOrUpdateProxyRule = mockCreateOrUpdateProxyRule;
nginxManager.deleteProxyRule = mockDeleteProxyRule;
nginxManager.testConfig = mockTestConfig;
nginxManager.initialize = mockInitialize;

nginxConfigService.writeDomainConfig = mockWriteDomainConfig;
nginxConfigService.deleteDomainConfig = mockDeleteDomainConfig;
nginxConfigService.reloadNginx = mockReloadNginx;
nginxConfigService.initialize = mockInitializeConfig;

describe('ProxyService', () => {
  let proxyService: ProxyService;
  
  beforeEach(() => {
    // Reset all mocks
    mockCreateOrUpdateProxyRule.mockClear();
    mockDeleteProxyRule.mockClear();
    mockTestConfig.mockClear();
    mockInitialize.mockClear();
    mockWriteDomainConfig.mockClear();
    mockDeleteDomainConfig.mockClear();
    mockReloadNginx.mockClear();
    mockInitializeConfig.mockClear();
    
    // Create a fresh instance for each test
    proxyService = new ProxyService();
  });
  
  describe('initialize', () => {
    it('should initialize nginx manager and config service', async () => {
      await proxyService.initialize();
      
      expect(mockInitialize).toHaveBeenCalled();
      expect(mockInitializeConfig).toHaveBeenCalled();
    });
    
    it('should handle initialization errors', async () => {
      // Mock initialize to throw an error
      mockInitialize.mockImplementationOnce(() => Promise.reject(new Error('Initialization failed')));
      
      await expect(proxyService.initialize()).rejects.toThrow('Initialization failed');
    });
  });
  
  describe('getRules', () => {
    it('should return all proxy rules', async () => {
      // Add some rules first
      await proxyService.createRule({
        name: 'Test Rule 1',
        sourceHost: 'example1.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        enabled: true,
        sslEnabled: false,
        domain: 'example1.com'
      });
      
      await proxyService.createRule({
        name: 'Test Rule 2',
        sourceHost: 'example2.com',
        sourcePath: '/app',
        targetContainer: 'app-service',
        targetPort: 3000,
        protocol: ProxyProtocol.HTTP,
        enabled: true,
        sslEnabled: false,
        domain: 'example2.com'
      });
      
      const rules = await proxyService.getRules();
      
      expect(rules).toHaveLength(2);
      expect(rules[0].name).toBe('Test Rule 1');
      expect(rules[1].name).toBe('Test Rule 2');
    });
  });
  
  describe('getRule', () => {
    it('should return a specific rule by ID', async () => {
      // Add a rule first
      const createdRule = await proxyService.createRule({
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        enabled: true,
        sslEnabled: false,
        domain: 'example.com'
      });
      
      const rule = await proxyService.getRule(createdRule.id);
      
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe(createdRule.id);
      expect(rule?.name).toBe('Test Rule');
    });
    
    it('should return null for non-existent rule ID', async () => {
      const rule = await proxyService.getRule('non-existent-id');
      
      expect(rule).toBeNull();
    });
  });
  
  describe('createRule', () => {
    it('should create a new proxy rule', async () => {
      const ruleData = {
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        enabled: true,
        sslEnabled: false,
        domain: 'example.com'
      };
      
      const rule = await proxyService.createRule(ruleData);
      
      expect(rule.id).toBeDefined();
      expect(rule.name).toBe(ruleData.name);
      expect(rule.sourceHost).toBe(ruleData.sourceHost);
      expect(rule.created).toBeDefined();
      
      // Verify nginx manager was called
      expect(mockCreateOrUpdateProxyRule).toHaveBeenCalledWith(rule);
      
      // Verify nginx config service was called for domain
      expect(mockWriteDomainConfig).toHaveBeenCalledWith(rule);
      expect(mockReloadNginx).toHaveBeenCalled();
    });
    
    it('should validate domain name', async () => {
      const ruleData = {
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        enabled: true,
        sslEnabled: false,
        domain: 'invalid domain'
      };
      
      await expect(proxyService.createRule(ruleData)).rejects.toThrow('Invalid domain name');
      
      // Verify nginx manager was not called
      expect(mockCreateOrUpdateProxyRule).not.toHaveBeenCalled();
    });
    
    it('should handle errors from nginx manager', async () => {
      const ruleData = {
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        enabled: true,
        sslEnabled: false,
        domain: 'example.com'
      };
      
      // Mock createOrUpdateProxyRule to throw an error
      mockCreateOrUpdateProxyRule.mockImplementationOnce(() => Promise.reject(new Error('Failed to create rule')));
      
      await expect(proxyService.createRule(ruleData)).rejects.toThrow('Failed to create rule');
    });
    
    it('should create a rule without domain configuration', async () => {
      const ruleData = {
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        enabled: true,
        sslEnabled: false
      };
      
      const rule = await proxyService.createRule(ruleData);
      
      expect(rule.id).toBeDefined();
      
      // Verify nginx manager was called
      expect(mockCreateOrUpdateProxyRule).toHaveBeenCalledWith(rule);
      
      // Verify nginx config service was not called for domain
      expect(mockWriteDomainConfig).not.toHaveBeenCalled();
      expect(mockReloadNginx).not.toHaveBeenCalled();
    });
  });
  
  describe('updateRule', () => {
    it('should update an existing rule', async () => {
      // Create a rule first
      const createdRule = await proxyService.createRule({
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        enabled: true,
        sslEnabled: false,
        domain: 'example.com'
      });
      
      // Reset mocks
      mockCreateOrUpdateProxyRule.mockClear();
      mockWriteDomainConfig.mockClear();
      mockReloadNginx.mockClear();
      
      // Update the rule
      const updates = {
        name: 'Updated Rule',
        targetPort: 9000
      };
      
      const updatedRule = await proxyService.updateRule(createdRule.id, updates);
      
      expect(updatedRule.id).toBe(createdRule.id);
      expect(updatedRule.name).toBe(updates.name);
      expect(updatedRule.targetPort).toBe(updates.targetPort);
      expect(updatedRule.sourceHost).toBe(createdRule.sourceHost);
      
      // Verify nginx manager was called
      expect(mockCreateOrUpdateProxyRule).toHaveBeenCalledWith(updatedRule);
      
      // Verify nginx config service was called for domain
      expect(mockWriteDomainConfig).toHaveBeenCalledWith(updatedRule);
      expect(mockReloadNginx).toHaveBeenCalled();
    });
    
    it('should throw error for non-existent rule', async () => {
      await expect(proxyService.updateRule('non-existent-id', { name: 'Updated Rule' }))
        .rejects.toThrow('Proxy rule with ID non-existent-id not found');
    });
    
    it('should validate domain name when updating', async () => {
      // Create a rule first
      const createdRule = await proxyService.createRule({
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        enabled: true,
        sslEnabled: false,
        domain: 'example.com'
      });
      
      // Reset mocks
      mockCreateOrUpdateProxyRule.mockClear();
      
      // Update with invalid domain
      await expect(proxyService.updateRule(createdRule.id, { domain: 'invalid domain' }))
        .rejects.toThrow('Invalid domain name');
      
      // Verify nginx manager was not called
      expect(mockCreateOrUpdateProxyRule).not.toHaveBeenCalled();
    });
    
    it('should handle domain changes', async () => {
      // Create a rule first
      const createdRule = await proxyService.createRule({
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        enabled: true,
        sslEnabled: false,
        domain: 'example.com'
      });
      
      // Reset mocks
      mockCreateOrUpdateProxyRule.mockClear();
      mockWriteDomainConfig.mockClear();
      mockDeleteDomainConfig.mockClear();
      mockReloadNginx.mockClear();
      
      // Update the domain
      const updates = {
        domain: 'new-example.com'
      };
      
      await proxyService.updateRule(createdRule.id, updates);
      
      // Verify old domain config was deleted
      expect(mockDeleteDomainConfig).toHaveBeenCalledWith(createdRule.id, createdRule.domain);
      
      // Verify new domain config was written
      expect(mockWriteDomainConfig).toHaveBeenCalled();
      expect(mockReloadNginx).toHaveBeenCalled();
    });
    
    it('should handle removing domain', async () => {
      // Create a rule first
      const createdRule = await proxyService.createRule({
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        enabled: true,
        sslEnabled: false,
        domain: 'example.com'
      });
      
      // Reset mocks
      mockCreateOrUpdateProxyRule.mockClear();
      mockWriteDomainConfig.mockClear();
      mockDeleteDomainConfig.mockClear();
      mockReloadNginx.mockClear();
      
      // Remove the domain
      const updates = {
        domain: undefined
      };
      
      await proxyService.updateRule(createdRule.id, updates);
      
      // Verify domain config was deleted
      expect(mockDeleteDomainConfig).toHaveBeenCalledWith(createdRule.id, createdRule.domain);
      expect(mockReloadNginx).toHaveBeenCalled();
      
      // Verify new domain config was not written
      expect(mockWriteDomainConfig).not.toHaveBeenCalled();
    });
  });
  
  describe('deleteRule', () => {
    it('should delete an existing rule', async () => {
      // Create a rule first
      const createdRule = await proxyService.createRule({
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        enabled: true,
        sslEnabled: false,
        domain: 'example.com'
      });
      
      // Reset mocks
      mockDeleteProxyRule.mockClear();
      mockDeleteDomainConfig.mockClear();
      mockReloadNginx.mockClear();
      
      // Delete the rule
      await proxyService.deleteRule(createdRule.id);
      
      // Verify rule was deleted
      const rule = await proxyService.getRule(createdRule.id);
      expect(rule).toBeNull();
      
      // Verify nginx manager was called
      expect(mockDeleteProxyRule).toHaveBeenCalledWith(createdRule.id);
      
      // Verify nginx config service was called for domain
      expect(mockDeleteDomainConfig).toHaveBeenCalledWith(createdRule.id, createdRule.domain);
      expect(mockReloadNginx).toHaveBeenCalled();
    });
    
    it('should throw error for non-existent rule', async () => {
      await expect(proxyService.deleteRule('non-existent-id'))
        .rejects.toThrow('Proxy rule with ID non-existent-id not found');
    });
    
    it('should handle errors from nginx manager', async () => {
      // Create a rule first
      const createdRule = await proxyService.createRule({
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        enabled: true,
        sslEnabled: false
      });
      
      // Reset mocks
      mockDeleteProxyRule.mockClear();
      
      // Mock deleteProxyRule to throw an error
      mockDeleteProxyRule.mockImplementationOnce(() => Promise.reject(new Error('Failed to delete rule')));
      
      await expect(proxyService.deleteRule(createdRule.id)).rejects.toThrow('Failed to delete rule');
    });
  });
  
  describe('toggleRule', () => {
    it('should toggle rule enabled state', async () => {
      // Create a rule first (enabled by default)
      const createdRule = await proxyService.createRule({
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        enabled: true,
        sslEnabled: false,
        domain: 'example.com'
      });
      
      // Reset mocks
      mockCreateOrUpdateProxyRule.mockClear();
      mockWriteDomainConfig.mockClear();
      mockReloadNginx.mockClear();
      
      // Toggle the rule (disable it)
      const updatedRule = await proxyService.toggleRule(createdRule.id);
      
      expect(updatedRule.id).toBe(createdRule.id);
      expect(updatedRule.enabled).toBe(false);
      
      // Verify nginx manager was called
      expect(mockCreateOrUpdateProxyRule).toHaveBeenCalledWith(updatedRule);
      
      // Verify nginx config service was called for domain
      expect(mockWriteDomainConfig).toHaveBeenCalledWith(updatedRule);
      expect(mockReloadNginx).toHaveBeenCalled();
      
      // Toggle again (enable it)
      mockCreateOrUpdateProxyRule.mockClear();
      mockWriteDomainConfig.mockClear();
      mockReloadNginx.mockClear();
      
      const reEnabledRule = await proxyService.toggleRule(updatedRule.id);
      
      expect(reEnabledRule.enabled).toBe(true);
    });
    
    it('should throw error for non-existent rule', async () => {
      await expect(proxyService.toggleRule('non-existent-id'))
        .rejects.toThrow('Proxy rule with ID non-existent-id not found');
    });
  });
  
  describe('testRule', () => {
    it('should test a rule configuration', async () => {
      const ruleData = {
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        sslEnabled: false
      };
      
      const result = await proxyService.testRule(ruleData);
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Rule configuration is valid');
      expect(mockTestConfig).toHaveBeenCalled();
    });
    
    it('should handle test failures', async () => {
      // Mock testConfig to return false
      mockTestConfig.mockImplementationOnce(() => Promise.resolve(false));
      
      const ruleData = {
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        sslEnabled: false
      };
      
      const result = await proxyService.testRule(ruleData);
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Rule configuration is invalid');
    });
    
    it('should handle errors during testing', async () => {
      // Mock testConfig to throw an error
      mockTestConfig.mockImplementationOnce(() => Promise.reject(new Error('Test failed')));
      
      const ruleData = {
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        sslEnabled: false
      };
      
      const result = await proxyService.testRule(ruleData);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Error testing rule');
    });
  });
  
  describe('recordTrafficData', () => {
    it('should record traffic data for a rule', async () => {
      // Create a rule first
      const createdRule = await proxyService.createRule({
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        enabled: true,
        sslEnabled: false
      });
      
      // Record traffic data
      const trafficData: Omit<ProxyTrafficData, 'id'> = {
        ruleId: createdRule.id,
        timestamp: Date.now(),
        requestCount: 10,
        responseCount: 10,
        bytesReceived: 1024,
        bytesSent: 2048,
        avgResponseTime: 50,
        statusCodes: { 200: 10 },
        requestMethods: { GET: 10 },
        pathHits: { '/api/users': 10 }
      };
      
      await proxyService.recordTrafficData(trafficData);
      
      // Get traffic data
      const recordedData = proxyService.getTrafficData(createdRule.id);
      
      expect(recordedData).toHaveLength(1);
      expect(recordedData[0].ruleId).toBe(createdRule.id);
      expect(recordedData[0].requestCount).toBe(trafficData.requestCount);
      expect(recordedData[0].statusCodes?.[200]).toBe(10);
    });
    
    it('should ignore traffic data for non-existent rule', async () => {
      // Record traffic data for non-existent rule
      const trafficData: Omit<ProxyTrafficData, 'id'> = {
        ruleId: 'non-existent-id',
        timestamp: Date.now(),
        requestCount: 10,
        responseCount: 10,
        bytesReceived: 1024,
        bytesSent: 2048,
        avgResponseTime: 50
      };
      
      // This should not throw an error
      await proxyService.recordTrafficData(trafficData);
      
      // Get traffic data
      const recordedData = proxyService.getTrafficData('non-existent-id');
      
      expect(recordedData).toHaveLength(0);
    });
    
    it('should limit traffic data to 1000 entries per rule', async () => {
      // Create a rule first
      const createdRule = await proxyService.createRule({
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        enabled: true,
        sslEnabled: false
      });
      
      // Record 1001 traffic data entries
      for (let i = 0; i < 1001; i++) {
        await proxyService.recordTrafficData({
          ruleId: createdRule.id,
          timestamp: Date.now() + i,
          requestCount: 1,
          responseCount: 1,
          bytesReceived: 1024,
          bytesSent: 2048,
          avgResponseTime: 50,
          pathHits: { [`/api/users/${i}`]: 1 }
        });
      }
      
      // Get traffic data
      const recordedData = proxyService.getTrafficData(createdRule.id);
      
      // Should be limited to 1000 entries
      expect(recordedData).toHaveLength(1000);
      
      // The oldest entry should have been removed
      expect(recordedData[0].pathHits?.['/api/users/0']).toBeUndefined();
    });
  });
  
  describe('getTrafficData', () => {
    it('should filter traffic data by timestamp', async () => {
      // Create a rule first
      const createdRule = await proxyService.createRule({
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        enabled: true,
        sslEnabled: false
      });
      
      const now = Date.now();
      
      // Record traffic data with different timestamps
      await proxyService.recordTrafficData({
        ruleId: createdRule.id,
        timestamp: now - 1000,
        requestCount: 1,
        responseCount: 1,
        bytesReceived: 1024,
        bytesSent: 2048,
        avgResponseTime: 50,
        pathHits: { '/api/users/1': 1 }
      });
      
      await proxyService.recordTrafficData({
        ruleId: createdRule.id,
        timestamp: now,
        requestCount: 1,
        responseCount: 1,
        bytesReceived: 1024,
        bytesSent: 2048,
        avgResponseTime: 50,
        pathHits: { '/api/users/2': 1 }
      });
      
      // Get traffic data since a specific timestamp
      const filteredData = proxyService.getTrafficData(createdRule.id, { since: now });
      
      expect(filteredData).toHaveLength(1);
      expect(filteredData[0].pathHits?.['/api/users/2']).toBe(1);
    });
    
    it('should limit traffic data results', async () => {
      // Create a rule first
      const createdRule = await proxyService.createRule({
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        enabled: true,
        sslEnabled: false
      });
      
      // Record multiple traffic data entries
      for (let i = 0; i < 10; i++) {
        await proxyService.recordTrafficData({
          ruleId: createdRule.id,
          timestamp: Date.now() + i,
          requestCount: 1,
          responseCount: 1,
          bytesReceived: 1024,
          bytesSent: 2048,
          avgResponseTime: 50,
          pathHits: { [`/api/users/${i}`]: 1 }
        });
      }
      
      // Get limited traffic data
      const limitedData = proxyService.getTrafficData(createdRule.id, { limit: 5 });
      
      expect(limitedData).toHaveLength(5);
    });
  });
  
  describe('recordError and getErrors', () => {
    it('should record and retrieve errors for a rule', async () => {
      // Create a rule first
      const createdRule = await proxyService.createRule({
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        enabled: true,
        sslEnabled: false
      });
      
      // Record an error
      const errorData: Omit<ProxyError, 'id'> = {
        ruleId: createdRule.id,
        timestamp: Date.now(),
        errorType: ProxyErrorType.CONNECTION_REFUSED,
        message: 'Connection refused',
        resolved: false
      };
      
      await proxyService.recordError(errorData);
      
      // Get errors
      const errors = proxyService.getErrors(createdRule.id);
      
      expect(errors).toHaveLength(1);
      expect(errors[0].ruleId).toBe(createdRule.id);
      expect(errors[0].errorType).toBe(errorData.errorType);
      expect(errors[0].message).toBe(errorData.message);
      expect(errors[0].resolved).toBe(false);
    });
    
    it('should filter errors by resolved status', async () => {
      // Create a rule first
      const createdRule = await proxyService.createRule({
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        enabled: true,
        sslEnabled: false
      });
      
      // Record resolved and unresolved errors
      await proxyService.recordError({
        ruleId: createdRule.id,
        timestamp: Date.now(),
        errorType: ProxyErrorType.CONNECTION_REFUSED,
        message: 'Connection refused',
        resolved: false
      });
      
      await proxyService.recordError({
        ruleId: createdRule.id,
        timestamp: Date.now(),
        errorType: ProxyErrorType.TIMEOUT,
        message: 'Connection timeout',
        resolved: true
      });
      
      // Get unresolved errors
      const unresolvedErrors = proxyService.getErrors(createdRule.id, { resolved: false });
      
      expect(unresolvedErrors).toHaveLength(1);
      expect(unresolvedErrors[0].errorType).toBe(ProxyErrorType.CONNECTION_REFUSED);
      
      // Get resolved errors
      const resolvedErrors = proxyService.getErrors(createdRule.id, { resolved: true });
      
      expect(resolvedErrors).toHaveLength(1);
      expect(resolvedErrors[0].errorType).toBe(ProxyErrorType.TIMEOUT);
    });
    
    it('should resolve an error', async () => {
      // Create a rule first
      const createdRule = await proxyService.createRule({
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        enabled: true,
        sslEnabled: false
      });
      
      // Record an error
      const errorData: Omit<ProxyError, 'id'> = {
        ruleId: createdRule.id,
        timestamp: Date.now(),
        errorType: ProxyErrorType.CONNECTION_REFUSED,
        message: 'Connection refused',
        resolved: false
      };
      
      await proxyService.recordError(errorData);
      
      // Get the error ID
      const errors = proxyService.getErrors(createdRule.id);
      const errorId = errors[0].id;
      
      // Resolve the error
      const resolvedError = await proxyService.resolveError(errorId, 'Fixed connection issue');
      
      expect(resolvedError).not.toBeNull();
      expect(resolvedError?.resolved).toBe(true);
    });
  });
});