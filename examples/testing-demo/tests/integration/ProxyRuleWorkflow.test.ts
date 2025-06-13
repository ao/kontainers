/**
 * Integration tests for ProxyRule workflow
 * 
 * This test demonstrates how to test a complete workflow involving
 * the ProxyRuleManager and other components.
 */

import { describe, expect, it, beforeEach, jest, afterEach } from 'bun:test';
import { ProxyRuleManager } from '../../src/ProxyRuleManager';
import { ProxyRuleStatus } from '../../src/types';

// Mock external API client that would be used in a real application
const mockApiClient = {
  applyProxyRule: jest.fn(),
  removeProxyRule: jest.fn(),
  getProxyRuleStatus: jest.fn(),
  reloadProxyConfiguration: jest.fn()
};

// Mock container service that would be used in a real application
const mockContainerService = {
  getContainerPort: jest.fn(),
  isContainerRunning: jest.fn(),
  getContainerById: jest.fn()
};

// ProxyRuleService that uses the ProxyRuleManager and external services
class ProxyRuleService {
  private manager: ProxyRuleManager;
  
  constructor(maxRules = 100) {
    this.manager = new ProxyRuleManager(maxRules);
  }
  
  async createProxyRule(domain: string, targetPort: number, path?: string, containerId?: string) {
    // Validate container if provided
    if (containerId) {
      const isRunning = await mockContainerService.isContainerRunning(containerId);
      if (!isRunning) {
        throw new Error('Cannot create proxy rule for non-running container');
      }
    }
    
    // Add rule to manager
    const rule = this.manager.addRule({
      domain,
      targetPort,
      path,
      targetContainer: containerId
    });
    
    // Apply rule via API
    try {
      await mockApiClient.applyProxyRule({
        id: rule.id,
        domain: rule.domain,
        targetPort: rule.targetPort,
        path: rule.path
      });
      
      // Reload configuration
      await mockApiClient.reloadProxyConfiguration();
      
      return rule;
    } catch (error) {
      // If API call fails, delete the rule and throw
      this.manager.deleteRule(rule.id);
      throw error;
    }
  }
  
  async deleteProxyRule(id: string) {
    const rule = this.manager.getRule(id);
    if (!rule) {
      throw new Error(`Rule with ID ${id} not found`);
    }
    
    // Remove rule via API
    await mockApiClient.removeProxyRule(id);
    
    // Delete from manager
    this.manager.deleteRule(id);
    
    // Reload configuration
    await mockApiClient.reloadProxyConfiguration();
    
    return true;
  }
  
  async getProxyRuleStatus(id: string) {
    const rule = this.manager.getRule(id);
    if (!rule) {
      throw new Error(`Rule with ID ${id} not found`);
    }
    
    // Get status from API
    const status = await mockApiClient.getProxyRuleStatus(id);
    
    // Update rule status if needed
    if (status !== rule.status) {
      this.manager.updateRule(id, { status });
    }
    
    return status;
  }
  
  getRules() {
    return this.manager.getRules();
  }
  
  getActiveRules() {
    return this.manager.getActiveRules();
  }
}

describe('ProxyRule Workflow Integration', () => {
  let proxyService: ProxyRuleService;
  
  beforeEach(() => {
    // Reset all mocks
    jest.resetAllMocks();
    
    // Create a fresh service for each test
    proxyService = new ProxyRuleService();
    
    // Set up default mock implementations
    mockContainerService.isContainerRunning.mockResolvedValue(true);
    mockContainerService.getContainerPort.mockResolvedValue(8080);
    mockContainerService.getContainerById.mockResolvedValue({
      id: 'container-1',
      name: 'test-container',
      status: 'running'
    });
    
    mockApiClient.applyProxyRule.mockResolvedValue({ success: true });
    mockApiClient.removeProxyRule.mockResolvedValue({ success: true });
    mockApiClient.getProxyRuleStatus.mockResolvedValue(ProxyRuleStatus.ACTIVE);
    mockApiClient.reloadProxyConfiguration.mockResolvedValue({ success: true });
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  it('should complete the full proxy rule lifecycle', async () => {
    // Step 1: Create a proxy rule
    const rule = await proxyService.createProxyRule(
      'example.com',
      8080,
      '/api',
      'container-1'
    );
    
    // Verify rule was created
    expect(rule).toBeDefined();
    expect(rule.domain).toBe('example.com');
    expect(rule.targetPort).toBe(8080);
    expect(rule.path).toBe('/api');
    expect(rule.targetContainer).toBe('container-1');
    
    // Verify API was called
    expect(mockApiClient.applyProxyRule).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'example.com',
        targetPort: 8080,
        path: '/api'
      })
    );
    
    // Verify configuration was reloaded
    expect(mockApiClient.reloadProxyConfiguration).toHaveBeenCalledTimes(1);
    
    // Step 2: Get rule status
    const status = await proxyService.getProxyRuleStatus(rule.id);
    
    // Verify status
    expect(status).toBe(ProxyRuleStatus.ACTIVE);
    
    // Verify API was called
    expect(mockApiClient.getProxyRuleStatus).toHaveBeenCalledWith(rule.id);
    
    // Step 3: Delete the rule
    const deleted = await proxyService.deleteProxyRule(rule.id);
    
    // Verify rule was deleted
    expect(deleted).toBe(true);
    
    // Verify API was called
    expect(mockApiClient.removeProxyRule).toHaveBeenCalledWith(rule.id);
    
    // Verify configuration was reloaded
    expect(mockApiClient.reloadProxyConfiguration).toHaveBeenCalledTimes(2);
    
    // Verify rule is no longer in the service
    expect(proxyService.getRules()).toHaveLength(0);
  });
  
  it('should handle container validation during rule creation', async () => {
    // Mock container not running
    mockContainerService.isContainerRunning.mockResolvedValue(false);
    
    // Try to create a rule for non-running container
    await expect(
      proxyService.createProxyRule('example.com', 8080, '/api', 'container-1')
    ).rejects.toThrow('Cannot create proxy rule for non-running container');
    
    // Verify no rule was created
    expect(proxyService.getRules()).toHaveLength(0);
    
    // Verify API was not called
    expect(mockApiClient.applyProxyRule).not.toHaveBeenCalled();
    expect(mockApiClient.reloadProxyConfiguration).not.toHaveBeenCalled();
  });
  
  it('should handle API errors during rule creation', async () => {
    // Mock API error
    mockApiClient.applyProxyRule.mockRejectedValue(new Error('API error'));
    
    // Try to create a rule
    await expect(
      proxyService.createProxyRule('example.com', 8080)
    ).rejects.toThrow('API error');
    
    // Verify no rule was created (it should be rolled back)
    expect(proxyService.getRules()).toHaveLength(0);
    
    // Verify API was called but not reload
    expect(mockApiClient.applyProxyRule).toHaveBeenCalledTimes(1);
    expect(mockApiClient.reloadProxyConfiguration).not.toHaveBeenCalled();
  });
  
  it('should handle API errors during rule deletion', async () => {
    // Create a rule first
    const rule = await proxyService.createProxyRule('example.com', 8080);
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock API error
    mockApiClient.removeProxyRule.mockRejectedValue(new Error('API error'));
    
    // Try to delete the rule
    await expect(
      proxyService.deleteProxyRule(rule.id)
    ).rejects.toThrow('API error');
    
    // Verify rule still exists
    expect(proxyService.getRules()).toHaveLength(1);
    
    // Verify API was called but not reload
    expect(mockApiClient.removeProxyRule).toHaveBeenCalledTimes(1);
    expect(mockApiClient.reloadProxyConfiguration).not.toHaveBeenCalled();
  });
  
  it('should update rule status when API reports different status', async () => {
    // Create a rule first
    const rule = await proxyService.createProxyRule('example.com', 8080);
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock API returning error status
    mockApiClient.getProxyRuleStatus.mockResolvedValue(ProxyRuleStatus.ERROR);
    
    // Get rule status
    const status = await proxyService.getProxyRuleStatus(rule.id);
    
    // Verify status
    expect(status).toBe(ProxyRuleStatus.ERROR);
    
    // Verify rule status was updated
    const updatedRule = proxyService.getRules()[0];
    expect(updatedRule.status).toBe(ProxyRuleStatus.ERROR);
  });
});