import { Elysia, type Context } from 'elysia';
import { verifyToken } from '../services/auth';
import { UserRole } from 'kontainers-shared';

// Error types
export class AuthenticationError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message = 'Insufficient permissions') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

// Extract token from Authorization header
function extractToken(authHeader?: string): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

// Authentication middleware
export const authenticate = new Elysia()
  .derive(({ request }) => {
    const authHeader = request.headers.get('authorization');
    const token = extractToken(authHeader);
    
    if (!token) {
      throw new AuthenticationError();
    }
    
    try {
      const decoded = verifyToken(token);
      return { user: decoded };
    } catch (error) {
      throw new AuthenticationError('Invalid or expired token');
    }
  });

// Role-based authorization middleware
export function authorize(allowedRoles: UserRole[]) {
  return new Elysia()
    .use(authenticate)
    .derive(({ user }) => {
      if (!allowedRoles.includes(user.role)) {
        throw new AuthorizationError();
      }
      return {};
    });
}

// Admin-only middleware
export const adminOnly = authorize([UserRole.ADMIN]);

// Admin and user middleware (no viewers)
export const adminAndUserOnly = authorize([UserRole.ADMIN, UserRole.USER]);

// Rate limiting middleware
export const rateLimiter = new Elysia()
  .derive(async ({ request, set }) => {
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const path = new URL(request.url).pathname;
    
    // Implement rate limiting logic here
    // For now, we'll just pass through
    
    return {};
  });