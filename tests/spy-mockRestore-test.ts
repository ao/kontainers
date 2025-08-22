import { describe, expect, it, jest } from 'bun:test';

describe('Spy mockRestore Issue', () => {
  it('should properly restore original method when using spy.mockRestore()', () => {
    const obj = {
      method: () => 'original'
    };
    
    const spy = jest.spyOn(obj, 'method').mockImplementation(() => 'mocked');
    expect(obj.method()).toBe('mocked');
    
    spy.mockRestore();
    expect(obj.method()).toBe('original');
  });

  it('should properly restore original method when using general mockRestore', () => {
    const obj = {
      method: () => 'original'
    };
    
    const spy = jest.spyOn(obj, 'method').mockImplementation(() => 'mocked');
    expect(obj.method()).toBe('mocked');
    
    // Use the general mockRestore method instead of the spy-specific one
    const mockRestoreMethod = spy.mockRestore;
    const generalMockRestore = mockRestoreMethod.bind(spy);
    generalMockRestore();
    
    // This should be 'original' but might fail if there's an issue
    expect(obj.method()).toBe('original');
  });
});