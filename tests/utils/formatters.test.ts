import { describe, expect, it } from 'bun:test';
import {
  formatBytes,
  formatDate,
  formatDuration,
  formatPercentage,
  truncateString
} from '@shared/src/utils/formatters';

describe('Formatter Utilities', () => {
  describe('formatBytes', () => {
    it('should format bytes to human-readable format', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1024)).toBe('1.00 KB');
      expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
      expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1.00 TB');
    });

    it('should handle decimal precision', () => {
      expect(formatBytes(1536)).toBe('1.50 KB');
      expect(formatBytes(1536, 0)).toBe('2 KB');
      expect(formatBytes(1536, 1)).toBe('1.5 KB');
      expect(formatBytes(1536, 3)).toBe('1.500 KB');
    });

    it('should handle negative values', () => {
      expect(formatBytes(-1024)).toBe('-1.00 KB');
    });
  });

  describe('formatDate', () => {
    it('should format dates in the default format', () => {
      const date = new Date('2025-06-13T12:00:00Z');
      expect(formatDate(date)).toMatch(/Jun 13, 2025/);
    });

    it('should format dates with custom format', () => {
      const date = new Date('2025-06-13T12:00:00Z');
      expect(formatDate(date, 'yyyy-MM-dd')).toBe('2025-06-13');
      expect(formatDate(date, 'HH:mm:ss')).toBe('12:00:00');
    });

    it('should handle date strings', () => {
      expect(formatDate('2025-06-13T12:00:00Z')).toMatch(/Jun 13, 2025/);
    });

    it('should return empty string for invalid dates', () => {
      expect(formatDate('invalid-date')).toBe('');
      expect(formatDate(null as any)).toBe('');
      expect(formatDate(undefined as any)).toBe('');
    });
  });

  describe('formatDuration', () => {
    it('should format seconds to human-readable duration', () => {
      expect(formatDuration(0)).toBe('0s');
      expect(formatDuration(30)).toBe('30s');
      expect(formatDuration(60)).toBe('1m 0s');
      expect(formatDuration(90)).toBe('1m 30s');
      expect(formatDuration(3600)).toBe('1h 0m 0s');
      expect(formatDuration(3661)).toBe('1h 1m 1s');
      expect(formatDuration(86400)).toBe('1d 0h 0m 0s');
      expect(formatDuration(90061)).toBe('1d 1h 1m 1s');
    });

    it('should handle compact format', () => {
      expect(formatDuration(3661, true)).toBe('1h 1m');
      expect(formatDuration(60, true)).toBe('1m');
      expect(formatDuration(30, true)).toBe('30s');
    });

    it('should handle negative values', () => {
      expect(formatDuration(-60)).toBe('-1m 0s');
    });
  });

  describe('formatPercentage', () => {
    it('should format numbers as percentages', () => {
      expect(formatPercentage(0)).toBe('0%');
      expect(formatPercentage(0.5)).toBe('50%');
      expect(formatPercentage(1)).toBe('100%');
      expect(formatPercentage(1.5)).toBe('150%');
    });

    it('should handle decimal precision', () => {
      expect(formatPercentage(0.123)).toBe('12%');
      expect(formatPercentage(0.123, 1)).toBe('12.3%');
      expect(formatPercentage(0.123, 2)).toBe('12.30%');
    });

    it('should handle negative values', () => {
      expect(formatPercentage(-0.5)).toBe('-50%');
    });
  });

  describe('truncateString', () => {
    it('should truncate strings that exceed max length', () => {
      expect(truncateString('Hello, world!', 5)).toBe('Hello...');
      expect(truncateString('Hello', 5)).toBe('Hello');
      expect(truncateString('Hello', 10)).toBe('Hello');
    });

    it('should use custom suffix if provided', () => {
      expect(truncateString('Hello, world!', 5, '…')).toBe('Hello…');
      expect(truncateString('Hello, world!', 5, ' [more]')).toBe('Hello [more]');
    });

    it('should handle empty strings', () => {
      expect(truncateString('', 5)).toBe('');
    });

    it('should handle null and undefined', () => {
      expect(truncateString(null as any, 5)).toBe('');
      expect(truncateString(undefined as any, 5)).toBe('');
    });
  });
});