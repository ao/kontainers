import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ProxyRule, ProxyProtocol } from '../../../shared/src/models';

const execAsync = promisify(exec);

/**
 * Nginx manager for generating and managing Nginx configuration
 */
export class NginxManager {
  private configDir: string;
  private sitesDir: string;
  private templatePath: string;
  private mainConfigPath: string;

  constructor(options: {
    configDir?: string;
    sitesDir?: string;
    templatePath?: string;
    mainConfigPath?: string;
  } = {}) {
    this.configDir = options.configDir || '/etc/nginx';
    this.sitesDir = options.sitesDir || path.join(this.configDir, 'sites-enabled');
    this.templatePath = options.templatePath || path.join(this.configDir, 'nginx.conf.template');
    this.mainConfigPath = options.mainConfigPath || path.join(this.configDir, 'nginx.conf');
  }

  /**
   * Initialize Nginx configuration directories
   */
  async initialize(): Promise<void> {
    try {
      // Ensure sites directory exists
      await fs.mkdir(this.sitesDir, { recursive: true });
      
      // Check if main config exists, if not create it
      try {
        await fs.access(this.mainConfigPath);
      } catch {
        // Create default main config
        await this.createDefaultMainConfig();
      }
    } catch (error: any) {
      console.error('Error initializing Nginx configuration:', error);
      throw new Error(`Failed to initialize Nginx configuration: ${error.message}`);
    }
  }

  /**
   * Create a default main Nginx configuration
   */
  private async createDefaultMainConfig(): Promise<void> {
    const defaultConfig = `
user nginx;
worker_processes auto;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    # SSL Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';

    # Gzip Settings
    gzip on;
    gzip_disable "msie6";
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Include site configurations
    include ${this.sitesDir}/*.conf;
}
`;

    await fs.writeFile(this.mainConfigPath, defaultConfig);
  }

  /**
   * Create or update a proxy rule configuration
   */
  async createOrUpdateProxyRule(rule: ProxyRule): Promise<void> {
    try {
      const configPath = path.join(this.sitesDir, `${rule.id}.conf`);
      const configContent = this.generateProxyRuleConfig(rule);
      
      await fs.writeFile(configPath, configContent);
      await this.reloadNginx();
    } catch (error: any) {
      console.error(`Error creating/updating proxy rule ${rule.id}:`, error);
      throw new Error(`Failed to create/update proxy rule ${rule.id}: ${error.message}`);
    }
  }

  /**
   * Delete a proxy rule configuration
   */
  async deleteProxyRule(ruleId: string): Promise<void> {
    try {
      const configPath = path.join(this.sitesDir, `${ruleId}.conf`);
      
      try {
        await fs.access(configPath);
        await fs.unlink(configPath);
        await this.reloadNginx();
      } catch (error) {
        // File doesn't exist, nothing to do
      }
    } catch (error: any) {
      console.error(`Error deleting proxy rule ${ruleId}:`, error);
      throw new Error(`Failed to delete proxy rule ${ruleId}: ${error.message}`);
    }
  }

  /**
   * Generate Nginx configuration for a proxy rule
   */
  private generateProxyRuleConfig(rule: ProxyRule): string {
    let config = '';
    
    // Handle HTTP/HTTPS
    if (rule.protocol === ProxyProtocol.HTTP || rule.protocol === ProxyProtocol.HTTPS) {
      config = `
server {
    listen 80;
    ${rule.protocol === ProxyProtocol.HTTPS ? 'listen 443 ssl;' : ''}
    server_name ${rule.sourceHost};
    
    ${this.generateAccessLog(rule)}
    ${this.generateErrorLog(rule)}
    
    ${rule.protocol === ProxyProtocol.HTTPS ? this.generateSslConfig(rule) : ''}
    
    location ${rule.sourcePath || '/'} {
        proxy_pass http://${rule.targetContainer}:${rule.targetPort};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        ${this.generateHeadersConfig(rule)}
        ${this.generateHealthCheckConfig(rule)}
        ${rule.advancedConfig ? this.generateAdvancedConfig(rule) : ''}
    }
    
    ${rule.customNginxConfig || ''}
}`;
    }
    // Handle TCP/UDP
    else if (rule.protocol === ProxyProtocol.TCP || rule.protocol === ProxyProtocol.UDP) {
      // For TCP/UDP, we need to add a stream block to the main config
      config = `
# TCP/UDP proxy for ${rule.name}
server {
    listen ${rule.sourceHost}:${rule.targetPort} ${rule.protocol.toLowerCase()};
    proxy_pass ${rule.targetContainer}:${rule.targetPort};
    ${rule.protocol === ProxyProtocol.TCP ? 'proxy_connect_timeout 1s;' : ''}
}`;
    }
    
    return config;
  }

  /**
   * Generate SSL configuration
   */
  private generateSslConfig(rule: ProxyRule): string {
    if (!rule.sslEnabled || !rule.sslCertPath || !rule.sslKeyPath) {
      return '';
    }
    
    return `
    ssl_certificate ${rule.sslCertPath};
    ssl_certificate_key ${rule.sslKeyPath};
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_stapling on;
    ssl_stapling_verify on;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;`;
  }

  /**
   * Generate headers configuration
   */
  private generateHeadersConfig(rule: ProxyRule): string {
    if (!rule.headers && !rule.responseHeaders) {
      return '';
    }
    
    let config = '';
    
    // Request headers
    if (rule.headers) {
      Object.entries(rule.headers).forEach(([name, value]) => {
        config += `proxy_set_header ${name} ${value};\n        `;
      });
    }
    
    // Response headers
    if (rule.responseHeaders) {
      Object.entries(rule.responseHeaders).forEach(([name, value]) => {
        config += `add_header ${name} ${value};\n        `;
      });
    }
    
    return config;
  }

  /**
   * Generate health check configuration
   */
  private generateHealthCheckConfig(rule: ProxyRule): string {
    if (!rule.healthCheck) {
      return '';
    }
    
    return `
        # Health check
        health_check uri=${rule.healthCheck.path} 
                    interval=${rule.healthCheck.interval}s 
                    fails=1 
                    passes=1 
                    match=status_${rule.healthCheck.successCodes};`;
  }

  /**
   * Generate advanced configuration
   */
  private generateAdvancedConfig(rule: ProxyRule): string {
    if (!rule.advancedConfig) {
      return '';
    }
    
    const config = [];
    const adv = rule.advancedConfig;
    
    // Timeouts
    config.push(`proxy_connect_timeout ${adv.proxyConnectTimeout}s;`);
    config.push(`proxy_send_timeout ${adv.proxySendTimeout}s;`);
    config.push(`proxy_read_timeout ${adv.proxyReadTimeout}s;`);
    
    // Buffer sizes
    if (adv.proxyBufferSize) {
      config.push(`proxy_buffer_size ${adv.proxyBufferSize};`);
    }
    if (adv.proxyBuffers) {
      config.push(`proxy_buffers ${adv.proxyBuffers};`);
    }
    if (adv.proxyBusyBuffersSize) {
      config.push(`proxy_busy_buffers_size ${adv.proxyBusyBuffersSize};`);
    }
    
    // Client max body size
    if (adv.clientMaxBodySize) {
      config.push(`client_max_body_size ${adv.clientMaxBodySize};`);
    }
    
    // Cache
    if (adv.cacheEnabled) {
      config.push('proxy_cache zone1;');
      if (adv.cacheDuration) {
        config.push(`proxy_cache_valid 200 ${adv.cacheDuration};`);
      }
    }
    
    // CORS
    if (adv.corsEnabled) {
      config.push('add_header Access-Control-Allow-Origin ' + 
                 (adv.corsAllowOrigin || '*') + ';');
      
      if (adv.corsAllowMethods) {
        config.push(`add_header Access-Control-Allow-Methods "${adv.corsAllowMethods}";`);
      }
      
      if (adv.corsAllowHeaders) {
        config.push(`add_header Access-Control-Allow-Headers "${adv.corsAllowHeaders}";`);
      }
      
      if (adv.corsAllowCredentials) {
        config.push('add_header Access-Control-Allow-Credentials "true";');
      }
    }
    
    // Rate limiting
    if (adv.rateLimit) {
      config.push(`limit_req zone=one burst=${adv.rateLimit.burstSize} ${adv.rateLimit.nodelay ? 'nodelay' : ''};`);
    }
    
    // Rewrite rules
    if (adv.rewriteRules && adv.rewriteRules.length > 0) {
      adv.rewriteRules.forEach(rewrite => {
        config.push(`rewrite ${rewrite.pattern} ${rewrite.replacement} ${rewrite.flag};`);
      });
    }
    
    return config.join('\n        ');
  }

  /**
   * Generate access log configuration
   */
  private generateAccessLog(rule: ProxyRule): string {
    return `access_log /var/log/nginx/${rule.id}_access.log;`;
  }

  /**
   * Generate error log configuration
   */
  private generateErrorLog(rule: ProxyRule): string {
    return `error_log /var/log/nginx/${rule.id}_error.log;`;
  }

  /**
   * Test Nginx configuration
   */
  async testConfig(): Promise<boolean> {
    try {
      await execAsync('nginx -t');
      return true;
    } catch (error: any) {
      console.error('Nginx configuration test failed:', error);
      return false;
    }
  }

  /**
   * Reload Nginx
   */
  async reloadNginx(): Promise<void> {
    try {
      // First test the configuration
      const testResult = await this.testConfig();
      if (!testResult) {
        throw new Error('Nginx configuration test failed');
      }
      
      // If test passed, reload Nginx
      await execAsync('nginx -s reload');
    } catch (error: any) {
      console.error('Error reloading Nginx:', error);
      throw new Error(`Failed to reload Nginx: ${error.message}`);
    }
  }

  /**
   * Get Nginx status
   */
  async getStatus(): Promise<{ running: boolean; version: string }> {
    try {
      const { stdout } = await execAsync('nginx -v 2>&1');
      return {
        running: true,
        version: stdout.trim().replace('nginx version: nginx/', '')
      };
    } catch (error) {
      return {
        running: false,
        version: 'unknown'
      };
    }
  }
}

// Export a singleton instance
export const nginxManager = new NginxManager();