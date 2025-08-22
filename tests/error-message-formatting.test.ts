import { describe, expect, it, jest } from 'bun:test';

describe('Error Message Formatting', () => {
  describe('toHaveBeenCalledWith', () => {
    it('should provide clear error messages with context when toHaveBeenCalledWith fails', () => {
      const mockFn = jest.fn();
      mockFn('actual arg');
      
      let errorMessage = '';
      try {
        expect(mockFn).toHaveBeenCalledWith('expected arg');
      } catch (error: any) {
        errorMessage = error.message;
      }
      
      // Verify the error message contains context
      expect(errorMessage).toContain('expect(received).toHaveBeenCalledWith(expected)');
      expect(errorMessage).toContain('Number of calls: 1');
    });

    it('should handle complex objects in error messages', () => {
      const mockFn = jest.fn();
      mockFn({ name: 'John', age: 30 });
      
      let errorMessage = '';
      try {
        expect(mockFn).toHaveBeenCalledWith({ name: 'Jane', age: 25 });
      } catch (error: any) {
        errorMessage = error.message;
      }
      
      // Verify the error message properly formats complex objects
      expect(errorMessage).toContain('expect(received).toHaveBeenCalledWith(expected)');
      expect(errorMessage).toContain('Number of calls: 1');
    });

    it('should handle asymmetric matchers in error messages', () => {
      const mockFn = jest.fn();
      mockFn('hello world');
      
      let errorMessage = '';
      try {
        expect(mockFn).toHaveBeenCalledWith(expect.stringContaining('missing'));
      } catch (error: any) {
        errorMessage = error.message;
      }
      
      // Verify the error message properly represents asymmetric matchers
      expect(errorMessage).toContain('expect(received).toHaveBeenCalledWith(expected)');
      expect(errorMessage).toContain('Number of calls: 1');
    });
  });

  describe('toHaveBeenCalled', () => {
    it('should provide clear error messages when toHaveBeenCalled fails', () => {
      const mockFn = jest.fn();
      
      let errorMessage = '';
      try {
        expect(mockFn).toHaveBeenCalled();
      } catch (error: any) {
        errorMessage = error.message;
      }
      
      // Verify the error message contains context
      expect(errorMessage).toContain('expect(received).toHaveBeenCalled()');
      expect(errorMessage).toContain('Expected number of calls: >= 1');
      expect(errorMessage).toContain('Received number of calls: 0');
    });
  });

  describe('not.toHaveBeenCalled', () => {
    it('should provide clear error messages when not.toHaveBeenCalled fails', () => {
      const mockFn = jest.fn();
      mockFn('arg1');
      mockFn('arg2');
      
      let errorMessage = '';
      try {
        expect(mockFn).not.toHaveBeenCalled();
      } catch (error: any) {
        errorMessage = error.message;
      }
      
      // Verify the error message contains context
      expect(errorMessage).toContain('expect(received).not.toHaveBeenCalled()');
      expect(errorMessage).toContain('Expected number of calls: 0');
      expect(errorMessage).toContain('Received number of calls: 2');
    });
  });
});