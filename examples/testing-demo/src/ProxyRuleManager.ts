/**
 * ProxyRuleManager.ts
 * 
 * This component manages proxy rules for the Kontainers application.
 * It provides functionality to create, update, delete, and validate proxy rules.
 */

import { ProxyRule, ProxyRuleStatus } from './types';

export class ProxyRuleManager {
  private rules: ProxyRule[] = [];
  private maxRules: number;
  private onRuleChange?: (rules: ProxyRule[]) => void;

  /**
   * Creates a new ProxyRuleManager instance
   * @param maxRules Maximum number of rules allowed (default: 100)
   * @param onRuleChange Optional callback that is triggered when rules change
   */
  constructor(maxRules = 100, onRuleChange?: (rules: ProxyRule[]) => void) {
    this.maxRules = maxRules;
    this.onRuleChange = onRuleChange;
  }

  /**
   * Get all proxy rules
   * @returns Array of proxy rules
   */
  getRules(): ProxyRule[] {
    return [...this.rules];
  }

  /**
   * Get a proxy rule by ID
   * @param id The rule ID to find
   * @returns The proxy rule or undefined if not found
   */
  getRule(id: string): ProxyRule | undefined {
    return this.rules.find(rule => rule.id === id);
  }

  /**
   * Add a new proxy rule
   * @param rule The rule to add (without ID)
   * @returns The added rule with generated ID
   * @throws Error if validation fails or max rules reached
   */
  addRule(rule: Omit<ProxyRule, 'id' | 'status'>): ProxyRule {
    // Check if max rules reached
    if (this.rules.length >= this.maxRules) {
      throw new Error(`Maximum number of rules (${this.maxRules}) reached`);
    }

    // Validate the rule
    this.validateRule(rule);

    // Create new rule with ID and status
    const newRule: ProxyRule = {
      ...rule,
      id: this.generateId(),
      status: ProxyRuleStatus.ACTIVE
    };

    // Add to rules array
    this.rules.push(newRule);

    // Trigger change callback
    this.triggerChange();

    return newRule;
  }

  /**
   * Update an existing proxy rule
   * @param id The ID of the rule to update
   * @param updates The updates to apply
   * @returns The updated rule
   * @throws Error if rule not found or validation fails
   */
  updateRule(id: string, updates: Partial<Omit<ProxyRule, 'id'>>): ProxyRule {
    const index = this.rules.findIndex(rule => rule.id === id);
    if (index === -1) {
      throw new Error(`Rule with ID ${id} not found`);
    }

    // Create updated rule
    const updatedRule: ProxyRule = {
      ...this.rules[index],
      ...updates
    };

    // Validate the updated rule
    this.validateRule(updatedRule);

    // Update the rule
    this.rules[index] = updatedRule;

    // Trigger change callback
    this.triggerChange();

    return updatedRule;
  }

  /**
   * Delete a proxy rule
   * @param id The ID of the rule to delete
   * @returns True if rule was deleted, false if not found
   */
  deleteRule(id: string): boolean {
    const initialLength = this.rules.length;
    this.rules = this.rules.filter(rule => rule.id !== id);
    
    const deleted = initialLength > this.rules.length;
    
    // Trigger change callback if a rule was deleted
    if (deleted) {
      this.triggerChange();
    }
    
    return deleted;
  }

  /**
   * Enable a proxy rule
   * @param id The ID of the rule to enable
   * @returns The updated rule
   * @throws Error if rule not found
   */
  enableRule(id: string): ProxyRule {
    return this.updateRule(id, { status: ProxyRuleStatus.ACTIVE });
  }

  /**
   * Disable a proxy rule
   * @param id The ID of the rule to disable
   * @returns The updated rule
   * @throws Error if rule not found
   */
  disableRule(id: string): ProxyRule {
    return this.updateRule(id, { status: ProxyRuleStatus.INACTIVE });
  }

  /**
   * Get active rules only
   * @returns Array of active proxy rules
   */
  getActiveRules(): ProxyRule[] {
    return this.rules.filter(rule => rule.status === ProxyRuleStatus.ACTIVE);
  }

  /**
   * Find rules by domain
   * @param domain The domain to search for
   * @returns Array of matching rules
   */
  findRulesByDomain(domain: string): ProxyRule[] {
    return this.rules.filter(rule => rule.domain === domain);
  }

  /**
   * Clear all rules
   */
  clearRules(): void {
    if (this.rules.length > 0) {
      this.rules = [];
      this.triggerChange();
    }
  }

  /**
   * Import rules from JSON
   * @param jsonRules JSON string containing rules
   * @returns Number of rules imported
   * @throws Error if JSON is invalid or rules are invalid
   */
  importRules(jsonRules: string): number {
    try {
      const rules = JSON.parse(jsonRules);
      
      if (!Array.isArray(rules)) {
        throw new Error('Invalid rules format: expected array');
      }
      
      // Validate all rules before importing
      rules.forEach(rule => this.validateRule(rule));
      
      // Check if importing would exceed max rules
      if (this.rules.length + rules.length > this.maxRules) {
        throw new Error(`Importing ${rules.length} rules would exceed maximum of ${this.maxRules}`);
      }
      
      // Add each rule with a new ID
      const importedRules = rules.map(rule => ({
        ...rule,
        id: this.generateId(),
        status: rule.status || ProxyRuleStatus.ACTIVE
      }));
      
      this.rules = [...this.rules, ...importedRules];
      this.triggerChange();
      
      return importedRules.length;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Invalid JSON format');
      }
      throw error;
    }
  }

  /**
   * Export rules to JSON
   * @returns JSON string containing all rules
   */
  exportRules(): string {
    return JSON.stringify(this.rules);
  }

  /**
   * Validate a proxy rule
   * @param rule The rule to validate
   * @throws Error if validation fails
   */
  private validateRule(rule: Partial<ProxyRule>): void {
    // Check required fields
    if (!rule.domain) {
      throw new Error('Domain is required');
    }
    
    if (!rule.targetPort) {
      throw new Error('Target port is required');
    }
    
    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!domainRegex.test(rule.domain)) {
      throw new Error('Invalid domain format');
    }
    
    // Validate port range
    if (typeof rule.targetPort === 'number' && (rule.targetPort < 1 || rule.targetPort > 65535)) {
      throw new Error('Port must be between 1 and 65535');
    }
    
    // Validate path format if provided
    if (rule.path && !rule.path.startsWith('/')) {
      throw new Error('Path must start with /');
    }
  }

  /**
   * Generate a unique ID for a new rule
   * @returns A unique ID string
   */
  private generateId(): string {
    return `rule-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }

  /**
   * Trigger the onRuleChange callback if defined
   */
  private triggerChange(): void {
    if (this.onRuleChange) {
      this.onRuleChange([...this.rules]);
    }
  }
}