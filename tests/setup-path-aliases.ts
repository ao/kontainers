/**
 * Path Alias Setup for Bun Tests
 *
 * This file is preloaded by Bun to set up path aliases for tests.
 * It provides:
 * 1. Path alias resolution for imports
 * 2. Jest compatibility layer for easier test migration
 * 3. Module interception for mocking
 */

import { mock } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';

console.log("Setting up path aliases and Jest compatibility layer for tests...");

// Get the project root directory
const projectRoot = path.resolve('.');

// Define path alias mappings with absolute paths for better reliability
const pathAliases = {
  '@frontend/': path.join(projectRoot, 'frontend/src/'),
  '@backend/': path.join(projectRoot, 'backend/src/'),
  '@shared/': path.join(projectRoot, 'shared/src/'),
  '@/': path.join(projectRoot, 'frontend/src/'),
  '@tests/': path.join(projectRoot, 'tests/')
};

// Verify that all path alias directories exist
Object.entries(pathAliases).forEach(([alias, dirPath]) => {
  if (!fs.existsSync(dirPath)) {
    console.warn(`Warning: Path alias ${alias} points to non-existent directory: ${dirPath}`);
  }
});

// Store all created mocks for global management
const allMocks: any[] = [];

/**
 * Creates a mock function compatible with Jest's mock API
 */
// Define the MockFunction interface
interface MockFunction extends ReturnType<typeof mock> {
  originalMethod?: (...args: any[]) => any;
  spyTarget?: {
    obj: any;
    methodName: string;
  };
  mock: {
    calls: any[][];
    instances: any[];
    invocationCallOrder: number[];
    results: any[];
    contexts: any[];
    onceValues?: any[];
    onceImplementations?: Array<(...args: any[]) => any>;
    defaultImpl?: (...args: any[]) => any;
  };
}

function createMockFunction(): MockFunction {
  // Create a mock object that will store the mock data
  const mockData: {
    calls: any[][];
    instances: any[];
    invocationCallOrder: number[];
    results: any[];
    contexts: any[];
    onceValues?: any[];
    onceImplementations?: Array<(...args: any[]) => any>;
    defaultImpl?: (...args: any[]) => any;
  } = {
    calls: [],
    instances: [],
    invocationCallOrder: [],
    results: [],
    contexts: []
  };
  
  // Create a wrapper function that tracks calls
  // Create a wrapper function that tracks calls and handles the mock implementation
  const mockFn = mock(function mockImplementation(...args: any[]) {
    // Track the call
    mockData.calls.push(args);
    mockData.invocationCallOrder.push(Date.now());
    
    // If we have queued values, use the next one
    if (mockData.onceValues && mockData.onceValues.length > 0) {
      return mockData.onceValues.shift();
    }
    
    // If we have queued implementations, use the next one
    if (mockData.onceImplementations && mockData.onceImplementations.length > 0) {
      const impl = mockData.onceImplementations.shift();
      if (impl) {
        return impl(...args);
      }
    }
    
    // Otherwise use the default implementation if available
    if (mockData.defaultImpl) {
      return mockData.defaultImpl(...args);
    }
    
    return undefined; // Default return value
  });
  
  // Add mock property
  Object.defineProperty(mockFn, 'mock', {
    get: () => mockData,
    configurable: true
  });
  
  // Define mock methods
  const mockMethods = {
    mockReturnValue: (val: any) => {
      // Store the default implementation
      mockData.defaultImpl = () => val;
      
      // Return the original mock function for chaining
      return mockFn;
    },
    
    mockReturnValueOnce: (val: any) => {
      // Initialize onceValues array if it doesn't exist
      if (!mockData.onceValues) {
        mockData.onceValues = [];
      }
      
      // Add the value to the queue
      mockData.onceValues.push(val);
      
      // Return the original mock function for chaining
      return mockFn;
    },
    
    mockImplementation: (impl: (...args: any[]) => any) => {
      // Store the default implementation
      mockData.defaultImpl = impl;
      
      // Return the original mock function for chaining
      return mockFn;
    },
    
    mockImplementationOnce: (impl: (...args: any[]) => any) => {
      // Initialize onceImplementations array if it doesn't exist
      if (!mockData.onceImplementations) {
        mockData.onceImplementations = [];
      }
      
      // Add the implementation to the queue
      mockData.onceImplementations.push(impl);
      
      // Return the original mock function for chaining
      return mockFn;
    },
    
    mockReset: () => {
      mockData.calls = [];
      mockData.instances = [];
      mockData.invocationCallOrder = [];
      mockData.results = [];
      mockData.contexts = [];
      mockData.onceValues = [];
      mockData.onceImplementations = [];
      mockData.defaultImpl = undefined;
      return mockFn;
    },
    
    mockClear: () => {
      // Clear call history but preserve implementations
      mockData.calls = [];
      mockData.invocationCallOrder = [];
      return mockFn;
    },
    
    mockRestore: function(this: MockFunction) {
      // If this is a spy, restore the original method
      // Using 'this' instead of typedMockFn to support overriding mockRestore
      if (this.originalMethod) {
        // Actually restore the method if this is called directly
        const original = this.originalMethod;
        
        // If we have the spy target information, restore the original method
        if (this.spyTarget) {
          const { obj, methodName } = this.spyTarget;
          obj[methodName] = original;
        }
        
        return original;
      }
      return this;
    },
    
    // Helper method to check if this mock is a spy
    isSpy: function(this: MockFunction): boolean {
      return !!(this.originalMethod && this.spyTarget);
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

/**
 * Path alias resolver for imports
 * Converts aliased paths to actual file system paths
 */
/**
 * Path alias resolver for imports
 * Converts aliased paths to actual file system paths
 *
 * Enhanced with:
 * 1. Path normalization
 * 2. Improved alias sorting for better prioritization
 * 3. Ambiguous path detection
 * 4. Better edge case handling
 */
/**
 * Normalizes a path for consistent handling
 * - Converts backslashes to forward slashes
 * - Trims whitespace
 * - Handles null/undefined values
 * - Removes duplicate slashes
 * - Preserves trailing slash if present
 */
function normalizePath(path: string): string {
  if (!path) return '';
  
  // Convert backslashes to forward slashes and trim whitespace
  let normalized = path.replace(/\\/g, '/').trim();
  
  // Remove duplicate slashes (except for protocol like http://)
  normalized = normalized.replace(/([^:])\/+/g, '$1/');
  
  // Handle special case for absolute paths that might start with multiple slashes
  if (normalized.startsWith('//') && !normalized.startsWith('///')) {
    // Keep network paths (UNC paths) intact
    // Do nothing
  } else {
    // Normalize other paths with multiple leading slashes
    normalized = normalized.replace(/^\/+/, '/');
  }
  
  return normalized;
}

const resolvePathAlias = (importPath: string): string => {
  // Handle edge cases
  if (!importPath) return '';
  
  // Normalize path - ensure consistent format
  const normalizedPath = normalizePath(importPath);
  if (!normalizedPath) return '';
  
  // Handle absolute paths that don't need alias resolution
  if (normalizedPath.startsWith('/') ||
      /^[a-zA-Z]:[\\\/]/.test(normalizedPath) || // Windows drive letter
      normalizedPath.startsWith('\\\\') || // Windows UNC path
      /^[a-zA-Z]+:\/\//.test(normalizedPath)) { // URL with protocol
    return normalizedPath;
  }
  
  // Create a scoring system for aliases to handle ambiguous paths better
  // This ensures more specific aliases are prioritized over generic ones
  const scoredAliases = Object.entries(pathAliases).map(([alias, absolutePath]) => {
    // Base score is the alias length (longer is more specific)
    let score = alias.length * 10;
    
    // Bonus for more segments in the path (more specific)
    const segmentCount = alias.split('/').filter(Boolean).length;
    score += segmentCount * 5;
    
    // Bonus for more specific prefixes
    if (alias.startsWith('@frontend/')) {
      score += 20; // Higher priority for frontend-specific paths
    } else if (alias.startsWith('@backend/')) {
      score += 20; // Higher priority for backend-specific paths
    } else if (alias.startsWith('@shared/')) {
      score += 20; // Higher priority for shared-specific paths
    } else if (alias.startsWith('@tests/')) {
      score += 20; // Higher priority for test-specific paths
    }
    
    // Penalty for generic aliases like '@/'
    if (alias === '@/') {
      score -= 15;
    }
    
    // Additional penalty for shorter aliases that might cause ambiguity
    if (alias.length <= 3) {
      score -= 10;
    }
    
    // Exact match bonus (highest priority)
    if (normalizedPath === alias) {
      score += 1000;
    }
    
    return { alias, absolutePath, score };
  });
  
  // Sort by score in descending order (higher score = more specific)
  const sortedAliases = scoredAliases.sort((a, b) => {
    // First sort by score
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) return scoreDiff;
    
    // If scores are equal, prefer longer aliases
    const lengthDiff = b.alias.length - a.alias.length;
    if (lengthDiff !== 0) return lengthDiff;
    
    // If lengths are equal, prefer more specific paths (more segments)
    const aSegments = a.alias.split('/').filter(Boolean).length;
    const bSegments = b.alias.split('/').filter(Boolean).length;
    return bSegments - aSegments;
  });
  
  // Check for potential ambiguous paths
  const matchingAliases = sortedAliases.filter(({ alias }) => {
    // Skip empty aliases
    if (!alias) return false;
    
    // Exact match is always valid
    if (normalizedPath === alias) return true;
    
    // Only match if the path starts with the alias
    if (!normalizedPath.startsWith(alias)) return false;
    
    // Additional check: ensure we're matching at a path boundary
    // This prevents partial segment matches (e.g., '@front' shouldn't match '@frontend/')
    const nextChar = normalizedPath.charAt(alias.length);
    
    // Valid boundaries: end of string, path separator, or alias already ends with separator
    const isValidBoundary = nextChar === '' || nextChar === '/' || alias.endsWith('/');
    
    return isValidBoundary;
  });
  
  // If we have multiple potential matches, log a warning (but still use the highest scored one)
  if (matchingAliases.length > 1) {
    console.warn(`Warning: Ambiguous path alias resolution for '${normalizedPath}'. ` +
      `Multiple aliases could match: ${matchingAliases.map(m => m.alias).join(', ')}. ` +
      `Using '${matchingAliases[0].alias}' based on specificity scoring.`);
  }
  
  // Apply the best matching alias if any
  if (matchingAliases.length > 0) {
    const { alias, absolutePath } = matchingAliases[0];
    
    // Handle exact match case
    if (normalizedPath === alias) {
      return absolutePath;
    }
    
    // Ensure proper path joining to avoid double slashes or missing slashes
    let relativePath = normalizedPath.substring(alias.length);
    
    // If the alias doesn't end with a slash and the relative path doesn't start with one,
    // we need to add a slash between them
    if (!alias.endsWith('/') && !relativePath.startsWith('/') && relativePath.length > 0) {
      relativePath = '/' + relativePath;
    }
    
    // If both have slashes, remove one
    if (alias.endsWith('/') && relativePath.startsWith('/')) {
      relativePath = relativePath.substring(1);
    }
    
    // Handle special case for node_modules imports
    if (relativePath.includes('node_modules/')) {
      // For node_modules imports, we should use the original path
      return normalizedPath;
    }
    
    // Ensure we don't have any double slashes in the final path
    const resolved = normalizePath(absolutePath + relativePath);
    return resolved;
  }
  
  // Handle node_modules imports directly
  if (normalizedPath.startsWith('node_modules/') ||
      normalizedPath.includes('/node_modules/')) {
    return normalizedPath;
  }
  
  // No alias matched, return the normalized path
  return normalizedPath;
};

// Register path alias resolver globally
(global as any).__resolvePathAlias = resolvePathAlias;

// Create a module interceptor that works with ESM
const originalLoader = (global as any).__bun_resolve;
if (originalLoader) {
  (global as any).__bun_resolve = function(id: string, parent: string) {
    // Create an array of possible module identifiers to check
    const possibleIds = new Set<string>();
    
    // Add the original ID
    possibleIds.add(id);
    
    // Add normalized version of the ID
    const normalizedId = normalizePath(id);
    if (normalizedId !== id) {
      possibleIds.add(normalizedId);
    }
    
    // Add resolved path alias version
    const resolvedId = resolvePathAlias(id);
    if (resolvedId !== id) {
      possibleIds.add(resolvedId);
    }
    
    // Add normalized version of resolved path
    const normalizedResolvedId = normalizePath(resolvedId);
    if (normalizedResolvedId !== resolvedId && normalizedResolvedId !== id) {
      possibleIds.add(normalizedResolvedId);
    }
    
    // Add resolved version of normalized ID
    const resolvedNormalizedId = resolvePathAlias(normalizedId);
    if (resolvedNormalizedId !== normalizedId &&
        resolvedNormalizedId !== id &&
        resolvedNormalizedId !== resolvedId) {
      possibleIds.add(resolvedNormalizedId);
    }
    
    // Handle parent-relative paths
    if (parent && id.startsWith('.')) {
      const parentDir = path.dirname(parent);
      const absolutePath = path.resolve(parentDir, id);
      possibleIds.add(absolutePath);
      possibleIds.add(normalizePath(absolutePath));
    }
    
    // Check all possible IDs for mocks
    for (const possibleId of possibleIds) {
      if (mockedModules.has(possibleId)) {
        return { path: possibleId, module: mockedModules.get(possibleId) };
      }
    }
    
    // Fall back to original loader
    return originalLoader(id, parent);
  };
}

// Define Jest global object for compatibility
(global as any).jest = {
  // Mock creation
  fn: createMockFunction,
  spyOn: (obj: any, method: string) => {
    const original = obj[method];
    const spy = createMockFunction() as MockFunction;
    
    // Make spy properties writable and configurable
    Object.defineProperty(spy, 'originalMethod', {
      value: original,
      writable: true,
      configurable: true
    });
    
    // Store the object and method name for the general mockRestore method
    Object.defineProperty(spy, 'spyTarget', {
      value: {
        obj,
        methodName: method
      },
      writable: true,
      configurable: true
    });
    
    obj[method] = spy;
    
    // Define mockRestore to actually restore the original method
    // This will override the general mockRestore method
    const originalMockRestore = function(this: MockFunction) {
      // Make sure we're operating on the correct object
      if (this.spyTarget) {
        const { obj, methodName } = this.spyTarget;
        obj[methodName] = original;
      }
      return original;
    };

    // Store a reference to the original mockRestore method
    // This is needed to handle cases where mockRestore is overridden
    (spy as any)._originalMockRestore = originalMockRestore;
    
    // Assign the mockRestore method using Object.defineProperty to make it writable and configurable
    Object.defineProperty(spy, 'mockRestore', {
      value: originalMockRestore,
      writable: true,
      configurable: true
    });
    
    // Mark this mock as a spy for easier identification
    (spy as any).isSpy = function() {
      return true;
    };
    
    return spy;
  },
  
  // Mock modules
  mock: (moduleName: string, factory?: () => any) => {
    console.log(`Mock registered for ${moduleName}`);
    
    // Normalize the module name for consistent handling
    const normalizedModuleName = normalizePath(moduleName);
    
    // Convert path aliases if present
    const resolvedModuleName = resolvePathAlias(normalizedModuleName);
    
    // Create the mock module
    let factoryResult: any = undefined;
    
    // If factory is provided, get its result
    if (factory) {
      factoryResult = factory();
    }
    
    // Handle different return types from factory function
    let mockModule: any;
    
    if (factory) {
      if (factoryResult === undefined || factoryResult === null) {
        // For undefined or null, create an empty object for mocking
        mockModule = {};
      } else if (typeof factoryResult !== 'object') {
        // For primitive return values (string, number, boolean),
        // wrap in an object with a default property
        mockModule = { default: factoryResult };
      } else {
        // For object return values, use as is
        mockModule = factoryResult;
      }
    } else {
      // If no factory is provided, create an auto-mocking proxy
      mockModule = new Proxy<Record<string, any>>({}, {
        get: (target: Record<string, any>, prop: string | symbol) => {
          const key = prop.toString();
          if (!(key in target)) {
            // Auto-create mock functions for accessed properties
            target[key] = createMockFunction();
          }
          return target[key];
        }
      });
    }
    
    // Add mock functions for common methods if it's an object
    if (typeof mockModule === 'object' && mockModule !== null) {
      Object.entries(mockModule).forEach(([key, value]) => {
        if (typeof value === 'function' && !(value as any).mock) {
          mockModule[key] = createMockFunction();
        }
      });
    }
    
    // Register the mock module with all possible path variations for better resolution
    // Original module name
    mockedModules.set(moduleName, mockModule);
    
    // Normalized module name
    if (normalizedModuleName !== moduleName) {
      mockedModules.set(normalizedModuleName, mockModule);
    }
    
    // Resolved module name
    if (resolvedModuleName !== moduleName && resolvedModuleName !== normalizedModuleName) {
      mockedModules.set(resolvedModuleName, mockModule);
    }
    
    // Normalized resolved module name
    const normalizedResolvedModuleName = normalizePath(resolvedModuleName);
    if (normalizedResolvedModuleName !== resolvedModuleName &&
        normalizedResolvedModuleName !== moduleName &&
        normalizedResolvedModuleName !== normalizedModuleName) {
      mockedModules.set(normalizedResolvedModuleName, mockModule);
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
    
    // Identify spies more robustly - check for both function and property implementations of isSpy
    const spies = allMocks.filter(mockFn => {
      // Check if it's a spy by either:
      // 1. Having an isSpy function that returns true
      // 2. Having an isSpy property that is true
      // 3. Having both originalMethod and spyTarget properties
      return (typeof mockFn.isSpy === 'function' && mockFn.isSpy()) ||
             (typeof mockFn.isSpy === 'boolean' && mockFn.isSpy) ||
             (mockFn.originalMethod && mockFn.spyTarget);
    });
    
    // All mocks that are not spies are regular mocks
    const regularMocks = allMocks.filter(mockFn => {
      return !((typeof mockFn.isSpy === 'function' && mockFn.isSpy()) ||
               (typeof mockFn.isSpy === 'boolean' && mockFn.isSpy) ||
               (mockFn.originalMethod && mockFn.spyTarget));
    });
    
    // Restore spies first
    spies.forEach(spy => {
      try {
        // First try to use the _originalMockRestore if available
        if (typeof (spy as any)._originalMockRestore === 'function') {
          (spy as any)._originalMockRestore.call(spy);
        }
        // Then try the standard mockRestore
        else if (typeof spy.mockRestore === 'function') {
          spy.mockRestore.call(spy);
        }
        // If neither is available but we have spyTarget and originalMethod, restore manually
        else if (spy.spyTarget && spy.originalMethod) {
          const { obj, methodName } = spy.spyTarget;
          obj[methodName] = spy.originalMethod;
        }
      } catch (e: any) {
        console.error(`Error restoring spy: ${e.message}`);
      }
    });
    
    // Then reset regular mocks (not restore, since they don't have an original implementation)
    regularMocks.forEach(mockFn => {
      try {
        if (typeof mockFn.mockReset === 'function') {
          mockFn.mockReset();
        }
      } catch (e: any) {
        console.error(`Error resetting mock: ${e.message}`);
      }
    });
    
    return true; // Return true to indicate success, matching Jest's behavior
  },
  
  // Expect extensions - initialize if not already defined
  expect: (global as any).expect || (() => {})
};

// Make sure global.expect exists before adding to it
if (!(global as any).expect) {
  (global as any).expect = () => ({});
}

// Define asymmetric matcher interface
interface AsymmetricMatcher {
  asymmetricMatch: (actual: any) => boolean;
  toString: () => string;
}

// Add expect matchers
const expectExtensions = {
  any: (constructor: any): AsymmetricMatcher => {
    return {
      asymmetricMatch: (actual: any): boolean => {
        try {
          // Handle null and undefined explicitly
          if (actual === null || actual === undefined) {
            return false;
          }
          
          // Check if it's an instance of the constructor
          if (actual instanceof constructor) {
            return true;
          }
          
          // Handle primitive types more explicitly
          if (constructor === Number && typeof actual === 'number') {
            return true;
          }
          if (constructor === String && typeof actual === 'string') {
            return true;
          }
          if (constructor === Boolean && typeof actual === 'boolean') {
            return true;
          }
          if (constructor === Object && typeof actual === 'object') {
            return true;
          }
          if (constructor === Function && typeof actual === 'function') {
            return true;
          }
          
          // Try to compare types as a fallback
          return typeof actual === typeof constructor();
        } catch (e) {
          // If constructor() throws, fall back to instanceof check
          return actual instanceof constructor;
        }
      },
      toString: (): string => `expect.any(${constructor.name || 'CustomType'})`
    };
  },
  
  anything: (): AsymmetricMatcher => {
    return {
      asymmetricMatch: (actual: any): boolean => {
        // anything matches everything except null and undefined
        return actual !== null && actual !== undefined;
      },
      toString: (): string => 'expect.anything()'
    };
  },
  
  stringContaining: (substring: string): AsymmetricMatcher => {
    return {
      asymmetricMatch: (actual: any): boolean =>
        typeof actual === 'string' && actual.includes(substring),
      toString: (): string => `expect.stringContaining('${substring}')`
    };
  },
  
  objectContaining: (expectedObj: object): AsymmetricMatcher => {
    return {
      asymmetricMatch: (actual: any): boolean => {
        if (actual === null || actual === undefined) return false;
        if (typeof actual !== 'object') return false;
        
        // Deep comparison for nested objects
        for (const [key, value] of Object.entries(expectedObj)) {
          // Check if the key exists in actual
          if (!(key in actual) && value !== undefined) return false;
          
          // Handle null values
          if (value === null) {
            if (actual[key] !== null) return false;
          }
          // Handle asymmetric matchers at any level
          else if (value && typeof value === 'object' && typeof value.asymmetricMatch === 'function') {
            if (!value.asymmetricMatch(actual[key])) return false;
          }
          // Handle functions that return asymmetric matchers
          else if (typeof value === 'function' &&
                  (value.name === 'anything' || value.name === 'any' ||
                   value.name === 'stringContaining' || value.name === 'objectContaining')) {
            try {
              const matcher = value();
              if (matcher && typeof matcher.asymmetricMatch === 'function') {
                if (!matcher.asymmetricMatch(actual[key])) return false;
              }
            } catch (e) {
              // If calling the function fails, continue with normal comparison
              if (actual[key] !== value) return false;
            }
          }
          // Handle nested objects recursively
          else if (value && typeof value === 'object' && value !== null) {
            if (!actual[key] || typeof actual[key] !== 'object' ||
                !expectExtensions.objectContaining(value).asymmetricMatch(actual[key])) {
              return false;
            }
          }
          // Handle primitive values
          else if (actual[key] !== value) {
            return false;
          }
        }
        return true;
      },
      toString: (): string => `expect.objectContaining(${JSON.stringify(expectedObj)})`
    };
  }
};

// Add the extensions to expect
Object.entries(expectExtensions).forEach(([key, value]) => {
  (global as any).expect[key] = value;
});

// Add Jest assertion methods to expect
const originalExpect = (global as any).expect;
(global as any).expect = (actual: any) => {
  const expectResult = originalExpect(actual);
  
  // Add toHaveBeenCalledWith matcher
  expectResult.toHaveBeenCalledWith = (...expectedArgs: any[]) => {
    // Improved type checking for mock functions
    if (!actual) {
      throw new Error(
        'Error: expect(...).toHaveBeenCalledWith(...)\n\n' +
        'toHaveBeenCalledWith cannot be used on a null or undefined value.\n' +
        'Received: ' + (actual === null ? 'null' : 'undefined') + '\n\n' +
        'Did you forget to create a mock function with jest.fn() or jest.spyOn()?'
      );
    }
    
    if (typeof actual !== 'function') {
      throw new Error(
        'Error: expect(...).toHaveBeenCalledWith(...)\n\n' +
        'toHaveBeenCalledWith can only be used on functions.\n' +
        `Received: ${typeof actual} (${JSON.stringify(actual)})\n\n` +
        'Did you forget to create a mock function with jest.fn() or jest.spyOn()?'
      );
    }
    
    if (!actual.mock || !Array.isArray(actual.mock.calls)) {
      const fnName = actual.name ? `"${actual.name}"` : 'anonymous';
      throw new Error(
        'Error: expect(...).toHaveBeenCalledWith(...)\n\n' +
        'toHaveBeenCalledWith can only be used on jest.fn(), jest.spyOn(), or mock functions.\n' +
        `Received: function ${fnName} without mock property\n\n` +
        'Did you forget to create a mock function with jest.fn() or jest.spyOn()?'
      );
    }
    
    // Helper function for deep equality
    function deepEqual(a: any, b: any): boolean {
      // Check if either value is an asymmetric matcher - this needs to be first
      // to handle cases where the matcher itself can match null/undefined
      if (b && typeof b === 'object' && typeof b.asymmetricMatch === 'function') {
        return b.asymmetricMatch(a);
      }
      
      // Handle functions that return asymmetric matchers (like expect.anything())
      if (typeof b === 'function' &&
          (b.name === 'anything' || b.name === 'any' ||
           b.name === 'stringContaining' || b.name === 'objectContaining')) {
        try {
          const matcher = b();
          if (matcher && typeof matcher.asymmetricMatch === 'function') {
            return matcher.asymmetricMatch(a);
          }
        } catch (e) {
          // If calling the function fails, continue with normal comparison
        }
      }
      
      if (a === b) return true;
      
      // Handle null and undefined after checking for matchers
      if (a === null || b === null) return a === b;
      if (a === undefined || b === undefined) return a === b;
      
      if (typeof a !== 'object' || typeof b !== 'object')
        return a === b;
      
      if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
          if (!deepEqual(a[i], b[i])) return false;
        }
        return true;
      }
      
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);
      
      if (aKeys.length !== bKeys.length) return false;
      
      for (const key of aKeys) {
        if (!bKeys.includes(key)) return false;
        if (!deepEqual(a[key], b[key])) return false;
      }
      
      return true;
    }

    const pass = actual.mock.calls.some((callArgs: any[]) => {
      if (callArgs.length !== expectedArgs.length) return false;
      
      return callArgs.every((arg, index) => {
        const expectedArg = expectedArgs[index];
        
        // Handle asymmetric matchers directly
        if (expectedArg && typeof expectedArg === 'object' && typeof expectedArg.asymmetricMatch === 'function') {
          return expectedArg.asymmetricMatch(arg);
        }
        
        // Handle functions that return asymmetric matchers
        if (typeof expectedArg === 'function' &&
            (expectedArg.name === 'anything' || expectedArg.name === 'any' ||
             expectedArg.name === 'stringContaining' || expectedArg.name === 'objectContaining')) {
          try {
            const matcher = expectedArg();
            if (matcher && typeof matcher.asymmetricMatch === 'function') {
              return matcher.asymmetricMatch(arg);
            }
          } catch (e) {
            // If calling the function fails, continue with normal comparison
          }
        }
        
        // Better deep equality check that handles asymmetric matchers, circular references, functions, etc.
        return deepEqual(arg, expectedArg);
      });
    });
    
    if (!pass) {
      // Get function name if available
      const fnName = actual.getMockName && actual.getMockName() !== 'jest.fn()'
        ? actual.getMockName()
        : 'mock function';
      
      // Format expected arguments with enhanced handling for asymmetric matchers and complex objects
      const expectedStr = expectedArgs.map((arg: any) => {
        if (arg === undefined) return 'undefined';
        if (arg === null) return 'null';
        
        if (arg && typeof arg === 'object') {
          // Handle asymmetric matchers
          if (typeof arg.asymmetricMatch === 'function' && typeof arg.toString === 'function') {
            return arg.toString();
          }
          
          // Handle objects with custom toString methods
          if (typeof arg.toString === 'function' && arg.toString !== Object.prototype.toString) {
            return arg.toString();
          }
          
          try {
            // Improved JSON stringification with special handling for asymmetric matchers
            return JSON.stringify(arg, (key, value) => {
              if (value && typeof value === 'object' && typeof value.asymmetricMatch === 'function') {
                return value.toString();
              }
              return value;
            }, 2); // Add indentation for better readability
          } catch (e) {
            return String(arg);
          }
        }
        
        // Format primitives
        if (typeof arg === 'string') return `"${arg}"`;
        if (typeof arg === 'function') return `Function ${arg.name || 'anonymous'}`;
        return JSON.stringify(arg);
      }).join(', ');
      
      // Format actual calls with enhanced readability and consistent formatting
      const actualCalls = actual.mock.calls.map((call: any[], callIndex: number) => {
        const callArgs = call.map((arg: any) => {
          if (arg === undefined) return 'undefined';
          if (arg === null) return 'null';
          
          if (arg && typeof arg === 'object') {
            try {
              // Handle asymmetric matchers in actual calls too
              if (typeof arg.asymmetricMatch === 'function' && typeof arg.toString === 'function') {
                return arg.toString();
              }
              
              return JSON.stringify(arg, (key, value) => {
                if (value && typeof value === 'object' && typeof value.asymmetricMatch === 'function') {
                  return value.toString();
                }
                return value;
              }, 2);
            } catch (e) {
              return String(arg);
            }
          }
          
          // Format primitives consistently
          if (typeof arg === 'string') return `"${arg}"`;
          if (typeof arg === 'function') return `Function ${arg.name || 'anonymous'}`;
          return JSON.stringify(arg);
        }).join(', ');
        
        return `  ${callIndex + 1}. [${callArgs}]`;
      }).join('\n');
      
      // Create a visual diff for each argument
      const diffLines: string[] = [];
      
      // Find the closest matching call for better diff
      let bestMatchCallIndex = 0;
      let bestMatchScore = -1;
      
      actual.mock.calls.forEach((call: any[], idx: number) => {
        let matchScore = 0;
        const minLength = Math.min(call.length, expectedArgs.length);
        
        for (let i = 0; i < minLength; i++) {
          if (deepEqual(call[i], expectedArgs[i])) {
            matchScore++;
          }
        }
        
        if (matchScore > bestMatchScore) {
          bestMatchScore = matchScore;
          bestMatchCallIndex = idx;
        }
      });
      
      // Generate diff for the best matching call
      if (actual.mock.calls.length > 0) {
        const bestCall = actual.mock.calls[bestMatchCallIndex];
        diffLines.push(`\nDiff (comparing with call #${bestMatchCallIndex + 1}):`);
        
        const maxArgs = Math.max(bestCall.length, expectedArgs.length);
        
        for (let i = 0; i < maxArgs; i++) {
          const actualArg = i < bestCall.length ? bestCall[i] : undefined;
          const expectedArg = i < expectedArgs.length ? expectedArgs[i] : undefined;
          
          if (i >= bestCall.length) {
            diffLines.push(`  [${i}] Expected: ${formatValue(expectedArg)}`);
            diffLines.push(`      Actual: undefined (missing argument)`);
          } else if (i >= expectedArgs.length) {
            diffLines.push(`  [${i}] Expected: undefined (unexpected argument)`);
            diffLines.push(`      Actual: ${formatValue(actualArg)}`);
          } else if (!deepEqual(actualArg, expectedArg)) {
            diffLines.push(`  [${i}] Expected: ${formatValue(expectedArg)}`);
            diffLines.push(`      Actual: ${formatValue(actualArg)}`);
          }
        }
      }
      
      // Enhanced helper function to format values for diff with better handling of complex objects
      function formatValue(value: any): string {
        if (value === undefined) return 'undefined';
        if (value === null) return 'null';
        
        if (value && typeof value === 'object') {
          // Handle asymmetric matchers
          if (typeof value.asymmetricMatch === 'function' && typeof value.toString === 'function') {
            return value.toString();
          }
          
          try {
            // Use pretty-printing for objects to improve readability
            return JSON.stringify(value, (key, val) => {
              if (val && typeof val === 'object' && typeof val.asymmetricMatch === 'function') {
                return val.toString();
              }
              return val;
            }, 2);
          } catch (e) {
            return String(value);
          }
        }
        
        // Format primitives consistently
        if (typeof value === 'string') return `"${value}"`;
        if (typeof value === 'function') return `Function ${value.name || 'anonymous'}`;
        return String(value);
      }
      
      const callCount = actual.mock.calls.length;
      const callText = callCount === 1 ? '1 time' : `${callCount} times`;
      
      throw new Error(
        `Error: expect(jest.fn()).toHaveBeenCalledWith(...)\n\n` +
        `Expected mock function to have been called with:\n` +
        `  [${expectedStr}]\n\n` +
        `But it was called ${callText} with:\n${actualCalls}` +
        (diffLines.length > 0 ? `\n${diffLines.join('\n')}` : '') +
        `\n\nNumber of calls: ${callCount}` +
        `\nMock name: ${fnName}`
      );
    }
    
    return { pass };
  };
  
  // Add not.toHaveBeenCalled matcher
  if (!expectResult.not) {
    expectResult.not = {};
  }
  
  expectResult.not.toHaveBeenCalled = () => {
    // Improved type checking for mock functions
    if (!actual) {
      throw new Error(
        'Error: expect(...).not.toHaveBeenCalled()\n\n' +
        'not.toHaveBeenCalled cannot be used on a null or undefined value.\n' +
        'Received: ' + (actual === null ? 'null' : 'undefined') + '\n\n' +
        'Did you forget to create a mock function with jest.fn() or jest.spyOn()?'
      );
    }
    
    if (typeof actual !== 'function') {
      throw new Error(
        'Error: expect(...).not.toHaveBeenCalled()\n\n' +
        'not.toHaveBeenCalled can only be used on functions.\n' +
        `Received: ${typeof actual} (${JSON.stringify(actual)})\n\n` +
        'Did you forget to create a mock function with jest.fn() or jest.spyOn()?'
      );
    }
    
    if (!actual.mock || !Array.isArray(actual.mock.calls)) {
      const fnName = actual.name ? `"${actual.name}"` : 'anonymous';
      throw new Error(
        'Error: expect(...).not.toHaveBeenCalled()\n\n' +
        'not.toHaveBeenCalled can only be used on jest.fn(), jest.spyOn(), or mock functions.\n' +
        `Received: function ${fnName} without mock property\n\n` +
        'Did you forget to create a mock function with jest.fn() or jest.spyOn()?'
      );
    }
    
    const pass = actual.mock.calls.length === 0;
    
    if (!pass) {
      // Get function name if available
      const fnName = actual.getMockName && actual.getMockName() !== 'jest.fn()'
        ? actual.getMockName()
        : 'mock function';
      
      // Format actual calls with enhanced readability and consistent formatting
      const actualCalls = actual.mock.calls.map((call: any[], callIndex: number) => {
        const callArgs = call.map((arg: any) => {
          if (arg === undefined) return 'undefined';
          if (arg === null) return 'null';
          
          if (arg && typeof arg === 'object') {
            try {
              // Handle asymmetric matchers in actual calls too
              if (typeof arg.asymmetricMatch === 'function' && typeof arg.toString === 'function') {
                return arg.toString();
              }
              
              return JSON.stringify(arg, (key, val) => {
                if (val && typeof val === 'object' && typeof val.asymmetricMatch === 'function') {
                  return val.toString();
                }
                return val;
              }, 2);
            } catch (e) {
              return String(arg);
            }
          }
          
          // Format primitives consistently
          if (typeof arg === 'string') return `"${arg}"`;
          if (typeof arg === 'function') return `Function ${arg.name || 'anonymous'}`;
          return JSON.stringify(arg);
        }).join(', ');
        
        return `  ${callIndex + 1}. [${callArgs}]`;
      }).join('\n');
      
      const callCount = actual.mock.calls.length;
      const callText = callCount === 1 ? '1 time' : `${callCount} times`;
      
      throw new Error(
        `Error: expect(jest.fn()).not.toHaveBeenCalled()\n\n` +
        `Expected ${fnName} not to have been called, but it was called ${callText} with:\n${actualCalls}\n\n` +
        `Call details:\n` +
        `- Total calls: ${callCount}\n` +
        `- First call: [${actual.mock.calls[0].map((arg: any) => JSON.stringify(arg)).join(', ')}]`
      );
    }
    
    return { pass };
  };
  
  // Add toHaveBeenCalled matcher
  expectResult.toHaveBeenCalled = () => {
    // Improved type checking for mock functions
    if (!actual) {
      throw new Error(
        'Error: expect(...).toHaveBeenCalled()\n\n' +
        'toHaveBeenCalled cannot be used on a null or undefined value.\n' +
        'Received: ' + (actual === null ? 'null' : 'undefined') + '\n\n' +
        'Did you forget to create a mock function with jest.fn() or jest.spyOn()?'
      );
    }
    
    if (typeof actual !== 'function') {
      throw new Error(
        'Error: expect(...).toHaveBeenCalled()\n\n' +
        'toHaveBeenCalled can only be used on functions.\n' +
        `Received: ${typeof actual} (${JSON.stringify(actual)})\n\n` +
        'Did you forget to create a mock function with jest.fn() or jest.spyOn()?'
      );
    }
    
    if (!actual.mock || !Array.isArray(actual.mock.calls)) {
      const fnName = actual.name ? `"${actual.name}"` : 'anonymous';
      throw new Error(
        'Error: expect(...).toHaveBeenCalled()\n\n' +
        'toHaveBeenCalled can only be used on jest.fn(), jest.spyOn(), or mock functions.\n' +
        `Received: function ${fnName} without mock property\n\n` +
        'Did you forget to create a mock function with jest.fn() or jest.spyOn()?'
      );
    }
    
    const pass = actual.mock.calls.length > 0;
    
    if (!pass) {
      // Get function name if available
      const fnName = actual.getMockName && actual.getMockName() !== 'jest.fn()'
        ? actual.getMockName()
        : 'mock function';
      
      throw new Error(
        `Error: expect(jest.fn()).toHaveBeenCalled()\n\n` +
        `Expected ${fnName} to have been called at least once, but it was never called.\n\n` +
        `Mock function details:\n` +
        `- Name: ${actual.getMockName ? actual.getMockName() : 'jest.fn()'}\n` +
        `- Call count: 0`
      );
    }
    
    return { pass };
  };
  
  return expectResult;
};

// Export types for TypeScript
type JestMock = ReturnType<typeof createMockFunction>;

console.log("Path aliases and Jest compatibility layer set up successfully");