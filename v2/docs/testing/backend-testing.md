# Backend Testing Guide

This guide provides detailed information on testing backend components in the Kontainers v2 project.

## Overview

Backend testing in Kontainers v2 focuses on ensuring that API endpoints, services, and middleware function correctly. The tests verify that the backend correctly handles requests, processes data, interacts with external services, and returns appropriate responses.

## Testing Tools

- **Bun Test**: Built-in test runner for Bun runtime
- **Jest**: For mocking and assertions
- **Elysia**: For creating test instances of the API

## API Endpoint Testing Approach

### Test Structure

Backend API tests typically follow this structure:

```typescript
import { describe, expect, it, beforeEach, jest, afterEach } from 'bun:test';
import { Elysia } from 'elysia';
import { endpointRoutes } from '@backend/src/api/endpoint';
import { relatedService } from '@backend/src/services/service';

// Mock the service
jest.mock('@backend/src/services/service', () => ({
  relatedService: {
    methodOne: jest.fn(),
    methodTwo: jest.fn()
  }
}));

describe('Endpoint API Routes', () => {
  let app: Elysia;
  
  beforeEach(() => {
    // Reset all mocks
    jest.resetAllMocks();
    
    // Create a new Elysia app with the routes
    app = new Elysia().use(endpointRoutes);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /path', () => {
    it('should return expected data', async () => {
      // Arrange: Set up mock return values
      (relatedService.methodOne as jest.Mock).mockResolvedValue(mockData);
      
      // Act: Make the request
      const response = await app.handle(new Request('http://localhost/path'));
      const body = await response.json();
      
      // Assert: Verify the response
      expect(response.status).toBe(200);
      expect(body).toEqual(expectedResult);
      expect(relatedService.methodOne).toHaveBeenCalledTimes(1);
    });
  });
});
```

### Testing HTTP Methods

Test each HTTP method that your API supports:

```typescript
// GET request
const response = await app.handle(new Request('http://localhost/path'));

// POST request with body
const response = await app.handle(
  new Request('http://localhost/path', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  })
);

// PUT request with body
const response = await app.handle(
  new Request('http://localhost/path/id', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  })
);

// DELETE request
const response = await app.handle(
  new Request('http://localhost/path/id', {
    method: 'DELETE'
  })
);
```

### Testing Query Parameters

```typescript
// Test with query parameters
const response = await app.handle(
  new Request('http://localhost/path?param1=value1&param2=value2')
);

// Verify that the service was called with the correct parameters
expect(relatedService.methodOne).toHaveBeenCalledWith({
  param1: 'value1',
  param2: 'value2'
});
```

## Mocking Strategies

### Mocking Services

Mock service dependencies to isolate the API layer:

```typescript
jest.mock('@backend/src/services/containerService', () => ({
  containerService: {
    getContainers: jest.fn(),
    getContainer: jest.fn(),
    createContainer: jest.fn(),
    startContainer: jest.fn(),
    stopContainer: jest.fn()
  }
}));

import { containerService } from '@backend/src/services/containerService';

// In test:
(containerService.getContainers as jest.Mock).mockResolvedValue([
  { id: 'container-1', name: 'Container 1' },
  { id: 'container-2', name: 'Container 2' }
]);
```

### Mocking External Services

For services that interact with external systems (like Docker):

```typescript
jest.mock('@backend/src/integrations/docker', () => ({
  dockerClient: {
    listContainers: jest.fn(),
    createContainer: jest.fn(),
    startContainer: jest.fn()
  }
}));

import { dockerClient } from '@backend/src/integrations/docker';

// In test:
(dockerClient.listContainers as jest.Mock).mockResolvedValue([
  { Id: 'container-1', Names: ['/container-1'] },
  { Id: 'container-2', Names: ['/container-2'] }
]);
```

### Mocking Database

For database interactions:

```typescript
jest.mock('@backend/src/db', () => ({
  db: {
    query: jest.fn(),
    execute: jest.fn(),
    transaction: jest.fn()
  }
}));

import { db } from '@backend/src/db';

// In test:
(db.query as jest.Mock).mockResolvedValue([
  { id: 1, name: 'Record 1' },
  { id: 2, name: 'Record 2' }
]);
```

## Testing Database Interactions

### Testing Queries

```typescript
describe('Database Service', () => {
  it('should retrieve records correctly', async () => {
    // Mock the database response
    (db.query as jest.Mock).mockResolvedValue([
      { id: 1, name: 'Record 1' },
      { id: 2, name: 'Record 2' }
    ]);
    
    // Call the service method
    const result = await databaseService.getRecords();
    
    // Verify the query was called correctly
    expect(db.query).toHaveBeenCalledWith(
      'SELECT * FROM records WHERE status = ?',
      ['active']
    );
    
    // Verify the result
    expect(result).toEqual([
      { id: 1, name: 'Record 1' },
      { id: 2, name: 'Record 2' }
    ]);
  });
});
```

### Testing Transactions

```typescript
describe('Transaction Handling', () => {
  it('should commit transaction on success', async () => {
    // Mock transaction objects
    const mockTransaction = {
      execute: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn()
    };
    
    (db.transaction as jest.Mock).mockResolvedValue(mockTransaction);
    (mockTransaction.execute as jest.Mock).mockResolvedValue({ affectedRows: 1 });
    
    // Call the service method
    await transactionService.performComplexOperation();
    
    // Verify transaction was committed
    expect(mockTransaction.commit).toHaveBeenCalled();
    expect(mockTransaction.rollback).not.toHaveBeenCalled();
  });
  
  it('should rollback transaction on error', async () => {
    // Mock transaction objects
    const mockTransaction = {
      execute: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn()
    };
    
    (db.transaction as jest.Mock).mockResolvedValue(mockTransaction);
    (mockTransaction.execute as jest.Mock).mockRejectedValue(new Error('Database error'));
    
    // Call the service method and expect it to throw
    await expect(transactionService.performComplexOperation()).rejects.toThrow('Database error');
    
    // Verify transaction was rolled back
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockTransaction.commit).not.toHaveBeenCalled();
  });
});
```

## Testing Authentication

### Testing Authentication Middleware

```typescript
describe('Authentication Middleware', () => {
  it('should allow requests with valid token', async () => {
    // Mock the JWT verification
    jest.mock('jsonwebtoken', () => ({
      verify: jest.fn().mockReturnValue({ userId: '123', role: 'admin' })
    }));
    
    // Create a test app with the auth middleware
    const app = new Elysia()
      .use(authMiddleware)
      .get('/protected', () => 'Protected data');
    
    // Make a request with a valid token
    const response = await app.handle(
      new Request('http://localhost/protected', {
        headers: { 'Authorization': 'Bearer valid-token' }
      })
    );
    
    // Verify the request was allowed
    expect(response.status).toBe(200);
  });
  
  it('should reject requests without token', async () => {
    // Create a test app with the auth middleware
    const app = new Elysia()
      .use(authMiddleware)
      .get('/protected', () => 'Protected data');
    
    // Make a request without a token
    const response = await app.handle(
      new Request('http://localhost/protected')
    );
    
    // Verify the request was rejected
    expect(response.status).toBe(401);
  });
});
```

### Testing Role-Based Access Control

```typescript
describe('Role-Based Access Control', () => {
  it('should allow access to admin users', async () => {
    // Mock the auth context
    const mockAuthContext = {
      user: { id: '123', role: 'admin' }
    };
    
    // Create a test app with the RBAC middleware
    const app = new Elysia()
      .use(ctx => {
        ctx.store.auth = mockAuthContext;
        return ctx;
      })
      .use(rbacMiddleware(['admin']))
      .get('/admin-only', () => 'Admin data');
    
    // Make a request
    const response = await app.handle(
      new Request('http://localhost/admin-only')
    );
    
    // Verify the request was allowed
    expect(response.status).toBe(200);
  });
  
  it('should deny access to non-admin users', async () => {
    // Mock the auth context
    const mockAuthContext = {
      user: { id: '123', role: 'user' }
    };
    
    // Create a test app with the RBAC middleware
    const app = new Elysia()
      .use(ctx => {
        ctx.store.auth = mockAuthContext;
        return ctx;
      })
      .use(rbacMiddleware(['admin']))
      .get('/admin-only', () => 'Admin data');
    
    // Make a request
    const response = await app.handle(
      new Request('http://localhost/admin-only')
    );
    
    // Verify the request was denied
    expect(response.status).toBe(403);
  });
});
```

## Testing Error Handling

### Testing API Error Responses

```typescript
describe('Error Handling', () => {
  it('should return 404 for non-existent resource', async () => {
    // Mock service to throw a specific error
    (containerService.getContainer as jest.Mock).mockRejectedValue(
      new ResourceNotFoundError('Container not found')
    );
    
    // Make the request
    const response = await app.handle(
      new Request('http://localhost/containers/non-existent')
    );
    
    // Verify the response
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('Container not found');
  });
  
  it('should return 400 for invalid input', async () => {
    // Mock service to throw a validation error
    (containerService.createContainer as jest.Mock).mockRejectedValue(
      new ValidationError('Invalid container configuration')
    );
    
    // Make the request
    const response = await app.handle(
      new Request('http://localhost/containers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'data' })
      })
    );
    
    // Verify the response
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid container configuration');
  });
  
  it('should return 500 for unexpected errors', async () => {
    // Mock service to throw an unexpected error
    (containerService.getContainers as jest.Mock).mockRejectedValue(
      new Error('Unexpected error')
    );
    
    // Make the request
    const response = await app.handle(
      new Request('http://localhost/containers')
    );
    
    // Verify the response
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Unexpected error');
  });
});
```

### Testing Middleware Error Handling

```typescript
describe('Error Middleware', () => {
  it('should catch and format errors', async () => {
    // Create a test app with the error middleware
    const app = new Elysia()
      .use(errorMiddleware)
      .get('/error', () => {
        throw new Error('Test error');
      });
    
    // Make a request that will cause an error
    const response = await app.handle(
      new Request('http://localhost/error')
    );
    
    // Verify the error was caught and formatted
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: 'Test error',
      status: 500
    });
  });
});
```

## Examples of Good Backend Tests

### 1. API Endpoint Test

```typescript
describe('GET /containers', () => {
  it('should return all containers', async () => {
    const mockContainers = [
      { id: 'container-1', name: 'Container 1' },
      { id: 'container-2', name: 'Container 2' }
    ];
    
    (containerService.getContainers as jest.Mock).mockResolvedValue(mockContainers);
    
    const response = await app.handle(new Request('http://localhost/containers'));
    const body = await response.json();
    
    expect(response.status).toBe(200);
    expect(body).toEqual({ containers: mockContainers });
    expect(containerService.getContainers).toHaveBeenCalledTimes(1);
  });
});
```

### 2. API with Query Parameters Test

```typescript
describe('GET /containers/:id/logs', () => {
  it('should get container logs with query parameters', async () => {
    const mockLogs = ['log1', 'log2', 'log3'];
    
    (containerService.getContainerLogs as jest.Mock).mockResolvedValue(mockLogs);
    
    const response = await app.handle(
      new Request('http://localhost/containers/container-1/logs?tail=100&since=2023-01-01')
    );
    const body = await response.json();
    
    expect(response.status).toBe(200);
    expect(body).toEqual({ id: 'container-1', logs: mockLogs });
    expect(containerService.getContainerLogs).toHaveBeenCalledWith('container-1', {
      tail: 100,
      since: '2023-01-01',
      until: undefined
    });
  });
});
```

### 3. POST Endpoint Test

```typescript
describe('POST /containers', () => {
  it('should create a new container', async () => {
    const mockContainer = { id: 'container-1', name: 'Container 1' };
    const mockRequest = {
      name: 'Container 1',
      image: 'nginx:latest',
      ports: [{ internal: 80, external: 8080 }]
    };
    
    (containerService.createContainer as jest.Mock).mockResolvedValue(mockContainer);
    
    const response = await app.handle(
      new Request('http://localhost/containers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockRequest)
      })
    );
    const body = await response.json();
    
    expect(response.status).toBe(200);
    expect(body).toEqual(mockContainer);
    expect(containerService.createContainer).toHaveBeenCalledWith(mockRequest);
  });
});
```

### 4. Service Layer Test

```typescript
describe('ContainerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getContainers', () => {
    it('should return formatted containers', async () => {
      // Mock Docker client response
      const mockDockerContainers = [
        {
          Id: 'container-1',
          Names: ['/container-1'],
          Image: 'nginx:latest',
          State: 'running',
          Status: 'Up 2 minutes',
          Created: 1630000000,
          Ports: [{ PrivatePort: 80, PublicPort: 8080, Type: 'tcp', IP: '0.0.0.0' }],
          NetworkSettings: { Networks: { bridge: {} } }
        }
      ];
      
      (dockerClient.listContainers as jest.Mock).mockResolvedValue(mockDockerContainers);
      
      // Call the service
      const result = await containerService.getContainers();
      
      // Verify the result
      expect(result).toEqual([
        {
          id: 'container-1',
          name: 'container-1',
          image: 'nginx:latest',
          state: 'RUNNING',
          status: 'Up 2 minutes',
          created: expect.any(String),
          ports: [{ privatePort: 80, publicPort: 8080, type: 'tcp', ip: '0.0.0.0' }],
          networks: ['bridge']
        }
      ]);
      
      // Verify Docker client was called
      expect(dockerClient.listContainers).toHaveBeenCalledTimes(1);
    });
  });
});
```

## Best Practices Summary

1. **Isolate the API layer**: Mock all service dependencies to test the API layer in isolation.

2. **Test all HTTP methods**: Ensure each endpoint handles all supported HTTP methods correctly.

3. **Test query parameters and request bodies**: Verify that the API correctly processes input data.

4. **Test error handling**: Ensure the API returns appropriate error responses for different error scenarios.

5. **Test authentication and authorization**: Verify that protected endpoints enforce access controls.

6. **Use descriptive test names**: Make it clear what each test is verifying.

7. **Keep tests independent**: Each test should be able to run in isolation.

8. **Reset mocks between tests**: Use `jest.clearAllMocks()` in `beforeEach` to ensure clean test state.

9. **Test edge cases**: Include tests for boundary conditions and unusual inputs.

10. **Test performance**: Include tests that verify the API meets performance requirements.

## Troubleshooting Common Issues

### Mock not being called

If your mock is not being called as expected:
- Ensure the mock is defined before the import
- Check that you're mocking the correct path
- Verify that the mock is properly reset between tests
- Use `console.log(jest.isMockFunction(dependency))` to verify the mock is set up correctly

### Unexpected API responses

If your API is returning unexpected responses:
- Check that the route is defined correctly
- Verify that the mock service is returning the expected data
- Ensure that middleware is correctly applied
- Use `console.log` to debug the request and response objects

### Authentication issues

If authentication tests are failing:
- Verify that the token is being passed correctly in the request
- Check that the JWT verification mock is set up correctly
- Ensure that the auth middleware is applied to the test app
- Verify that the user object is correctly stored in the context

## Conclusion

Backend testing is a critical part of ensuring the quality and reliability of the Kontainers v2 application. By following the approaches and best practices outlined in this guide, you can write effective tests that catch issues early and provide confidence in your backend code.