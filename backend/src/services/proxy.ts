
// Generate UUID v4-like IDs without external dependency
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
import { nginxManager } from '../integrations/nginx';
import { nginxConfigService } from './nginxConfig';
import { ProxyRule, ProxyTrafficData, ProxyError, ProxyErrorType } from '../../../shared/src/models';
import { db } from '../db';
import { proxyRules, proxyTraffic, proxyErrors } from '../db/schema';
import { eq } from 'drizzle-orm';

/**
 * Service for managing proxy rules
 */
export class ProxyService {
  private rules: Map<string, ProxyRule> = new Map();
  private trafficData: Map<string, ProxyTrafficData[]> = new Map();
  private errors: Map<string, ProxyError[]> = new Map();
  private eventHandlers: Map<string, Function[]> = new Map();

  constructor() {
    // Initialize event handlers
    this.eventHandlers = new Map();
  }

  /**
   * Register event handler
   */
  on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)?.push(handler);
  }

  /**
   * Emit event
   */
  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  /**
   * Initialize proxy service
   */
  async initialize(): Promise<void> {
    try {
      await nginxManager.initialize();
      await nginxConfigService.initialize();
      
      // Load existing rules from database
      const storedRules = await db.select().from(proxyRules).all();
      
      // Convert stored rules to ProxyRule objects
      for (const storedRule of storedRules) {
        const rule: ProxyRule = {
          ...storedRule,
          headers: storedRule.headers ? JSON.parse(storedRule.headers) : undefined,
          responseHeaders: storedRule.responseHeaders ? JSON.parse(storedRule.responseHeaders) : undefined,
          healthCheck: storedRule.healthCheck ? JSON.parse(storedRule.healthCheck) : undefined,
          loadBalancing: storedRule.loadBalancing ? JSON.parse(storedRule.loadBalancing) : undefined,
          advancedConfig: storedRule.advancedConfig ? JSON.parse(storedRule.advancedConfig) : undefined,
          created: parseInt(storedRule.created)
        };
        
        // Add rule to in-memory map
        this.rules.set(rule.id, rule);
        
        // Initialize traffic data and errors
        this.trafficData.set(rule.id, []);
        this.errors.set(rule.id, []);
        
        // Load recent traffic data
        const recentTraffic = await db.select()
          .from(proxyTraffic)
          .where(eq(proxyTraffic.ruleId, rule.id))
          .orderBy(proxyTraffic.timestamp)
          .limit(100)
          .all();
          
        if (recentTraffic.length > 0) {
          const trafficDataList: ProxyTrafficData[] = recentTraffic.map(t => ({
            id: t.id,
            ruleId: t.ruleId,
            timestamp: parseInt(t.timestamp),
            method: t.method,
            path: t.path,
            statusCode: t.statusCode || undefined,
            responseTime: t.responseTime || undefined,
            bytesSent: t.bytesSent || undefined,
            bytesReceived: t.bytesReceived || undefined,
            clientIp: t.clientIp || undefined,
            userAgent: t.userAgent || undefined
          }));
          
          this.trafficData.set(rule.id, trafficDataList);
        }
        
        // Load recent errors
        const recentErrors = await db.select()
          .from(proxyErrors)
          .where(eq(proxyErrors.ruleId, rule.id))
          .orderBy(proxyErrors.timestamp)
          .limit(100)
          .all();
          
        if (recentErrors.length > 0) {
          const errorList: ProxyError[] = recentErrors.map(e => ({
            id: e.id,
            ruleId: e.ruleId,
            timestamp: parseInt(e.timestamp),
            type: e.type as ProxyErrorType,
            code: e.code || undefined,
            message: e.message || undefined,
            path: e.path || undefined,
            resolved: e.resolved === 1,
            resolvedAt: e.resolvedAt ? parseInt(e.resolvedAt) : undefined,
            resolution: e.resolution || undefined
          }));
          
          this.errors.set(rule.id, errorList);
        }
      }
      
      console.log(`Loaded ${storedRules.length} proxy rules from database`);
      this.emit('proxy:initialized', { success: true });
    } catch (error: any) {
      console.error('Error initializing proxy service:', error);
      this.emit('proxy:initialized', { success: false, error: error.message });
      throw error;
    }
  }

  /**
   * Get all proxy rules
   */
  async getRules(): Promise<ProxyRule[]> {
    return Array.from(this.rules.values());
  }

  /**
   * Get proxy rule by ID
   */
  async getRule(id: string): Promise<ProxyRule | null> {
    return this.rules.get(id) || null;
  }

  /**
   * Create a new proxy rule
   */
  async createRule(rule: Omit<ProxyRule, 'id' | 'created'>): Promise<ProxyRule> {
    const id = generateId();
    const newRule: ProxyRule = {
      ...rule,
      id,
      created: Date.now(),
      enabled: rule.enabled !== undefined ? rule.enabled : true
    };
    
    try {
      // Validate domain name if provided
      if (newRule.domain) {
        const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/;
        if (!domainRegex.test(newRule.domain)) {
          throw new Error(`Invalid domain name: ${newRule.domain}`);
        }
      }
      
      // Save rule to Nginx
      await nginxManager.createOrUpdateProxyRule(newRule);
      
      // If domain is specified, generate domain-specific configuration
      if (newRule.domain) {
        await nginxConfigService.writeDomainConfig(newRule);
        await nginxConfigService.reloadNginx();
      }
      
      // Save rule to memory
      this.rules.set(id, newRule);
      
      // Initialize traffic data and errors
      this.trafficData.set(id, []);
      this.errors.set(id, []);
      
      // Save rule to database
      await db.insert(proxyRules).values({
        id: newRule.id,
        name: newRule.name,
        sourceHost: newRule.sourceHost,
        sourcePath: newRule.sourcePath,
        targetContainer: newRule.targetContainer,
        targetPort: newRule.targetPort,
        protocol: newRule.protocol,
        sslEnabled: newRule.sslEnabled ? 1 : 0,
        sslCertPath: newRule.sslCertPath,
        sslKeyPath: newRule.sslKeyPath,
        domain: newRule.domain,
        headers: newRule.headers ? JSON.stringify(newRule.headers) : null,
        responseHeaders: newRule.responseHeaders ? JSON.stringify(newRule.responseHeaders) : null,
        healthCheck: newRule.healthCheck ? JSON.stringify(newRule.healthCheck) : null,
        loadBalancing: newRule.loadBalancing ? JSON.stringify(newRule.loadBalancing) : null,
        advancedConfig: newRule.advancedConfig ? JSON.stringify(newRule.advancedConfig) : null,
        customNginxConfig: newRule.customNginxConfig,
        created: newRule.created.toString(),
        enabled: newRule.enabled ? 1 : 0
      });
      
      this.emit('proxy:rule:created', newRule);
      return newRule;
    } catch (error: any) {
      console.error('Error creating proxy rule:', error);
      this.emit('proxy:rule:error', {
        ruleId: id,
        action: 'create',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update a proxy rule
   */
  async updateRule(id: string, updates: Partial<ProxyRule>): Promise<ProxyRule> {
    const existingRule = this.rules.get(id);
    if (!existingRule) {
      throw new Error(`Proxy rule with ID ${id} not found`);
    }
    
    const updatedRule: ProxyRule = {
      ...existingRule,
      ...updates
    };
    
    try {
      // Validate domain name if provided
      if (updatedRule.domain) {
        const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/;
        if (!domainRegex.test(updatedRule.domain)) {
          throw new Error(`Invalid domain name: ${updatedRule.domain}`);
        }
      }
      
      // Update rule in Nginx
      await nginxManager.createOrUpdateProxyRule(updatedRule);
      
      // Handle domain configuration updates
      if (updatedRule.domain) {
        // If domain changed, delete old domain config if it exists
        if (existingRule.domain && existingRule.domain !== updatedRule.domain) {
          await nginxConfigService.deleteDomainConfig(id, existingRule.domain);
        }
        
        // Write new domain config
        await nginxConfigService.writeDomainConfig(updatedRule);
        await nginxConfigService.reloadNginx();
      } else if (existingRule.domain && !updatedRule.domain) {
        // If domain was removed, delete the domain config
        await nginxConfigService.deleteDomainConfig(id, existingRule.domain);
        await nginxConfigService.reloadNginx();
      }
      
      // Update rule in memory
      this.rules.set(id, updatedRule);
      
      // Update rule in database
      await db.update(proxyRules)
        .set({
          name: updatedRule.name,
          sourceHost: updatedRule.sourceHost,
          sourcePath: updatedRule.sourcePath,
          targetContainer: updatedRule.targetContainer,
          targetPort: updatedRule.targetPort,
          protocol: updatedRule.protocol,
          sslEnabled: updatedRule.sslEnabled ? 1 : 0,
          sslCertPath: updatedRule.sslCertPath,
          sslKeyPath: updatedRule.sslKeyPath,
          domain: updatedRule.domain,
          headers: updatedRule.headers ? JSON.stringify(updatedRule.headers) : null,
          responseHeaders: updatedRule.responseHeaders ? JSON.stringify(updatedRule.responseHeaders) : null,
          healthCheck: updatedRule.healthCheck ? JSON.stringify(updatedRule.healthCheck) : null,
          loadBalancing: updatedRule.loadBalancing ? JSON.stringify(updatedRule.loadBalancing) : null,
          advancedConfig: updatedRule.advancedConfig ? JSON.stringify(updatedRule.advancedConfig) : null,
          customNginxConfig: updatedRule.customNginxConfig,
          enabled: updatedRule.enabled ? 1 : 0
        })
        .where(eq(proxyRules.id, id));
      
      this.emit('proxy:rule:updated', updatedRule);
      return updatedRule;
    } catch (error: any) {
      console.error(`Error updating proxy rule ${id}:`, error);
      this.emit('proxy:rule:error', {
        ruleId: id,
        action: 'update',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete a proxy rule
   */
  async deleteRule(id: string): Promise<void> {
    const rule = this.rules.get(id);
    if (!rule) {
      throw new Error(`Proxy rule with ID ${id} not found`);
    }
    
    try {
      // Delete rule from Nginx
      await nginxManager.deleteProxyRule(id);
      
      // Delete domain configuration if it exists
      if (rule.domain) {
        await nginxConfigService.deleteDomainConfig(id, rule.domain);
        await nginxConfigService.reloadNginx();
      }
      
      // Delete rule from memory
      this.rules.delete(id);
      this.trafficData.delete(id);
      this.errors.delete(id);
      
      // Delete rule from database
      await db.delete(proxyRules).where(eq(proxyRules.id, id));
      
      // Delete associated traffic data and errors
      await db.delete(proxyTraffic).where(eq(proxyTraffic.ruleId, id));
      await db.delete(proxyErrors).where(eq(proxyErrors.ruleId, id));
      
      this.emit('proxy:rule:deleted', { id });
    } catch (error: any) {
      console.error(`Error deleting proxy rule ${id}:`, error);
      this.emit('proxy:rule:error', {
        ruleId: id,
        action: 'delete',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Toggle a proxy rule (enable/disable)
   */
  async toggleRule(id: string): Promise<ProxyRule> {
    const rule = this.rules.get(id);
    if (!rule) {
      throw new Error(`Proxy rule with ID ${id} not found`);
    }
    
    const updatedRule: ProxyRule = {
      ...rule,
      enabled: !rule.enabled
    };
    
    try {
      // Update rule in Nginx
      await nginxManager.createOrUpdateProxyRule(updatedRule);
      
      // Update domain configuration if it exists
      if (updatedRule.domain) {
        await nginxConfigService.writeDomainConfig(updatedRule);
        await nginxConfigService.reloadNginx();
      }
      
      // Update rule in memory
      this.rules.set(id, updatedRule);
      
      // Update enabled state in database
      await db.update(proxyRules)
        .set({
          enabled: updatedRule.enabled ? 1 : 0
        })
        .where(eq(proxyRules.id, id));
      
      this.emit('proxy:rule:toggled', updatedRule);
      return updatedRule;
    } catch (error: any) {
      console.error(`Error toggling proxy rule ${id}:`, error);
      this.emit('proxy:rule:error', {
        ruleId: id,
        action: 'toggle',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Test a proxy rule
   */
  async testRule(rule: Partial<ProxyRule>): Promise<{ success: boolean; message?: string }> {
    try {
      // Create a temporary rule for testing
      const testRule: ProxyRule = {
        id: 'test-rule',
        name: rule.name || 'Test Rule',
        sourceHost: rule.sourceHost || 'localhost',
        sourcePath: rule.sourcePath || '/',
        targetContainer: rule.targetContainer || 'localhost',
        targetPort: rule.targetPort || 80,
        protocol: rule.protocol || 'HTTP' as any,
        sslEnabled: rule.sslEnabled || false,
        created: Date.now(),
        enabled: true,
        ...rule
      };
      
      // Generate Nginx config but don't apply it
      const configValid = await nginxManager.testConfig();
      
      return {
        success: configValid,
        message: configValid ? 'Rule configuration is valid' : 'Rule configuration is invalid'
      };
    } catch (error: any) {
      console.error('Error testing proxy rule:', error);
      return {
        success: false,
        message: `Error testing rule: ${error.message}`
      };
    }
  }

  /**
   * Record traffic data for a rule
   */
  async recordTrafficData(data: Omit<ProxyTrafficData, 'id'>): Promise<void> {
    const { ruleId } = data;
    
    if (!this.rules.has(ruleId)) {
      console.warn(`Attempted to record traffic data for non-existent rule ${ruleId}`);
      return;
    }
    
    const trafficData: ProxyTrafficData = {
      ...data,
      id: generateId()
    };
    
    // Add to in-memory cache
    const ruleTrafficData = this.trafficData.get(ruleId) || [];
    ruleTrafficData.push(trafficData);
    
    // Limit in-memory cache to 1000 entries per rule
    if (ruleTrafficData.length > 1000) {
      ruleTrafficData.shift(); // Remove oldest entry
    }
    
    this.trafficData.set(ruleId, ruleTrafficData);
    
    // Persist to database (don't await to avoid blocking)
    db.insert(proxyTraffic).values({
      id: trafficData.id,
      ruleId: trafficData.ruleId,
      timestamp: trafficData.timestamp.toString(),
      method: trafficData.method,
      path: trafficData.path,
      statusCode: trafficData.statusCode,
      responseTime: trafficData.responseTime,
      bytesSent: trafficData.bytesSent,
      bytesReceived: trafficData.bytesReceived,
      clientIp: trafficData.clientIp,
      userAgent: trafficData.userAgent
    }).catch(err => {
      console.error('Error persisting traffic data to database:', err);
    });
    
    this.emit('proxy:traffic:recorded', trafficData);
  }

  /**
   * Get traffic data for a rule
   */
  getTrafficData(ruleId: string, options: { limit?: number; since?: number } = {}): ProxyTrafficData[] {
    const ruleTrafficData = this.trafficData.get(ruleId) || [];
    
    let filteredData = ruleTrafficData;
    
    // Filter by timestamp if 'since' is provided
    if (options.since !== undefined) {
      filteredData = filteredData.filter(data => data.timestamp >= options.since!);
    }
    
    // Sort by timestamp (newest first)
    filteredData.sort((a, b) => b.timestamp - a.timestamp);
    
    // Limit the number of results if 'limit' is provided
    if (options.limit) {
      filteredData = filteredData.slice(0, options.limit);
    }
    
    return filteredData;
  }

  /**
   * Record an error for a rule
   */
  async recordError(error: Omit<ProxyError, 'id'>): Promise<void> {
    const { ruleId } = error;
    
    if (!this.rules.has(ruleId)) {
      console.warn(`Attempted to record error for non-existent rule ${ruleId}`);
      return;
    }
    
    const proxyError: ProxyError = {
      ...error,
      id: generateId()
    };
    
    // Add to in-memory cache
    const ruleErrors = this.errors.get(ruleId) || [];
    ruleErrors.push(proxyError);
    
    // Limit in-memory cache to 1000 entries per rule
    if (ruleErrors.length > 1000) {
      ruleErrors.shift(); // Remove oldest entry
    }
    
    this.errors.set(ruleId, ruleErrors);
    
    // Persist to database (don't await to avoid blocking)
    db.insert(proxyErrors).values({
      id: proxyError.id,
      ruleId: proxyError.ruleId,
      timestamp: proxyError.timestamp.toString(),
      type: proxyError.type,
      code: proxyError.code,
      message: proxyError.message,
      path: proxyError.path,
      resolved: proxyError.resolved ? 1 : 0,
      resolvedAt: proxyError.resolvedAt ? proxyError.resolvedAt.toString() : null,
      resolution: proxyError.resolution
    }).catch(err => {
      console.error('Error persisting error to database:', err);
    });
    
    this.emit('proxy:error:recorded', proxyError);
  }

  /**
   * Get errors for a rule
   */
  getErrors(ruleId: string, options: { limit?: number; since?: number; resolved?: boolean } = {}): ProxyError[] {
    const ruleErrors = this.errors.get(ruleId) || [];
    
    let filteredErrors = ruleErrors;
    
    // Filter by timestamp if 'since' is provided
    if (options.since !== undefined) {
      filteredErrors = filteredErrors.filter(error => error.timestamp >= options.since!);
    }
    
    // Filter by resolved status if 'resolved' is provided
    if (options.resolved !== undefined) {
      filteredErrors = filteredErrors.filter(error => error.resolved === options.resolved);
    }
    
    // Sort by timestamp (newest first)
    filteredErrors.sort((a, b) => b.timestamp - a.timestamp);
    
    // Limit the number of results if 'limit' is provided
    if (options.limit) {
      filteredErrors = filteredErrors.slice(0, options.limit);
    }
    
    return filteredErrors;
  }

  /**
   * Mark an error as resolved
   */
  async resolveError(errorId: string, resolution: string): Promise<ProxyError | null> {
    // Find the error in all rule errors
    for (const [ruleId, errors] of this.errors.entries()) {
      const errorIndex = errors.findIndex(error => error.id === errorId);
      if (errorIndex !== -1) {
        const error = errors[errorIndex];
        const resolvedError: ProxyError = {
          ...error,
          resolved: true,
          resolvedAt: Date.now(),
          resolution
        };
        
        // Update the error in the array
        errors[errorIndex] = resolvedError;
        this.errors.set(ruleId, errors);
        
        // Update error in database
        try {
          await db.update(proxyErrors)
            .set({
              resolved: 1,
              resolvedAt: resolvedError.resolvedAt.toString(),
              resolution: resolvedError.resolution
            })
            .where(eq(proxyErrors.id, errorId));
        } catch (err) {
          console.error(`Error updating error resolution in database: ${err}`);
          // Continue even if database update fails
        }
        
        this.emit('proxy:error:resolved', resolvedError);
        return resolvedError;
      }
    }
    
    return null;
  }

  /**
   * Get Nginx status
   */
  async getNginxStatus(): Promise<{ running: boolean; version: string }> {
    return nginxManager.getStatus();
  }
}

// Export a singleton instance
export const proxyService = new ProxyService();