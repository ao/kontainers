import { describe, expect, it } from 'bun:test';
import { ProxyRule } from '../shared/src/models/proxy';

describe('Relative Imports Test', () => {
  it('should be able to import from shared directory', () => {
    // Just check that we can create an object of the imported type
    const rule: Partial<ProxyRule> = {
      name: 'Test Rule',
      domain: 'test.example.com'
    };
    expect(rule.name).toBe('Test Rule');
    expect(rule.domain).toBe('test.example.com');
  });
});