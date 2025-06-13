# Frontend Testing Guide

This guide provides detailed information on testing frontend components in the Kontainers v2 project.

## Overview

Frontend testing in Kontainers v2 focuses on ensuring that React components render correctly, handle user interactions properly, manage state effectively, and integrate well with the rest of the application. We use React Testing Library as our primary testing tool, which encourages testing components in a way that resembles how users interact with them.

## Testing Tools

- **React Testing Library**: For rendering components and querying the DOM
- **@testing-library/user-event**: For simulating user interactions
- **Jest**: For test assertions and mocking
- **@testing-library/react-hooks**: For testing custom React hooks

## Component Testing Approach

### Test Structure

Frontend tests typically follow this structure:

```typescript
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../utils/test-utils';
import ComponentToTest from '@frontend/src/components/path/to/Component';

// Mock dependencies
jest.mock('@frontend/src/services/someService', () => ({
  someMethod: jest.fn()
}));

describe('ComponentName', () => {
  beforeEach(() => {
    // Reset mocks and set up test environment
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    renderWithProviders(<ComponentToTest />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  it('handles user interaction', async () => {
    renderWithProviders(<ComponentToTest />);
    fireEvent.click(screen.getByRole('button', { name: /button text/i }));
    await waitFor(() => {
      expect(screen.getByText('Result')).toBeInTheDocument();
    });
  });
});
```

### Rendering Components

Always use the `renderWithProviders` utility from `tests/utils/test-utils.tsx` to render components. This utility wraps components with all necessary providers:

```typescript
const { history } = renderWithProviders(
  <ComponentToTest />,
  {
    initialRoute: '/initial/route',
    authState: {
      user: { id: '1', username: 'testuser' },
      isAuthenticated: true,
      login: jest.fn(),
      logout: jest.fn(),
      setUser: jest.fn()
    }
  }
);
```

### Querying Elements

Follow these best practices for querying elements:

1. **Prefer user-centric queries**:
   - `getByRole` - Find by ARIA role
   - `getByLabelText` - Find form elements by their label
   - `getByPlaceholderText` - Find input by placeholder
   - `getByText` - Find elements by their text content

2. **Use `data-testid` as a last resort**:
   ```tsx
   <button data-testid="submit-button">Submit</button>
   ```
   ```typescript
   screen.getByTestId('submit-button')
   ```

3. **Query variants**:
   - `getBy*`: Throws error if element not found
   - `queryBy*`: Returns null if element not found (good for asserting absence)
   - `findBy*`: Returns a Promise, resolves when element is found (good for async rendering)

## Mocking Strategies

### Mocking Services

Mock API services to avoid actual network requests:

```typescript
jest.mock('@frontend/src/services/containerService', () => ({
  fetchContainers: jest.fn(),
  createContainer: jest.fn(),
  deleteContainer: jest.fn()
}));

import { fetchContainers } from '@frontend/src/services/containerService';

// In test:
(fetchContainers as jest.Mock).mockResolvedValue([
  { id: '1', name: 'container-1' },
  { id: '2', name: 'container-2' }
]);
```

### Mocking React Query

For components using React Query:

```typescript
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: jest.fn()
}));

import { useQuery } from '@tanstack/react-query';

// In test:
(useQuery as jest.Mock).mockReturnValue({
  data: mockData,
  isLoading: false,
  error: null,
  refetch: jest.fn()
});
```

### Mocking React Router

For components that use React Router hooks:

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
  useParams: () => ({ id: 'container-1' })
}));
```

Alternatively, use the helper functions from `test-utils.tsx`:

```typescript
import { createMockNavigate, createMockParams } from '../../../utils/test-utils';

const mockNavigate = createMockNavigate();
const mockParams = createMockParams({ id: 'container-1' });
```

## Testing UI Interactions

### Clicking Elements

```typescript
// Click a button
fireEvent.click(screen.getByRole('button', { name: /submit/i }));

// Click a link
fireEvent.click(screen.getByRole('link', { name: /view details/i }));
```

### Form Interactions

```typescript
// Type in an input
fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Container' } });

// Submit a form
fireEvent.submit(screen.getByRole('form'));
```

### Waiting for Async Operations

```typescript
// Wait for an element to appear
await waitFor(() => {
  expect(screen.getByText('Success')).toBeInTheDocument();
});

// Wait for a specific condition
await waitFor(() => {
  expect(mockService.createContainer).toHaveBeenCalledTimes(1);
});
```

## Testing State Management

### Testing Component State

```typescript
it('updates state when input changes', () => {
  renderWithProviders(<ContainerForm />);
  
  const nameInput = screen.getByLabelText('Name');
  fireEvent.change(nameInput, { target: { value: 'New Container' } });
  
  expect(nameInput).toHaveValue('New Container');
});
```

### Testing Store Integration

For components that use Zustand stores:

```typescript
// Mock the store
jest.mock('@frontend/src/store/containerStore', () => ({
  useContainerStore: jest.fn(() => ({
    containers: mockContainers,
    setContainers: jest.fn(),
    addContainer: jest.fn()
  }))
}));

import { useContainerStore } from '@frontend/src/store/containerStore';

it('interacts with the store', () => {
  const mockSetContainers = jest.fn();
  (useContainerStore as jest.Mock).mockReturnValue({
    containers: [],
    setContainers: mockSetContainers
  });
  
  renderWithProviders(<ContainerList />);
  
  // Test that the component calls store methods
  expect(mockSetContainers).toHaveBeenCalledWith(expect.any(Array));
});
```

## Testing Routing and Navigation

### Testing Navigation

```typescript
it('navigates to container detail page when container name is clicked', () => {
  const { history } = renderWithProviders(<ContainerList />);
  
  const containerLink = screen.getByText('nginx-web');
  fireEvent.click(containerLink);
  
  expect(history.location.pathname).toBe('/containers/container-1');
});
```

### Testing Route Parameters

```typescript
it('uses route parameters to fetch container details', () => {
  // Mock useParams to return a specific ID
  jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useParams: () => ({ id: 'container-1' })
  }));
  
  renderWithProviders(<ContainerDetail />);
  
  expect(mockContainerService.getContainer).toHaveBeenCalledWith('container-1');
});
```

## Examples of Good Frontend Tests

### 1. Basic Component Rendering Test

```typescript
describe('ContainerStatusBadge', () => {
  it('renders the correct status for running containers', () => {
    renderWithProviders(
      <ContainerStatusBadge state={ContainerState.RUNNING} />
    );
    
    const badge = screen.getByText('Running');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-green-500');
  });
  
  it('renders the correct status for stopped containers', () => {
    renderWithProviders(
      <ContainerStatusBadge state={ContainerState.STOPPED} />
    );
    
    const badge = screen.getByText('Stopped');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-red-500');
  });
});
```

### 2. User Interaction Test

```typescript
describe('ContainerCreationForm', () => {
  it('submits the form with correct values', async () => {
    const mockCreateContainer = jest.fn().mockResolvedValue({ id: 'new-container' });
    (containerService.createContainer as jest.Mock).mockImplementation(mockCreateContainer);
    
    renderWithProviders(<ContainerCreationForm />);
    
    // Fill out the form
    fireEvent.change(screen.getByLabelText('Name'), { 
      target: { value: 'test-container' } 
    });
    
    fireEvent.change(screen.getByLabelText('Image'), { 
      target: { value: 'nginx:latest' } 
    });
    
    // Add a port mapping
    fireEvent.click(screen.getByText('Add Port Mapping'));
    const internalPortInput = screen.getByLabelText('Internal Port');
    const externalPortInput = screen.getByLabelText('External Port');
    
    fireEvent.change(internalPortInput, { target: { value: '80' } });
    fireEvent.change(externalPortInput, { target: { value: '8080' } });
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    
    // Verify the service was called with correct parameters
    await waitFor(() => {
      expect(mockCreateContainer).toHaveBeenCalledWith({
        name: 'test-container',
        image: 'nginx:latest',
        ports: [{ internal: 80, external: 8080 }]
      });
    });
  });
});
```

### 3. Async Data Loading Test

```typescript
describe('ContainerList', () => {
  it('shows loading state when fetching containers', () => {
    (useQuery as jest.Mock).mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      refetch: jest.fn()
    });
    
    renderWithProviders(<ContainerList />);
    
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
  
  it('shows error message when fetch fails', () => {
    const errorMessage = 'Failed to fetch containers';
    (useQuery as jest.Mock).mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error(errorMessage),
      refetch: jest.fn()
    });
    
    renderWithProviders(<ContainerList />);
    
    expect(screen.getByText('Error loading containers')).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });
  
  it('renders container list correctly when data is loaded', () => {
    const mockContainers = [
      { id: '1', name: 'nginx-web', image: 'nginx:latest', state: ContainerState.RUNNING },
      { id: '2', name: 'redis-cache', image: 'redis:alpine', state: ContainerState.STOPPED }
    ];
    
    (useQuery as jest.Mock).mockReturnValue({
      data: mockContainers,
      isLoading: false,
      error: null,
      refetch: jest.fn()
    });
    
    renderWithProviders(<ContainerList />);
    
    expect(screen.getByText('nginx-web')).toBeInTheDocument();
    expect(screen.getByText('redis-cache')).toBeInTheDocument();
  });
});
```

## Best Practices Summary

1. **Test from a user's perspective**: Focus on what the user sees and does, not on implementation details.

2. **Use the `renderWithProviders` utility**: This ensures components have access to all necessary context providers.

3. **Mock external dependencies**: Avoid actual API calls or external service interactions.

4. **Test loading states, error states, and success states**: Ensure components handle all possible states correctly.

5. **Test user interactions thoroughly**: Verify that clicks, form submissions, and other interactions work as expected.

6. **Use descriptive test names**: Make it clear what each test is verifying.

7. **Keep tests independent**: Each test should be able to run in isolation.

8. **Test accessibility**: Ensure components are accessible by using role-based queries when possible.

9. **Avoid testing implementation details**: Focus on behavior, not on how it's implemented.

10. **Use snapshot testing sparingly**: Prefer explicit assertions over snapshots for most tests.

## Troubleshooting Common Issues

### "Element not found" errors

If `getBy*` queries are failing, try:
- Using `screen.debug()` to see the current state of the DOM
- Checking if the element is actually rendered (might be conditional rendering)
- Using `queryBy*` instead to check if the element exists
- Using `findBy*` if the element appears asynchronously

### Mocking issues

If mocks aren't working as expected:
- Ensure mocks are defined before imports
- Check that you're mocking the correct path
- Use `jest.clearAllMocks()` in `beforeEach` to reset mock state
- Verify mock implementation with `console.log(jest.isMockFunction(dependency))`

### Async testing issues

If tests with async operations are failing:
- Wrap assertions in `waitFor` or use `findBy*` queries
- Check that promises are being properly resolved/rejected in mocks
- Ensure you're using `async/await` correctly in test functions
- Add appropriate timeouts if needed

## Conclusion

Frontend testing is a critical part of ensuring the quality and reliability of the Kontainers v2 application. By following the approaches and best practices outlined in this guide, you can write effective tests that catch issues early and provide confidence in your frontend code.