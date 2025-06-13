import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  ProxyRule,
  SslCertificate,
  WafMode,
  WafRuleset,
  IpAccessControlConfig,
  LetsEncryptStatus
} from '../../../shared/src/models';
import { nginxManager } from '../integrations/nginx';

const execAsync = promisify(exec);

/**
 * Service for generating and managing Nginx configurations for domain-based routing
 */
export class NginxConfigService {
  private configDir: string;
  domainConfigsDir: string; // Changed to public for certManager access
  private sslCertsDir: string;
  private letsEncryptDir: string;
  private modsecurityDir: string;

  constructor(options: {
    configDir?: string;
    domainConfigsDir?: string;
    sslCertsDir?: string;
    letsEncryptDir?: string;
    modsecurityDir?: string;
  } = {}) {
    this.configDir = options.configDir || '/etc/nginx';
    this.domainConfigsDir = options.domainConfigsDir || path.join(this.configDir, 'conf.d');
    this.sslCertsDir = options.sslCertsDir || path.join(this.configDir, 'ssl');
    this.letsEncryptDir = options.letsEncryptDir || path.join(this.configDir, 'ssl/letsencrypt');
    this.modsecurityDir = options.modsecurityDir || path.join(this.configDir, 'modsecurity');
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    try {
      // Ensure required directories exist
      await fs.mkdir(this.domainConfigsDir, { recursive: true });
      await fs.mkdir(this.sslCertsDir, { recursive: true });
      await fs.mkdir(this.letsEncryptDir, { recursive: true });
      await fs.mkdir(this.modsecurityDir, { recursive: true });
      await fs.mkdir(path.join(this.modsecurityDir, 'rules'), { recursive: true });
      
      // Create .well-known/acme-challenge directory for Let's Encrypt
      const acmeChallengeDir = path.join('/var/www', '.well-known/acme-challenge');
      await fs.mkdir(acmeChallengeDir, { recursive: true });
      
      console.log(`NginxConfigService initialized with:
        - Domain configs directory: ${this.domainConfigsDir}
        - SSL certificates directory: ${this.sslCertsDir}
        - Let's Encrypt directory: ${this.letsEncryptDir}
        - ModSecurity directory: ${this.modsecurityDir}
        - ACME challenge directory: ${acmeChallengeDir}`);
    } catch (error: any) {
      console.error('Error initializing NginxConfigService:', error);
      throw new Error(`Failed to initialize NginxConfigService: ${error.message}`);
    }
  }

  /**
   * Generate an Nginx server block configuration for a domain
   * @param rule The proxy rule containing domain information
   * @returns The generated Nginx configuration as a string
   */
  generateDomainConfig(rule: ProxyRule): string {
    if (!rule.domain) {
      throw new Error('Proxy rule is missing domain field');
    }

    let config = `
# Domain configuration for ${rule.name} (${rule.domain})
server {
    listen 80;
    server_name ${rule.domain};
    
    # Enhanced logging for analytics
    log_format ${rule.id}_analytics_fmt '$remote_addr - $remote_user [$time_local] '
                       '"$request" $status $body_bytes_sent '
                       '"$http_referer" "$http_user_agent" '
                       '$request_time $upstream_response_time $pipe '
                       '$upstream_cache_status $host';
    
    access_log /var/log/nginx/${rule.id}_access.log ${rule.id}_analytics_fmt;
    error_log /var/log/nginx/${rule.id}_error.log;
`;

    // Add Let's Encrypt ACME challenge location
    config += `
    # Let's Encrypt ACME challenge location
    location /.well-known/acme-challenge/ {
        root /var/www;
        try_files $uri =404;
    }
`;

    // If Let's Encrypt is enabled but SSL is not yet set up, we only need the ACME challenge location
    if (rule.letsEncryptEnabled && !rule.sslEnabled) {
      config += `
    # Redirect all HTTP traffic to HTTPS once certificate is issued
    location / {
        return 301 https://$host$request_uri;
    }
`;
    }

    // Add SSL configuration if enabled
    if (rule.sslEnabled && rule.sslCertPath && rule.sslKeyPath) {
      // Close the HTTP server block and start an HTTPS server block
      config += `
}

# HTTPS server for ${rule.name} (${rule.domain})
server {
    listen 443 ssl;
    server_name ${rule.domain};
    
    # Enhanced logging for analytics
    access_log /var/log/nginx/${rule.id}_access.log ${rule.id}_analytics_fmt;
    error_log /var/log/nginx/${rule.id}_error.log;
    
    ssl_certificate ${rule.sslCertPath};
    ssl_certificate_key ${rule.sslKeyPath};
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-CHACHA20-POLY1305';
    ssl_prefer_server_ciphers on;
    ssl_stapling on;
    ssl_stapling_verify on;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Let's Encrypt ACME challenge location
    location /.well-known/acme-challenge/ {
        root /var/www;
        try_files $uri =404;
    }
`;
    }

    // Add location block for the main path
    config += `
    location ${rule.sourcePath || '/'} {
        proxy_pass http://${rule.targetContainer}:${rule.targetPort};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
`;

    // Add custom headers if specified
    if (rule.headers) {
      Object.entries(rule.headers).forEach(([name, value]) => {
        config += `        proxy_set_header ${name} ${value};\n`;
      });
    }

    // Add response headers if specified
    if (rule.responseHeaders) {
      Object.entries(rule.responseHeaders).forEach(([name, value]) => {
        config += `        add_header ${name} ${value};\n`;
      });
    }

    // Add health check if specified
    if (rule.healthCheck) {
      // Convert milliseconds to seconds for Nginx
      const intervalSeconds = Math.max(1, Math.floor(rule.healthCheck.interval / 1000));
      const timeoutSeconds = Math.max(1, Math.floor(rule.healthCheck.timeout / 1000));
      
      // Create match condition for status codes
      // First, check if we need to create a match condition
      config += `
        # Health check
        # Nginx Plus feature - commented out for compatibility with open source Nginx
        # health_check uri=${rule.healthCheck.path}
        #             interval=${intervalSeconds}s
        #             timeout=${timeoutSeconds}s
        #             fails=${rule.healthCheck.retries}
        #             passes=1;
        
        # Standard Nginx health check using custom location
        location = /_health_check_${rule.id} {
          internal;
          proxy_pass http://${rule.targetContainer}:${rule.targetPort}${rule.healthCheck.path};
          proxy_connect_timeout ${timeoutSeconds}s;
          proxy_read_timeout ${timeoutSeconds}s;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_intercept_errors on;
          error_page ${rule.healthCheck.successCodes} = 200;
          error_page 400 401 402 403 404 405 406 407 408 409 410 411 412 413 414 415 416 417 418 421 422 423 424 425 426 428 429 431 451 500 501 502 503 504 505 506 507 508 510 511 = 503;
          return 503;
        }
`;
    }

    // Add advanced configuration if specified
    if (rule.advancedConfig) {
      const adv = rule.advancedConfig;
      
      // Timeouts
      config += `
        proxy_connect_timeout ${adv.proxyConnectTimeout}s;
        proxy_send_timeout ${adv.proxySendTimeout}s;
        proxy_read_timeout ${adv.proxyReadTimeout}s;
`;
      
      // Buffer sizes
      if (adv.proxyBufferSize) {
        config += `        proxy_buffer_size ${adv.proxyBufferSize};\n`;
      }
      if (adv.proxyBuffers) {
        config += `        proxy_buffers ${adv.proxyBuffers};\n`;
      }
      if (adv.proxyBusyBuffersSize) {
        config += `        proxy_busy_buffers_size ${adv.proxyBusyBuffersSize};\n`;
      }
      
      // Client max body size
      if (adv.clientMaxBodySize) {
        config += `        client_max_body_size ${adv.clientMaxBodySize};\n`;
      }
      
      // Cache
      if (adv.cacheEnabled) {
        config += `        proxy_cache zone1;\n`;
        if (adv.cacheDuration) {
          config += `        proxy_cache_valid 200 ${adv.cacheDuration};\n`;
        }
      }
      
      // CORS
      if (adv.corsEnabled) {
        config += `        add_header Access-Control-Allow-Origin ${adv.corsAllowOrigin || '*'};\n`;
        
        if (adv.corsAllowMethods) {
          config += `        add_header Access-Control-Allow-Methods "${adv.corsAllowMethods}";\n`;
        }
        
        if (adv.corsAllowHeaders) {
          config += `        add_header Access-Control-Allow-Headers "${adv.corsAllowHeaders}";\n`;
        }
        
        if (adv.corsAllowCredentials) {
          config += `        add_header Access-Control-Allow-Credentials "true";\n`;
        }
      }
      
      // Rate limiting
      if (adv.rateLimit && adv.rateLimit.enabled) {
        const zoneName = adv.rateLimit.zone || `zone_${rule.id}`;
        const perIp = adv.rateLimit.perIp ? '$binary_remote_addr' : '$server_name';
        
        // Define rate limit zone at the http context level (this will be moved to a separate file)
        // For now, we'll add it as a comment to show what would be added to the http context
        config += `        # Rate limiting zone definition (would be in http context):\n`;
        config += `        # limit_req_zone ${perIp} zone=${zoneName}:10m rate=${adv.rateLimit.requestsPerSecond}r/s;\n`;
        
        // Add the rate limiting directive
        config += `        limit_req zone=${zoneName} burst=${adv.rateLimit.burstSize}`;
        
        if (adv.rateLimit.nodelay) {
          config += ` nodelay`;
        }
        
        config += `;\n`;
        
        // Add logging if specified
        if (adv.rateLimit.logLevel) {
          config += `        limit_req_log_level ${adv.rateLimit.logLevel};\n`;
        }
        
        // Add custom response code if specified
        if (adv.rateLimit.responseCode) {
          config += `        limit_req_status ${adv.rateLimit.responseCode};\n`;
        }
      }
      
      // Rewrite rules
      if (adv.rewriteRules && adv.rewriteRules.length > 0) {
        adv.rewriteRules.forEach(rewrite => {
          config += `        rewrite ${rewrite.pattern} ${rewrite.replacement} ${rewrite.flag};\n`;
        });
      }
    }

    // Add custom Nginx config if specified
    if (rule.customNginxConfig) {
      config += `\n        ${rule.customNginxConfig}\n`;
    }

    // Add security headers if specified
    if (rule.advancedConfig?.securityHeaders) {
      const secHeaders = rule.advancedConfig.securityHeaders;
      config += `\n    # Security Headers\n`;
      
      if (secHeaders.xFrameOptions) {
        config += `    add_header X-Frame-Options "${secHeaders.xFrameOptions}" always;\n`;
      }
      
      if (secHeaders.xContentTypeOptions) {
        config += `    add_header X-Content-Type-Options "${secHeaders.xContentTypeOptions}" always;\n`;
      }
      
      if (secHeaders.xXssProtection) {
        config += `    add_header X-XSS-Protection "${secHeaders.xXssProtection}" always;\n`;
      }
      
      if (secHeaders.strictTransportSecurity) {
        config += `    add_header Strict-Transport-Security "${secHeaders.strictTransportSecurity}" always;\n`;
      }
      
      if (secHeaders.contentSecurityPolicy) {
        config += `    add_header Content-Security-Policy "${secHeaders.contentSecurityPolicy}" always;\n`;
      }
      
      if (secHeaders.referrerPolicy) {
        config += `    add_header Referrer-Policy "${secHeaders.referrerPolicy}" always;\n`;
      }
      
      if (secHeaders.permissionsPolicy) {
        config += `    add_header Permissions-Policy "${secHeaders.permissionsPolicy}" always;\n`;
      }
      
      // Add custom security headers
      if (secHeaders.customHeaders) {
        Object.entries(secHeaders.customHeaders).forEach(([name, value]) => {
          config += `    add_header ${name} "${value}" always;\n`;
        });
      }
    }
    
    // Add WAF configuration if enabled
    if (rule.advancedConfig?.wafConfig?.enabled) {
      const waf = rule.advancedConfig.wafConfig;
      config += `\n    # ModSecurity WAF Configuration\n`;
      config += `    modsecurity on;\n`;
      config += `    modsecurity_rules_file /etc/nginx/modsecurity/rules/${rule.id}-modsec.conf;\n`;
      
      // The actual rules file would be generated separately and would include:
      // - Mode (detection vs blocking)
      // - Enabled rulesets
      // - Custom rules
    }
    
    // Add IP access control if enabled
    if (rule.advancedConfig?.ipAccessControl?.enabled) {
      const ipControl = rule.advancedConfig.ipAccessControl;
      config += `\n    # IP Access Control\n`;
      
      // Add specific rules first
      if (ipControl.rules && ipControl.rules.length > 0) {
        ipControl.rules.forEach(rule => {
          config += `    ${rule.action} ${rule.ip}; ${rule.comment ? `# ${rule.comment}` : ''}\n`;
        });
      }
      
      // Add default action
      if (ipControl.defaultAction) {
        config += `    ${ipControl.defaultAction} all;\n`;
      }
    }
    
    // Close location and server blocks
    config += `    }\n}\n`;

    return config;
  }

  /**
   * Write a domain configuration to a file
   * @param rule The proxy rule containing domain information
   * @returns The path to the written configuration file
   */
  async writeDomainConfig(rule: ProxyRule): Promise<string> {
    if (!rule.domain) {
      throw new Error('Proxy rule is missing domain field');
    }

    try {
      const configContent = this.generateDomainConfig(rule);
      const configFileName = `${rule.id}-${rule.domain.replace(/[^a-zA-Z0-9]/g, '-')}.conf`;
      const configPath = path.join(this.domainConfigsDir, configFileName);
      
      await fs.writeFile(configPath, configContent);
      console.log(`Domain configuration written to ${configPath}`);
      
      return configPath;
    } catch (error: any) {
      console.error(`Error writing domain configuration for ${rule.domain}:`, error);
      throw new Error(`Failed to write domain configuration: ${error.message}`);
    }
  }

  /**
   * Delete a domain configuration file
   * @param ruleId The ID of the proxy rule
   * @param domain The domain name
   */
  async deleteDomainConfig(ruleId: string, domain: string): Promise<void> {
    try {
      const configFileName = `${ruleId}-${domain.replace(/[^a-zA-Z0-9]/g, '-')}.conf`;
      const configPath = path.join(this.domainConfigsDir, configFileName);
      
      try {
        await fs.access(configPath);
        await fs.unlink(configPath);
        console.log(`Domain configuration deleted: ${configPath}`);
      } catch (error) {
        // File doesn't exist, nothing to do
        console.log(`No domain configuration found to delete for ${domain}`);
      }
    } catch (error: any) {
      console.error(`Error deleting domain configuration for ${domain}:`, error);
      throw new Error(`Failed to delete domain configuration: ${error.message}`);
    }
  }

  /**
   * Reload Nginx to apply configuration changes
   */
  async reloadNginx(): Promise<void> {
    try {
      // First test the configuration
      const testResult = await this.testNginxConfig();
      if (!testResult.valid) {
        throw new Error(`Nginx configuration test failed: ${testResult.message}`);
      }
      
      // If test passed, reload Nginx
      const { stdout, stderr } = await execAsync('nginx -s reload');
      console.log('Nginx reloaded successfully');
      return;
    } catch (error: any) {
      console.error('Error reloading Nginx:', error);
      throw new Error(`Failed to reload Nginx: ${error.message}`);
    }
  }

  /**
   * Test Nginx configuration
   */
  async testNginxConfig(): Promise<{ valid: boolean; message: string }> {
    try {
      const { stdout, stderr } = await execAsync('nginx -t');
      return { valid: true, message: 'Configuration test successful' };
    } catch (error: any) {
      return { 
        valid: false, 
        message: error.stderr || error.message || 'Unknown error during configuration test' 
      };
    }
  }

  /**
   * Store an SSL certificate to the filesystem
   * @param certificate The SSL certificate to store
   * @returns The paths to the certificate files
   */
  async storeSslCertificate(certificate: SslCertificate): Promise<{
    certPath: string;
    keyPath: string;
    chainPath?: string;
  }> {
    try {
      const certDir = path.join(this.sslCertsDir, certificate.id);
      await fs.mkdir(certDir, { recursive: true });
      
      const certPath = path.join(certDir, 'certificate.pem');
      const keyPath = path.join(certDir, 'private.key');
      
      await fs.writeFile(certPath, certificate.certificate);
      await fs.writeFile(keyPath, certificate.privateKey);
      
      let chainPath: string | undefined;
      if (certificate.chainCertificate) {
        chainPath = path.join(certDir, 'chain.pem');
        await fs.writeFile(chainPath, certificate.chainCertificate);
      }
      
      console.log(`SSL certificate stored for ${certificate.domain} with ID ${certificate.id}`);
      
      return {
        certPath,
        keyPath,
        chainPath
      };
    } catch (error: any) {
      console.error(`Error storing SSL certificate for ${certificate.domain}:`, error);
      throw new Error(`Failed to store SSL certificate: ${error.message}`);
    }
  }
  
  /**
   * Delete an SSL certificate from the filesystem
   * @param certificateId The ID of the certificate to delete
   */
  async deleteSslCertificate(certificateId: string): Promise<void> {
    try {
      const certDir = path.join(this.sslCertsDir, certificateId);
      await fs.rm(certDir, { recursive: true, force: true });
      console.log(`SSL certificate with ID ${certificateId} deleted`);
    } catch (error: any) {
      console.error(`Error deleting SSL certificate ${certificateId}:`, error);
      throw new Error(`Failed to delete SSL certificate: ${error.message}`);
    }
  }
  
  /**
   * Generate ModSecurity configuration for a proxy rule
   * @param rule The proxy rule containing WAF configuration
   * @returns The path to the generated ModSecurity configuration file
   */
  async generateModSecurityConfig(rule: ProxyRule): Promise<string> {
    if (!rule.advancedConfig?.wafConfig?.enabled) {
      throw new Error('WAF configuration is not enabled for this rule');
    }
    
    const waf = rule.advancedConfig.wafConfig;
    let config = `# ModSecurity configuration for ${rule.name} (${rule.domain || rule.sourceHost})\n\n`;
    
    // Set SecRuleEngine based on mode
    config += `SecRuleEngine ${waf.mode === WafMode.DETECTION ? 'DetectionOnly' : 'On'}\n\n`;
    
    // Include core ruleset if enabled
    if (waf.rulesets.includes(WafRuleset.CORE)) {
      config += `Include /etc/nginx/modsecurity/coreruleset/crs-setup.conf\n`;
      config += `Include /etc/nginx/modsecurity/coreruleset/rules/*.conf\n\n`;
    }
    
    // Include specific rulesets
    if (waf.rulesets.includes(WafRuleset.SQL)) {
      config += `Include /etc/nginx/modsecurity/rules/sql-injection.conf\n`;
    }
    
    if (waf.rulesets.includes(WafRuleset.XSS)) {
      config += `Include /etc/nginx/modsecurity/rules/xss-protection.conf\n`;
    }
    
    if (waf.rulesets.includes(WafRuleset.LFI)) {
      config += `Include /etc/nginx/modsecurity/rules/lfi-protection.conf\n`;
    }
    
    if (waf.rulesets.includes(WafRuleset.RFI)) {
      config += `Include /etc/nginx/modsecurity/rules/rfi-protection.conf\n`;
    }
    
    if (waf.rulesets.includes(WafRuleset.SCANNER)) {
      config += `Include /etc/nginx/modsecurity/rules/scanner-detection.conf\n`;
    }
    
    if (waf.rulesets.includes(WafRuleset.SESSION)) {
      config += `Include /etc/nginx/modsecurity/rules/session-protection.conf\n`;
    }
    
    if (waf.rulesets.includes(WafRuleset.PROTOCOL)) {
      config += `Include /etc/nginx/modsecurity/rules/protocol-protection.conf\n`;
    }
    
    // Add custom rules if provided
    if (waf.customRules) {
      config += `\n# Custom rules\n${waf.customRules}\n`;
    }
    
    // Write the configuration to a file
    const configPath = path.join(this.modsecurityDir, 'rules', `${rule.id}-modsec.conf`);
    await fs.writeFile(configPath, config);
    
    console.log(`ModSecurity configuration written to ${configPath}`);
    return configPath;
  }
}

// Export a singleton instance
export const nginxConfigService = new NginxConfigService();

// Add a function to configure Nginx for Let's Encrypt
export async function configureNginxForLetsEncrypt(): Promise<void> {
  try {
    // Create a special Nginx configuration for ACME challenges
    const acmeConfig = `
# Global ACME challenge configuration for Let's Encrypt
server {
    listen 80 default_server;
    server_name _;
    
    # ACME challenge location
    location /.well-known/acme-challenge/ {
        root /var/www;
        try_files $uri =404;
    }
    
    # Redirect everything else to HTTPS if possible
    location / {
        return 301 https://$host$request_uri;
    }
}`;
    
    // Write the configuration to a file
    const configPath = path.join(nginxConfigService.domainConfigsDir, '00-acme-challenges.conf');
    await fs.writeFile(configPath, acmeConfig);
    
    // Reload Nginx
    await nginxConfigService.reloadNginx();
    
    console.log('Nginx configured for ACME challenges');
  } catch (error: any) {
    console.error('Error configuring Nginx for ACME challenges:', error);
    throw new Error(`Failed to configure Nginx for ACME challenges: ${error.message}`);
  }
}