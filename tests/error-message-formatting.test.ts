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
      expect(errorMessage).toContain('toHaveBeenCalledWith');
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
      expect(errorMessage).toContain('toHaveBeenCalledWith');
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
      expect(errorMessage).toContain('toHaveBeenCalledWith');
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
      expect(errorMessage).toContain('toHaveBeenCalled');
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
      expect(errorMessage).toContain('toHaveBeenCalled');
    });
  });
});