import { describe, expect, it } from 'bun:test';
import { sanitizeHtml, escapeHtml, sanitizeText } from '../backend/src/utils/sanitize';

describe('Backend Sanitize Utils', () => {
  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(escapeHtml('&')).toBe('&amp;');
      expect(escapeHtml("'")).toBe('&#039;');
    });
  });

  describe('sanitizeText', () => {
    it('should sanitize plain text', () => {
      expect(sanitizeText('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(sanitizeText('')).toBe('');
    });
  });

  describe('sanitizeHtml', () => {
    it('should allow safe HTML tags', () => {
      expect(sanitizeHtml('<p>Hello world</p>')).toBe('<p>Hello world</p>');
      expect(sanitizeHtml('<h1>Title</h1>')).toBe('<h1>Title</h1>');
      expect(sanitizeHtml('<strong>Bold</strong>')).toBe('<strong>Bold</strong>');
    });

    it('should remove dangerous tags', () => {
      expect(sanitizeHtml('<script>alert("xss")</script>')).toBe('alert("xss")');
      expect(sanitizeHtml('<iframe src="evil.com"></iframe>')).toBe('');
    });

    it('should handle empty input', () => {
      expect(sanitizeHtml('')).toBe('');
    });

    it('should remove HTML comments', () => {
      expect(sanitizeHtml('<!-- comment --><p>text</p>')).toBe('<p>text</p>');
    });

    it('should handle allowed attributes', () => {
      const result = sanitizeHtml('<a href="https://example.com">Link</a>');
      expect(result).toContain('Link');
      expect(result).toContain('</a>');
    });

    it('should block javascript URLs', () => {
      expect(sanitizeHtml('<a href="javascript:alert(1)">Link</a>')).toBe('<a>Link</a>');
    });

    it('should handle closing tags', () => {
      expect(sanitizeHtml('<p>text</p>')).toBe('<p>text</p>');
    });
  });
});
