# Testing Guide for ProxyRuleManager

This guide explains how to test the `ProxyRuleManager` component using the Kontainers testing framework. It covers writing unit tests, integration tests, and performance tests.

## Overview

The `ProxyRuleManager` is a component that manages proxy rules for the Kontainers application. It provides functionality to create, update, delete, and validate proxy rules. Testing this component thoroughly is essential to ensure that it works correctly and efficiently.

## Setting Up the Testing Environment

Before running tests, make sure you have the following prerequisites:

1. Bun installed (>= 1.0.0)
2. Project dependencies installed (`bun install`)

## Writing Unit Tests

Unit tests focus on testing individual methods of the `ProxyRuleManager` class in isolation. They verify that each method behaves correctly with various inputs.

### Test Structure

A typical unit test for the `ProxyRuleManager` follows this structure:

```typescript
import { describe, expect, it, beforeEach, jest } from 'bun:test';
import { ProxyRuleManager } from '../../src/ProxyRuleManager';
import { ProxyRuleStatus } from '../../src/types';

describe('ProxyRuleManager', () => {
  let manager: ProxyRuleManager;
  let onRuleChangeMock: jest.Mock;

  beforeEach(() => {
    // Create a fresh mock for each test
    onRuleChangeMock = jest.fn();
    
    // Create a fresh manager for each test
    manager = new ProxyRuleManager(100, onRuleChangeMock);
  });

  describe('methodName', () => {
    it('should do something specific', () => {
      // Arrange: Set up test data
      const testData = { /* ... */ };
      
      // Act: Call the method being tested
      const result = manager.methodName(testData);
      
      // Assert: Verify the result
      expect(result).toEqual(expectedResult);
      
      // Verify side effects if applicable
      expect(onRuleChangeMock).toHaveBeenCalledWith(expectedArgs);
    });
  });
});
```

### Testing Strategies

1. **Test Each Method Separately**: Write separate tests for each method of the `ProxyRuleManager` class.
2. **Test Happy Path**: Test that the method works correctly with valid inputs.
3. **Test Edge Cases**: Test the method with edge cases, such as empty inputs or boundary values.
4. **Test Error Handling**: Test that the method throws appropriate errors for invalid inputs.
5. **Test Side Effects**: Test that the method triggers appropriate side effects, such as calling callbacks.

### Example: Testing the `addRule` Method

```typescript
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
});
```

## Writing Integration Tests

Integration tests verify that the `ProxyRuleManager` works correctly with other components. They test the interactions between the `ProxyRuleManager` and other services.

### Test Structure

A typical integration test follows this structure:

```typescript
import { describe, expect, it, beforeEach, jest, afterEach } from 'bun:test';
import { ProxyRuleManager } from '../../src/ProxyRuleManager';
import { ProxyRuleStatus } from '../../src/types';

// Mock external dependencies
const mockDependency = {
  methodOne: jest.fn(),
  methodTwo: jest.fn()
};

// Service that uses ProxyRuleManager
class ServiceUnderTest {
  private manager: ProxyRuleManager;
  
  constructor() {
    this.manager = new ProxyRuleManager();
  }
  
  async doSomething() {
    // Use the manager and external dependencies
    // ...
  }
}

describe('Integration Test', () => {
  let service: ServiceUnderTest;
  
  beforeEach(() => {
    // Reset mocks
    jest.resetAllMocks();
    
    // Create a fresh service
    service = new ServiceUnderTest();
    
    // Set up mock implementations
    mockDependency.methodOne.mockResolvedValue(/* ... */);
  });
  
  it('should complete a workflow successfully', async () => {
    // Step 1: Start the workflow
    const result1 = await service.doSomething();
    
    // Verify step 1 result
    expect(result1).toEqual(/* ... */);
    
    // Step 2: Continue the workflow
    const result2 = await service.doSomethingElse();
    
    // Verify step 2 result
    expect(result2).toEqual(/* ... */);
    
    // Verify external dependencies were called correctly
    expect(mockDependency.methodOne).toHaveBeenCalledWith(/* ... */);
  });
});
```

### Testing Strategies

1. **Test Complete Workflows**: Test entire workflows that involve multiple components.
2. **Mock External Dependencies**: Mock external services and APIs to isolate the components being tested.
3. **Test Error Handling**: Test how the system handles errors from external dependencies.
4. **Test Asynchronous Operations**: Test that asynchronous operations complete correctly.

### Example: Testing the ProxyRuleService

```typescript
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
  
  // Verify API was called
  expect(mockApiClient.applyProxyRule).toHaveBeenCalledWith(
    expect.objectContaining({
      domain: 'example.com',
      targetPort: 8080,
      path: '/api'
    })
  );
  
  // Step 2: Get rule status
  const status = await proxyService.getProxyRuleStatus(rule.id);
  
  // Verify status
  expect(status).toBe(ProxyRuleStatus.ACTIVE);
  
  // Step 3: Delete the rule
  const deleted = await proxyService.deleteProxyRule(rule.id);
  
  // Verify rule was deleted
  expect(deleted).toBe(true);
  
  // Verify rule is no longer in the service
  expect(proxyService.getRules()).toHaveLength(0);
});
```

## Writing Performance Tests

Performance tests measure the system's responsiveness and throughput under various conditions. They verify that the `ProxyRuleManager` performs efficiently with different numbers of rules.

### Test Structure

A typical performance test follows this structure:

```typescript
import { describe, expect, it, beforeEach } from 'bun:test';
import { ProxyRuleManager } from '../../src/ProxyRuleManager';

// Helper function to measure execution time
function measureExecutionTime(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe('Performance Test', () => {
  let manager: ProxyRuleManager;
  
  beforeEach(() => {
    // Create a fresh manager for each test
    manager = new ProxyRuleManager(10000);
  });
  
  it('should perform operation efficiently', () => {
    // Measure execution time
    const executionTime = measureExecutionTime(() => {
      // Perform the operation being tested
      // ...
    });
    
    // Log the execution time
    console.log(`Operation took ${executionTime.toFixed(2)}ms`);
    
    // Verify the operation was fast enough
    expect(executionTime).toBeLessThan(expectedTime);
  });
});
```

### Testing Strategies

1. **Measure Execution Time**: Measure how long operations take to execute.
2. **Test with Different Data Sizes**: Test performance with different numbers of rules.
3. **Test Different Operations**: Test the performance of different operations (add, update, delete, etc.).
4. **Set Performance Expectations**: Set clear expectations for how fast operations should be.

### Example: Testing Adding Rules Performance

```typescript
it('should handle adding 1000 rules efficiently', () => {
  const executionTime = measureExecutionTime(() => {
    for (let i = 0; i < 1000; i++) {
      manager.addRule({
        domain: `domain-${i}.example.com`,
        targetPort: 8000 + i,
        path: `/api-${i}`
      });
    }
  });
  
  console.log(`Adding 1000 rules took ${executionTime.toFixed(2)}ms`);
  expect(executionTime).toBeLessThan(1000); // Should be under 1 second
  expect(manager.getRules().length).toBe(1000);
});
```

## Running Tests

### Running All Tests

```bash
bun test
```

### Running Specific Test Types

```bash
# Run unit tests
bun test:unit

# Run integration tests
bun test:integration

# Run performance tests
bun test:performance
```

### Running Tests with Coverage

```bash
bun test:coverage
```

This will generate a coverage report in the `coverage` directory.

## Debugging Tests

To debug tests, you can use the `--inspect-brk` flag:

```bash
bun --inspect-brk test path/to/test.ts
```

You can then connect to the debugger using Chrome DevTools or your IDE.

## Best Practices

1. **Test Independence**: Each test should be independent and not rely on the state from other tests.
2. **Descriptive Test Names**: Test names should clearly describe what is being tested.
3. **AAA Pattern**: Tests should follow the Arrange, Act, Assert pattern.
4. **Mock External Dependencies**: External dependencies should be mocked to isolate the component being tested.
5. **Test Edge Cases**: Tests should cover edge cases and error conditions.
6. **Performance Metrics**: Performance tests should include clear metrics and expectations.
7. **Clean Up**: Tests should clean up any resources they create.

## Conclusion

Testing the `ProxyRuleManager` component thoroughly ensures that it works correctly and efficiently. By writing unit tests, integration tests, and performance tests, you can catch bugs early and ensure that the component meets its requirements.

For more information about the Kontainers testing framework, see the [Testing Documentation](../../../docs/testing/README.md).