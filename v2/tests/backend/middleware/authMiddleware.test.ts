import { describe, expect, it, jest, beforeEach } from 'bun:test';
import { Elysia } from 'elysia';
import { authMiddleware } from '@backend/src/middleware/authMiddleware';
import { db } from '@backend/src/db';
import { Role } from '@shared/src/models';
import jwt from 'jsonwebtoken';

// Mock JWT
jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

// Mock database
jest.mock('@backend/src/db', () => ({
  db: {
    users: {
      findOne: jest.fn()
    }
  }
}));

describe('Authentication Middleware', () => {
  let app: Elysia;
  const JWT_SECRET = 'test-secret';
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a test app with the auth middleware
    app = new Elysia()
      .use(authMiddleware({ secret: JWT_SECRET }))
      .get('/protected', () => 'Protected Resource', {
        beforeHandle: [
          ({ set, user }) => {
            if (!user) {
              set.status = 401;
              return 'Unauthorized';
            }
          }
        ]
      })
      .get('/admin-only', () => 'Admin Resource', {
        beforeHandle: [
          ({ set, user }) => {
            if (!user) {
              set.status = 401;
              return 'Unauthorized';
            }
            if (user.role !== Role.ADMIN) {
              set.status = 403;
              return 'Forbidden';
            }
          }
        ]
      });
  });
  
  it('should allow access to protected route with valid token', async () => {
    // Mock JWT verification
    const mockUser = { id: '1', username: 'testuser', role: Role.USER };
    (jwt.verify as jest.Mock).mockReturnValue({ id: '1' });
    
    // Mock user in database
    (db.users.findOne as jest.Mock).mockResolvedValue(mockUser);
    
    const response = await app.handle(
      new Request('http://localhost/protected', {
        headers: {
          'Authorization': 'Bearer valid-token'
        }
      })
    );
    
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('Protected Resource');
    expect(jwt.verify).toHaveBeenCalledWith('valid-token', JWT_SECRET);
    expect(db.users.findOne).toHaveBeenCalledWith({ id: '1' });
  });
  
  it('should deny access to protected route without token', async () => {
    const response = await app.handle(
      new Request('http://localhost/protected')
    );
    
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('Unauthorized');
  });
  
  it('should deny access to protected route with invalid token', async () => {
    // Mock JWT verification to throw error
    (jwt.verify as jest.Mock).mockImplementation(() => {
      throw new Error('Invalid token');
    });
    
    const response = await app.handle(
      new Request('http://localhost/protected', {
        headers: {
          'Authorization': 'Bearer invalid-token'
        }
      })
    );
    
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('Unauthorized');
  });
  
  it('should deny access if user not found in database', async () => {
    // Mock JWT verification
    (jwt.verify as jest.Mock).mockReturnValue({ id: '999' });
    
    // Mock user not found in database
    (db.users.findOne as jest.Mock).mockResolvedValue(null);
    
    const response = await app.handle(
      new Request('http://localhost/protected', {
        headers: {
          'Authorization': 'Bearer valid-token'
        }
      })
    );
    
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('Unauthorized');
  });
  
  it('should allow admin access to admin-only route', async () => {
    // Mock JWT verification
    const mockAdmin = { id: '1', username: 'admin', role: Role.ADMIN };
    (jwt.verify as jest.Mock).mockReturnValue({ id: '1' });
    
    // Mock admin in database
    (db.users.findOne as jest.Mock).mockResolvedValue(mockAdmin);
    
    const response = await app.handle(
      new Request('http://localhost/admin-only', {
        headers: {
          'Authorization': 'Bearer admin-token'
        }
      })
    );
    
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('Admin Resource');
  });
  
  it('should deny regular user access to admin-only route', async () => {
    // Mock JWT verification
    const mockUser = { id: '2', username: 'regularuser', role: Role.USER };
    (jwt.verify as jest.Mock).mockReturnValue({ id: '2' });
    
    // Mock regular user in database
    (db.users.findOne as jest.Mock).mockResolvedValue(mockUser);
    
    const response = await app.handle(
      new Request('http://localhost/admin-only', {
        headers: {
          'Authorization': 'Bearer user-token'
        }
      })
    );
    
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('Forbidden');
  });
  
  it('should handle malformed authorization header', async () => {
    const response = await app.handle(
      new Request('http://localhost/protected', {
        headers: {
          'Authorization': 'malformed-header'
        }
      })
    );
    
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('Unauthorized');
  });
  
  it('should extract token from authorization header correctly', async () => {
    // Mock JWT verification
    const mockUser = { id: '1', username: 'testuser', role: Role.USER };
    (jwt.verify as jest.Mock).mockReturnValue({ id: '1' });
    
    // Mock user in database
    (db.users.findOne as jest.Mock).mockResolvedValue(mockUser);
    
    await app.handle(
      new Request('http://localhost/protected', {
        headers: {
          'Authorization': 'Bearer test-token-123'
        }
      })
    );
    
    expect(jwt.verify).toHaveBeenCalledWith('test-token-123', JWT_SECRET);
  });
});