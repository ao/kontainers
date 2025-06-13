import { Elysia, t } from 'elysia';
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
} from '../services/auth';
import { authenticate, adminOnly, adminAndUserOnly } from '../middleware/auth';
import { UserRole } from 'kontainers-shared';

export const authRoutes = new Elysia({ prefix: '/api/auth' })
  // Public routes
  .post('/login', async ({ body, request }) => {
    const result = await loginUser(body);
    
    // Log successful login
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    await logAuditEvent(
      result.user.id,
      'login',
      'user',
      result.user.id,
      undefined,
      ip,
      userAgent
    );
    
    return result;
  }, {
    body: t.Object({
      email: t.String(),
      password: t.String()
    })
  })
  
  .post('/register', async ({ body }) => {
    // In production, you might want to restrict registration
    // or require admin approval
    return await createUser(body);
  }, {
    body: t.Object({
      username: t.String(),
      email: t.String(),
      password: t.String(),
      role: t.Optional(t.Enum(UserRole))
    })
  })
  
  .post('/password-reset/request', async ({ body }) => {
    const token = await requestPasswordReset(body.email);
    // In a real app, you would send this token via email
    // For development, we'll return it directly
    return { message: 'Password reset requested', token };
  }, {
    body: t.Object({
      email: t.String()
    })
  })
  
  .post('/password-reset/confirm', async ({ body }) => {
    await resetPassword(body.token, body.password);
    return { message: 'Password reset successful' };
  }, {
    body: t.Object({
      token: t.String(),
      password: t.String()
    })
  })
  
  // Protected routes
  .use(authenticate)
  .get('/me', async ({ user }) => {
    const userData = await getUserById(user.userId);
    if (!userData) {
      throw new Error('User not found');
    }
    return userData;
  })
  
  .put('/me', async ({ body, user }) => {
    // Users can update their own profile
    return await updateUser(user.userId, body);
  }, {
    body: t.Object({
      username: t.Optional(t.String()),
      email: t.Optional(t.String()),
      password: t.Optional(t.String())
    })
  })
  
  // Admin-only routes
  .use('/users', adminOnly)
  .get('/users', async () => {
    return await listUsers();
  })
  
  .get('/users/:id', async ({ params }) => {
    const user = await getUserById(params.id);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }, {
    params: t.Object({
      id: t.String()
    })
  })
  
  .put('/users/:id', async ({ params, body }) => {
    return await updateUser(params.id, body);
  }, {
    params: t.Object({
      id: t.String()
    }),
    body: t.Object({
      username: t.Optional(t.String()),
      email: t.Optional(t.String()),
      password: t.Optional(t.String()),
      role: t.Optional(t.Enum(UserRole)),
      isActive: t.Optional(t.Boolean())
    })
  })
  
  .delete('/users/:id', async ({ params }) => {
    await deleteUser(params.id);
    return { message: 'User deleted successfully' };
  }, {
    params: t.Object({
      id: t.String()
    })
  });