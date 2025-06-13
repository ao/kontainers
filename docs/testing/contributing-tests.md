# Contributing Tests Guide

This guide provides guidelines and best practices for adding new tests to the Kontainers project. Following these guidelines ensures that tests are consistent, maintainable, and effective.

## Guidelines for Adding New Tests

### Test Structure and Organization

Tests should be organized according to the project's structure:

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
```

When adding a new test:

1. **Place it in the appropriate directory** based on what you're testing.
2. **Follow the naming convention**: `[component-name].test.ts` or `[component-name].test.tsx`.
3. **Group related tests** using `describe` blocks.
4. **Use clear test names** that describe the expected behavior.

### Writing Effective Tests

#### 1. Follow the AAA Pattern

Structure your tests using the Arrange-Act-Assert pattern:

```typescript
it('should update container status when started', async () => {
  // Arrange: Set up the test data and conditions
  const container = { id: 'container-1', status: 'stopped' };
  (containerService.getContainer as jest.Mock).mockResolvedValue(container);
  (containerService.startContainer as jest.Mock).mockResolvedValue(undefined);
  
  // Act: Perform the action being tested
  const response = await app.handle(
    new Request(`http://localhost/containers/${container.id}/start`, {
      method: 'POST'
    })
  );
  
  // Assert: Verify the expected outcome
  expect(response.status).toBe(200);
  expect(containerService.startContainer).toHaveBeenCalledWith(container.id);
});
```

#### 2. Test One Thing at a Time

Each test should focus on a single behavior or functionality:

```typescript
// Good: Each test focuses on one aspect
describe('Container Status Badge', () => {
  it('should display green badge for running containers', () => {
    // Test implementation
  });
  
  it('should display red badge for stopped containers', () => {
    // Test implementation
  });
  
  it('should display yellow badge for paused containers', () => {
    // Test implementation
  });
});

// Avoid: Testing multiple behaviors in one test
it('should display correct badge colors for different container states', () => {
  // Testing multiple behaviors in one test makes it harder to identify what failed
});
```

#### 3. Use Descriptive Test Names

Test names should clearly describe what is being tested:

```typescript
// Good: Clear and descriptive
it('should show error message when API request fails', () => {
  // Test implementation
});

// Avoid: Vague or technical
it('handles error case', () => {
  // Test implementation
});
```

#### 4. Keep Tests Independent

Tests should not depend on the state from other tests:

```typescript
// Good: Each test is self-contained
describe('Container Service', () => {
  beforeEach(() => {
    // Reset state before each test
    jest.clearAllMocks();
    containerService.reset();
  });
  
  it('test one', () => {
    // Test implementation with its own setup
  });
  
  it('test two', () => {
    // Test implementation with its own setup
  });
});

// Avoid: Tests that depend on each other
it('first creates a container', () => {
  // Creates state that the next test depends on
});

it('then updates the container', () => {
  // Depends on the previous test having run successfully
});
```

#### 5. Mock External Dependencies

Mock external dependencies to isolate the code being tested:

```typescript
// Mock external service
jest.mock('@backend/src/services/externalService', () => ({
  externalService: {
    fetchData: jest.fn()
  }
}));

import { externalService } from '@backend/src/services/externalService';

it('should handle data from external service', async () => {
  // Arrange: Set up the mock
  (externalService.fetchData as jest.Mock).mockResolvedValue({
    data: 'test data'
  });
  
  // Act: Call the function that uses the external service
  const result = await service.processExternalData();
  
  // Assert: Verify the result
  expect(result).toBe('processed: test data');
});
```

## Test Coverage Expectations

### Coverage Goals

The Kontainers project aims for the following test coverage:

- **Critical paths**: 90%+ coverage
- **Business logic**: 80%+ coverage
- **UI components**: 70%+ coverage
- **Overall project**: 75%+ coverage

### What to Test

Focus your testing efforts on:

1. **Business logic**: Functions that implement business rules and logic
2. **API endpoints**: All API endpoints and their various response scenarios
3. **UI components**: User interactions, rendering, and state management
4. **Error handling**: How the application handles errors and edge cases
5. **Integration points**: How different parts of the application work together

### What Not to Test

Some things don't need extensive testing:

1. **Third-party libraries**: Assume they work as documented
2. **Simple getters/setters**: Unless they contain logic
3. **Configuration files**: Unless they contain logic
4. **Generated code**: Unless it's critical to the application

### Checking Coverage

Run the coverage report to identify areas that need more tests:

```bash
npm run test:coverage
```

Review the coverage report to identify:
- Files with low coverage
- Uncovered branches or conditions
- Complex functions with insufficient tests

## Code Review Checklist for Tests

When reviewing tests (your own or others'), check for the following:

### Functionality

- [ ] Tests verify the correct behavior of the code
- [ ] Tests cover both success and error scenarios
- [ ] Tests cover edge cases and boundary conditions
- [ ] Tests are independent and don't rely on each other

### Readability

- [ ] Test names clearly describe what is being tested
- [ ] Tests follow the AAA (Arrange-Act-Assert) pattern
- [ ] Tests use descriptive variable names
- [ ] Complex test setup is explained with comments

### Maintainability

- [ ] Tests don't duplicate code unnecessarily
- [ ] Tests use appropriate mocks and test utilities
- [ ] Tests don't contain hardcoded values without explanation
- [ ] Tests are not overly complex or brittle

### Performance

- [ ] Tests run in a reasonable amount of time
- [ ] Tests don't perform unnecessary operations
- [ ] Tests clean up resources properly

## Test Naming Conventions

Consistent naming helps make tests more discoverable and understandable.

### File Naming

- **Backend tests**: `[feature].test.ts`
- **Frontend component tests**: `[ComponentName].test.tsx`
- **Integration tests**: `[workflow-name].test.ts`
- **Performance tests**: `[feature]-performance.test.ts`

### Test Suite Naming

Use `describe` blocks to group related tests:

```typescript
// For components
describe('ContainerList Component', () => {
  // Tests for ContainerList
});

// For API endpoints
describe('Containers API', () => {
  describe('GET /containers', () => {
    // Tests for GET /containers
  });
  
  describe('POST /containers', () => {
    // Tests for POST /containers
  });
});

// For services
describe('ContainerService', () => {
  describe('getContainers', () => {
    // Tests for getContainers method
  });
  
  describe('createContainer', () => {
    // Tests for createContainer method
  });
});
```

### Test Case Naming

Use the `it` function with descriptive names:

```typescript
// Format: it('should [expected behavior] when [condition]', () => {})

// Good examples:
it('should display loading indicator when data is being fetched', () => {});
it('should show error message when API request fails', () => {});
it('should filter containers when search term is entered', () => {});

// Avoid:
it('test loading', () => {});
it('handles errors', () => {});
it('filters', () => {});
```

## Documentation Requirements for Tests

Good test documentation helps others understand the purpose and context of tests.

### Test File Headers

Add a header comment to each test file:

```typescript
/**
 * Tests for the ContainerList component
 * 
 * This file contains tests for the ContainerList component, which displays
 * a list of containers and allows filtering, sorting, and navigation to
 * container details.
 */
```

### Test Suite Documentation

Add comments to describe test suites:

```typescript
describe('ContainerList Component', () => {
  /**
   * Tests for the basic rendering of the ContainerList component
   * with different data states (loading, error, empty, with data)
   */
  describe('Rendering', () => {
    // Tests
  });
  
  /**
   * Tests for the filtering functionality of the ContainerList component
   * including search by name, filtering by status, etc.
   */
  describe('Filtering', () => {
    // Tests
  });
});
```

### Complex Test Documentation

Add comments to explain complex test setups or assertions:

```typescript
it('should handle pagination correctly', async () => {
  // Setup mock data for multiple pages
  const page1Data = generateContainers(10, { page: 1 });
  const page2Data = generateContainers(10, { page: 2 });
  
  // Mock the API to return different data for different pages
  (containerService.getContainers as jest.Mock)
    .mockImplementation((params) => {
      // Return appropriate page based on the page parameter
      return params.page === 1 ? page1Data : page2Data;
    });
  
  // Render the component with initial page 1
  renderWithProviders(<ContainerList initialPage={1} />);
  
  // Verify page 1 data is displayed
  expect(screen.getByText(page1Data[0].name)).toBeInTheDocument();
  
  // Navigate to page 2
  fireEvent.click(screen.getByRole('button', { name: /next page/i }));
  
  // Wait for page 2 data to be displayed
  await waitFor(() => {
    expect(screen.getByText(page2Data[0].name)).toBeInTheDocument();
  });
});
```

## Examples of Good Tests

### Frontend Component Test

```typescript
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../utils/test-utils';
import ContainerStatusBadge from '@frontend/src/components/containers/ContainerStatusBadge';
import { ContainerState } from '@shared/src/models';

describe('ContainerStatusBadge Component', () => {
  it('should display green badge for running containers', () => {
    renderWithProviders(
      <ContainerStatusBadge state={ContainerState.RUNNING} />
    );
    
    const badge = screen.getByText('Running');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-green-500');
  });
  
  it('should display red badge for stopped containers', () => {
    renderWithProviders(
      <ContainerStatusBadge state={ContainerState.STOPPED} />
    );
    
    const badge = screen.getByText('Stopped');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-red-500');
  });
  
  it('should display yellow badge for paused containers', () => {
    renderWithProviders(
      <ContainerStatusBadge state={ContainerState.PAUSED} />
    );
    
    const badge = screen.getByText('Paused');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-yellow-500');
  });
  
  it('should display gray badge for unknown states', () => {
    renderWithProviders(
      <ContainerStatusBadge state="UNKNOWN" as any />
    );
    
    const badge = screen.getByText('Unknown');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-gray-500');
  });
});
```

### Backend API Test

```typescript
import { describe, expect, it, beforeEach, jest } from 'bun:test';
import { Elysia } from 'elysia';
import { containersRoutes } from '@backend/src/api/containers';
import { containerService } from '@backend/src/services/container';

// Mock the container service
jest.mock('@backend/src/services/container', () => ({
  containerService: {
    getContainers: jest.fn(),
    getContainer: jest.fn(),
    createContainer: jest.fn()
  }
}));

describe('Containers API Routes', () => {
  let app: Elysia;
  
  beforeEach(() => {
    jest.resetAllMocks();
    app = new Elysia().use(containersRoutes);
  });

  describe('GET /containers', () => {
    it('should return all containers', async () => {
      // Arrange
      const mockContainers = [
        { id: 'container-1', name: 'Container 1' },
        { id: 'container-2', name: 'Container 2' }
      ];
      
      (containerService.getContainers as jest.Mock).mockResolvedValue(mockContainers);
      
      // Act
      const response = await app.handle(new Request('http://localhost/containers'));
      const body = await response.json();
      
      // Assert
      expect(response.status).toBe(200);
      expect(body).toEqual({ containers: mockContainers });
      expect(containerService.getContainers).toHaveBeenCalledTimes(1);
    });
    
    it('should handle errors', async () => {
      // Arrange
      const errorMessage = 'Failed to fetch containers';
      (containerService.getContainers as jest.Mock).mockRejectedValue(
        new Error(errorMessage)
      );
      
      // Act
      const response = await app.handle(new Request('http://localhost/containers'));
      const body = await response.json();
      
      // Assert
      expect(response.status).toBe(500);
      expect(body.error).toBe(errorMessage);
    });
    
    it('should apply filters from query parameters', async () => {
      // Arrange
      const mockContainers = [{ id: 'container-1', name: 'Container 1' }];
      (containerService.getContainers as jest.Mock).mockResolvedValue(mockContainers);
      
      // Act
      const response = await app.handle(
        new Request('http://localhost/containers?status=running&name=nginx')
      );
      
      // Assert
      expect(response.status).toBe(200);
      expect(containerService.getContainers).toHaveBeenCalledWith({
        status: 'running',
        name: 'nginx'
      });
    });
  });

  describe('POST /containers', () => {
    it('should create a new container', async () => {
      // Arrange
      const mockContainer = { id: 'container-1', name: 'Container 1' };
      const mockRequest = {
        name: 'Container 1',
        image: 'nginx:latest',
        ports: [{ internal: 80, external: 8080 }]
      };
      
      (containerService.createContainer as jest.Mock).mockResolvedValue(mockContainer);
      
      // Act
      const response = await app.handle(
        new Request('http://localhost/containers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mockRequest)
        })
      );
      const body = await response.json();
      
      // Assert
      expect(response.status).toBe(200);
      expect(body).toEqual(mockContainer);
      expect(containerService.createContainer).toHaveBeenCalledWith(mockRequest);
    });
    
    it('should validate request body', async () => {
      // Arrange
      const invalidRequest = {
        // Missing required 'name' field
        image: 'nginx:latest'
      };
      
      // Act
      const response = await app.handle(
        new Request('http://localhost/containers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(invalidRequest)
        })
      );
      const body = await response.json();
      
      // Assert
      expect(response.status).toBe(400);
      expect(body.error).toContain('name');
      expect(containerService.createContainer).not.toHaveBeenCalled();
    });
  });
});
```

### Integration Test

```typescript
import { describe, expect, it, beforeEach, jest } from 'bun:test';
import { Elysia } from 'elysia';
import { apiRoutes } from '@backend/src/api';
import { containerService } from '@backend/src/services/container';
import { proxyService } from '@backend/src/services/proxy';

// Partial mocking - mock only external dependencies
jest.mock('@backend/src/integrations/docker', () => ({
  dockerClient: {
    createContainer: jest.fn().mockResolvedValue({ id: 'container-1' }),
    startContainer: jest.fn().mockResolvedValue(undefined)
  }
}));

jest.mock('@backend/src/integrations/nginx', () => ({
  nginxClient: {
    createProxyRule: jest.fn().mockResolvedValue({ id: 'rule-1' }),
    reloadConfig: jest.fn().mockResolvedValue({ success: true })
  }
}));

describe('Container and Proxy Integration', () => {
  let app: Elysia;
  
  beforeEach(() => {
    jest.clearAllMocks();
    app = new Elysia().use(apiRoutes);
  });

  it('should create a container and configure proxy rule', async () => {
    // Step 1: Create a container
    const createContainerResponse = await app.handle(
      new Request('http://localhost/containers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'web-app',
          image: 'nginx:latest',
          ports: [{ internal: 80, external: 8080 }]
        })
      })
    );
    
    expect(createContainerResponse.status).toBe(200);
    const containerData = await createContainerResponse.json();
    const containerId = containerData.id;
    
    // Step 2: Start the container
    const startContainerResponse = await app.handle(
      new Request(`http://localhost/containers/${containerId}/start`, {
        method: 'POST'
      })
    );
    
    expect(startContainerResponse.status).toBe(200);
    
    // Step 3: Create a proxy rule for the container
    const createProxyResponse = await app.handle(
      new Request('http://localhost/proxy/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'app.localhost',
          targetPort: 8080,
          targetContainer: containerId,
          path: '/',
          enabled: true
        })
      })
    );
    
    expect(createProxyResponse.status).toBe(200);
    const proxyData = await createProxyResponse.json();
    const ruleId = proxyData.id;
    
    // Step 4: Verify the proxy rule was created
    const getProxyResponse = await app.handle(
      new Request(`http://localhost/proxy/rules/${ruleId}`)
    );
    
    expect(getProxyResponse.status).toBe(200);
    const proxyRule = await getProxyResponse.json();
    expect(proxyRule.targetContainer).toBe(containerId);
    
    // Verify the integration between services
    expect(proxyService.reloadConfiguration).toHaveBeenCalled();
  });
});
```

## Conclusion

Writing good tests is an investment in the quality and maintainability of the Kontainers project. By following these guidelines, you can contribute tests that:

- Verify the correct behavior of the code
- Document how the code is supposed to work
- Catch regressions early
- Make the codebase more maintainable

Remember that tests are code too, and they deserve the same level of care and attention as the application code they verify.