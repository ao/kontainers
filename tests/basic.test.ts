import { describe, expect, it } from 'bun:test';

describe('Basic Test', () => {
  it('should pass a basic test', () => {
    expect(1 + 1).toBe(2);
  });
  
  it('should handle string operations', () => {
    expect('hello' + ' world').toBe('hello world');
  });
  
  it('should handle array operations', () => {
    expect([1, 2, 3].length).toBe(3);
  });
});