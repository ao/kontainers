# Testing Cheat Sheet

A quick reference guide for testing in the Kontainers v2 project.

## Common Testing Commands

### Running Tests

```bash
# Run all tests
npm test
# or
bun test

# Run tests in watch mode
npm run test:watch
# or
bun test --watch

# Run tests with coverage
npm run test:coverage
# or
bun test --coverage

# Run specific test suites
npm run test:frontend
npm run test:backend
npm run test:integration
npm run test:utils
npm run test:performance

# Run tests matching a pattern
npm test -- -t "container"
# or
bun test -t "container"

# Run tests in a specific file
npm test -- path/to/file.test.ts
# or
bun test path/to/file.test.ts

# Run tests with timeout (for long-running tests)
npm test -- --timeout 10000
# or
bun test --timeout 10000
```

### Debugging Tests

```bash
# Run tests with debugger
bun --inspect-brk test path/to/file.test.ts

# Run tests with verbose output
npm test -- --verbose
# or
bun test --verbose
```

## Test Structure

### Basic Test Structure

```typescript
import { describe, expect, it, beforeEach, afterEach } from 'bun:test';

describe('Component or Feature Name', () => {
  beforeEach(() => {
    // Setup code that runs before each test
  });

  afterEach(() => {
    // Cleanup code that runs after each test
  });

  it('should do something specific', () => {
    // Test code
    expect(result).toBe(expected);
  });
});
```

### Frontend Test Structure

```typescript
import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../../utils/test-utils';
import Component from '@frontend/src/components/path/to/Component';

describe('Component Name', () => {
  it('should render correctly', () => {
    renderWithProviders(<Component />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
});
```

### Backend Test Structure

```typescript
import { Elysia } from 'elysia';
import { apiRoutes } from '@backend/src/api/routes';

describe('API Endpoint', () => {
  let app: Elysia;
  
  beforeEach(() => {
    app = new Elysia().use(apiRoutes);
  });

  it('should return expected response', async () => {
    const response = await app.handle(new Request('http://localhost/endpoint'));
    expect(response.status).toBe(200);
  });
});
```

## Assertion Examples

### Basic Assertions

```typescript
// Equality
expect(value).toBe(exactValue);          // Strict equality (===)
expect(value).toEqual(obj);              // Deep equality
expect(value).not.toBe(differentValue);  // Negation

// Truthiness
expect(value).toBeTruthy();              // Truthy value
expect(value).toBeFalsy();               // Falsy value
expect(value).toBeNull();                // null
expect(value).toBeUndefined();           // undefined
expect(value).toBeDefined();             // Not undefined

// Numbers
expect(value).toBeGreaterThan(3);        // > 3
expect(value).toBeGreaterThanOrEqual(3); // >= 3
expect(value).toBeLessThan(3);           // < 3
expect(value).toBeLessThanOrEqual(3);    // <= 3
expect(value).toBeCloseTo(0.3, 1);       // Close to 0.3 with 1 decimal precision

// Strings
expect(value).toMatch(/pattern/);        // Match regex
expect(value).toContain('substring');    // Contains substring

// Arrays
expect(array).toContain(item);           // Array contains item
expect(array).toHaveLength(3);           // Array has length

// Objects
expect(object).toHaveProperty('key');    // Object has property
expect(object).toMatchObject({           // Object matches partial object
  key: 'value'
});
```

### DOM Assertions

```typescript
// Element presence
expect(element).toBeInTheDocument();     // Element exists in document
expect(element).not.toBeInTheDocument(); // Element doesn't exist

// Visibility
expect(element).toBeVisible();           // Element is visible
expect(element).not.toBeVisible();       // Element is not visible

// Disabled state
expect(element).toBeDisabled();          // Element is disabled
expect(element).toBeEnabled();           // Element is enabled

// Form elements
expect(inputElement).toHaveValue('text'); // Input has value
expect(checkboxElement).toBeChecked();    // Checkbox is checked

// Classes and attributes
expect(element).toHaveClass('class-name'); // Element has class
expect(element).toHaveAttribute('attr', 'value'); // Element has attribute

// Content
expect(element).toHaveTextContent('text'); // Element contains text
```

### Async Assertions

```typescript
// Using async/await
it('should resolve async operation', async () => {
  const result = await asyncFunction();
  expect(result).toBe(expected);
});

// Using waitFor
it('should eventually update', async () => {
  triggerAsyncUpdate();
  await waitFor(() => {
    expect(screen.getByText('Updated')).toBeInTheDocument();
  });
});

// Finding elements that appear asynchronously
it('should show element after delay', async () => {
  triggerAction();
  const element = await screen.findByText('Appears Later');
  expect(element).toBeInTheDocument();
});
```

## Mocking Examples

### Function Mocks

```typescript
// Basic mock
const mockFn = jest.fn();
mockFn('arg');
expect(mockFn).toHaveBeenCalledWith('arg');

// Mock implementation
const mockFn = jest.fn().mockImplementation(arg => arg * 2);
expect(mockFn(2)).toBe(4);

// Mock return values
const mockFn = jest.fn()
  .mockReturnValueOnce(1)
  .mockReturnValueOnce(2)
  .mockReturnValue(3);
expect(mockFn()).toBe(1);
expect(mockFn()).toBe(2);
expect(mockFn()).toBe(3);
expect(mockFn()).toBe(3);

// Mock promises
const mockFn = jest.fn()
  .mockResolvedValueOnce('resolved')
  .mockRejectedValueOnce(new Error('rejected'));
await expect(mockFn()).resolves.toBe('resolved');
await expect(mockFn()).rejects.toThrow('rejected');
```

### Module Mocks

```typescript
// Mock a module
jest.mock('@backend/src/services/service', () => ({
  serviceFunction: jest.fn()
}));

import { serviceFunction } from '@backend/src/services/service';

// Use the mock in tests
(serviceFunction as jest.Mock).mockReturnValue('mocked value');
```

### React Query Mocks

```typescript
// Mock useQuery hook
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: jest.fn()
}));

import { useQuery } from '@tanstack/react-query';

// Configure the mock for a test
(useQuery as jest.Mock).mockReturnValue({
  data: mockData,
  isLoading: false,
  error: null,
  refetch: jest.fn()
});
```

### React Router Mocks

```typescript
// Mock useNavigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

// Mock useParams
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ id: 'test-id' })
}));
```

### Fetch Mock

```typescript
// Mock global fetch
global.fetch = jest.fn().mockImplementation(() => 
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: 'mocked data' }),
    text: () => Promise.resolve('mocked text'),
    status: 200,
    headers: new Headers()
  })
);

// Mock fetch failure
global.fetch = jest.fn().mockImplementation(() => 
  Promise.resolve({
    ok: false,
    status: 500,
    json: () => Promise.resolve({ error: 'Server error' })
  })
);
```

## User Interaction Examples

### Click Events

```typescript
// Click a button
fireEvent.click(screen.getByRole('button', { name: /submit/i }));

// Click a link
fireEvent.click(screen.getByRole('link', { name: /view details/i }));

// Click by test id
fireEvent.click(screen.getByTestId('submit-button'));
```

### Form Interactions

```typescript
// Type in an input
fireEvent.change(screen.getByLabelText('Username'), {
  target: { value: 'testuser' }
});

// Check a checkbox
fireEvent.click(screen.getByLabelText('Remember me'));

// Select an option
fireEvent.change(screen.getByLabelText('Country'), {
  target: { value: 'US' }
});

// Submit a form
fireEvent.submit(screen.getByRole('form'));
```

### Keyboard Events

```typescript
// Press a key
fireEvent.keyDown(element, { key: 'Enter', code: 'Enter' });

// Type multiple characters
fireEvent.change(input, { target: { value: 'Hello' } });
```

### Drag and Drop

```typescript
// Drag and drop
fireEvent.dragStart(sourceElement);
fireEvent.drop(targetElement);
fireEvent.dragEnd(sourceElement);
```

## Querying Elements

### By Role

```typescript
// Get by role
screen.getByRole('button');
screen.getByRole('button', { name: /submit/i });
screen.getByRole('heading', { level: 2 });
screen.getByRole('textbox', { name: /username/i });
```

### By Text

```typescript
// Get by text content
screen.getByText('Hello World');
screen.getByText(/hello/i); // Case-insensitive regex
```

### By Form Elements

```typescript
// Get by label
screen.getByLabelText('Username');

// Get by placeholder
screen.getByPlaceholderText('Enter username');

// Get by display value
screen.getByDisplayValue('Current value');
```

### By Test ID

```typescript
// Get by test ID (use as last resort)
screen.getByTestId('submit-button');
```

### Query Variants

```typescript
// getBy* - Throws error if not found
const element = screen.getByText('Exists');

// queryBy* - Returns null if not found
const element = screen.queryByText('May not exist');
if (element) {
  // Element exists
}

// findBy* - Returns Promise, waits for element
const element = await screen.findByText('Appears later');
```

## Debugging Tips

### Debugging DOM

```typescript
// Print the current DOM
screen.debug();

// Print a specific element
screen.debug(screen.getByRole('button'));
```

### Debugging Tests

```typescript
// Add console.log statements
console.log('Value:', value);

// Use test.only to run only one test
it.only('should focus on this test', () => {
  // Only this test will run
});

// Skip a test
it.skip('should skip this test', () => {
  // This test will be skipped
});
```

### Debugging Mocks

```typescript
// Check mock calls
console.log(mockFn.mock.calls);

// Check mock results
console.log(mockFn.mock.results);

// Check if function is mocked
console.log(jest.isMockFunction(mockFn));
```

## Links to Resources

- [Bun Test Documentation](https://bun.sh/docs/cli/test)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Testing Library Queries](https://testing-library.com/docs/queries/about)
- [Jest DOM Matchers](https://github.com/testing-library/jest-dom#custom-matchers)
- [Elysia Documentation](https://elysiajs.com/introduction.html)
- [React Query Testing](https://tanstack.com/query/latest/docs/react/guides/testing)

## Project-Specific Resources

- [Main Testing Documentation](./README.md)
- [Frontend Testing Guide](./frontend-testing.md)
- [Backend Testing Guide](./backend-testing.md)
- [Integration Testing Guide](./integration-testing.md)
- [Test Maintenance Guide](./test-maintenance.md)
- [Contributing Tests Guide](./contributing-tests.md)