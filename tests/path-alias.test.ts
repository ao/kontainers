import { describe, expect, it } from 'bun:test';
import path from 'path';
import fs from 'fs';

describe('Path Alias Test', () => {
  it('should be able to resolve paths correctly', () => {
    // Test that we can resolve paths correctly
    const rootDir = path.resolve('.');
    expect(fs.existsSync(rootDir)).toBe(true);
    
    // Check that frontend directory exists
    const frontendDir = path.join(rootDir, 'frontend');
    expect(fs.existsSync(frontendDir)).toBe(true);
    
    // Check that backend directory exists
    const backendDir = path.join(rootDir, 'backend');
    expect(fs.existsSync(backendDir)).toBe(true);
    
    // Check that shared directory exists
    const sharedDir = path.join(rootDir, 'shared');
    expect(fs.existsSync(sharedDir)).toBe(true);
  });
});