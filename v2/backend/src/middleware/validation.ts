import { Elysia } from 'elysia';
import { z } from 'zod';
import { sanitizeHtml } from '../utils/sanitize';

/**
 * Input validation and sanitization middleware
 * Uses Zod for validation and custom sanitization for HTML content
 */

// Error type for validation errors
export class ValidationError extends Error {
  constructor(message: string, public errors: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Sanitize string values in an object recursively
 * @param obj Object to sanitize
 * @returns Sanitized object
 */
function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    return sanitizeHtml(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  if (typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = sanitizeObject(obj[key]);
      }
    }
    return result;
  }
  
  return obj;
}

/**
 * Create a validation middleware with a Zod schema
 * @param schema Zod schema for validation
 * @returns Elysia middleware
 */
export function validateBody(schema: z.ZodType) {
  return new Elysia()
    .derive(async ({ body, set }) => {
      try {
        // Sanitize input
        const sanitizedBody = sanitizeObject(body);
        
        // Validate with Zod
        const validatedData = schema.parse(sanitizedBody);
        
        // Return validated and sanitized data
        return { validatedBody: validatedData };
      } catch (error) {
        if (error instanceof z.ZodError) {
          set.status = 400;
          throw new ValidationError('Validation failed', error.format());
        }
        throw error;
      }
    });
}

/**
 * Create a validation middleware for query parameters
 * @param schema Zod schema for validation
 * @returns Elysia middleware
 */
export function validateQuery(schema: z.ZodType) {
  return new Elysia()
    .derive(async ({ query, set }) => {
      try {
        // Sanitize input
        const sanitizedQuery = sanitizeObject(query);
        
        // Validate with Zod
        const validatedData = schema.parse(sanitizedQuery);
        
        // Return validated and sanitized data
        return { validatedQuery: validatedData };
      } catch (error) {
        if (error instanceof z.ZodError) {
          set.status = 400;
          throw new ValidationError('Query validation failed', error.format());
        }
        throw error;
      }
    });
}

/**
 * Create a validation middleware for path parameters
 * @param schema Zod schema for validation
 * @returns Elysia middleware
 */
export function validateParams(schema: z.ZodType) {
  return new Elysia()
    .derive(async ({ params, set }) => {
      try {
        // Sanitize input
        const sanitizedParams = sanitizeObject(params);
        
        // Validate with Zod
        const validatedData = schema.parse(sanitizedParams);
        
        // Return validated and sanitized data
        return { validatedParams: validatedData };
      } catch (error) {
        if (error instanceof z.ZodError) {
          set.status = 400;
          throw new ValidationError('Path parameter validation failed', error.format());
        }
        throw error;
      }
    });
}