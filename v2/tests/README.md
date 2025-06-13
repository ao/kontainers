# Kontainers v2 Test Suite

This directory contains the comprehensive test suite for the Kontainers v2 project. The tests cover both frontend and backend components, ensuring the reliability and correctness of the application.

## Test Structure

The test suite is organized into the following directories:

```
tests/
├── backend/              # Backend tests
│   ├── api/              # API endpoint tests
│   └── middleware/       # Middleware tests
├── frontend/             # Frontend tests
│   └── components/       # React component tests
│       ├── auth/         # Authentication components
│       ├── metrics/      # Metrics and monitoring components
│       ├── proxy/        # Proxy management components
│       └── settings/     # Settings components
├── integration/          # Integration tests
├── utils/                # Test utilities
│   ├── setup.ts          # Global test setup
│   └── test-utils.tsx    # React testing utilities
└── tsconfig.json         # TypeScript configuration for tests
```

## Running Tests

Tests can be run using Bun's built-in test runner. The following npm scripts are available:

- `npm test` or `bun test`: Run all tests
- `npm run test:watch` or `bun test --watch`: Run tests in watch mode
- `npm run test:coverage` or `bun test --coverage`: Run tests with coverage reporting
- `npm run test:frontend`: Run only frontend tests
- `npm run test:backend`: Run only backend tests
- `npm run test:integration`: Run only integration tests
- `npm run test:utils`: Run only utility tests

## Test Coverage

The test suite covers the following areas:

### Backend Tests

- **API Endpoints**: Tests for all REST API endpoints, including:
  - Container management endpoints
  - Proxy rule endpoints
  - Health and metrics endpoints
  - Authentication endpoints

- **Middleware**: Tests for middleware functions, including:
  - Authentication middleware
  - Error handling middleware
  - Logging middleware

### Frontend Tests

- **Components**: Tests for React components, including:
  - Proxy management components (ProxyRuleDetail, ProxyRuleForm, ProxyTrafficMonitor)
  - Metrics and monitoring components (SystemHealthMonitor, ResourceUsageGraphs, MetricsDashboard)
  - Settings components (ConfigurationForm, BackupRestorePanel)
  - Authentication components (Login, Register)

- **Stores**: Tests for state management, including:
  - Container store
  - Proxy store
  - Auth store

### Integration Tests

- **Frontend-Backend Integration**: Tests for the interaction between frontend and backend
- **Container Management**: Tests for container operations across the stack

### Utility Tests

- **Formatters**: Tests for utility functions like formatBytes, formatDate, etc.
- **Validators**: Tests for validation functions

## Test Utilities

The test suite includes several utilities to make testing easier:

- **setup.ts**: Global test setup with mocks for fetch, localStorage, WebSocket, etc.
- **test-utils.tsx**: React testing utilities with custom render function that includes all providers

## Writing Tests

When writing new tests, follow these guidelines:

1. **Test Structure**: Use the describe/it pattern to organize tests
2. **Mocking**: Use jest.mock() to mock external dependencies
3. **Assertions**: Use expect() with appropriate matchers
4. **Async Testing**: Use async/await with waitFor() for asynchronous tests
5. **Component Testing**: Use renderWithProviders() from test-utils.tsx

## Continuous Integration

Tests are automatically run as part of the CI/CD pipeline. All tests must pass before code can be merged into the main branch.

## Future Improvements

- Add more integration tests for complex workflows
- Improve test coverage for error scenarios
- Add performance tests for critical paths
- Add end-to-end tests with Playwright or Cypress