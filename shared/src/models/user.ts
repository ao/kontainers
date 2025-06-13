export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  VIEWER = 'viewer'
}

export interface User {
  id: string;
  username: string;
  email: string;
  password: string; // Hashed password, never sent to frontend
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  lastLogin?: string;
  isActive: boolean;
}

export interface UserDTO {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  lastLogin?: string;
  isActive: boolean;
}

export interface CreateUserRequest {
  username: string;
  email: string;
  password: string;
  role?: UserRole;
}

export interface UpdateUserRequest {
  username?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: UserDTO;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirmRequest {
  token: string;
  password: string;
}

export interface TokenPayload {
  userId: string;
  role: UserRole;
}