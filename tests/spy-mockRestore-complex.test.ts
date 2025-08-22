import { describe, expect, it, jest } from 'bun:test';

describe('Spy mockRestore Complex Issues', () => {
  // Test 1: Direct access to the general mockRestore method
  it('should properly restore when accessing general mockRestore directly', () => {
    const obj = {
      method: () => 'original'
    };
    
    const spy = jest.spyOn(obj, 'method').mockImplementation(() => 'mocked');
    expect(obj.method()).toBe('mocked');
    
    // Access the general mockRestore method from the prototype
    const generalMockRestore = Object.getPrototypeOf(spy).mockRestore;
    generalMockRestore.call(spy);
    
    // This should be 'original' if the general mockRestore works correctly
    expect(obj.method()).toBe('original');
  });

  // Test 2: Multiple spies on the same object
  it('should handle multiple spies on the same object correctly', () => {
    const obj = {
      method1: () => 'original1',
      method2: () => 'original2'
    };
    
    const spy1 = jest.spyOn(obj, 'method1').mockImplementation(() => 'mocked1');
    const spy2 = jest.spyOn(obj, 'method2').mockImplementation(() => 'mocked2');
    
    expect(obj.method1()).toBe('mocked1');
    expect(obj.method2()).toBe('mocked2');
    
    // Restore only one spy
    spy1.mockRestore();
    
    // method1 should be restored, method2 should still be mocked
    expect(obj.method1()).toBe('original1');
    expect(obj.method2()).toBe('mocked2');
    
    // Now restore the second spy
    spy2.mockRestore();
    expect(obj.method2()).toBe('original2');
  });

  // Test 3: Nested objects
  it('should handle spies on nested object properties', () => {
    const obj = {
      nested: {
        method: () => 'original'
      }
    };
    
    const spy = jest.spyOn(obj.nested, 'method').mockImplementation(() => 'mocked');
    expect(obj.nested.method()).toBe('mocked');
    
    spy.mockRestore();
    expect(obj.nested.method()).toBe('original');
  });

  // Test 4: Overriding mockRestore
  it('should handle overriding mockRestore correctly', () => {
    console.log('Starting test: should handle overriding mockRestore correctly');
    
    const obj = {
      method: () => 'original'
    };
    
    console.log('Original method:', obj.method());
    
    const spy = jest.spyOn(obj, 'method').mockImplementation(() => 'mocked');
    console.log('After spyOn, method returns:', obj.method());
    
    console.log('Before override - spy.spyTarget:', (spy as any).spyTarget);
    console.log('Before override - spy.originalMethod:', (spy as any).originalMethod);
    console.log('Before override - spy._originalMockRestore:', (spy as any)._originalMockRestore);
    
    // Override the spy's mockRestore with a custom implementation
    const originalMockRestore = (spy as any)._originalMockRestore || spy.mockRestore;
    console.log('originalMockRestore is a function:', typeof originalMockRestore === 'function');
    
    // Use Object.defineProperty to override the mockRestore method
    const customMockRestore = function(this: any) {
      console.log('Custom mockRestore called');
      console.log('this.spyTarget:', this.spyTarget);
      console.log('this.originalMethod:', this.originalMethod);
      const result = originalMockRestore.call(this);
      console.log('After originalMockRestore.call(this), method returns:', obj.method());
      return result;
    };
    
    Object.defineProperty(spy, 'mockRestore', {
      value: customMockRestore,
      writable: true,
      configurable: true
    });
    
    expect(obj.method()).toBe('mocked');
    console.log('Before spy.mockRestore(), method returns:', obj.method());
    
    spy.mockRestore();
    console.log('After spy.mockRestore(), method returns:', obj.method());
    
    expect(obj.method()).toBe('original');
    console.log('Test completed successfully');
  });
});