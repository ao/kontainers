# Integration Testing Guide

This guide provides detailed information on integration testing in the Kontainers project.

## Overview

Integration testing in Kontainers focuses on verifying that different components of the application work together correctly. Unlike unit tests that test components in isolation, integration tests examine the interactions between multiple components, services, and external dependencies to ensure they function as expected when combined.

## Testing Tools

- **Bun Test**: Built-in test runner for Bun runtime
- **Jest**: For mocking and assertions
- **Elysia**: For creating test instances of the API
- **WebSocket**: For testing real-time communication

## Integration Testing Approach

### Test Structure

Integration tests typically follow this structure:

```typescript
import { describe, expect, it, beforeEach, jest, afterEach } from 'bun:test';
import { Elysia } from 'elysia';
import { apiRoutes } from '@backend/src/api';
import { someService } from '@backend/src/services/someService';

// Partial mocking - mock only external dependencies
jest.mock('@backend/src/integrations/externalSystem', () => ({
  externalClient: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    performAction: jest.fn()
  }
}));

import { externalClient } from '@backend/src/integrations/externalSystem';

describe('Integration Test Suite Name', () => {
  let app: Elysia;
  
  beforeEach(() => {
    // Reset mocks for external dependencies
    jest.clearAllMocks();
    
    // Create a test app with all necessary routes
    app = new Elysia().use(apiRoutes);
    
    // Set up mock responses for external dependencies
    (externalClient.connect as jest.Mock).mockResolvedValue(undefined);
    (externalClient.performAction as jest.Mock).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    // Clean up any resources
  });

  it('should complete the entire workflow successfully', async () => {
    // Step 1: Initialize the process
    const initResponse = await app.handle(
      new Request('http://localhost/api/workflow/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ param: 'value' })
      })
    );
    
    expect(initResponse.status).toBe(200);
    const initBody = await initResponse.json();
    const workflowId = initBody.id;
    
    // Step 2: Perform an action
    const actionResponse = await app.handle(
      new Request(`http://localhost/api/workflow/${workflowId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'doSomething' })
      })
    );
    
    expect(actionResponse.status).toBe(200);
    
    // Step 3: Verify the result
    const resultResponse = await app.handle(
      new Request(`http://localhost/api/workflow/${workflowId}/result`)
    );
    
    expect(resultResponse.status).toBe(200);
    const resultBody = await resultResponse.json();
    expect(resultBody.status).toBe('completed');
    expect(resultBody.result).toEqual(expect.objectContaining({
      success: true
    }));
    
    // Verify external system was called correctly
    expect(externalClient.connect).toHaveBeenCalledTimes(1);
    expect(externalClient.performAction).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId })
    );
  });
});
```

## Setting Up Test Environments

### Creating a Test Environment

For integration tests, you need to set up an environment that closely resembles the production environment but is isolated for testing:

```typescript
// Create a test environment
async function setupTestEnvironment() {
  // Initialize services
  const services = {
    containerService: new ContainerService(),
    proxyService: new ProxyService(),
    configService: new ConfigurationService()
  };
  
  // Initialize API with real services
  const app = new Elysia()
    .use(authMiddleware)
    .use(ctx => {
      ctx.services = services;
      return ctx;
    })
    .use(apiRoutes);
  
  // Mock external dependencies
  (dockerClient.listContainers as jest.Mock).mockResolvedValue([]);
  (nginxClient.reloadConfig as jest.Mock).mockResolvedValue({ success: true });
  
  return {
    app,
    services
  };
}

describe('Container and Proxy Integration', () => {
  let env: ReturnType<typeof setupTestEnvironment>;
  
  beforeEach(async () => {
    env = await setupTestEnvironment();
  });
  
  afterEach(async () => {
    // Clean up resources
  });
  
  it('should create a container and configure proxy rules', async () => {
    // Test implementation
  });
});
```

### Using Test Databases

For tests that require database interactions:

```typescript
import { createTestDatabase } from '../utils/test-db';

describe('Database Integration Tests', () => {
  let testDb: any;
  
  beforeEach(async () => {
    // Create an isolated test database
    testDb = await createTestDatabase();
    
    // Initialize the schema
    await testDb.execute(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL,
        email TEXT NOT NULL
      )
    `);
    
    // Seed with test data
    await testDb.execute(`
      INSERT INTO users (id, username, email) VALUES
      (1, 'testuser', 'test@example.com')
    `);
  });
  
  afterEach(async () => {
    // Clean up the test database
    await testDb.close();
  });
  
  it('should retrieve and update user data', async () => {
    // Test implementation using real database queries
  });
});
```

## Testing Workflows Across Components

### Container Management Workflow

```typescript
describe('Container Management Workflow', () => {
  it('should create, start, monitor, and remove a container', async () => {
    // Step 1: Create a container
    const createResponse = await app.handle(
      new Request('http://localhost/containers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test-nginx',
          image: 'nginx:latest',
          ports: [{ internal: 80, external: 8080 }]
        })
      })
    );
    
    expect(createResponse.status).toBe(200);
    const createBody = await createResponse.json();
    const containerId = createBody.id;
    
    // Step 2: Start the container
    const startResponse = await app.handle(
      new Request(`http://localhost/containers/${containerId}/start`, {
        method: 'POST'
      })
    );
    
    expect(startResponse.status).toBe(200);
    
    // Step 3: Get container stats
    const statsResponse = await app.handle(
      new Request(`http://localhost/containers/${containerId}/stats`)
    );
    
    expect(statsResponse.status).toBe(200);
    const statsBody = await statsResponse.json();
    expect(statsBody.stats).toBeDefined();
    
    // Step 4: Stop the container
    const stopResponse = await app.handle(
      new Request(`http://localhost/containers/${containerId}/stop`, {
        method: 'POST'
      })
    );
    
    expect(stopResponse.status).toBe(200);
    
    // Step 5: Remove the container
    const removeResponse = await app.handle(
      new Request(`http://localhost/containers/${containerId}`, {
        method: 'DELETE'
      })
    );
    
    expect(removeResponse.status).toBe(200);
    
    // Verify the container no longer exists
    const getResponse = await app.handle(
      new Request(`http://localhost/containers/${containerId}`)
    );
    
    expect(getResponse.status).toBe(404);
  });
});
```

### Proxy Configuration Workflow

```typescript
describe('Proxy Configuration Workflow', () => {
  it('should create a proxy rule and verify traffic routing', async () => {
    // Step 1: Create a container
    const containerResponse = await app.handle(
      new Request('http://localhost/containers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test-web',
          image: 'nginx:latest',
          ports: [{ internal: 80, external: 8080 }]
        })
      })
    );
    
    const containerBody = await containerResponse.json();
    const containerId = containerBody.id;
    
    // Step 2: Create a proxy rule
    const proxyResponse = await app.handle(
      new Request('http://localhost/proxy/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'test.localhost',
          targetPort: 8080,
          targetContainer: containerId,
          path: '/',
          enabled: true
        })
      })
    );
    
    expect(proxyResponse.status).toBe(200);
    const proxyBody = await proxyResponse.json();
    const ruleId = proxyBody.id;
    
    // Step 3: Verify the proxy rule was created
    const getRuleResponse = await app.handle(
      new Request(`http://localhost/proxy/rules/${ruleId}`)
    );
    
    expect(getRuleResponse.status).toBe(200);
    
    // Step 4: Simulate traffic through the proxy
    const trafficResponse = await app.handle(
      new Request(`http://localhost/proxy/test?url=http://test.localhost/`)
    );
    
    expect(trafficResponse.status).toBe(200);
    const trafficBody = await trafficResponse.json();
    expect(trafficBody.success).toBe(true);
    
    // Step 5: Check traffic metrics
    const metricsResponse = await app.handle(
      new Request(`http://localhost/proxy/rules/${ruleId}/metrics`)
    );
    
    expect(metricsResponse.status).toBe(200);
    const metricsBody = await metricsResponse.json();
    expect(metricsBody.requests).toBeGreaterThan(0);
    
    // Step 6: Clean up
    await app.handle(
      new Request(`http://localhost/proxy/rules/${ruleId}`, {
        method: 'DELETE'
      })
    );
    
    await app.handle(
      new Request(`http://localhost/containers/${containerId}`, {
        method: 'DELETE'
      })
    );
  });
});
```

## Handling Asynchronous Operations in Tests

### Using Async/Await

```typescript
it('should handle asynchronous operations', async () => {
  // Start a long-running operation
  const startResponse = await app.handle(
    new Request('http://localhost/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'long-running' })
    })
  );
  
  const startBody = await startResponse.json();
  const operationId = startBody.id;
  
  // Poll for completion
  let status = 'pending';
  let attempts = 0;
  const maxAttempts = 10;
  
  while (status === 'pending' && attempts < maxAttempts) {
    const statusResponse = await app.handle(
      new Request(`http://localhost/operations/${operationId}/status`)
    );
    
    const statusBody = await statusResponse.json();
    status = statusBody.status;
    
    if (status === 'pending') {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
  }
  
  expect(status).toBe('completed');
});
```

### Testing WebSocket Communication

```typescript
describe('WebSocket Integration', () => {
  it('should handle real-time log streaming via WebSocket', async () => {
    // Create a container
    const createResponse = await app.handle(
      new Request('http://localhost/containers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test-logs',
          image: 'nginx:latest'
        })
      })
    );
    
    const createBody = await createResponse.json();
    const containerId = createBody.id;
    
    // Mock WebSocket connection
    const mockWs = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn()
    };
    
    // Mock WebSocket context
    const mockContext = {
      ws: mockWs,
      query: { id: containerId }
    };
    
    // Get the WebSocket handler
    const wsHandler = app.routes.find(r => r.path === '/containers/:id/logs/stream')?.handler;
    
    // Call the handler with the mock context
    if (wsHandler) {
      await wsHandler(mockContext);
    }
    
    // Verify log streaming was started
    expect(containerService.startLogStreaming).toHaveBeenCalledWith(
      containerId,
      expect.any(Function)
    );
    
    // Simulate receiving log data
    const logCallback = (containerService.startLogStreaming as jest.Mock).mock.calls[0][1];
    logCallback('New log line');
    
    // Verify data was sent to the client
    expect(mockWs.send).toHaveBeenCalledWith(
      JSON.stringify({ log: 'New log line' })
    );
    
    // Simulate connection close
    const closeHandler = mockWs.on.mock.calls.find(call => call[0] === 'close')[1];
    closeHandler();
    
    // Verify log streaming was stopped
    expect(containerService.stopLogStreaming).toHaveBeenCalledWith(containerId);
    
    // Clean up
    await app.handle(
      new Request(`http://localhost/containers/${containerId}`, {
        method: 'DELETE'
      })
    );
  });
});
```

## Examples of Good Integration Tests

### 1. Container Lifecycle Test

```typescript
describe('Container Lifecycle Integration', () => {
  it('should manage the complete container lifecycle', async () => {
    // Mock Docker responses
    (dockerClient.createContainer as jest.Mock).mockResolvedValue({ id: 'container-1' });
    (dockerClient.startContainer as jest.Mock).mockResolvedValue(undefined);
    (dockerClient.stopContainer as jest.Mock).mockResolvedValue(undefined);
    (dockerClient.removeContainer as jest.Mock).mockResolvedValue(undefined);
    (dockerClient.getContainerStats as jest.Mock).mockResolvedValue({
      cpu_stats: { cpu_usage: { total_usage: 1000000 } },
      memory_stats: { usage: 1024000, limit: 2048000 }
    });
    
    // Step 1: Create a container
    const createResponse = await app.handle(
      new Request('http://localhost/containers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test-container',
          image: 'nginx:latest',
          ports: [{ internal: 80, external: 8080 }]
        })
      })
    );
    
    expect(createResponse.status).toBe(200);
    const container = await createResponse.json();
    
    // Step 2: Start the container
    const startResponse = await app.handle(
      new Request(`http://localhost/containers/${container.id}/start`, {
        method: 'POST'
      })
    );
    
    expect(startResponse.status).toBe(200);
    expect(dockerClient.startContainer).toHaveBeenCalledWith(container.id);
    
    // Step 3: Get container stats
    const statsResponse = await app.handle(
      new Request(`http://localhost/containers/${container.id}/stats`)
    );
    
    expect(statsResponse.status).toBe(200);
    const stats = await statsResponse.json();
    expect(stats.stats).toBeDefined();
    expect(stats.stats.cpuUsage).toBeDefined();
    expect(stats.stats.memoryUsage).toBeDefined();
    
    // Step 4: Stop the container
    const stopResponse = await app.handle(
      new Request(`http://localhost/containers/${container.id}/stop`, {
        method: 'POST'
      })
    );
    
    expect(stopResponse.status).toBe(200);
    expect(dockerClient.stopContainer).toHaveBeenCalledWith(container.id);
    
    // Step 5: Remove the container
    const removeResponse = await app.handle(
      new Request(`http://localhost/containers/${container.id}`, {
        method: 'DELETE'
      })
    );
    
    expect(removeResponse.status).toBe(200);
    expect(dockerClient.removeContainer).toHaveBeenCalledWith(container.id, false);
  });
});
```

### 2. Authentication and Authorization Flow

```typescript
describe('Authentication and Authorization Flow', () => {
  it('should authenticate user and enforce authorization', async () => {
    // Mock JWT service
    jest.mock('@backend/src/services/auth', () => ({
      authService: {
        generateToken: jest.fn().mockReturnValue('valid-token'),
        verifyToken: jest.fn().mockImplementation(token => {
          if (token === 'valid-token') {
            return { userId: 'user-1', role: 'user' };
          }
          throw new Error('Invalid token');
        })
      }
    }));
    
    import { authService } from '@backend/src/services/auth';
    
    // Step 1: Login
    const loginResponse = await app.handle(
      new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'password123'
        })
      })
    );
    
    expect(loginResponse.status).toBe(200);
    const loginBody = await loginResponse.json();
    expect(loginBody.token).toBe('valid-token');
    
    // Step 2: Access protected resource with token
    const protectedResponse = await app.handle(
      new Request('http://localhost/api/protected', {
        headers: { 'Authorization': `Bearer ${loginBody.token}` }
      })
    );
    
    expect(protectedResponse.status).toBe(200);
    
    // Step 3: Try to access admin resource with user role
    const adminResponse = await app.handle(
      new Request('http://localhost/api/admin', {
        headers: { 'Authorization': `Bearer ${loginBody.token}` }
      })
    );
    
    expect(adminResponse.status).toBe(403); // Forbidden
    
    // Step 4: Try to access protected resource without token
    const unauthorizedResponse = await app.handle(
      new Request('http://localhost/api/protected')
    );
    
    expect(unauthorizedResponse.status).toBe(401); // Unauthorized
  });
});
```

### 3. Configuration Backup and Restore

```typescript
describe('Configuration Backup and Restore', () => {
  it('should backup and restore system configuration', async () => {
    // Mock configuration data
    const mockConfig = {
      settings: {
        theme: 'dark',
        notifications: true
      },
      proxyRules: [
        { id: 'rule-1', domain: 'example.com', targetPort: 8080 }
      ]
    };
    
    // Mock configuration service
    (configService.getFullConfiguration as jest.Mock).mockResolvedValue(mockConfig);
    (configService.restoreConfiguration as jest.Mock).mockResolvedValue({ success: true });
    
    // Step 1: Create a backup
    const backupResponse = await app.handle(
      new Request('http://localhost/config/backup', {
        method: 'POST'
      })
    );
    
    expect(backupResponse.status).toBe(200);
    const backupBody = await backupResponse.json();
    expect(backupBody.backup).toBeDefined();
    const backupId = backupBody.id;
    
    // Step 2: Modify configuration
    await app.handle(
      new Request('http://localhost/config/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: 'light',
          notifications: false
        })
      })
    );
    
    // Step 3: Restore from backup
    const restoreResponse = await app.handle(
      new Request(`http://localhost/config/restore/${backupId}`, {
        method: 'POST'
      })
    );
    
    expect(restoreResponse.status).toBe(200);
    expect(configService.restoreConfiguration).toHaveBeenCalledWith(backupId);
    
    // Step 4: Verify configuration was restored
    const configResponse = await app.handle(
      new Request('http://localhost/config/settings')
    );
    
    expect(configResponse.status).toBe(200);
    const configBody = await configResponse.json();
    expect(configBody).toEqual(mockConfig.settings);
  });
});
```

## Best Practices Summary

1. **Test Complete Workflows**: Focus on testing end-to-end workflows rather than individual operations.

2. **Minimize Mocking**: Only mock external dependencies that can't be easily included in the test environment.

3. **Use Real-like Data**: Use realistic data that mimics production scenarios.

4. **Test Error Recovery**: Verify that the system recovers from errors appropriately.

5. **Clean Up Resources**: Ensure tests clean up any resources they create to avoid affecting other tests.

6. **Test Asynchronous Operations**: Use appropriate techniques to handle asynchronous operations in tests.

7. **Test in Isolation**: Each test should run independently without relying on state from other tests.

8. **Use Descriptive Test Names**: Make it clear what workflow or scenario each test is verifying.

9. **Test Performance Characteristics**: Include assertions about performance where relevant.

10. **Test Edge Cases**: Include tests for boundary conditions and unusual scenarios.

## Troubleshooting Common Issues

### Test Isolation Problems

If tests are affecting each other:
- Ensure each test cleans up its resources
- Use unique identifiers for test resources
- Reset shared state between tests
- Run tests in isolation with `--runInBand` if necessary

### Asynchronous Testing Issues

If tests with async operations are failing:
- Ensure you're using `async/await` correctly
- Use appropriate waiting mechanisms for operations to complete
- Check that promises are being properly resolved/rejected
- Add appropriate timeouts for long-running operations

### External Dependency Issues

If tests are failing due to external dependencies:
- Check that mocks are correctly set up
- Verify that the dependency is being properly isolated
- Consider using a real instance of the dependency in a controlled environment
- Use debugging to trace the interaction with the dependency

## Conclusion

Integration testing is a vital part of ensuring the quality and reliability of the Kontainers application. By testing how components work together, you can catch issues that might not be apparent when testing components in isolation. Following the approaches and best practices outlined in this guide will help you write effective integration tests that provide confidence in your application's behavior.