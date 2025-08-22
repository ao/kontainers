import { describe, expect, it, jest } from 'bun:test';

describe('restoreAllMocks Functionality', () => {
  it('should properly restore all spied methods when using jest.restoreAllMocks()', () => {
    const obj = {
      method1: () => 'original1',
      method2: () => 'original2'
    };
    
    // Create two spies
    const spy1 = jest.spyOn(obj, 'method1').mockImplementation(() => 'mocked1');
    const spy2 = jest.spyOn(obj, 'method2').mockImplementation(() => 'mocked2');
    
    // Verify the mocks are working
    expect(obj.method1()).toBe('mocked1');
    expect(obj.method2()).toBe('mocked2');
    
    // Restore all mocks
    jest.restoreAllMocks();
    
    // Verify the original methods are restored
    expect(obj.method1()).toBe('original1');
    expect(obj.method2()).toBe('original2');
  });

  it('should handle a mix of spies and regular mocks correctly', () => {
    const obj = {
      method: () => 'original'
    };
    
    // Create a spy
    const spy = jest.spyOn(obj, 'method').mockImplementation(() => 'mocked');
    
    // Create a regular mock
    const regularMock = jest.fn().mockReturnValue('mock value');
    
    // Verify both are working
    expect(obj.method()).toBe('mocked');
    expect(regularMock()).toBe('mock value');
    
    // Restore all mocks
    jest.restoreAllMocks();
    
    // Verify the spy is restored but the regular mock is not affected
    // (regular mocks don't have anything to restore to)
    expect(obj.method()).toBe('original');
    // Regular mocks retain their mock implementation after restoreAllMocks
    expect(regularMock()).toBe('mock value');
  });
});