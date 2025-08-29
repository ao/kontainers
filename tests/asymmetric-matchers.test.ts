import { describe, expect, it, jest } from 'bun:test';

describe('Asymmetric Matchers with toHaveBeenCalledWith', () => {
  it('should support expect.any with toHaveBeenCalledWith', () => {
    const mockFn = jest.fn();
    mockFn(123);
    
    expect(mockFn).toHaveBeenCalledWith(expect.any(Number));
    
    let errorThrown = false;
    try {
      expect(mockFn).toHaveBeenCalledWith(expect.any(String));
    } catch (_error: any) {
      errorThrown = true;
    }
    expect(errorThrown).toBe(true);
  });
  
  it('should support expect.anything with toHaveBeenCalledWith', () => {
    const mockFn = jest.fn();
    mockFn('some value');
    
    expect(mockFn).toHaveBeenCalledWith(expect.anything());
  });
  
  it('should support expect.stringContaining with toHaveBeenCalledWith', () => {
    const mockFn = jest.fn();
    mockFn('hello world');
    
    expect(mockFn).toHaveBeenCalledWith(expect.stringContaining('world'));
    
    let errorThrown = false;
    try {
      expect(mockFn).toHaveBeenCalledWith(expect.stringContaining('missing'));
    } catch (_error: any) {
      errorThrown = true;
    }
    expect(errorThrown).toBe(true);
  });
  
  it('should support expect.objectContaining with toHaveBeenCalledWith', () => {
    const mockFn = jest.fn();
    mockFn({ name: 'John', age: 30, city: 'New York' });
    
    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({ name: 'John', age: 30 }));
    
    let errorThrown = false;
    try {
      expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({ name: 'Jane' }));
    } catch (_error: any) {
      errorThrown = true;
    }
    expect(errorThrown).toBe(true);
  });

  it('should support nested asymmetric matchers', () => {
    const mockFn = jest.fn();
    mockFn({
      user: {
        name: 'John',
        age: 30,
        address: {
          city: 'New York',
          zip: '10001'
        }
      }
    });
    
    expect(mockFn).toHaveBeenCalledWith(expect.objectContaining({
      user: expect.objectContaining({
        name: 'John',
        address: expect.objectContaining({
          city: expect.stringContaining('York')
        })
      })
    }));
  });
});