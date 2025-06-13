import { describe, expect, it, beforeEach, jest, afterEach } from 'bun:test';
import { Elysia } from 'elysia';
import { authRoutes } from '@backend/src/api/auth';
import { 
  createUser, 
  loginUser, 
  getUserById, 
  updateUser, 
  deleteUser, 
  listUsers,
  requestPasswordReset,
  resetPassword,
  logAuditEvent
} from '@backend/src/services/auth';
import { UserRole } from 'kontainers-shared';

// Mock the auth service
jest.mock('@backend/src/services/auth', () => ({
  createUser: jest.fn(),
  loginUser: jest.fn(),
  getUserById: jest.fn(),
  updateUser: jest.fn(),
  deleteUser: jest.fn(),
  listUsers: jest.fn(),
  requestPasswordReset: jest.fn(),
  resetPassword: jest.fn(),
  logAuditEvent: jest.fn()
}));

// Mock the auth middleware
jest.mock('@backend/src/middleware/auth', () => ({
  authenticate: jest.fn((app) => app),
  adminOnly: jest.fn((app) => app),
  adminAndUserOnly: jest.fn((app) => app)
}));

describe('Authentication API Routes', () => {
  let app: Elysia;
  
  const mockUser = {
    id: 'user-1',
    username: 'testuser',
    email: 'test@example.com',
    role: UserRole.USER,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  const mockAdmin = {
    id: 'admin-1',
    username: 'admin',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTEiLCJpYXQiOjE2MTYxNjI4MDAsImV4cCI6MTYxNjE2NjQwMH0.example-token';
  
  beforeEach(() => {
    // Reset all mocks
    jest.resetAllMocks();
    
    // Create a new Elysia app with the auth routes
    app = new Elysia().use(authRoutes);
    
    // Default mock implementations
    (loginUser as jest.Mock).mockResolvedValue({
      user: mockUser,
      token: mockToken
    });
    
    (createUser as jest.Mock).mockResolvedValue(mockUser);
    (getUserById as jest.Mock).mockResolvedValue(mockUser);
    (updateUser as jest.Mock).mockResolvedValue(mockUser);
    (deleteUser as jest.Mock).mockResolvedValue(undefined);
    (listUsers as jest.Mock).mockResolvedValue([mockUser, mockAdmin]);
    (requestPasswordReset as jest.Mock).mockResolvedValue('reset-token-123');
    (resetPassword as jest.Mock).mockResolvedValue(undefined);
    (logAuditEvent as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /login', () => {
    it('should login a user with valid credentials', async () => {
      const response = await app.handle(
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'test-agent',
            'X-Forwarded-For': '127.0.0.1'
          },
          body: JSON.stringify({
            email: 'test@example.com',
            password: 'password123'
          })
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({
        user: mockUser,
        token: mockToken
      });
      expect(loginUser).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123'
      });
      expect(logAuditEvent).toHaveBeenCalledWith(
        mockUser.id,
        'login',
        'user',
        mockUser.id,
        undefined,
        '127.0.0.1',
        'test-agent'
      );
    });
  });

  describe('POST /register', () => {
    it('should register a new user', async () => {
      const newUser = {
        username: 'newuser',
        email: 'new@example.com',
        password: 'password123'
      };
      
      const response = await app.handle(
        new Request('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newUser)
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual(mockUser);
      expect(createUser).toHaveBeenCalledWith(newUser);
    });

    it('should register a new user with specified role', async () => {
      const newUser = {
        username: 'newadmin',
        email: 'newadmin@example.com',
        password: 'password123',
        role: UserRole.ADMIN
      };
      
      (createUser as jest.Mock).mockResolvedValue({
        ...mockUser,
        username: newUser.username,
        email: newUser.email,
        role: UserRole.ADMIN
      });
      
      const response = await app.handle(
        new Request('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newUser)
        })
      );
      
      expect(response.status).toBe(200);
      expect(createUser).toHaveBeenCalledWith(newUser);
    });
  });

  describe('POST /password-reset/request', () => {
    it('should request a password reset', async () => {
      const response = await app.handle(
        new Request('http://localhost/api/auth/password-reset/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'test@example.com'
          })
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({
        message: 'Password reset requested',
        token: 'reset-token-123'
      });
      expect(requestPasswordReset).toHaveBeenCalledWith('test@example.com');
    });
  });

  describe('POST /password-reset/confirm', () => {
    it('should confirm a password reset', async () => {
      const response = await app.handle(
        new Request('http://localhost/api/auth/password-reset/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: 'reset-token-123',
            password: 'newpassword123'
          })
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({
        message: 'Password reset successful'
      });
      expect(resetPassword).toHaveBeenCalledWith('reset-token-123', 'newpassword123');
    });
  });

  describe('GET /me', () => {
    it('should get the current user profile', async () => {
      // For protected routes, we need to mock the request context
      // to include the authenticated user
      const mockRequest = new Request('http://localhost/api/auth/me');
      const mockContext = {
        request: mockRequest,
        user: { userId: 'user-1' }
      };
      
      // Mock the handle method to use our context
      const originalHandle = app.handle;
      app.handle = jest.fn().mockImplementation(() => {
        const handler = app.routes.find(r => r.method === 'GET' && r.path === '/api/auth/me')?.handler;
        return handler?.(mockContext);
      });
      
      const response = await app.handle(mockRequest);
      
      expect(getUserById).toHaveBeenCalledWith('user-1');
      
      // Restore original handle method
      app.handle = originalHandle;
    });
  });

  describe('PUT /me', () => {
    it('should update the current user profile', async () => {
      const updateData = {
        username: 'updateduser',
        email: 'updated@example.com'
      };
      
      // Mock the context with authenticated user
      const mockRequest = new Request('http://localhost/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });
      
      const mockContext = {
        request: mockRequest,
        user: { userId: 'user-1' },
        body: updateData
      };
      
      // Mock the handle method
      const originalHandle = app.handle;
      app.handle = jest.fn().mockImplementation(() => {
        const handler = app.routes.find(r => r.method === 'PUT' && r.path === '/api/auth/me')?.handler;
        return handler?.(mockContext);
      });
      
      const response = await app.handle(mockRequest);
      
      expect(updateUser).toHaveBeenCalledWith('user-1', updateData);
      
      // Restore original handle method
      app.handle = originalHandle;
    });
  });

  describe('GET /users', () => {
    it('should list all users (admin only)', async () => {
      // Mock the context with admin user
      const mockRequest = new Request('http://localhost/api/auth/users');
      
      const mockContext = {
        request: mockRequest,
        user: { userId: 'admin-1', role: UserRole.ADMIN }
      };
      
      // Mock the handle method
      const originalHandle = app.handle;
      app.handle = jest.fn().mockImplementation(() => {
        const handler = app.routes.find(r => r.method === 'GET' && r.path === '/api/auth/users')?.handler;
        return handler?.(mockContext);
      });
      
      const response = await app.handle(mockRequest);
      
      expect(listUsers).toHaveBeenCalled();
      
      // Restore original handle method
      app.handle = originalHandle;
    });
  });

  describe('DELETE /users/:id', () => {
    it('should delete a user (admin only)', async () => {
      // Mock the context with admin user
      const mockRequest = new Request('http://localhost/api/auth/users/user-1', {
        method: 'DELETE'
      });
      
      const mockContext = {
        request: mockRequest,
        user: { userId: 'admin-1', role: UserRole.ADMIN },
        params: { id: 'user-1' }
      };
      
      // Mock the handle method
      const originalHandle = app.handle;
      app.handle = jest.fn().mockImplementation(() => {
        const handler = app.routes.find(r => r.method === 'DELETE' && r.path === '/api/auth/users/:id')?.handler;
        return handler?.(mockContext);
      });
      
      const response = await app.handle(mockRequest);
      
      expect(deleteUser).toHaveBeenCalledWith('user-1');
      
      // Restore original handle method
      app.handle = originalHandle;
    });
  });
});