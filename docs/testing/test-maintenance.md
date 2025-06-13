# Test Maintenance Guide

This guide provides strategies and best practices for maintaining tests in the Kontainers project. As the application evolves, tests need to be updated to ensure they remain effective and continue to provide value.

## Updating Tests When Features Change

### Identifying Tests That Need Updates

When features change, you need to identify which tests are affected:

1. **Look for failing tests**: Run the test suite to see which tests are failing after the feature change.

2. **Search for related tests**: Use search tools to find tests related to the changed feature:

   ```bash
   # Find tests related to container management
   grep -r "container" --include="*.test.ts" tests/
   ```

3. **Check test coverage**: Run tests with coverage to identify areas that are no longer covered:

   ```bash
   npm run test:coverage
   ```

### Strategies for Updating Tests

#### 1. Update Test Data

When data structures or expected values change:

```typescript
// Before
expect(response.body).toEqual({
  container: {
    id: expect.any(String),
    name: 'test-container',
    status: 'running'
  }
});

// After
expect(response.body).toEqual({
  container: {
    id: expect.any(String),
    name: 'test-container',
    status: 'running',
    healthStatus: expect.any(String) // New field added
  }
});
```

#### 2. Update Test Logic

When the behavior of a feature changes:

```typescript
// Before
it('should return 404 when container not found', async () => {
  const response = await request(app).get('/containers/non-existent');
  expect(response.status).toBe(404);
});

// After
it('should return 404 with error details when container not found', async () => {
  const response = await request(app).get('/containers/non-existent');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({
    error: 'Container not found',
    code: 'CONTAINER_NOT_FOUND'
  });
});
```

#### 3. Update Mocks

When dependencies or interfaces change:

```typescript
// Before
jest.mock('@backend/src/services/containerService', () => ({
  getContainer: jest.fn().mockResolvedValue({
    id: 'container-1',
    name: 'test-container'
  })
}));

// After
jest.mock('@backend/src/services/containerService', () => ({
  getContainer: jest.fn().mockResolvedValue({
    id: 'container-1',
    name: 'test-container',
    resources: { // New nested structure
      cpu: '100m',
      memory: '128Mi'
    }
  })
}));
```

### Handling Breaking Changes

For significant changes that break many tests:

1. **Create a migration plan**: Identify all affected tests and plan how to update them.

2. **Update tests incrementally**: Focus on critical paths first, then move to less critical areas.

3. **Consider test refactoring**: Use the opportunity to improve test structure and reduce duplication.

4. **Update test utilities**: If shared test utilities are affected, update them first.

5. **Document changes**: Add comments explaining why tests were updated to help future maintainers.

## Debugging Failing Tests

### Common Causes of Test Failures

1. **Application changes**: The application behavior changed, but tests weren't updated.
2. **Environment issues**: Problems with the test environment or dependencies.
3. **Flaky tests**: Tests that fail intermittently due to timing or race conditions.
4. **Data issues**: Problems with test data or database state.
5. **Configuration issues**: Incorrect test configuration or setup.

### Debugging Process

#### 1. Understand the Failure

Start by understanding what's failing and why:

```typescript
// Add more detailed assertions to pinpoint the issue
expect(response.body).toEqual(expectedData);

// Change to more specific assertions to narrow down the problem
expect(response.body.id).toBe(expectedData.id);
expect(response.body.name).toBe(expectedData.name);
expect(response.body.status).toBe(expectedData.status);
```

#### 2. Add Debugging Output

Add temporary logging to see what's happening:

```typescript
console.log('Response body:', response.body);
console.log('Expected data:', expectedData);
```

#### 3. Isolate the Problem

Run the failing test in isolation:

```bash
npm test -- -t "should return container details"
```

#### 4. Check for Environmental Issues

Verify that the test environment is set up correctly:

```typescript
beforeEach(() => {
  // Log environment setup
  console.log('Test environment:', process.env.NODE_ENV);
  console.log('Mock setup complete:', Boolean(mockService.method));
});
```

#### 5. Use Debugging Tools

Use the Bun debugger or Node.js debugger:

```bash
# Run tests with the debugger
bun --inspect-brk test tests/path/to/test.test.ts
```

### Fixing Common Issues

#### Async Test Issues

```typescript
// Problem: Test completes before async operation finishes
it('should handle async operation', () => {
  service.asyncMethod();
  expect(result).toBe(expected); // Fails because operation hasn't completed
});

// Solution: Use async/await
it('should handle async operation', async () => {
  await service.asyncMethod();
  expect(result).toBe(expected);
});

// Alternative solution: Use done callback
it('should handle async operation', (done) => {
  service.asyncMethod().then(() => {
    expect(result).toBe(expected);
    done();
  });
});
```

#### Mock Issues

```typescript
// Problem: Mock not being called
it('should call the service', () => {
  component.doSomething();
  expect(mockService.method).toHaveBeenCalled(); // Fails if mock not set up correctly
});

// Solution: Verify mock setup
beforeEach(() => {
  jest.clearAllMocks();
  console.log('Is mock function:', jest.isMockFunction(mockService.method));
});
```

#### Timing Issues

```typescript
// Problem: Test depends on timing
it('should update after delay', async () => {
  component.startProcess();
  expect(component.status).toBe('completed'); // Fails if process takes time
});

// Solution: Wait for the operation to complete
it('should update after delay', async () => {
  component.startProcess();
  await waitFor(() => expect(component.status).toBe('completed'));
});
```

## Handling Flaky Tests

Flaky tests are tests that sometimes pass and sometimes fail without any changes to the code. They can be frustrating and reduce confidence in the test suite.

### Identifying Flaky Tests

1. **Run tests multiple times**: Use a script to run tests repeatedly:

   ```bash
   # Run tests 10 times and report failures
   for i in {1..10}; do npm test; done
   ```

2. **Use test reporting**: Configure your CI system to track flaky tests.

3. **Add logging**: Add temporary logging to suspected flaky tests to gather more information.

### Common Causes of Flakiness

1. **Race conditions**: Tests that depend on the timing of operations.
2. **Shared state**: Tests that affect each other through shared state.
3. **External dependencies**: Tests that depend on external services.
4. **Time dependencies**: Tests that depend on the current time or date.
5. **Resource limitations**: Tests that fail due to resource constraints.

### Strategies for Fixing Flaky Tests

#### 1. Add Proper Waiting

```typescript
// Before: Might be flaky if operation takes time
it('should update status', async () => {
  await service.startOperation();
  expect(service.status).toBe('completed');
});

// After: Wait for the condition to be true
it('should update status', async () => {
  await service.startOperation();
  await waitFor(() => expect(service.status).toBe('completed'));
});
```

#### 2. Isolate Tests

```typescript
// Before: Tests might affect each other
describe('Service tests', () => {
  it('test one', () => {
    service.doSomething();
    expect(service.state).toBe('done');
  });
  
  it('test two', () => {
    expect(service.state).toBe('initial'); // Might fail if test one runs first
  });
});

// After: Reset state between tests
describe('Service tests', () => {
  beforeEach(() => {
    service.reset();
  });
  
  it('test one', () => {
    service.doSomething();
    expect(service.state).toBe('done');
  });
  
  it('test two', () => {
    expect(service.state).toBe('initial');
  });
});
```

#### 3. Mock Time-Dependent Code

```typescript
// Before: Depends on current time
it('should check if event is today', () => {
  const event = { date: new Date() };
  expect(service.isToday(event)).toBe(true);
});

// After: Mock the date
it('should check if event is today', () => {
  // Mock current date to a fixed value
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2023-01-01'));
  
  const event = { date: new Date('2023-01-01') };
  expect(service.isToday(event)).toBe(true);
  
  jest.useRealTimers();
});
```

#### 4. Mock External Dependencies

```typescript
// Before: Depends on external service
it('should fetch data', async () => {
  const data = await service.fetchData();
  expect(data).toBeDefined();
});

// After: Mock the external service
it('should fetch data', async () => {
  // Mock the fetch function
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ result: 'data' })
  });
  
  const data = await service.fetchData();
  expect(data).toEqual({ result: 'data' });
});
```

#### 5. Add Retries for Unavoidable Flakiness

For tests that are inherently flaky due to external factors:

```typescript
// Add retry logic for flaky tests
jest.retryTimes(3); // Retry up to 3 times

it('should handle intermittent network issues', async () => {
  const result = await service.fetchWithRetry();
  expect(result).toBeDefined();
});
```

## Test Refactoring Guidelines

As the application evolves, tests may need to be refactored to remain maintainable and effective.

### When to Refactor Tests

1. **Duplication**: When there's significant duplication across tests.
2. **Complexity**: When tests become too complex or hard to understand.
3. **Brittleness**: When tests break frequently due to minor changes.
4. **Performance**: When tests run too slowly.
5. **Coverage gaps**: When tests no longer cover important scenarios.

### Refactoring Strategies

#### 1. Extract Common Setup

```typescript
// Before: Duplicated setup
it('test one', () => {
  const container = { id: '1', name: 'test' };
  const service = new ContainerService();
  service.addContainer(container);
  // Test logic
});

it('test two', () => {
  const container = { id: '1', name: 'test' };
  const service = new ContainerService();
  service.addContainer(container);
  // Test logic
});

// After: Shared setup
let container;
let service;

beforeEach(() => {
  container = { id: '1', name: 'test' };
  service = new ContainerService();
  service.addContainer(container);
});

it('test one', () => {
  // Test logic
});

it('test two', () => {
  // Test logic
});
```

#### 2. Create Test Helpers

```typescript
// Before: Complex test setup
it('should create and configure a container', async () => {
  const createResponse = await request(app)
    .post('/containers')
    .send({ name: 'test', image: 'nginx' });
  
  const containerId = createResponse.body.id;
  
  await request(app)
    .post(`/containers/${containerId}/start`)
    .send();
  
  // More test logic
});

// After: Helper function
async function createAndStartContainer(name, image) {
  const createResponse = await request(app)
    .post('/containers')
    .send({ name, image });
  
  const containerId = createResponse.body.id;
  
  await request(app)
    .post(`/containers/${containerId}/start`)
    .send();
  
  return containerId;
}

it('should create and configure a container', async () => {
  const containerId = await createAndStartContainer('test', 'nginx');
  // More test logic
});
```

#### 3. Use Data Builders

```typescript
// Before: Hardcoded test data
it('should process container', () => {
  const container = {
    id: '1',
    name: 'test',
    image: 'nginx',
    ports: [{ internal: 80, external: 8080 }],
    env: ['VAR=value'],
    volumes: [{ source: '/host', destination: '/container' }]
  };
  
  // Test logic
});

// After: Data builder
class ContainerBuilder {
  constructor() {
    this.container = {
      id: '1',
      name: 'test',
      image: 'nginx',
      ports: [],
      env: [],
      volumes: []
    };
  }
  
  withId(id) {
    this.container.id = id;
    return this;
  }
  
  withName(name) {
    this.container.name = name;
    return this;
  }
  
  withPort(internal, external) {
    this.container.ports.push({ internal, external });
    return this;
  }
  
  build() {
    return { ...this.container };
  }
}

it('should process container', () => {
  const container = new ContainerBuilder()
    .withName('test')
    .withPort(80, 8080)
    .build();
  
  // Test logic
});
```

#### 4. Split Large Tests

```typescript
// Before: Large test with multiple assertions
it('should handle the entire workflow', async () => {
  // Setup
  // ...
  
  // Create container
  // ...
  expect(createResponse.status).toBe(200);
  
  // Start container
  // ...
  expect(startResponse.status).toBe(200);
  
  // Configure proxy
  // ...
  expect(proxyResponse.status).toBe(200);
  
  // Check metrics
  // ...
  expect(metricsResponse.status).toBe(200);
});

// After: Split into focused tests
describe('Container workflow', () => {
  it('should create a container', async () => {
    // Setup
    // Create container
    expect(createResponse.status).toBe(200);
  });
  
  it('should start a container', async () => {
    // Setup with existing container
    // Start container
    expect(startResponse.status).toBe(200);
  });
  
  it('should configure proxy for a container', async () => {
    // Setup with running container
    // Configure proxy
    expect(proxyResponse.status).toBe(200);
  });
  
  it('should collect metrics from a running container', async () => {
    // Setup with running container
    // Check metrics
    expect(metricsResponse.status).toBe(200);
  });
});
```

## Performance Optimization for Slow Tests

Slow tests can reduce developer productivity and slow down the CI/CD pipeline. Here are strategies to optimize test performance:

### Identifying Slow Tests

1. **Use test timing**: Most test runners report the time taken by each test:

   ```bash
   npm test -- --verbose
   ```

2. **Profile tests**: Use profiling tools to identify bottlenecks:

   ```bash
   node --prof node_modules/.bin/jest path/to/slow.test.js
   ```

### Optimization Strategies

#### 1. Reduce Setup/Teardown Overhead

```typescript
// Before: Setup/teardown for each test
beforeEach(async () => {
  // Expensive setup
  await setupDatabase();
});

afterEach(async () => {
  // Expensive teardown
  await cleanupDatabase();
});

// After: Setup/teardown once for the suite
beforeAll(async () => {
  // Expensive setup
  await setupDatabase();
});

afterAll(async () => {
  // Expensive teardown
  await cleanupDatabase();
});

beforeEach(() => {
  // Lightweight reset
  resetDatabaseState();
});
```

#### 2. Mock Expensive Operations

```typescript
// Before: Real operation
it('should process data', async () => {
  const result = await service.processLargeDataset();
  expect(result).toBe(expected);
});

// After: Mock expensive operation
it('should process data', async () => {
  // Mock the expensive internal method
  jest.spyOn(service, 'processChunk').mockImplementation(() => 'processed');
  
  const result = await service.processLargeDataset();
  expect(result).toBe(expected);
});
```

#### 3. Use In-Memory Databases

```typescript
// Before: Real database
const db = new Database('file:test.db');

// After: In-memory database
const db = new Database(':memory:');
```

#### 4. Parallelize Tests

Configure Jest to run tests in parallel:

```json
// jest.config.js
{
  "maxWorkers": 4
}
```

#### 5. Selective Testing

Run only the tests you need:

```bash
# Run only container-related tests
npm test -- -t "container"

# Run only a specific file
npm test -- path/to/file.test.js
```

#### 6. Optimize Test Data

```typescript
// Before: Large test data
const largeData = generateLargeTestData(); // Creates 10,000 items

// After: Smaller test data
const smallData = generateLargeTestData(100); // Creates 100 items
```

## Conclusion

Maintaining tests is an ongoing process that requires attention and care. By following the guidelines in this document, you can ensure that your tests remain effective, reliable, and efficient as the Kontainers application evolves.

Remember that well-maintained tests provide value by:
- Catching regressions early
- Documenting expected behavior
- Enabling confident refactoring
- Improving code quality

Invest time in test maintenance to keep your test suite healthy and valuable.