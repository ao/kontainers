import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@frontend/contexts/ThemeContext';
import { AuthContext } from '@frontend/contexts/AuthContext';
import { NotificationProvider } from '@frontend/contexts/NotificationContext';

// Define the extended render options
interface ExtendedRenderOptions extends Omit<RenderOptions, 'queries'> {
  initialRoute?: string;
  routes?: { path: string; element: ReactElement }[];
  authState?: {
    user: any;
    isAuthenticated: boolean;
    login: (token: string) => void;
    logout: () => void;
    setUser: (user: any) => void;
  };
}

/**
 * Custom render function that wraps the component with all necessary providers
 * @param ui - The React component to render
 * @param options - Extended render options
 * @returns The rendered component with additional utilities
 */
function renderWithProviders(
  ui: ReactElement,
  {
    initialRoute = '/',
    routes = [],
    authState = {
      user: null,
      isAuthenticated: false,
      login: jest.fn(),
      logout: jest.fn(),
      setUser: jest.fn()
    },
    ...renderOptions
  }: ExtendedRenderOptions = {}
) {
  // Create a history object for testing navigation
  const history = {
    location: { pathname: initialRoute },
    push: jest.fn((path) => {
      history.location.pathname = path;
    }),
    replace: jest.fn((path) => {
      history.location.pathname = path;
    })
  };

  function AllTheProviders({ children }: { children: React.ReactNode }) {
    return (
      <AuthContext.Provider value={authState}>
        <ThemeProvider>
          <NotificationProvider>
            <MemoryRouter initialEntries={[initialRoute]}>
              {routes.length > 0 ? (
                <Routes>
                  {routes.map(({ path, element }) => (
                    <Route key={path} path={path} element={element} />
                  ))}
                  <Route path="*" element={children} />
                </Routes>
              ) : (
                children
              )}
            </MemoryRouter>
          </NotificationProvider>
        </ThemeProvider>
      </AuthContext.Provider>
    );
  }

  return {
    ...render(ui, { wrapper: AllTheProviders, ...renderOptions }),
    history
  };
}

// Re-export everything from testing-library
export * from '@testing-library/react';

// Export the custom render function
export { renderWithProviders };

/**
 * Creates a mock for the useNavigate hook
 * @returns A mock navigate function
 */
export function createMockNavigate() {
  const navigate = jest.fn();
  jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useNavigate: () => navigate
  }));
  return navigate;
}

/**
 * Creates a mock for the useParams hook
 * @param params - The params to return
 * @returns A mock params object
 */
export function createMockParams(params: Record<string, string>) {
  jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useParams: () => params
  }));
  return params;
}

/**
 * Creates a mock for the useLocation hook
 * @param location - The location to return
 * @returns A mock location object
 */
export function createMockLocation(location: Partial<Location> = {}) {
  const mockLocation = {
    pathname: '/',
    search: '',
    hash: '',
    state: null,
    key: 'default',
    ...location
  };
  
  jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useLocation: () => mockLocation
  }));
  
  return mockLocation;
}

/**
 * Helper function to wait for async operations
 * @param ms - The number of milliseconds to wait
 * @returns A promise that resolves after the specified time
 */
export const waitForAsync = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));