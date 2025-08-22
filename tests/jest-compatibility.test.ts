import { describe, expect, it, jest } from 'bun:test';

describe('Jest Compatibility', () => {
  describe('Mock Functions', () => {
    it('should create a mock function', () => {
      const mockFn = jest.fn();
      expect(typeof mockFn).toBe('function');
    });

    it('should track calls to a mock function', () => {
      const mockFn = jest.fn();
      mockFn();
      mockFn(1, 2);
      expect(mockFn.mock.calls.length).toBe(2);
      expect(mockFn.mock.calls[0]).toEqual([]);
      expect(mockFn.mock.calls[1]).toEqual([1, 2]);
    });

    it('should support mockReturnValue', () => {
      const mockFn = jest.fn().mockReturnValue(42);
      expect(mockFn()).toBe(42);
      expect(mockFn()).toBe(42);
    });

    it('should support mockReturnValueOnce', () => {
      const mockFn = jest.fn()
        .mockReturnValueOnce(1)
        .mockReturnValueOnce(2)
        .mockReturnValue(3);
      
      expect(mockFn()).toBe(1); // First call returns 1
      expect(mockFn()).toBe(2); // Second call returns 2
      expect(mockFn()).toBe(3); // Third call returns default value 3
      expect(mockFn()).toBe(3); // Subsequent calls return default value 3
    });

    it('should support mockImplementation', () => {
      const mockFn = jest.fn().mockImplementation((a, b) => a + b);
      expect(mockFn(1, 2)).toBe(3);
      expect(mockFn(3, 4)).toBe(7);
    });

    it('should support mockImplementationOnce', () => {
      const mockFn = jest.fn()
        .mockImplementationOnce((a, b) => a + b)
        .mockImplementationOnce((a, b) => a * b)
        .mockImplementation((a, b) => a / b);
      
      expect(mockFn(1, 2)).toBe(3);    // First call: 1 + 2 = 3
      expect(mockFn(3, 4)).toBe(12);   // Second call: 3 * 4 = 12
      expect(mockFn(10, 2)).toBe(5);   // Third call: 10 / 2 = 5
      expect(mockFn(20, 4)).toBe(5);   // Subsequent calls: 20 / 4 = 5
      describe('Advanced Mock Function Chaining', () => {
        it('should maintain the same mock function instance when chaining', () => {
          const mockFn = jest.fn();
          const chainedFn1 = mockFn.mockReturnValueOnce(1);
          const chainedFn2 = chainedFn1.mockReturnValueOnce(2);
          
          // All references should point to the same function
          expect(chainedFn1).toBe(mockFn);
          expect(chainedFn2).toBe(mockFn);
        });
        
        it('should handle complex chaining with multiple once methods', () => {
          const mockFn = jest.fn();
          
          // Store the original mock function for reference
          const originalMockFn = mockFn;
          
          // Chain multiple methods
          mockFn
            .mockReturnValueOnce(1)
            .mockReturnValueOnce(2)
            .mockImplementationOnce(() => 3)
            .mockReturnValue(4);
          
          // Verify the function wasn't replaced during chaining
          expect(mockFn).toBe(originalMockFn);
          
          // Verify the queue order is maintained
          expect(mockFn()).toBe(1); // First call: mockReturnValueOnce(1)
          expect(mockFn()).toBe(2); // Second call: mockReturnValueOnce(2)
          expect(mockFn()).toBe(3); // Third call: mockImplementationOnce(() => 3)
          expect(mockFn()).toBe(4); // Fourth call: mockReturnValue(4)
        });
        
        it('should handle interleaved chain calls correctly', () => {
          const mockFn = jest.fn();
          
          // First chain
          mockFn.mockReturnValueOnce('a');
          
          // Second chain - should append to the queue, not replace it
          mockFn.mockReturnValueOnce('b');
          
          // Third chain - should append to the queue
          mockFn.mockReturnValueOnce('c');
          
          // Default value at the end
          mockFn.mockReturnValue('default');
          
          // Verify the queue order is maintained
          expect(mockFn()).toBe('a');
          expect(mockFn()).toBe('b');
          expect(mockFn()).toBe('c');
          expect(mockFn()).toBe('default');
        });
      });
    });

    it('should handle mixed mockReturnValueOnce and mockImplementationOnce', () => {
      const mockFn = jest.fn()
        .mockReturnValueOnce(42)
        .mockImplementationOnce(() => 43)
        .mockReturnValue(44);
      
      expect(mockFn()).toBe(42);  // First call returns fixed value 42
      expect(mockFn()).toBe(43);  // Second call uses implementation to return 43
      expect(mockFn()).toBe(44);  // Third call returns default value 44
    });

    it('should reset mock function when reset is called', () => {
      const mockFn = jest.fn()
        .mockReturnValueOnce(1)
        .mockReturnValue(2);
      
      expect(mockFn()).toBe(1);
      
      mockFn.mockReset();
      
      // After reset, the function should return undefined
      expect(mockFn()).toBeUndefined();
    });
  });
});