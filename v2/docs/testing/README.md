# Kontainers v2 Testing Framework

This document provides a comprehensive overview of the testing strategy, tools, and best practices for the Kontainers v2 project.

## Testing Philosophy

The Kontainers v2 testing framework is built on the following principles:

1. **Comprehensive Coverage**: Tests should cover all critical functionality across the application, including frontend components, backend APIs, and integration points.

2. **Shift Left**: Testing is integrated early in the development process to catch issues before they propagate.

3. **Automation First**: Automated tests are preferred over manual testing to ensure consistency and enable continuous integration.

4. **Fast Feedback**: Tests should run quickly to provide developers with immediate feedback.

5. **Maintainability**: Tests should be easy to understand, maintain, and extend as the application evolves.

## Test Directory Structure

The test suite is organized into the following directory structure:

```
tests/
├── backend/              # Backend tests
│   ├── api/              # API endpoint tests
│   └── middleware/       # Middleware tests
├── frontend/             # Frontend tests
│   └── components/       # React component tests
│       ├── auth/         # Authentication components
│       ├── containers/   # Container management components
│       ├── metrics/      # Metrics and monitoring components
│       ├── proxy/        # Proxy management components
│       └── settings/     # Settings components
├── integration/          # Integration tests
├── performance/          # Performance tests
├── utils/                # Test utilities
│   ├── setup.ts          # Global test setup
│   └── test-utils.tsx    # React testing utilities
└── tsconfig.json         # TypeScript configuration for tests
```

## Types of Tests

### Unit Tests

Unit tests focus on testing individual components or functions in isolation. They are fast to run and provide immediate feedback on code changes.

**Examples**:
- Testing a React component's rendering and behavior
- Testing a utility function's output for various inputs
- Testing an API endpoint's response to different requests

### Integration Tests

Integration tests verify that different parts of the application work together correctly. They test the interactions between components, services, and external dependencies.

**Examples**:
- Testing the complete container creation workflow
- Testing the proxy rule configuration and application
- Testing authentication flows

### Performance Tests

Performance tests measure the system's responsiveness, throughput, and resource utilization under various conditions.

**Examples**:
- API response time measurements
- Throughput testing for high-traffic endpoints
- Resource utilization monitoring during operations

## Testing Tools and Libraries

Kontainers v2 uses the following testing tools and libraries:

### Core Testing Framework

- **Bun Test**: Built-in test runner for Bun runtime
- **Jest**: For mocking and assertions

### Frontend Testing

- **@testing-library/react**: For testing React components
- **@testing-library/user-event**: For simulating user interactions
- **@testing-library/react-hooks**: For testing React hooks

### Backend Testing

- **Elysia**: For creating test instances of the API
- **Fetch API**: For making HTTP requests to test endpoints

### Performance Testing

- **Performance API**: For measuring response times and throughput

## Running Tests

Tests can be run using the following npm scripts:

```bash
# Run all tests
npm test
# or
bun test

# Run tests in watch mode
npm run test:watch
# or
bun test --watch

# Run tests with coverage reporting
npm run test:coverage
# or
bun test --coverage

# Run specific test suites
npm run test:frontend
npm run test:backend
npm run test:integration
npm run test:utils
npm run test:performance
```

## Test Coverage

The project aims for high test coverage across all critical paths. Coverage reports are generated using Bun's built-in coverage reporter and can be viewed after running:

```bash
npm run test:coverage
```

The coverage report includes:
- Line coverage
- Branch coverage
- Function coverage
- Statement coverage

## Interpreting Test Results

Test results are displayed in the console after running the tests. The output includes:

1. **Pass/Fail Status**: Whether each test passed or failed
2. **Error Messages**: Detailed error messages for failed tests
3. **Test Duration**: How long each test took to run
4. **Coverage Information**: Code coverage statistics (when running with `--coverage`)

### Understanding Coverage Reports

Coverage reports show which parts of the code are executed during tests:

- **Green**: Code that is covered by tests
- **Red**: Code that is not covered by tests
- **Yellow**: Branches that are partially covered

Focus on increasing coverage in critical paths and complex logic rather than aiming for 100% coverage everywhere.

## Best Practices for Writing Tests

### General Best Practices

1. **Test One Thing at a Time**: Each test should focus on a single behavior or functionality.
2. **Use Descriptive Test Names**: Test names should clearly describe what is being tested.
3. **Follow the AAA Pattern**: Arrange, Act, Assert.
4. **Keep Tests Independent**: Tests should not depend on the state from other tests.
5. **Mock External Dependencies**: Use mocks for external services, APIs, and databases.

### Frontend Test Best Practices

1. **Test Behavior, Not Implementation**: Focus on what the user sees and does.
2. **Use Data-Test Attributes**: Use `data-testid` attributes to select elements.
3. **Test User Interactions**: Simulate clicks, form submissions, and other user actions.
4. **Test Accessibility**: Ensure components are accessible.
5. **Use the `renderWithProviders` Utility**: This utility wraps components with all necessary providers.

### Backend Test Best Practices

1. **Test API Contracts**: Ensure APIs return the expected data structures.
2. **Test Error Handling**: Verify that APIs handle errors gracefully.
3. **Test Edge Cases**: Test boundary conditions and unusual inputs.
4. **Mock Database and External Services**: Avoid hitting real databases or external services.
5. **Test Authorization**: Verify that endpoints enforce proper access controls.

### Integration Test Best Practices

1. **Focus on Workflows**: Test complete user workflows rather than individual operations.
2. **Use Real-like Data**: Use realistic data that mimics production scenarios.
3. **Test Error Recovery**: Verify that the system recovers from errors appropriately.
4. **Test Asynchronous Operations**: Ensure that async operations complete correctly.

## Common Testing Patterns

### Component Testing Pattern

```typescript
describe('ComponentName', () => {
  it('renders correctly', () => {
    renderWithProviders(<ComponentName />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  it('handles user interaction', () => {
    renderWithProviders(<ComponentName />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Result')).toBeInTheDocument();
  });
});
```

### API Testing Pattern

```typescript
describe('API Endpoint', () => {
  it('returns expected data', async () => {
    const response = await app.handle(new Request('http://localhost/endpoint'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual(expectedData);
  });

  it('handles errors correctly', async () => {
    // Mock service to throw an error
    (service.method as jest.Mock).mockRejectedValue(new Error('Test error'));
    
    const response = await app.handle(new Request('http://localhost/endpoint'));
    expect(response.status).toBe(500);
  });
});
```

### Integration Testing Pattern

```typescript
it('completes the workflow successfully', async () => {
  // Step 1: Create a resource
  const createResponse = await app.handle(/* create request */);
  expect(createResponse.status).toBe(200);
  
  // Step 2: Modify the resource
  const updateResponse = await app.handle(/* update request */);
  expect(updateResponse.status).toBe(200);
  
  // Step 3: Verify the result
  const getResponse = await app.handle(/* get request */);
  expect(getResponse.status).toBe(200);
  expect(await getResponse.json()).toEqual(expectedResult);
});
```

## Conclusion

The Kontainers v2 testing framework provides a comprehensive approach to ensuring the quality and reliability of the application. By following the guidelines and best practices outlined in this document, developers can write effective tests that catch issues early and provide confidence in the codebase.

For more specific guidance, refer to the component-specific testing guides:

- [Frontend Testing Guide](./frontend-testing.md)
- [Backend Testing Guide](./backend-testing.md)
- [Integration Testing Guide](./integration-testing.md)
- [Test Maintenance Guide](./test-maintenance.md)
- [Contributing Tests Guide](./contributing-tests.md)
- [Testing Cheat Sheet](./cheat-sheet.md)