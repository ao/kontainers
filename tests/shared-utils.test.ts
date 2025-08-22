import { describe, expect, it, jest } from 'bun:test';
import { formatBytes, formatPercentage, formatDate, generateId, debounce, throttle } from '../shared/src/utils';

describe('Shared Utils', () => {
  describe('formatBytes', () => {
    it('should format 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
    });

    it('should format bytes', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1073741824)).toBe('1 GB');
    });

    it('should handle decimals', () => {
      expect(formatBytes(1536, 1)).toBe('1.5 KB');
      expect(formatBytes(1536, 0)).toBe('2 KB');
    });
  });

  describe('formatPercentage', () => {
    it('should format percentage with default decimals', () => {
      expect(formatPercentage(75.456)).toBe('75.5%');
    });

    it('should format percentage with custom decimals', () => {
      expect(formatPercentage(75.456, 2)).toBe('75.46%');
      expect(formatPercentage(75.456, 0)).toBe('75%');
    });
  });

  describe('formatDate', () => {
    it('should format Date object', () => {
      const date = new Date('2023-01-01T12:00:00Z');
      const result = formatDate(date);
      expect(result).toContain('2023');
    });

    it('should format date string', () => {
      const result = formatDate('2023-01-01T12:00:00Z');
      expect(result).toContain('2023');
    });
  });

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(0);
    });
  });

  describe('debounce', () => {
    it('should debounce function calls', async () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 100);
      
      debouncedFn();
      debouncedFn();
      debouncedFn();
      
      expect(mockFn).not.toHaveBeenCalled();
      
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('throttle', () => {
    it('should throttle function calls', async () => {
      const mockFn = jest.fn();
      const throttledFn = throttle(mockFn, 100);
      
      throttledFn();
      throttledFn();
      throttledFn();
      
      expect(mockFn).toHaveBeenCalledTimes(1);
      
      await new Promise(resolve => setTimeout(resolve, 150));
      throttledFn();
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });
});
