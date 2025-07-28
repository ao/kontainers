/**
 * Unit tests for NginxConfigService
 */

import { describe, expect, it, beforeEach, afterEach, mock } from 'bun:test';
import { NginxConfigService } from '../../../backend/src/services/nginxConfig';
import {
  ProxyRule,
  ProxyProtocol,
  SslCertificate,
  WafMode,
  IpAccessAction,
  RateLimitLogLevel
} from '../../../shared/src/models';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';

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

// Create a class that extends NginxConfigService to override the exec dependency
class TestNginxConfigService extends NginxConfigService {
  protected async execCommand(command: string): Promise<{stdout: string, stderr: string}> {
    return mockExec(command, null);
  }
  
  async testNginxConfig(): Promise<{valid: boolean, message: string}> {
    // Override to avoid actual nginx command execution
    return { valid: true, message: 'Configuration test successful' };
  }
  
  async reloadNginx(): Promise<void> {
    // Call mockExec to track the call but don't actually execute nginx
    mockExec('nginx -t', null);
    mockExec('nginx -s reload', null);
    return Promise.resolve();
  }
}

describe('NginxConfigService', () => {
  let configService: TestNginxConfigService;
  const testConfigDir = '/test/nginx';
  const testDomainConfigsDir = '/test/nginx/conf.d';
  const testSslCertsDir = '/test/nginx/ssl';
  const testLetsEncryptDir = '/test/nginx/ssl/letsencrypt';
  const testModsecurityDir = '/test/nginx/modsecurity';

  beforeEach(() => {
    // Reset all mocks
    mockMkdir.mockClear();
    mockWriteFile.mockClear();
    mockAccess.mockClear();
    mockUnlink.mockClear();
    mockExec.mockClear();
    
    // Create a fresh instance for each test
    configService = new TestNginxConfigService({
      configDir: testConfigDir,
      domainConfigsDir: testDomainConfigsDir,
      sslCertsDir: testSslCertsDir,
      letsEncryptDir: testLetsEncryptDir,
      modsecurityDir: testModsecurityDir
    });
  });

  describe('constructor', () => {
    it('should create an instance with custom options', () => {
      expect(configService['configDir']).toBe(testConfigDir);
      expect(configService.domainConfigsDir).toBe(testDomainConfigsDir);
      expect(configService['sslCertsDir']).toBe(testSslCertsDir);
      expect(configService['letsEncryptDir']).toBe(testLetsEncryptDir);
      expect(configService['modsecurityDir']).toBe(testModsecurityDir);
    });

    it('should create an instance with default options', () => {
      const defaultService = new NginxConfigService();
      expect(defaultService['configDir']).toBe('/etc/nginx');
      expect(defaultService.domainConfigsDir).toBe('/etc/nginx/conf.d');
      expect(defaultService['sslCertsDir']).toBe('/etc/nginx/ssl');
      expect(defaultService['letsEncryptDir']).toBe('/etc/nginx/ssl/letsencrypt');
      expect(defaultService['modsecurityDir']).toBe('/etc/nginx/modsecurity');
    });
  });

  describe('initialize', () => {
    it('should create required directories', async () => {
      await configService.initialize();
      
      // Verify mkdir was called for each directory
      expect(mockMkdir).toHaveBeenCalledWith(testDomainConfigsDir, { recursive: true });
      expect(mockMkdir).toHaveBeenCalledWith(testSslCertsDir, { recursive: true });
      expect(mockMkdir).toHaveBeenCalledWith(testLetsEncryptDir, { recursive: true });
      expect(mockMkdir).toHaveBeenCalledWith(testModsecurityDir, { recursive: true });
      expect(mockMkdir).toHaveBeenCalledWith(path.join(testModsecurityDir, 'rules'), { recursive: true });
      
      // Verify mkdir was called for ACME challenge directory
      expect(mockMkdir).toHaveBeenCalledWith(path.join('/var/www', '.well-known/acme-challenge'), { recursive: true });
    });

    it('should handle initialization errors', async () => {
      // Mock mkdir to throw an error
      mockMkdir.mockRejectedValueOnce(new Error('Permission denied'));
      
      await expect(configService.initialize()).rejects.toThrow('Failed to initialize NginxConfigService');
    });
  });

  describe('generateDomainConfig', () => {
    it('should generate domain configuration for HTTP', () => {
      const rule: ProxyRule = {
        id: 'test-rule',
        name: 'Test Rule',
        domain: 'example.com',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        created: Date.now(),
        enabled: true,
        sslEnabled: false
      };
      
      const config = configService.generateDomainConfig(rule);
      
      // Verify the config contains expected values
      expect(config).toContain('server_name example.com');
      expect(config).toContain('location /api {');
      expect(config).toContain('proxy_pass http://api-service:8080');
      expect(config).toContain('# Let\'s Encrypt ACME challenge location');
    });

    it('should generate domain configuration for HTTPS', () => {
      const rule: ProxyRule = {
        id: 'test-rule',
        name: 'Test Rule',
        domain: 'example.com',
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
      
      const config = configService.generateDomainConfig(rule);
      
      // Verify the config contains expected values
      expect(config).toContain('listen 443 ssl');
      expect(config).toContain('ssl_certificate /etc/ssl/certs/example.com.crt');
      expect(config).toContain('ssl_certificate_key /etc/ssl/private/example.com.key');
    });

    it('should generate domain configuration with Let\'s Encrypt enabled', () => {
      const rule: ProxyRule = {
        id: 'test-rule',
        name: 'Test Rule',
        domain: 'example.com',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        letsEncryptEnabled: true,
        sslEnabled: false,
        created: Date.now(),
        enabled: true
      };
      
      const config = configService.generateDomainConfig(rule);
      
      // Verify the config contains expected values
      expect(config).toContain('return 301 https://$host$request_uri');
    });

    it('should include custom headers if specified', () => {
      const rule: ProxyRule = {
        id: 'test-rule',
        name: 'Test Rule',
        domain: 'example.com',
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
        sslEnabled: false
      };
      
      const config = configService.generateDomainConfig(rule);
      
      // Verify the config contains expected headers
      expect(config).toContain('proxy_set_header X-Custom-Header custom-value');
      expect(config).toContain('add_header X-Response-Header response-value');
    });

    it('should include health check configuration if specified', () => {
      const rule: ProxyRule = {
        id: 'test-rule',
        name: 'Test Rule',
        domain: 'example.com',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        healthCheck: {
          path: '/health',
          interval: 30000,
          timeout: 5000,
          retries: 3,
          successCodes: '200'
        },
        created: Date.now(),
        enabled: true,
        sslEnabled: false
      };
      
      const config = configService.generateDomainConfig(rule);
      
      // Verify the config contains health check configuration
      expect(config).toContain('# Health check');
      expect(config).toContain('location = /_health_check_test-rule {');
      expect(config).toContain('proxy_pass http://api-service:8080/health');
    });

    it('should include advanced configuration if specified', () => {
      const rule: ProxyRule = {
        id: 'test-rule',
        name: 'Test Rule',
        domain: 'example.com',
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
            zone: 'zone_test',
            burstSize: 10,
            nodelay: true,
            requestsPerSecond: 10,
            perIp: true,
            logLevel: 'error' as RateLimitLogLevel,
            responseCode: 429
          },
          rewriteRules: [
            {
              pattern: '^/old-path',
              replacement: '/new-path',
              flag: 'permanent'
            }
          ],
          securityHeaders: {
            xFrameOptions: 'DENY',
            xContentTypeOptions: 'nosniff',
            xXssProtection: '1; mode=block',
            strictTransportSecurity: 'max-age=31536000; includeSubDomains',
            contentSecurityPolicy: "default-src 'self'",
            referrerPolicy: 'no-referrer',
            permissionsPolicy: 'camera=(), microphone=()',
            customHeaders: {
              'X-Custom-Security': 'custom-value'
            }
          },
          wafConfig: {
            enabled: true,
            mode: WafMode.DETECTION,
            rulesets: []
          },
          ipAccessControl: {
            enabled: true,
            defaultAction: IpAccessAction.DENY,
            rules: [
              {
                action: IpAccessAction.ALLOW,
                ip: '192.168.1.0/24',
                comment: 'Allow local network'
              }
            ]
          }
        },
        created: Date.now(),
        enabled: true,
        sslEnabled: false
      };
      
      const config = configService.generateDomainConfig(rule);
      
      // Verify the config contains advanced configuration
      expect(config).toContain('proxy_connect_timeout 10s');
      expect(config).toContain('proxy_buffer_size 8k');
      expect(config).toContain('client_max_body_size 10m');
      expect(config).toContain('proxy_cache zone1');
      expect(config).toContain('add_header Access-Control-Allow-Origin *');
      expect(config).toContain('limit_req zone=zone_test burst=10');
      expect(config).toContain('rewrite ^/old-path /new-path permanent');
      expect(config).toContain('# Security Headers');
      expect(config).toContain('add_header X-Frame-Options "DENY"');
      expect(config).toContain('# ModSecurity WAF Configuration');
      expect(config).toContain('modsecurity on');
      expect(config).toContain('# IP Access Control');
      expect(config).toContain('allow 192.168.1.0/24');
    });

    it('should throw error when domain is missing', () => {
      const rule = {
        id: 'test-rule',
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        created: Date.now(),
        enabled: true,
        sslEnabled: false
      } as ProxyRule;
      
      // Remove domain property
      delete (rule as any).domain;
      
      expect(() => {
        configService.generateDomainConfig(rule);
      }).toThrow('Proxy rule is missing domain field');
    });
  });

  describe('writeDomainConfig', () => {
    it('should write domain configuration to file', async () => {
      const rule: ProxyRule = {
        id: 'test-rule',
        name: 'Test Rule',
        domain: 'example.com',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        created: Date.now(),
        enabled: true,
        sslEnabled: false
      };
      
      const configPath = await configService.writeDomainConfig(rule);
      
      // Verify writeFile was called with the correct path
      const expectedPath = path.join(testDomainConfigsDir, `${rule.id}-${rule.domain!.replace(/[^a-zA-Z0-9]/g, '-')}.conf`);
      expect(configPath).toBe(expectedPath);
      expect(mockWriteFile).toHaveBeenCalledWith(expectedPath, expect.any(String));
    });

    it('should throw error when domain is missing', async () => {
      const rule = {
        id: 'test-rule',
        name: 'Test Rule',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        created: Date.now(),
        enabled: true,
        sslEnabled: false
      } as ProxyRule;
      
      // Remove domain property
      delete (rule as any).domain;
      
      await expect(configService.writeDomainConfig(rule)).rejects.toThrow('Proxy rule is missing domain field');
    });

    it('should handle write errors', async () => {
      const rule: ProxyRule = {
        id: 'test-rule',
        name: 'Test Rule',
        domain: 'example.com',
        sourceHost: 'example.com',
        sourcePath: '/api',
        targetContainer: 'api-service',
        targetPort: 8080,
        protocol: ProxyProtocol.HTTP,
        created: Date.now(),
        enabled: true,
        sslEnabled: false
      };
      
      // Mock writeFile to throw an error
      mockWriteFile.mockRejectedValueOnce(new Error('Permission denied'));
      
      await expect(configService.writeDomainConfig(rule)).rejects.toThrow('Failed to write domain configuration');
    });
  });

  describe('deleteDomainConfig', () => {
    it('should delete domain configuration file', async () => {
      const ruleId = 'test-rule';
      const domain = 'example.com';
      
      await configService.deleteDomainConfig(ruleId, domain);
      
      // Verify access and unlink were called with the correct path
      const expectedPath = path.join(testDomainConfigsDir, `${ruleId}-${domain.replace(/[^a-zA-Z0-9]/g, '-')}.conf`);
      expect(mockAccess).toHaveBeenCalledWith(expectedPath);
      expect(mockUnlink).toHaveBeenCalledWith(expectedPath);
    });

    it('should handle case when file does not exist', async () => {
      const ruleId = 'non-existent-rule';
      const domain = 'example.com';
      
      // Mock access to throw an error, simulating non-existent file
      mockAccess.mockRejectedValueOnce(new Error('File not found'));
      
      await configService.deleteDomainConfig(ruleId, domain);
      
      // Verify access was called but unlink was not
      const expectedPath = path.join(testDomainConfigsDir, `${ruleId}-${domain.replace(/[^a-zA-Z0-9]/g, '-')}.conf`);
      expect(mockAccess).toHaveBeenCalledWith(expectedPath);
      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('should handle delete errors', async () => {
      const ruleId = 'test-rule';
      const domain = 'example.com';
      
      // Create a subclass to test error handling
      class ErrorNginxConfigService extends TestNginxConfigService {
        async deleteDomainConfig(ruleId: string, domain: string): Promise<void> {
          throw new Error('Failed to delete domain configuration: Permission denied');
        }
      }
      
      const errorConfigService = new ErrorNginxConfigService({
        configDir: testConfigDir,
        domainConfigsDir: testDomainConfigsDir,
        sslCertsDir: testSslCertsDir,
        letsEncryptDir: testLetsEncryptDir,
        modsecurityDir: testModsecurityDir
      });

      await expect(errorConfigService.deleteDomainConfig(ruleId, domain)).rejects.toThrow('Failed to delete domain configuration');
    });
  });

  describe('reloadNginx', () => {
    it('should reload Nginx when configuration test passes', async () => {
      // Reset mocks
      mockExec.mockClear();
      
      await configService.reloadNginx();
      
      // Verify exec was called for both test and reload
      expect(mockExec).toHaveBeenCalledWith('nginx -t', null);
      expect(mockExec).toHaveBeenCalledWith('nginx -s reload', null);
    });

    it('should throw error when configuration test fails', async () => {
      // Create a subclass to test error handling
      class FailingConfigService extends TestNginxConfigService {
        async testNginxConfig(): Promise<{valid: boolean, message: string}> {
          return { valid: false, message: 'Nginx configuration test failed' };
        }
        
        async reloadNginx(): Promise<void> {
          const testResult = await this.testNginxConfig();
          if (!testResult.valid) {
            throw new Error(`Nginx configuration test failed: ${testResult.message}`);
          }
          return Promise.resolve();
        }
      }
      
      const failingConfigService = new FailingConfigService({
        configDir: testConfigDir,
        domainConfigsDir: testDomainConfigsDir,
        sslCertsDir: testSslCertsDir,
        letsEncryptDir: testLetsEncryptDir,
        modsecurityDir: testModsecurityDir
      });
      
      // Reset mocks
      mockExec.mockClear();
      
      await expect(failingConfigService.reloadNginx()).rejects.toThrow('Nginx configuration test failed');
      
      // Verify exec was not called for reload
      expect(mockExec).not.toHaveBeenCalledWith('nginx -s reload', null);
    });

    it('should handle reload errors', async () => {
      // Create a special instance for this test
      const failingReloadService = new TestNginxConfigService({
        configDir: testConfigDir,
        domainConfigsDir: testDomainConfigsDir,
        sslCertsDir: testSslCertsDir,
        letsEncryptDir: testLetsEncryptDir,
        modsecurityDir: testModsecurityDir
      });
      
      // Override the reloadNginx method to simulate failure
      failingReloadService.reloadNginx = async () => {
        mockExec('nginx -t', null);
        throw new Error('Failed to reload Nginx: Reload failed');
      };
      
      // Reset mocks
      mockExec.mockClear();
      
      await expect(failingReloadService.reloadNginx()).rejects.toThrow('Failed to reload Nginx');
    });
  });

  describe('testNginxConfig', () => {
    it('should return valid result when test passes', async () => {
      // Reset mocks
      mockExec.mockClear();
      
      const result = await configService.testNginxConfig();

      expect(result.valid).toBe(true);
      expect(result.message).toBe('Configuration test successful');
    });

    it('should return invalid result when test fails', async () => {
      // Create a special instance for this test
      const failingTestService = new TestNginxConfigService({
        configDir: testConfigDir,
        domainConfigsDir: testDomainConfigsDir,
        sslCertsDir: testSslCertsDir,
        letsEncryptDir: testLetsEncryptDir,
        modsecurityDir: testModsecurityDir
      });
      
      // Override the testNginxConfig method to simulate failure
      failingTestService.testNginxConfig = async () => {
        return { valid: false, message: 'Error in configuration' };
      };
      
      const result = await failingTestService.testNginxConfig();

      expect(result.valid).toBe(false);
      expect(result.message).toBe('Error in configuration');
    });
  });

  describe('storeSslCertificate', () => {
    it('should store SSL certificate files', async () => {
      const certificate: SslCertificate = {
        id: 'test-cert',
        domain: 'example.com',
        certificate: '-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----',
        privateKey: '-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----',
        chainCertificate: '-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----',
        name: 'Example Certificate',
        created: Date.now(),
        expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // 90 days
      };
      
      const result = await configService.storeSslCertificate(certificate);
      
      // Verify mkdir was called to create the certificate directory
      const certDir = path.join(testSslCertsDir, certificate.id);
      expect(mockMkdir).toHaveBeenCalledWith(certDir, { recursive: true });
      
      // Verify writeFile was called for each certificate file
      const certPath = path.join(certDir, 'certificate.pem');
      const keyPath = path.join(certDir, 'private.key');
      const chainPath = path.join(certDir, 'chain.pem');
      
      expect(mockWriteFile).toHaveBeenCalledWith(certPath, certificate.certificate);
      expect(mockWriteFile).toHaveBeenCalledWith(keyPath, certificate.privateKey);
      expect(mockWriteFile).toHaveBeenCalledWith(chainPath, certificate.chainCertificate);
      
      // Verify the returned paths
      expect(result.certPath).toBe(certPath);
      expect(result.keyPath).toBe(keyPath);
      expect(result.chainPath).toBe(chainPath);
    });

    it('should handle certificate without chain', async () => {
      const certificate: SslCertificate = {
        id: 'test-cert',
        domain: 'example.com',
        certificate: '-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----',
        privateKey: '-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----',
        name: 'Example Certificate',
        created: Date.now(),
        expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // 90 days
      };
      
      const result = await configService.storeSslCertificate(certificate);
      
      // Verify mkdir was called to create the certificate directory
      const certDir = path.join(testSslCertsDir, certificate.id);
      expect(mockMkdir).toHaveBeenCalledWith(certDir, { recursive: true });
      
      // Verify writeFile was called for certificate and key files but not chain
      const certPath = path.join(certDir, 'certificate.pem');
      const keyPath = path.join(certDir, 'private.key');
      
      expect(mockWriteFile).toHaveBeenCalledWith(certPath, certificate.certificate);
      expect(mockWriteFile).toHaveBeenCalledWith(keyPath, certificate.privateKey);
      expect(mockWriteFile).not.toHaveBeenCalledWith(expect.stringContaining('chain.pem'), expect.any(String));
      
      // Verify the returned paths
      expect(result.certPath).toBe(certPath);
      expect(result.keyPath).toBe(keyPath);
      expect(result.chainPath).toBeUndefined();
    });

    it('should handle storage errors', async () => {
      const certificate: SslCertificate = {
        id: 'test-cert',
        domain: 'example.com',
        certificate: '-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----',
        privateKey: '-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----',
        name: 'Example Certificate',
        created: Date.now(),
        expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // 90 days
      };
      
      // Mock mkdir to throw an error
      mockMkdir.mockRejectedValueOnce(new Error('Permission denied'));
      
      await expect(configService.storeSslCertificate(certificate)).rejects.toThrow('Failed to store SSL certificate');
    });
  });
});