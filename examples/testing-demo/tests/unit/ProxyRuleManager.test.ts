/**
 * Unit tests for ProxyRuleManager
 */

import { describe, expect, it, beforeEach, jest } from 'bun:test';
import { ProxyRuleManager } from '../../src/ProxyRuleManager';
import { ProxyRule, ProxyRuleStatus } from '../../src/types';

describe('ProxyRuleManager', () => {
  let manager: ProxyRuleManager;
  let onRuleChangeMock: jest.Mock;

  beforeEach(() => {
    // Create a fresh mock for each test
    onRuleChangeMock = jest.fn();
    
    // Create a fresh manager for each test
    manager = new ProxyRuleManager(100, onRuleChangeMock);
  });

  describe('constructor', () => {
    it('should create an instance with default values', () => {
      const defaultManager = new ProxyRuleManager();
      expect(defaultManager.getRules()).toEqual([]);
    });

    it('should create an instance with custom max rules', () => {
      const customManager = new ProxyRuleManager(50);
      expect(customManager.getRules()).toEqual([]);
    });
  });

  describe('addRule', () => {
    it('should add a valid rule', () => {
      const rule = {
        domain: 'example.com',
        targetPort: 8080,
        path: '/api'
      };

      const addedRule = manager.addRule(rule);
      
      // Verify the rule was added with correct properties
      expect(addedRule.domain).toBe('example.com');
      expect(addedRule.targetPort).toBe(8080);
      expect(addedRule.path).toBe('/api');
      expect(addedRule.status).toBe(ProxyRuleStatus.ACTIVE);
      expect(addedRule.id).toBeDefined();
      
      // Verify the rule is in the manager's rules
      const rules = manager.getRules();
      expect(rules).toHaveLength(1);
      expect(rules[0]).toEqual(addedRule);
      
      // Verify the change callback was called
      expect(onRuleChangeMock).toHaveBeenCalledTimes(1);
      expect(onRuleChangeMock).toHaveBeenCalledWith([addedRule]);
    });

    it('should throw error when adding rule without domain', () => {
      const invalidRule = {
        targetPort: 8080
      };

      expect(() => {
        manager.addRule(invalidRule as any);
      }).toThrow('Domain is required');
      
      // Verify no rules were added
      expect(manager.getRules()).toHaveLength(0);
      
      // Verify the change callback was not called
      expect(onRuleChangeMock).not.toHaveBeenCalled();
    });

    it('should throw error when adding rule without target port', () => {
      const invalidRule = {
        domain: 'example.com'
      };

      expect(() => {
        manager.addRule(invalidRule as any);
      }).toThrow('Target port is required');
      
      // Verify no rules were added
      expect(manager.getRules()).toHaveLength(0);
      
      // Verify the change callback was not called
      expect(onRuleChangeMock).not.toHaveBeenCalled();
    });

    it('should throw error when adding rule with invalid domain', () => {
      const invalidRule = {
        domain: 'invalid domain',
        targetPort: 8080
      };

      expect(() => {
        manager.addRule(invalidRule);
      }).toThrow('Invalid domain format');
      
      // Verify no rules were added
      expect(manager.getRules()).toHaveLength(0);
      
      // Verify the change callback was not called
      expect(onRuleChangeMock).not.toHaveBeenCalled();
    });

    it('should throw error when adding rule with invalid port', () => {
      const invalidRule = {
        domain: 'example.com',
        targetPort: 70000
      };

      expect(() => {
        manager.addRule(invalidRule);
      }).toThrow('Port must be between 1 and 65535');
      
      // Verify no rules were added
      expect(manager.getRules()).toHaveLength(0);
      
      // Verify the change callback was not called
      expect(onRuleChangeMock).not.toHaveBeenCalled();
    });

    it('should throw error when adding rule with invalid path', () => {
      const invalidRule = {
        domain: 'example.com',
        targetPort: 8080,
        path: 'invalid-path'
      };

      expect(() => {
        manager.addRule(invalidRule);
      }).toThrow('Path must start with /');
      
      // Verify no rules were added
      expect(manager.getRules()).toHaveLength(0);
      
      // Verify the change callback was not called
      expect(onRuleChangeMock).not.toHaveBeenCalled();
    });

    it('should throw error when exceeding max rules', () => {
      // Create a manager with max 2 rules
      const limitedManager = new ProxyRuleManager(2);
      
      // Add 2 rules
      limitedManager.addRule({
        domain: 'example1.com',
        targetPort: 8081
      });
      
      limitedManager.addRule({
        domain: 'example2.com',
        targetPort: 8082
      });
      
      // Try to add a third rule
      expect(() => {
        limitedManager.addRule({
          domain: 'example3.com',
          targetPort: 8083
        });
      }).toThrow('Maximum number of rules (2) reached');
      
      // Verify only 2 rules were added
      expect(limitedManager.getRules()).toHaveLength(2);
    });
  });

  describe('updateRule', () => {
    let ruleId: string;
    
    beforeEach(() => {
      // Add a rule to update
      const addedRule = manager.addRule({
        domain: 'example.com',
        targetPort: 8080
      });
      
      ruleId = addedRule.id;
      
      // Reset the mock to clear the addRule call
      onRuleChangeMock.mockClear();
    });

    it('should update an existing rule', () => {
      const updatedRule = manager.updateRule(ruleId, {
        domain: 'updated.com',
        targetPort: 9090,
        path: '/api'
      });
      
      // Verify the rule was updated
      expect(updatedRule.domain).toBe('updated.com');
      expect(updatedRule.targetPort).toBe(9090);
      expect(updatedRule.path).toBe('/api');
      expect(updatedRule.id).toBe(ruleId);
      
      // Verify the rule in the manager was updated
      const rule = manager.getRule(ruleId);
      expect(rule).toEqual(updatedRule);
      
      // Verify the change callback was called
      expect(onRuleChangeMock).toHaveBeenCalledTimes(1);
      expect(onRuleChangeMock).toHaveBeenCalledWith([updatedRule]);
    });

    it('should throw error when updating non-existent rule', () => {
      expect(() => {
        manager.updateRule('non-existent-id', {
          domain: 'updated.com'
        });
      }).toThrow('Rule with ID non-existent-id not found');
      
      // Verify the change callback was not called
      expect(onRuleChangeMock).not.toHaveBeenCalled();
    });

    it('should throw error when updating with invalid data', () => {
      expect(() => {
        manager.updateRule(ruleId, {
          domain: 'invalid domain'
        });
      }).toThrow('Invalid domain format');
      
      // Verify the rule was not updated
      const rule = manager.getRule(ruleId);
      expect(rule?.domain).toBe('example.com');
      
      // Verify the change callback was not called
      expect(onRuleChangeMock).not.toHaveBeenCalled();
    });
  });

  describe('deleteRule', () => {
    let ruleId: string;
    
    beforeEach(() => {
      // Add a rule to delete
      const addedRule = manager.addRule({
        domain: 'example.com',
        targetPort: 8080
      });
      
      ruleId = addedRule.id;
      
      // Reset the mock to clear the addRule call
      onRuleChangeMock.mockClear();
    });

    it('should delete an existing rule', () => {
      const result = manager.deleteRule(ruleId);
      
      // Verify the rule was deleted
      expect(result).toBe(true);
      expect(manager.getRule(ruleId)).toBeUndefined();
      expect(manager.getRules()).toHaveLength(0);
      
      // Verify the change callback was called
      expect(onRuleChangeMock).toHaveBeenCalledTimes(1);
      expect(onRuleChangeMock).toHaveBeenCalledWith([]);
    });

    it('should return false when deleting non-existent rule', () => {
      const result = manager.deleteRule('non-existent-id');
      
      // Verify the result is false
      expect(result).toBe(false);
      
      // Verify the rules are unchanged
      expect(manager.getRules()).toHaveLength(1);
      
      // Verify the change callback was not called
      expect(onRuleChangeMock).not.toHaveBeenCalled();
    });
  });

  describe('enableRule and disableRule', () => {
    let ruleId: string;
    
    beforeEach(() => {
      // Add a rule
      const addedRule = manager.addRule({
        domain: 'example.com',
        targetPort: 8080
      });
      
      ruleId = addedRule.id;
      
      // Reset the mock to clear the addRule call
      onRuleChangeMock.mockClear();
    });

    it('should enable a rule', () => {
      // First disable the rule
      manager.disableRule(ruleId);
      onRuleChangeMock.mockClear();
      
      // Then enable it
      const enabledRule = manager.enableRule(ruleId);
      
      // Verify the rule was enabled
      expect(enabledRule.status).toBe(ProxyRuleStatus.ACTIVE);
      
      // Verify the rule in the manager was updated
      const rule = manager.getRule(ruleId);
      expect(rule?.status).toBe(ProxyRuleStatus.ACTIVE);
      
      // Verify the change callback was called
      expect(onRuleChangeMock).toHaveBeenCalledTimes(1);
    });

    it('should disable a rule', () => {
      const disabledRule = manager.disableRule(ruleId);
      
      // Verify the rule was disabled
      expect(disabledRule.status).toBe(ProxyRuleStatus.INACTIVE);
      
      // Verify the rule in the manager was updated
      const rule = manager.getRule(ruleId);
      expect(rule?.status).toBe(ProxyRuleStatus.INACTIVE);
      
      // Verify the change callback was called
      expect(onRuleChangeMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('getActiveRules', () => {
    beforeEach(() => {
      // Add some rules with different statuses
      const rule1 = manager.addRule({
        domain: 'active1.com',
        targetPort: 8081
      });
      
      const rule2 = manager.addRule({
        domain: 'active2.com',
        targetPort: 8082
      });
      
      const rule3 = manager.addRule({
        domain: 'inactive.com',
        targetPort: 8083
      });
      
      // Disable one rule
      manager.disableRule(rule3.id);
      
      // Reset the mock
      onRuleChangeMock.mockClear();
    });

    it('should return only active rules', () => {
      const activeRules = manager.getActiveRules();
      
      // Verify only active rules are returned
      expect(activeRules).toHaveLength(2);
      expect(activeRules.every(rule => rule.status === ProxyRuleStatus.ACTIVE)).toBe(true);
      expect(activeRules.map(rule => rule.domain)).toContain('active1.com');
      expect(activeRules.map(rule => rule.domain)).toContain('active2.com');
      expect(activeRules.map(rule => rule.domain)).not.toContain('inactive.com');
      
      // Verify the change callback was not called
      expect(onRuleChangeMock).not.toHaveBeenCalled();
    });
  });

  describe('findRulesByDomain', () => {
    beforeEach(() => {
      // Add some rules with different domains
      manager.addRule({
        domain: 'example.com',
        targetPort: 8081
      });
      
      manager.addRule({
        domain: 'example.com',
        targetPort: 8082,
        path: '/api'
      });
      
      manager.addRule({
        domain: 'other.com',
        targetPort: 8083
      });
      
      // Reset the mock
      onRuleChangeMock.mockClear();
    });

    it('should find rules by domain', () => {
      const rules = manager.findRulesByDomain('example.com');
      
      // Verify the correct rules are returned
      expect(rules).toHaveLength(2);
      expect(rules.every(rule => rule.domain === 'example.com')).toBe(true);
      
      // Verify the change callback was not called
      expect(onRuleChangeMock).not.toHaveBeenCalled();
    });

    it('should return empty array for non-existent domain', () => {
      const rules = manager.findRulesByDomain('non-existent.com');
      
      // Verify an empty array is returned
      expect(rules).toHaveLength(0);
      
      // Verify the change callback was not called
      expect(onRuleChangeMock).not.toHaveBeenCalled();
    });
  });

  describe('clearRules', () => {
    beforeEach(() => {
      // Add some rules
      manager.addRule({
        domain: 'example1.com',
        targetPort: 8081
      });
      
      manager.addRule({
        domain: 'example2.com',
        targetPort: 8082
      });
      
      // Reset the mock
      onRuleChangeMock.mockClear();
    });

    it('should clear all rules', () => {
      manager.clearRules();
      
      // Verify all rules were cleared
      expect(manager.getRules()).toHaveLength(0);
      
      // Verify the change callback was called
      expect(onRuleChangeMock).toHaveBeenCalledTimes(1);
      expect(onRuleChangeMock).toHaveBeenCalledWith([]);
    });

    it('should not trigger change callback if no rules to clear', () => {
      // Clear rules first
      manager.clearRules();
      onRuleChangeMock.mockClear();
      
      // Clear again
      manager.clearRules();
      
      // Verify the change callback was not called
      expect(onRuleChangeMock).not.toHaveBeenCalled();
    });
  });

  describe('importRules and exportRules', () => {
    it('should export rules to JSON', () => {
      // Add some rules
      const rule1 = manager.addRule({
        domain: 'example1.com',
        targetPort: 8081
      });
      
      const rule2 = manager.addRule({
        domain: 'example2.com',
        targetPort: 8082,
        path: '/api'
      });
      
      // Export rules
      const json = manager.exportRules();
      
      // Parse the JSON to verify it's valid
      const exportedRules = JSON.parse(json);
      
      // Verify the exported rules match the added rules
      expect(exportedRules).toHaveLength(2);
      expect(exportedRules[0].id).toBe(rule1.id);
      expect(exportedRules[1].id).toBe(rule2.id);
    });

    it('should import valid rules from JSON', () => {
      // Create JSON to import
      const json = JSON.stringify([
        {
          domain: 'imported1.com',
          targetPort: 9091,
          status: ProxyRuleStatus.ACTIVE
        },
        {
          domain: 'imported2.com',
          targetPort: 9092,
          path: '/api',
          status: ProxyRuleStatus.INACTIVE
        }
      ]);
      
      // Import rules
      const count = manager.importRules(json);
      
      // Verify the correct number of rules was imported
      expect(count).toBe(2);
      
      // Verify the rules were imported correctly
      const rules = manager.getRules();
      expect(rules).toHaveLength(2);
      expect(rules.map(r => r.domain)).toContain('imported1.com');
      expect(rules.map(r => r.domain)).toContain('imported2.com');
      
      // Verify the change callback was called
      expect(onRuleChangeMock).toHaveBeenCalledTimes(1);
    });

    it('should throw error when importing invalid JSON', () => {
      expect(() => {
        manager.importRules('invalid json');
      }).toThrow('Invalid JSON format');
      
      // Verify no rules were imported
      expect(manager.getRules()).toHaveLength(0);
      
      // Verify the change callback was not called
      expect(onRuleChangeMock).not.toHaveBeenCalled();
    });

    it('should throw error when importing non-array JSON', () => {
      expect(() => {
        manager.importRules('{"notAnArray": true}');
      }).toThrow('Invalid rules format: expected array');
      
      // Verify no rules were imported
      expect(manager.getRules()).toHaveLength(0);
      
      // Verify the change callback was not called
      expect(onRuleChangeMock).not.toHaveBeenCalled();
    });

    it('should throw error when importing invalid rules', () => {
      // Create JSON with invalid rule
      const json = JSON.stringify([
        {
          domain: 'valid.com',
          targetPort: 8080
        },
        {
          domain: 'invalid domain',
          targetPort: 8081
        }
      ]);
      
      expect(() => {
        manager.importRules(json);
      }).toThrow('Invalid domain format');
      
      // Verify no rules were imported
      expect(manager.getRules()).toHaveLength(0);
      
      // Verify the change callback was not called
      expect(onRuleChangeMock).not.toHaveBeenCalled();
    });

    it('should throw error when importing would exceed max rules', () => {
      // Create a manager with max 2 rules
      const limitedManager = new ProxyRuleManager(2);
      
      // Add one rule
      limitedManager.addRule({
        domain: 'existing.com',
        targetPort: 8080
      });
      
      // Create JSON with 2 rules
      const json = JSON.stringify([
        {
          domain: 'import1.com',
          targetPort: 9091
        },
        {
          domain: 'import2.com',
          targetPort: 9092
        }
      ]);
      
      expect(() => {
        limitedManager.importRules(json);
      }).toThrow('Importing 2 rules would exceed maximum of 2');
      
      // Verify no rules were imported
      expect(limitedManager.getRules()).toHaveLength(1);
    });
  });
});