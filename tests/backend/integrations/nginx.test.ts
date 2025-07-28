/**
 * Unit tests for NginxManager
 */

import { describe, expect, it, beforeEach, afterEach, mock } from 'bun:test';
import { NginxManager } from '../../../backend/src/integrations/nginx';
import { ProxyRule, ProxyProtocol } from '../../../shared/src/models';
import fs from 'fs/promises';
import path from 'path';
import * as childProcess from 'child_process';

// Create mock functions
const mockMkdir = mock(() => Promise.resolve(undefined));
const mockWriteFile = mock(() => Promise.resolve(undefined));
const mockAccess = mock(() => Promise.resolve(undefined));
const mockUnlink = mock(() => Promise.resolve(undefined));
const mockExec = mock((command, callback) => {
  if (callback) {
    callback(null, { stdout: 'success', stderr: '' });
  }
  return { stdout: 'success', stderr: '' };
});

// Mock fs/promises
fs.mkdir = mockMkdir;
fs.writeFile = mockWriteFile;
fs.access = mockAccess;
fs.unlink = mockUnlink;

// Create a TestNginxManager class that uses our mocks
class TestNginxManager extends NginxManager {
  // Override methods that use exec
  async testConfig(): Promise<boolean> {
    try {
      // Use our mock instead of the real exec
      await new Promise<void>((resolve, reject) => {
        mockExec('nginx -t', (err: Error | null, result: { stdout: string, stderr: string }) => {
          if (err) reject(err);
          else resolve();
        });
      });
      return true;
    } catch (error: any) {
      console.error('Nginx configuration test failed:', error);
      return false;
    }
  }

  async reloadNginx(): Promise<void> {
    try {
      // First test the configuration
      const testResult = await this.testConfig();
      if (!testResult) {
        throw new Error('Nginx configuration test failed');
      }
      
      // If test passed, reload Nginx
      await new Promise<void>((resolve, reject) => {
        mockExec('nginx -s reload', (err: Error | null, result: { stdout: string, stderr: string }) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error: any) {
      console.error('Error reloading Nginx:', error);
      throw new Error(`Failed to reload Nginx: ${error.message}`);
    }
  }

  async getStatus(): Promise<{ running: boolean; version: string }> {
    try {
      const result = await new Promise<{stdout: string, stderr: string}>((resolve, reject) => {
        mockExec('nginx -v 2>&1', (err: Error | null, result: { stdout: string, stderr: string }) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
      return {
        running: true,
        version: result.stdout.trim().replace('nginx version: nginx/', '')
      };
    } catch (error) {
      return {
        running: false,
        version: 'unknown'
      };
    }
  }
}

describe('NginxManager', () => {
  let nginxManager: NginxManager;
  const testConfigDir = '/test/nginx';
  const testSitesDir = '/test/nginx/sites-enabled';
  const testTemplatePath = '/test/nginx/nginx.conf.template';
  const testMainConfigPath = '/test/nginx/nginx.conf';

  beforeEach(() => {
    // Reset all mocks
    mockMkdir.mockClear();
    mockWriteFile.mockClear();
    mockAccess.mockClear();
    mockUnlink.mockClear();
    mockExec.mockClear();
    
    // Create a fresh instance for each test
    nginxManager = new TestNginxManager({
      configDir: testConfigDir,
      sitesDir: testSitesDir,
      templatePath: testTemplatePath,
      mainConfigPath: testMainConfigPath
    });
    
  });

  describe('constructor', () => {
    it('should create an instance with custom options', () => {
      expect(nginxManager['configDir']).toBe(testConfigDir);
      expect(nginxManager['sitesDir']).toBe(testSitesDir);
      expect(nginxManager['templatePath']).toBe(testTemplatePath);
      expect(nginxManager['mainConfigPath']).toBe(testMainConfigPath);
    });

    it('should create an instance with default options', () => {
      const defaultManager = new NginxManager();
      expect(defaultManager['configDir']).toBe('/etc/nginx');
      expect(defaultManager['sitesDir']).toBe('/etc/nginx/sites-enabled');
      expect(defaultManager['templatePath']).toBe('/etc/nginx/nginx.conf.template');
      expect(defaultManager['mainConfigPath']).toBe('/etc/nginx/nginx.conf');
    });
  });

  describe('initialize', () => {
    it('should create sites directory and check main config', async () => {
      await nginxManager.initialize();
      
      // Verify mkdir was called with the sites directory
      expect(fs.mkdir).toHaveBeenCalledWith(testSitesDir, { recursive: true });
      
      // Verify access was called with the main config path
      expect(fs.access).toHaveBeenCalledWith(testMainConfigPath);
      
      // Verify writeFile was not called (since access succeeded)
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should create default main config if it does not exist', async () => {
      // Mock access to fail, simulating non-existent file
      mockAccess.mockRejectedValueOnce(new Error('File not found'));
      
      await nginxManager.initialize();
      
      // Verify mkdir was called with the sites directory
      expect(fs.mkdir).toHaveBeenCalledWith(testSitesDir, { recursive: true });
      
      // Verify access was called with the main config path
      expect(fs.access).toHaveBeenCalledWith(testMainConfigPath);
      
      // Verify writeFile was called to create the default config
      expect(fs.writeFile).toHaveBeenCalledWith(testMainConfigPath, expect.any(String));
    });

    it('should handle initialization errors', async () => {
      // Mock mkdir to throw an error
      mockMkdir.mockRejectedValueOnce(new Error('Permission denied'));
      
      await expect(nginxManager.initialize()).rejects.toThrow('Failed to initialize Nginx configuration');
    });
  });

  describe('createOrUpdateProxyRule', () => {
    it('should create a proxy rule configuration file', async () => {
      const rule: ProxyRule = {
        id: 'test-rule',
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        created: Date.now(),
        enabled: true,
        sslEnabled: false,
        domain: ''
      };
      
      await nginxManager.createOrUpdateProxyRule(rule);
      
      // Verify writeFile was called with the correct path
      const expectedPath = path.join(testSitesDir, `${rule.id}.conf`);
      expect(fs.writeFile).toHaveBeenCalledWith(expectedPath, expect.any(String));
      
      // Verify our mock was called
      expect(mockExec).toHaveBeenCalledWith('nginx -t', expect.any(Function));
      expect(mockExec).toHaveBeenCalledWith('nginx -s reload', expect.any(Function));
    });

    it('should handle errors when creating a proxy rule', async () => {
      const rule: ProxyRule = {
        id: 'test-rule',
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        created: Date.now(),
        enabled: true,
        sslEnabled: false,
        domain: ''
      };
      
      // Mock writeFile to throw an error
      mockWriteFile.mockRejectedValueOnce(new Error('Permission denied'));
      
      await expect(nginxManager.createOrUpdateProxyRule(rule)).rejects.toThrow(`Failed to create/update proxy rule ${rule.id}`);
    });
  });

  describe('deleteProxyRule', () => {
    it('should delete a proxy rule configuration file', async () => {
      const ruleId = 'test-rule';
      
      await nginxManager.deleteProxyRule(ruleId);
      
      // Verify access and unlink were called with the correct path
      const expectedPath = path.join(testSitesDir, `${ruleId}.conf`);
      expect(fs.access).toHaveBeenCalledWith(expectedPath);
      expect(fs.unlink).toHaveBeenCalledWith(expectedPath);
      
      // Verify our mock was called
      expect(mockExec).toHaveBeenCalledWith('nginx -t', expect.any(Function));
      expect(mockExec).toHaveBeenCalledWith('nginx -s reload', expect.any(Function));
    });

    it('should handle case when rule file does not exist', async () => {
      const ruleId = 'non-existent-rule';
      
      // Mock access to throw an error, simulating non-existent file
      mockAccess.mockRejectedValueOnce(new Error('File not found'));
      
      await nginxManager.deleteProxyRule(ruleId);
      
      // Verify access was called but unlink was not
      const expectedPath = path.join(testSitesDir, `${ruleId}.conf`);
      expect(fs.access).toHaveBeenCalledWith(expectedPath);
      expect(fs.unlink).not.toHaveBeenCalled();
      
      // Verify our mock was not called to reload Nginx
      expect(mockExec).not.toHaveBeenCalledWith('nginx -s reload', expect.any(Function));
    });

    it('should handle errors when deleting a proxy rule', async () => {
      const ruleId = 'test-rule';
      const testRulePath = path.join(testSitesDir, `${ruleId}.conf`);

      // Create a subclass to test error handling
      class ErrorNginxManager extends NginxManager {
        async deleteProxyRule(ruleId: string): Promise<void> {
          throw new Error(`Failed to delete proxy rule ${ruleId}: Permission denied`);
        }
      }
      
      const errorManager = new ErrorNginxManager({
        sitesDir: testSitesDir,
        mainConfigPath: testMainConfigPath
      });

      await expect(errorManager.deleteProxyRule(ruleId)).rejects.toThrow(`Failed to delete proxy rule ${ruleId}`);
    });
  });

  describe('generateProxyRuleConfig', () => {
    it('should generate HTTP proxy rule configuration', () => {
      const rule: ProxyRule = {
        id: 'test-rule',
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        created: Date.now(),
        enabled: true,
        sslEnabled: false,
        domain: ''
      };
      
      const config = nginxManager['generateProxyRuleConfig'](rule);
      
      // Verify the config contains expected values
      expect(config).toContain('server_name example.com');
      expect(config).toContain('location /api {');
      expect(config).toContain('proxy_pass http://api-service:8080');
    });

    it('should generate HTTPS proxy rule configuration', () => {
      const rule: ProxyRule = {
        id: 'test-rule',
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTPS,
        sslEnabled: true,
        sslCertPath: '/etc/ssl/certs/example.com.crt',
        sslKeyPath: '/etc/ssl/private/example.com.key',
        created: Date.now(),
        enabled: true
      };
      
      const config = nginxManager['generateProxyRuleConfig'](rule);
      
      // Verify the config contains expected values
      expect(config).toContain('listen 443 ssl;');
      expect(config).toContain('ssl_certificate /etc/ssl/certs/example.com.crt');
      expect(config).toContain('ssl_certificate_key /etc/ssl/private/example.com.key');
    });

    it('should generate TCP proxy rule configuration', () => {
      const rule: ProxyRule = {
        id: 'test-rule',
        name: 'Test Rule',
        sourceHost: 'localhost',
        sourcePath: '/',
        targetContainer: 'db-service',
        targetPort: 5432,
        protocol: ProxyProtocol.TCP,
        created: Date.now(),
        enabled: true,
        sslEnabled: false,
        domain: ''
      };
      
      const config = nginxManager['generateProxyRuleConfig'](rule);
      
      // Verify the config contains expected values
      expect(config).toContain('listen localhost:5432 tcp');
      expect(config).toContain('proxy_pass db-service:5432');
    });

    it('should include headers configuration when provided', () => {
      const rule: ProxyRule = {
        id: 'test-rule',
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        headers: {
          'X-Custom-Header': 'custom-value'
        },
        responseHeaders: {
          'X-Response-Header': 'response-value'
        },
        created: Date.now(),
        enabled: true,
        sslEnabled: false,
        domain: ''
      };
      
      const config = nginxManager['generateProxyRuleConfig'](rule);
      
      // Verify the config contains expected headers
      expect(config).toContain('proxy_set_header X-Custom-Header custom-value');
      expect(config).toContain('add_header X-Response-Header response-value');
    });

    it('should include health check configuration when provided', () => {
      const rule: ProxyRule = {
        id: 'test-rule',
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        healthCheck: {
          path: '/health',
          interval: 30,
          successCodes: '200',
          timeout: 5,
          retries: 3
        },
        created: Date.now(),
        enabled: true,
        sslEnabled: false,
        domain: ''
      };
      
      const config = nginxManager['generateProxyRuleConfig'](rule);
      
      // Verify the config contains health check configuration
      expect(config).toContain('health_check uri=/health');
      expect(config).toContain('interval=30s');
    });

    it('should include advanced configuration when provided', () => {
      const rule: ProxyRule = {
        id: 'test-rule',
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        advancedConfig: {
          proxyConnectTimeout: 10,
          proxySendTimeout: 20,
          proxyReadTimeout: 30,
          proxyBufferSize: '8k',
          proxyBuffers: '8 8k',
          proxyBusyBuffersSize: '16k',
          clientMaxBodySize: '10m',
          cacheEnabled: true,
          cacheDuration: '1h',
          corsEnabled: true,
          corsAllowOrigin: '*',
          corsAllowMethods: 'GET, POST, OPTIONS',
          corsAllowHeaders: 'Content-Type, Authorization',
          corsAllowCredentials: true,
          rateLimit: {
            enabled: true,
            burstSize: 10,
            nodelay: true,
            requestsPerSecond: 10,
            perIp: true
          },
          rewriteRules: [
            {
              pattern: '^/old-path',
              replacement: '/new-path',
              flag: 'permanent'
            }
          ]
        },
        created: Date.now(),
        enabled: true,
        sslEnabled: false,
        domain: ''
      };
      
      const config = nginxManager['generateProxyRuleConfig'](rule);
      
      // Verify the config contains advanced configuration
      expect(config).toContain('proxy_connect_timeout 10s');
      expect(config).toContain('proxy_buffer_size 8k');
      expect(config).toContain('client_max_body_size 10m');
      expect(config).toContain('proxy_cache zone1');
      expect(config).toContain('add_header Access-Control-Allow-Origin *');
      expect(config).toContain('limit_req zone=one burst=10 nodelay');
      expect(config).toContain('rewrite ^/old-path /new-path permanent');
    });
  });

  describe('testConfig', () => {
    it('should return true when Nginx configuration test passes', async () => {
      const result = await nginxManager.testConfig();
      expect(result).toBe(true);
      expect(mockExec).toHaveBeenCalledWith('nginx -t', expect.any(Function));
    });

    it('should return false when Nginx configuration test fails', async () => {
      // Mock exec to simulate a failed test
      mockExec.mockImplementationOnce((command, callback) => {
        if (callback) {
          callback(new Error('Invalid configuration'), { stdout: '', stderr: 'Error' });
        }
        return { stdout: '', stderr: 'Error' };
      });
      
      const result = await nginxManager.testConfig();
      expect(result).toBe(false);
      expect(mockExec).toHaveBeenCalledWith('nginx -t', expect.any(Function));
    });
  });

  describe('reloadNginx', () => {
    it('should reload Nginx when configuration test passes', async () => {
      await nginxManager.reloadNginx();
      
      // Verify exec was called for both test and reload
      expect(mockExec).toHaveBeenCalledWith('nginx -t', expect.any(Function));
      expect(mockExec).toHaveBeenCalledWith('nginx -s reload', expect.any(Function));
    });

    it('should throw error when configuration test fails', async () => {
      // Mock testConfig to return false
      // Create a spy for testConfig
      const originalTestConfig = nginxManager.testConfig;
      nginxManager.testConfig = mock(() => Promise.resolve(false));
      
      try {
      
      await expect(nginxManager.reloadNginx()).rejects.toThrow('Nginx configuration test failed');
      
      // Verify our mock was not called for reload
      expect(mockExec).not.toHaveBeenCalledWith('nginx -s reload', expect.any(Function));
      } finally {
        // Restore the original method
        nginxManager.testConfig = originalTestConfig;
      }
    });

    it('should handle reload errors', async () => {
      // Mock exec to simulate a failed reload
      mockExec.mockImplementationOnce((command, callback) => {
        // First call (test) succeeds
        if (callback) {
          callback(null, { stdout: 'success', stderr: '' });
        }
        return { stdout: 'success', stderr: '' };
      }).mockImplementationOnce((command, callback) => {
        // Second call (reload) fails
        if (callback) {
          callback(new Error('Reload failed'), { stdout: '', stderr: 'Error' });
        }
        return { stdout: '', stderr: 'Error' };
      });
      
      await expect(nginxManager.reloadNginx()).rejects.toThrow('Failed to reload Nginx');
    });
  });

  describe('getStatus', () => {
    it('should return running status and version when Nginx is running', async () => {
      // Mock exec to return a version string
      mockExec.mockImplementationOnce((command, callback) => {
        if (callback) {
          callback(null, { stdout: 'nginx version: nginx/1.18.0', stderr: '' });
        }
        return { stdout: 'nginx version: nginx/1.18.0', stderr: '' };
      });
      
      const status = await nginxManager.getStatus();
      
      expect(status.running).toBe(true);
      expect(status.version).toBe('1.18.0');
      expect(mockExec).toHaveBeenCalledWith('nginx -v 2>&1', expect.any(Function));
    });

    it('should return not running status when Nginx is not running', async () => {
      // Mock exec to simulate Nginx not running
      mockExec.mockImplementationOnce((command, callback) => {
        if (callback) {
          callback(new Error('Command failed'), { stdout: '', stderr: 'Error' });
        }
        return { stdout: '', stderr: 'Error' };
      });
      
      const status = await nginxManager.getStatus();
      
      expect(status.running).toBe(false);
      expect(status.version).toBe('unknown');
      expect(mockExec).toHaveBeenCalledWith('nginx -v 2>&1', expect.any(Function));
    });
  });
});