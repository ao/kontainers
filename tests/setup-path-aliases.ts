// This file is preloaded by Bun to set up path aliases for tests
import { mock } from 'bun:test';
import * as path from 'path';

console.log("Setting up path aliases and Jest compatibility layer for tests...");

// Define path alias mappings
const pathAliases = {
  '@frontend/': '../frontend/src/',
  '@backend/': '../backend/src/',
  '@shared/': '../shared/src/',
  '@/': '../frontend/src/',
  '@tests/': './'
};

// Store all created mocks for global management
const allMocks: any[] = [];

// Create a more comprehensive Jest compatibility layer
function createMockFunction() {
  // Create a mock object that will store the mock data
  const mockData = {
    calls: [] as any[][],
    instances: [] as any[],
    invocationCallOrder: [] as number[],
    results: [] as any[],
    contexts: [] as any[]
  };
  
  // Create a wrapper function that tracks calls
  const mockFn = mock((...args: any[]) => {
    // Track the call
    mockData.calls.push(args);
    mockData.invocationCallOrder.push(Date.now());
    return undefined; // Default return value
  });
  
  // Use Object.defineProperty to add the mock property
  Object.defineProperty(mockFn, 'mock', {
    get: () => mockData,
    configurable: true
  });
  
  // Add Jest-style mock methods using Object.defineProperty
  const mockMethods = {
    mockReturnValue: (val: any) => {
      const originalMock = mockFn;
      const newMock = mock(() => val);
      // Copy properties
      Object.getOwnPropertyNames(originalMock).forEach(prop => {
        if (prop !== 'length' && prop !== 'name') {
          try {
            Object.defineProperty(newMock, prop, Object.getOwnPropertyDescriptor(originalMock, prop)!);
          } catch (e) {
            // Ignore errors for non-configurable properties
          }
        }
      });
      return newMock;
    },
    
    mockReturnValueOnce: (val: any) => {
      const originalMock = mockFn;
      const newMock = mock(() => val);
      // Copy properties
      Object.getOwnPropertyNames(originalMock).forEach(prop => {
        if (prop !== 'length' && prop !== 'name') {
          try {
            Object.defineProperty(newMock, prop, Object.getOwnPropertyDescriptor(originalMock, prop)!);
          } catch (e) {
            // Ignore errors for non-configurable properties
          }
        }
      });
      return newMock;
    },
    
    mockImplementation: (impl: (...args: any[]) => any) => {
      const originalMock = mockFn;
      const newMock = mock(impl);
      // Copy properties
      Object.getOwnPropertyNames(originalMock).forEach(prop => {
        if (prop !== 'length' && prop !== 'name') {
          try {
            Object.defineProperty(newMock, prop, Object.getOwnPropertyDescriptor(originalMock, prop)!);
          } catch (e) {
            // Ignore errors for non-configurable properties
          }
        }
      });
      return newMock;
    },
    
    mockImplementationOnce: (impl: (...args: any[]) => any) => {
      const originalMock = mockFn;
      const newMock = mock(impl);
      // Copy properties
      Object.getOwnPropertyNames(originalMock).forEach(prop => {
        if (prop !== 'length' && prop !== 'name') {
          try {
            Object.defineProperty(newMock, prop, Object.getOwnPropertyDescriptor(originalMock, prop)!);
          } catch (e) {
            // Ignore errors for non-configurable properties
          }
        }
      });
      return newMock;
    },
    
    mockReset: () => {
      mockData.calls = [];
      mockData.instances = [];
      mockData.invocationCallOrder = [];
      mockData.results = [];
      mockData.contexts = [];
      return mockFn;
    },
    
    mockClear: () => {
      mockData.calls = [];
      mockData.instances = [];
      mockData.invocationCallOrder = [];
      mockData.results = [];
      mockData.contexts = [];
      return mockFn;
    },
    
    mockRestore: () => {
      return mockFn;
    }
  };
  
  // Add all mock methods to the function
  Object.entries(mockMethods).forEach(([key, value]) => {
    Object.defineProperty(mockFn, key, {
      value,
      configurable: true,
      writable: true
    });
  });
  
  // Add to global mocks collection for management
  allMocks.push(mockFn);
  
  return mockFn;
}

// Mock module cache for jest.mock
const mockedModules = new Map<string, any>();

// Create a module interceptor
const originalRequire = require;
const moduleCache = new Map<string, any>();

// Override the require function to intercept module imports
(global as any).require = function(id: string) {
  // Check if this module is mocked
  if (mockedModules.has(id)) {
    return mockedModules.get(id);
  }
  
  // Check for path aliases
  for (const [alias, relativePath] of Object.entries(pathAliases)) {
    if (id.startsWith(alias)) {
      const resolvedId = id.replace(alias, relativePath);
      if (mockedModules.has(resolvedId)) {
        return mockedModules.get(resolvedId);
      }
    }
  }
  
  // Fall back to original require
  return originalRequire(id);
};

// Define Jest global object
(global as any).jest = {
  // Mock creation
  fn: createMockFunction,
  spyOn: (obj: any, method: string) => {
    const original = obj[method];
    obj[method] = createMockFunction();
    obj[method].mockRestore = () => {
      obj[method] = original;
    };
    return obj[method];
  },
  
  // Mock modules
  mock: (moduleName: string, factory?: () => any) => {
    console.log(`Mock registered for ${moduleName}`);
    
    // Convert path aliases if present
    let resolvedModuleName = moduleName;
    for (const [alias, relativePath] of Object.entries(pathAliases)) {
      if (moduleName.startsWith(alias)) {
        resolvedModuleName = moduleName.replace(alias, relativePath);
        break;
      }
    }
    
    // Create the mock module
    const mockModule = factory ? factory() : {};
    
    // Add mock functions for common methods
    if (typeof mockModule === 'object' && mockModule !== null) {
      Object.entries(mockModule).forEach(([key, value]) => {
        if (typeof value === 'function' && !(value as any).mock) {
          mockModule[key] = createMockFunction();
        }
      });
    }
    
    // Register the mock module
    mockedModules.set(moduleName, mockModule);
    mockedModules.set(resolvedModuleName, mockModule);
    
    // Clear any cached module
    if (moduleCache.has(moduleName)) {
      moduleCache.delete(moduleName);
    }
    if (moduleCache.has(resolvedModuleName)) {
      moduleCache.delete(resolvedModuleName);
    }
    
    return mockModule;
  },
  
  // Mock management
  resetAllMocks: () => {
    console.log('Resetting all mocks');
    allMocks.forEach(mockFn => mockFn.mockReset());
  },
  
  clearAllMocks: () => {
    console.log('Clearing all mocks');
    allMocks.forEach(mockFn => mockFn.mockClear());
  },
  
  restoreAllMocks: () => {
    console.log('Restoring all mocks');
    allMocks.forEach(mockFn => mockFn.mockRestore());
  },
  
  // Expect extensions - initialize if not already defined
  expect: (global as any).expect || (() => {})
};

// Make sure global.expect exists before adding to it
if (!(global as any).expect) {
  (global as any).expect = () => ({});
}

// Add expect matchers
const expectExtensions = {
  any: (constructor: any) => {
    return { asymmetricMatch: (actual: any) => actual instanceof constructor };
  },
  
  anything: () => {
    return { asymmetricMatch: () => true };
  },
  
  stringContaining: (substring: string) => {
    return {
      asymmetricMatch: (actual: any) =>
        typeof actual === 'string' && actual.includes(substring)
    };
  },
  
  objectContaining: (expectedObj: object) => {
    return {
      asymmetricMatch: (actual: any) => {
        for (const [key, value] of Object.entries(expectedObj)) {
          if (actual[key] !== value) return false;
        }
        return true;
      }
    };
  }
};

// Add the extensions to expect
Object.entries(expectExtensions).forEach(([key, value]) => {
  Object.defineProperty((global as any).expect, key, {
    value,
    configurable: true,
    writable: true
  });
});

// Add Jest assertion methods
const originalExpect = (global as any).expect;
(global as any).expect = (actual: any) => {
  const expectResult = originalExpect(actual);
  
  // Add toHaveBeenCalledWith matcher
  expectResult.toHaveBeenCalledWith = (...expectedArgs: any[]) => {
    if (!actual || !actual.mock || !Array.isArray(actual.mock.calls)) {
      throw new Error('toHaveBeenCalledWith can only be used on jest.fn(), jest.spyOn(), or mock functions');
    }
    
    const pass = actual.mock.calls.some((callArgs: any[]) => {
      if (callArgs.length !== expectedArgs.length) return false;
      
      return callArgs.every((arg, index) => {
        const expectedArg = expectedArgs[index];
        
        // Handle asymmetric matchers
        if (expectedArg && typeof expectedArg === 'object' && typeof expectedArg.asymmetricMatch === 'function') {
          return expectedArg.asymmetricMatch(arg);
        }
        
        // Deep equality check
        return JSON.stringify(arg) === JSON.stringify(expectedArg);
      });
    });
    
    if (!pass) {
      throw new Error(`Expected mock function to have been called with:\n${JSON.stringify(expectedArgs)}\nBut it was called with:\n${JSON.stringify(actual.mock.calls)}`);
    }
    
    return { pass };
  };
  
  // Add not.toHaveBeenCalled matcher
  if (!expectResult.not) {
    expectResult.not = {};
  }
  
  expectResult.not.toHaveBeenCalled = () => {
    if (!actual || !actual.mock || !Array.isArray(actual.mock.calls)) {
      throw new Error('toHaveBeenCalled can only be used on jest.fn(), jest.spyOn(), or mock functions');
    }
    
    const pass = actual.mock.calls.length === 0;
    
    if (!pass) {
      throw new Error(`Expected mock function not to have been called, but it was called ${actual.mock.calls.length} times`);
    }
    
    return { pass };
  };
  
  // Add toHaveBeenCalled matcher
  expectResult.toHaveBeenCalled = () => {
    if (!actual || !actual.mock || !Array.isArray(actual.mock.calls)) {
      throw new Error('toHaveBeenCalled can only be used on jest.fn(), jest.spyOn(), or mock functions');
    }
    
    const pass = actual.mock.calls.length > 0;
    
    if (!pass) {
      throw new Error('Expected mock function to have been called, but it was not called');
    }
    
    return { pass };
  };
  
  return expectResult;
};

// Path alias resolver for imports
const resolvePathAlias = (importPath: string): string => {
  for (const [alias, relativePath] of Object.entries(pathAliases)) {
    if (importPath.startsWith(alias)) {
      return importPath.replace(alias, relativePath);
    }
  }
  return importPath;
};

// Register path alias resolver
(global as any).__resolvePathAlias = resolvePathAlias;

// Add a simple type definition for Jest.Mock that doesn't conflict with existing types
// We're not exporting this type, just using it to help TypeScript understand the code
type JestMock = ReturnType<typeof createMockFunction>;

console.log("Jest compatibility layer set up successfully");