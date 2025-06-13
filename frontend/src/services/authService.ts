import axios from 'axios';
import { LoginRequest, LoginResponse, CreateUserRequest, UserDTO, PasswordResetRequest, PasswordResetConfirmRequest } from 'kontainers-shared';

const API_URL = '/api/auth';

// Axios instance with auth header
const authAxios = axios.create();

// Add auth token to requests if available
authAxios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export const authService = {
  /**
   * Login user
   */
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await axios.post(`${API_URL}/login`, credentials);
    
    // Store token in localStorage
    localStorage.setItem('token', response.data.token);
    
    return response.data;
  },
  
  /**
   * Register new user
   */
  async register(userData: CreateUserRequest): Promise<UserDTO> {
    const response = await axios.post(`${API_URL}/register`, userData);
    return response.data;
  },
  
  /**
   * Get current user profile
   */
  async getCurrentUser(): Promise<UserDTO> {
    const response = await authAxios.get(`${API_URL}/me`);
    return response.data;
  },
  
  /**
   * Update current user profile
   */
  async updateProfile(userData: Partial<UserDTO>): Promise<UserDTO> {
    const response = await authAxios.put(`${API_URL}/me`, userData);
    return response.data;
  },
  
  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<{ message: string; token: string }> {
    const response = await axios.post(`${API_URL}/password-reset/request`, { email });
    return response.data;
  },
  
  /**
   * Reset password with token
   */
  async resetPassword(token: string, password: string): Promise<{ message: string }> {
    const response = await axios.post(`${API_URL}/password-reset/confirm`, { token, password });
    return response.data;
  },
  
  /**
   * Admin: Get all users
   */
  async getAllUsers(): Promise<UserDTO[]> {
    const response = await authAxios.get(`${API_URL}/users`);
    return response.data;
  },
  
  /**
   * Admin: Get user by ID
   */
  async getUserById(id: string): Promise<UserDTO> {
    const response = await authAxios.get(`${API_URL}/users/${id}`);
    return response.data;
  },
  
  /**
   * Admin: Update user
   */
  async updateUser(id: string, userData: Partial<UserDTO>): Promise<UserDTO> {
    const response = await authAxios.put(`${API_URL}/users/${id}`, userData);
    return response.data;
  },
  
  /**
   * Admin: Delete user
   */
  async deleteUser(id: string): Promise<{ message: string }> {
    const response = await authAxios.delete(`${API_URL}/users/${id}`);
    return response.data;
  },
  
  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!localStorage.getItem('token');
  },
  
  /**
   * Logout user
   */
  logout(): void {
    localStorage.removeItem('token');
  }
};

export default authService;