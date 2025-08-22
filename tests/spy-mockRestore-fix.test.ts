import { describe, expect, it, jest } from 'bun:test';

describe('Spy mockRestore Fix Test', () => {
  it('should handle overriding mockRestore correctly', () => {
    // Create an object with a method
    const obj = {
      method: () => 'original'
    };
    
    // Create a spy and mock its implementation
    const spy = jest.spyOn(obj, 'method').mockImplementation(() => 'mocked');
    
    // Verify the mock works
    expect(obj.method()).toBe('mocked');
    
    // Store the original mockRestore method
    const originalMockRestore = spy.mockRestore;
    
    // Override mockRestore with a custom implementation using Object.defineProperty
    const customMockRestore = function(this: any) {
      // Call the original mockRestore method with the correct context
      return originalMockRestore.call(this);
    };
    
    Object.defineProperty(spy, 'mockRestore', {
      value: customMockRestore,
      writable: true,
      configurable: true
    });
    
    // Call the overridden mockRestore method
    spy.mockRestore();
    
    // Verify the original method is restored
    expect(obj.method()).toBe('original');
  });
});