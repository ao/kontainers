/**
 * Performance tests for ProxyRuleManager
 * 
 * This file demonstrates how to write performance tests for the ProxyRuleManager
 * to ensure it performs well under various conditions.
 */

import { describe, expect, it, beforeEach } from 'bun:test';
import { ProxyRuleManager } from '../../src/ProxyRuleManager';
import { ProxyRuleStatus } from '../../src/types';

// Helper function to measure execution time
function measureExecutionTime(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

// Helper function to generate a valid domain name
function generateDomain(index: number): string {
  return `domain-${index}.example.com`;
}

// Helper function to generate a valid rule
function generateRule(index: number) {
  return {
    domain: generateDomain(index),
    targetPort: 8000 + (index % 1000),
    path: index % 2 === 0 ? `/api-${index}` : undefined,
    sslEnabled: index % 3 === 0,
    headers: index % 4 === 0 ? { 'X-Custom': `value-${index}` } : undefined
  };
}

describe('ProxyRuleManager Performance', () => {
  let manager: ProxyRuleManager;
  
  beforeEach(() => {
    // Create a fresh manager for each test with a high limit
    manager = new ProxyRuleManager(10000);
  });
  
  it('should handle adding a single rule efficiently', () => {
    const rule = generateRule(1);
    
    const executionTime = measureExecutionTime(() => {
      manager.addRule(rule);
    });
    
    console.log(`Adding a single rule took ${executionTime.toFixed(2)}ms`);
    expect(executionTime).toBeLessThan(5); // Should be very fast
  });
  
  it('should handle adding 100 rules efficiently', () => {
    const executionTime = measureExecutionTime(() => {
      for (let i = 0; i < 100; i++) {
        manager.addRule(generateRule(i));
      }
    });
    
    console.log(`Adding 100 rules took ${executionTime.toFixed(2)}ms`);
    expect(executionTime).toBeLessThan(100); // Should be reasonably fast
    expect(manager.getRules().length).toBe(100);
  });
  
  it('should handle adding 1000 rules efficiently', () => {
    const executionTime = measureExecutionTime(() => {
      for (let i = 0; i < 1000; i++) {
        manager.addRule(generateRule(i));
      }
    });
    
    console.log(`Adding 1000 rules took ${executionTime.toFixed(2)}ms`);
    expect(executionTime).toBeLessThan(1000); // Should be under 1 second
    expect(manager.getRules().length).toBe(1000);
  });
  
  it('should handle finding rules by domain efficiently', () => {
    // Add 1000 rules with 100 different domains (10 rules per domain)
    for (let i = 0; i < 1000; i++) {
      const domainIndex = Math.floor(i / 10);
      manager.addRule({
        domain: generateDomain(domainIndex),
        targetPort: 8000 + i,
        path: `/path-${i}`
      });
    }
    
    // Measure time to find rules for a specific domain
    const executionTime = measureExecutionTime(() => {
      const rules = manager.findRulesByDomain(generateDomain(50));
      expect(rules.length).toBe(10);
    });
    
    console.log(`Finding rules by domain took ${executionTime.toFixed(2)}ms`);
    expect(executionTime).toBeLessThan(10); // Should be very fast
  });
  
  it('should handle getting active rules efficiently', () => {
    // Add 1000 rules with varying statuses
    for (let i = 0; i < 1000; i++) {
      const rule = manager.addRule(generateRule(i));
      
      // Make half of the rules inactive
      if (i % 2 === 0) {
        manager.disableRule(rule.id);
      }
    }
    
    // Measure time to get active rules
    const executionTime = measureExecutionTime(() => {
      const activeRules = manager.getActiveRules();
      expect(activeRules.length).toBe(500);
    });
    
    console.log(`Getting active rules took ${executionTime.toFixed(2)}ms`);
    expect(executionTime).toBeLessThan(20); // Should be fast
  });
  
  it('should handle updating rules efficiently', () => {
    // Add 1000 rules
    const ruleIds: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const rule = manager.addRule(generateRule(i));
      ruleIds.push(rule.id);
    }
    
    // Measure time to update all rules
    const executionTime = measureExecutionTime(() => {
      for (const id of ruleIds) {
        manager.updateRule(id, { path: '/updated' });
      }
    });
    
    console.log(`Updating 1000 rules took ${executionTime.toFixed(2)}ms`);
    expect(executionTime).toBeLessThan(1000); // Should be under 1 second
    
    // Verify all rules were updated
    const rules = manager.getRules();
    expect(rules.every(rule => rule.path === '/updated')).toBe(true);
  });
  
  it('should handle deleting rules efficiently', () => {
    // Add 1000 rules
    const ruleIds: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const rule = manager.addRule(generateRule(i));
      ruleIds.push(rule.id);
    }
    
    // Measure time to delete all rules
    const executionTime = measureExecutionTime(() => {
      for (const id of ruleIds) {
        manager.deleteRule(id);
      }
    });
    
    console.log(`Deleting 1000 rules took ${executionTime.toFixed(2)}ms`);
    expect(executionTime).toBeLessThan(1000); // Should be under 1 second
    expect(manager.getRules().length).toBe(0);
  });
  
  it('should handle exporting rules efficiently', () => {
    // Add 1000 rules
    for (let i = 0; i < 1000; i++) {
      manager.addRule(generateRule(i));
    }
    
    // Measure time to export rules
    const executionTime = measureExecutionTime(() => {
      const json = manager.exportRules();
      expect(json).toBeDefined();
      expect(json.length).toBeGreaterThan(1000);
    });
    
    console.log(`Exporting 1000 rules took ${executionTime.toFixed(2)}ms`);
    expect(executionTime).toBeLessThan(100); // Should be reasonably fast
  });
  
  it('should handle importing rules efficiently', () => {
    // Create 1000 rules to import
    const rulesToImport = [];
    for (let i = 0; i < 1000; i++) {
      rulesToImport.push({
        domain: generateDomain(i),
        targetPort: 8000 + i,
        path: `/api-${i}`,
        status: ProxyRuleStatus.ACTIVE
      });
    }
    
    const json = JSON.stringify(rulesToImport);
    
    // Measure time to import rules
    const executionTime = measureExecutionTime(() => {
      const count = manager.importRules(json);
      expect(count).toBe(1000);
    });
    
    console.log(`Importing 1000 rules took ${executionTime.toFixed(2)}ms`);
    expect(executionTime).toBeLessThan(1000); // Should be under 1 second
    expect(manager.getRules().length).toBe(1000);
  });
  
  it('should handle clearing rules efficiently', () => {
    // Add 1000 rules
    for (let i = 0; i < 1000; i++) {
      manager.addRule(generateRule(i));
    }
    
    // Measure time to clear rules
    const executionTime = measureExecutionTime(() => {
      manager.clearRules();
    });
    
    console.log(`Clearing 1000 rules took ${executionTime.toFixed(2)}ms`);
    expect(executionTime).toBeLessThan(50); // Should be very fast
    expect(manager.getRules().length).toBe(0);
  });
  
  it('should perform well with a large number of operations', () => {
    const operations = 10000;
    const startTime = performance.now();
    
    // Perform a mix of operations
    for (let i = 0; i < operations; i++) {
      const operation = i % 5;
      
      switch (operation) {
        case 0:
          // Add rule
          manager.addRule(generateRule(i));
          break;
        case 1:
          // Update rule (if any exist)
          const rules = manager.getRules();
          if (rules.length > 0) {
            const randomIndex = Math.floor(Math.random() * rules.length);
            manager.updateRule(rules[randomIndex].id, { path: `/updated-${i}` });
          }
          break;
        case 2:
          // Delete rule (if any exist)
          const rulesToDelete = manager.getRules();
          if (rulesToDelete.length > 0) {
            const randomIndex = Math.floor(Math.random() * rulesToDelete.length);
            manager.deleteRule(rulesToDelete[randomIndex].id);
          }
          break;
        case 3:
          // Find rules by domain
          manager.findRulesByDomain(generateDomain(i % 100));
          break;
        case 4:
          // Get active rules
          manager.getActiveRules();
          break;
      }
    }
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const operationsPerSecond = operations / (totalTime / 1000);
    
    console.log(`Performed ${operations} mixed operations in ${totalTime.toFixed(2)}ms`);
    console.log(`Performance: ${operationsPerSecond.toFixed(2)} operations per second`);
    
    // Expect reasonable performance
    expect(operationsPerSecond).toBeGreaterThan(1000); // At least 1000 ops/sec
  });
});