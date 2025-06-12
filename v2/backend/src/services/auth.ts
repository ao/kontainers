import { db } from '../db';
import { users, passwordResetTokens, auditLogs } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { User, UserRole, UserDTO, CreateUserRequest, LoginRequest, PasswordResetRequest } from 'kontainers-shared';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Environment variables (would normally be in .env)
const JWT_SECRET = process.env.JWT_SECRET || 'kontainers-jwt-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const SALT_ROUNDS = 10;
const PASSWORD_RESET_EXPIRES_IN = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * Generate a unique ID
 */
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Hash a password
 */
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare a password with a hash
 */
async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a JWT token
 */
function generateToken(userId: string, role: UserRole): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify a JWT token
 */
export function verifyToken(token: string): { userId: string; role: UserRole } {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: UserRole };
    return decoded;
  } catch (error) {
    throw new Error('Invalid token');
  }
}

/**
 * Convert User to UserDTO (remove sensitive data)
 */
function toUserDTO(user: User): UserDTO {
  const { password, ...userDTO } = user;
  return userDTO;
}

/**
 * Create a new user
 */
export async function createUser(userData: CreateUserRequest): Promise<UserDTO> {
  const hashedPassword = await hashPassword(userData.password);
  
  const now = new Date().toISOString();
  const newUser: User = {
    id: generateId(),
    username: userData.username,
    email: userData.email,
    password: hashedPassword,
    role: userData.role || UserRole.USER,
    createdAt: now,
    updatedAt: now,
    isActive: true
  };
  
  await db.insert(users).values(newUser);
  
  return toUserDTO(newUser);
}

/**
 * Create default admin user
 */
export async function createDefaultAdminUser(): Promise<void> {
  const adminExists = await db.select().from(users).where(eq(users.role, UserRole.ADMIN)).all();
  
  if (adminExists.length === 0) {
    await createUser({
      username: 'admin',
      email: 'admin@kontainers.local',
      password: 'admin', // This should be changed immediately
      role: UserRole.ADMIN
    });
    console.log('Default admin user created');
  }
}

/**
 * Login a user
 */
export async function loginUser(loginData: LoginRequest): Promise<{ token: string; user: UserDTO }> {
  const user = await db.select().from(users).where(eq(users.email, loginData.email)).get();
  
  if (!user) {
    throw new Error('Invalid email or password');
  }
  
  if (!user.isActive) {
    throw new Error('User account is inactive');
  }
  
  const passwordMatch = await comparePassword(loginData.password, user.password);
  if (!passwordMatch) {
    throw new Error('Invalid email or password');
  }
  
  // Update last login time
  const now = new Date().toISOString();
  await db.update(users)
    .set({ lastLogin: now, updatedAt: now })
    .where(eq(users.id, user.id));
  
  // Generate token
  const token = generateToken(user.id, user.role as UserRole);
  
  return {
    token,
    user: toUserDTO(user)
  };
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<UserDTO | null> {
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  
  if (!user) {
    return null;
  }
  
  return toUserDTO(user);
}

/**
 * Update user
 */
export async function updateUser(userId: string, userData: Partial<User>): Promise<UserDTO> {
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  
  if (!user) {
    throw new Error('User not found');
  }
  
  const updateData: Partial<User> = {
    ...userData,
    updatedAt: new Date().toISOString()
  };
  
  // If password is being updated, hash it
  if (updateData.password) {
    updateData.password = await hashPassword(updateData.password);
  }
  
  await db.update(users)
    .set(updateData)
    .where(eq(users.id, userId));
  
  const updatedUser = await db.select().from(users).where(eq(users.id, userId)).get();
  return toUserDTO(updatedUser!);
}

/**
 * Delete user
 */
export async function deleteUser(userId: string): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}

/**
 * List users
 */
export async function listUsers(): Promise<UserDTO[]> {
  const userList = await db.select().from(users).all();
  return userList.map(toUserDTO);
}

/**
 * Request password reset
 */
export async function requestPasswordReset(email: string): Promise<string> {
  const user = await db.select().from(users).where(eq(users.email, email)).get();
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // Generate reset token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRES_IN).toISOString();
  
  // Save token to database
  await db.insert(passwordResetTokens).values({
    id: generateId(),
    userId: user.id,
    token,
    expiresAt,
    used: false
  });
  
  return token;
}

/**
 * Reset password
 */
export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  const resetToken = await db.select().from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.token, token),
        eq(passwordResetTokens.used, false)
      )
    ).get();
  
  if (!resetToken) {
    throw new Error('Invalid or expired token');
  }
  
  // Check if token is expired
  if (new Date(resetToken.expiresAt) < new Date()) {
    throw new Error('Token expired');
  }
  
  // Hash new password
  const hashedPassword = await hashPassword(newPassword);
  
  // Update user password
  await db.update(users)
    .set({
      password: hashedPassword,
      updatedAt: new Date().toISOString()
    })
    .where(eq(users.id, resetToken.userId));
  
  // Mark token as used
  await db.update(passwordResetTokens)
    .set({ used: true })
    .where(eq(passwordResetTokens.id, resetToken.id));
  
  return true;
}

/**
 * Log audit event
 */
export async function logAuditEvent(
  userId: string | null,
  action: string,
  resource: string,
  resourceId?: string,
  details?: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await db.insert(auditLogs).values({
    id: generateId(),
    userId,
    action,
    resource,
    resourceId,
    timestamp: new Date().toISOString(),
    ipAddress,
    userAgent,
    details: details ? JSON.stringify(details) : null
  });
}