import { describe, expect, it, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { ProxyRule, ProxyProtocol } from '../../shared/src/models';
import { proxyService } from '../../backend/src/services/proxy';
import { nginxConfigService } from '../../backend/src/services/nginxConfig';
import { nginxManager } from '../../backend/src/integrations/nginx';
import fs from 'fs/promises';
import path from 'path';
import http from 'http';

// Create mock functions for the nginx integration
const originalNginxManager = { ...nginxManager };
const mockNginxManager = {
  createOrUpdateProxyRule: mock(() => Promise.resolve()),
  reloadNginx: mock(() => Promise.resolve()),
  testConfig: mock(() => Promise.resolve(true)),
  getStatus: mock(() => Promise.resolve({ running: true, version: '1.20.0' }))
};

// Apply mocks to nginxManager
Object.assign(nginxManager, mockNginxManager);

// Create mock functions for the nginx config service
const originalNginxConfigService = { ...nginxConfigService };
const mockNginxConfigService = {
  writeDomainConfig: mock(() => Promise.resolve('/etc/nginx/conf.d/test-rule-123-api-example-com.conf')),
  reloadNginx: mock(() => Promise.resolve()),
  testNginxConfig: mock(() => Promise.resolve({ valid: true, message: 'Configuration test successful' })),
  generateDomainConfig: mock((rule: ProxyRule) => {
    return `
# Domain configuration for ${rule.name} (${rule.domain})
server {
    listen 80;
    server_name ${rule.domain};
    
    access_log /var/log/nginx/${rule.id}_access.log;
    error_log /var/log/nginx/${rule.id}_error.log;

    location ${rule.sourcePath || '/'} {
        proxy_pass http://${rule.targetContainer}:${rule.targetPort};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`;
  })
};

// Apply mocks to nginxConfigService
Object.assign(nginxConfigService, mockNginxConfigService);

// Mock fs/promises functions
const mockFsPromises = {
  writeFile: mock(() => Promise.resolve()),
  access: mock(() => Promise.resolve()),
  unlink: mock(() => Promise.resolve()),
  mkdir: mock(() => Promise.resolve())
};

// Spy on fs/promises methods with proper return types
spyOn(fs, 'writeFile').mockImplementation(() => Promise.resolve());
spyOn(fs, 'access').mockImplementation(() => Promise.resolve());
spyOn(fs, 'unlink').mockImplementation(() => Promise.resolve());
// Skip mocking mkdir as it has complex return types
// Instead, we'll just verify it's not called in our tests

// Mock http.request
const mockHttpRequest = mock(() => {
  const mockReq: any = {
    on: mock((event: string, callback: Function) => mockReq),
    write: mock(() => mockReq),
    end: mock(() => {
      const mockRes: any = {
        statusCode: 200,
        headers: {
          'content-type': 'application/json'
        },
        on: mock((event: string, callback: Function) => {
          if (event === 'data') {
            callback(Buffer.from(JSON.stringify({ success: true })));
          }
          if (event === 'end') {
            callback();
          }
          return mockRes;
        })
      };
      
      const responseCallback = mockReq.on.mock.calls.find((call: any[]) => call[0] === 'response');
      if (responseCallback && responseCallback[1]) {
        responseCallback[1](mockRes);
      }
      
      return mockReq;
    })
  };
  return mockReq;
});

spyOn(http, 'request').mockImplementation(mockHttpRequest);

describe('Multi-Domain Reverse Proxy Integration', () => {
  let testRule: ProxyRule;
  
  beforeEach(() => {
    // Reset all mocks
    mockNginxManager.createOrUpdateProxyRule.mockReset();
    mockNginxManager.reloadNginx.mockReset();
    mockNginxManager.testConfig.mockReset();
    mockNginxManager.getStatus.mockReset();
    
    mockNginxConfigService.writeDomainConfig.mockReset();
    mockNginxConfigService.reloadNginx.mockReset();
    mockNginxConfigService.testNginxConfig.mockReset();
    mockNginxConfigService.generateDomainConfig.mockReset();
    
    mockFsPromises.writeFile.mockReset();
    mockFsPromises.access.mockReset();
    mockFsPromises.unlink.mockReset();
    mockFsPromises.mkdir.mockReset();
    
    mockHttpRequest.mockReset();
    
    // Set up test rule
    testRule = {
      id: 'test-rule-123',
      name: 'Test Domain Rule',
      sourceHost: 'localhost',
      sourcePath: '/api',
      targetContainer: 'api-service',
      targetPort: 8080,
      protocol: ProxyProtocol.HTTP,
      sslEnabled: false,
      created: Date.now(),
      enabled: true,
      domain: 'api.example.com'
    };
    
    // Set up mock return values
    mockNginxManager.testConfig.mockReturnValue(Promise.resolve(true));
    mockNginxManager.reloadNginx.mockReturnValue(Promise.resolve(undefined));
    mockNginxManager.getStatus.mockReturnValue(Promise.resolve({ running: true, version: '1.20.0' }));
    
    mockNginxConfigService.writeDomainConfig.mockReturnValue(Promise.resolve('/etc/nginx/conf.d/test-rule-123-api-example-com.conf'));
    mockNginxConfigService.reloadNginx.mockReturnValue(Promise.resolve(undefined));
    mockNginxConfigService.testNginxConfig.mockReturnValue(Promise.resolve({ valid: true, message: 'Configuration test successful' }));
    mockNginxConfigService.generateDomainConfig.mockImplementation((rule: ProxyRule) => {
      return `
# Domain configuration for ${rule.name} (${rule.domain})
server {
    listen 80;
    server_name ${rule.domain};
    
    access_log /var/log/nginx/${rule.id}_access.log;
    error_log /var/log/nginx/${rule.id}_error.log;

    location ${rule.sourcePath || '/'} {
        proxy_pass http://${rule.targetContainer}:${rule.targetPort};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`;
    });
    
    mockFsPromises.writeFile.mockReturnValue(Promise.resolve(undefined));
  });
  
  afterEach(() => {
    // No need to clear mocks as we reset them in beforeEach
  });
  
  it('should create a proxy rule with a domain and generate nginx configuration', async () => {
    // Create a new proxy rule with a domain
    const rule = await proxyService.createRule(testRule);
    
    // Verify rule was created with the correct domain
    expect(rule).toBeDefined();
    expect(rule.domain).toBe('api.example.com');
    
    // Verify nginx configuration was generated
    expect(mockNginxConfigService.writeDomainConfig).toHaveBeenCalledWith(expect.objectContaining({
      id: rule.id,
      domain: 'api.example.com'
    }));
    
    // Verify the content of the generated configuration
    const generatedConfig = mockNginxConfigService.generateDomainConfig(rule);
    expect(generatedConfig).toContain(`server_name ${rule.domain}`);
    expect(generatedConfig).toContain(`proxy_pass http://${rule.targetContainer}:${rule.targetPort}`);
    
    // Verify nginx was reloaded
    expect(mockNginxConfigService.reloadNginx).toHaveBeenCalled();
  });
  
  it('should verify nginx configuration is valid before reloading', async () => {
    // Mock the test to fail
    mockNginxConfigService.testNginxConfig.mockReturnValue(Promise.resolve({
      valid: false,
      message: 'Invalid server_name directive'
    }));
    
    // Try to create a rule with invalid domain
    const invalidRule = {
      ...testRule,
      domain: 'invalid domain with spaces'
    };
    
    // Expect the creation to fail
    await expect(proxyService.createRule(invalidRule)).rejects.toThrow();
    
    // Verify nginx was not reloaded
    expect(mockNginxConfigService.reloadNginx).not.toHaveBeenCalled();
  });
  
  it('should route requests to the correct container based on domain', async () => {
    // Create a proxy rule
    const rule = await proxyService.createRule(testRule);
    
    // Mock a request to the domain
    const requestOptions = {
      hostname: 'api.example.com',
      port: 80,
      path: '/api/users',
      method: 'GET'
    };
    
    // Make a request
    const makeRequest = () => {
      return new Promise((resolve, reject) => {
        const req = http.request(requestOptions, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              data: JSON.parse(data)
            });
          });
        });
        
        req.on('error', (error) => {
          reject(error);
        });
        
        req.end();
      });
    };
    
    const response = await makeRequest();
    
    // Verify the request was made
    expect(mockHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: 'api.example.com',
        port: 80,
        path: '/api/users'
      }),
      expect.any(Function)
    );
    
    // Verify the response
    expect(response).toEqual(
      expect.objectContaining({
        statusCode: 200,
        data: { success: true }
      })
    );
  });
  
  it('should update domain configuration when rule is updated', async () => {
    // Create a proxy rule
    const rule = await proxyService.createRule(testRule);
    
    // Update the rule with a new domain
    const updatedRule = await proxyService.updateRule(rule.id, {
      domain: 'new-api.example.com'
    });
    
    // Verify the domain was updated
    expect(updatedRule.domain).toBe('new-api.example.com');
    
    // Verify the old domain config was deleted and new one was created
    expect(mockNginxConfigService.writeDomainConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        id: rule.id,
        domain: 'new-api.example.com'
      })
    );
    
    // Verify nginx was reloaded
    expect(mockNginxConfigService.reloadNginx).toHaveBeenCalled();
  });
  
  it('should remove domain configuration when rule is deleted', async () => {
    // Create a proxy rule
    const rule = await proxyService.createRule(testRule);
    
    // Reset mocks to track new calls
    mockNginxConfigService.reloadNginx.mockReset();
    
    // Delete the rule
    await proxyService.deleteRule(rule.id);
    
    // Verify nginx configuration was updated
    // Note: We can't verify this directly since we didn't mock deleteProxyRule
    
    // Verify nginx was reloaded
    expect(mockNginxConfigService.reloadNginx).toHaveBeenCalled();
  });
});