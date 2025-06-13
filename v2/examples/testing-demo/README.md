# Kontainers v2 Testing Demo

This project demonstrates how to use the Kontainers v2 testing framework to write comprehensive tests for your application. It includes examples of unit tests, integration tests, and performance tests.

## Project Structure

```
testing-demo/
├── src/                      # Source code
│   ├── ProxyRuleManager.ts   # Main component being tested
│   └── types.ts              # Type definitions
├── tests/                    # Test files
│   ├── unit/                 # Unit tests
│   │   └── ProxyRuleManager.test.ts
│   ├── integration/          # Integration tests
│   │   └── ProxyRuleWorkflow.test.ts
│   └── performance/          # Performance tests
│       └── ProxyRuleManager.perf.ts
├── docs/                     # Documentation
├── package.json              # Project configuration
└── tsconfig.json             # TypeScript configuration
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (>= 1.0.0)

### Installation

```bash
# Clone the repository (if you haven't already)
git clone https://github.com/your-org/kontainers.git
cd kontainers/v2/examples/testing-demo

# Install dependencies
bun install
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

### Running Tests in Watch Mode

```bash
bun test:watch
```

## Test Types

### Unit Tests

Unit tests focus on testing individual components or functions in isolation. In this demo, we test the `ProxyRuleManager` class to ensure that each method works correctly.

Key aspects demonstrated:
- Testing class initialization
- Testing method behavior
- Testing error handling
- Testing edge cases
- Using mocks for callbacks

Example:

```typescript
describe('addRule', () => {
  it('should add a valid rule', () => {
    const rule = {
      domain: 'example.com',
      targetPort: 8080,
      path: '/api'
    };

    const addedRule = manager.addRule(rule);
    
    expect(addedRule.domain).toBe('example.com');
    expect(addedRule.targetPort).toBe(8080);
    expect(addedRule.path).toBe('/api');
    expect(addedRule.status).toBe(ProxyRuleStatus.ACTIVE);
    expect(addedRule.id).toBeDefined();
  });
});
```

### Integration Tests

Integration tests verify that different parts of the application work together correctly. In this demo, we test the interaction between the `ProxyRuleManager` and a service that uses it.

Key aspects demonstrated:
- Testing complete workflows
- Mocking external dependencies
- Testing error handling across components
- Testing asynchronous operations

Example:

```typescript
it('should complete the full proxy rule lifecycle', async () => {
  // Step 1: Create a proxy rule
  const rule = await proxyService.createProxyRule(
    'example.com',
    8080,
    '/api',
    'container-1'
  );
  
  // Step 2: Get rule status
  const status = await proxyService.getProxyRuleStatus(rule.id);
  
  // Step 3: Delete the rule
  const deleted = await proxyService.deleteProxyRule(rule.id);
  
  // Verify rule is no longer in the service
  expect(proxyService.getRules()).toHaveLength(0);
});
```

### Performance Tests

Performance tests measure the system's responsiveness and throughput under various conditions. In this demo, we test the performance of the `ProxyRuleManager` with different numbers of rules.

Key aspects demonstrated:
- Measuring execution time
- Testing with large datasets
- Setting performance expectations
- Testing different operations

Example:

```typescript
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
```

## Debugging Tests

To debug tests, you can use the `--inspect-brk` flag:

```bash
bun --inspect-brk test path/to/test.ts
```

You can then connect to the debugger using Chrome DevTools or your IDE.

## Test Coverage

To view test coverage, run:

```bash
bun test:coverage
```

This will generate a coverage report in the `coverage` directory.

## Best Practices Demonstrated

1. **Test Organization**: Tests are organized by type (unit, integration, performance)
2. **Test Isolation**: Each test is independent and doesn't rely on the state from other tests
3. **Descriptive Test Names**: Test names clearly describe what is being tested
4. **AAA Pattern**: Tests follow the Arrange, Act, Assert pattern
5. **Mocking**: External dependencies are mocked to isolate the component being tested
6. **Edge Cases**: Tests cover edge cases and error conditions
7. **Performance Metrics**: Performance tests include clear metrics and expectations

## Learn More

For more information about the Kontainers v2 testing framework, see:

- [Testing Overview](../../docs/testing/README.md)
- [Frontend Testing Guide](../../docs/testing/frontend-testing.md)
- [Backend Testing Guide](../../docs/testing/backend-testing.md)
- [Integration Testing Guide](../../docs/testing/integration-testing.md)
- [Testing Cheat Sheet](../../docs/testing/cheat-sheet.md)

## License

MIT