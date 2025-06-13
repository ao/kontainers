import { create } from 'zustand';
import { UserDTO, UserRole } from 'kontainers-shared';
import authService from '../services/authService';

interface AuthState {
  user: UserDTO | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
  updateProfile: (userData: Partial<UserDTO>) => Promise<void>;
  clearError: () => void;
  
  // Admin actions
  getAllUsers: () => Promise<UserDTO[]>;
  updateUser: (id: string, userData: Partial<UserDTO>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  
  // Helper methods
  hasRole: (role: UserRole) => boolean;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: authService.isAuthenticated(),
  isLoading: false,
  error: null,
  
  login: async (email, password) => {
    try {
      set({ isLoading: true, error: null });
      const response = await authService.login({ email, password });
      set({ 
        isAuthenticated: true, 
        user: response.user,
        isLoading: false 
      });
    } catch (error: any) {
      set({ 
        error: error.response?.data?.message || 'Login failed', 
        isLoading: false,
        isAuthenticated: false
      });
      throw error;
    }
  },
  
  register: async (username, email, password) => {
    try {
      set({ isLoading: true, error: null });
      await authService.register({ username, email, password });
      set({ isLoading: false });
      // After registration, user needs to login
    } catch (error: any) {
      set({ 
        error: error.response?.data?.message || 'Registration failed', 
        isLoading: false 
      });
      throw error;
    }
  },
  
  logout: () => {
    authService.logout();
    set({ user: null, isAuthenticated: false });
  },
  
  loadUser: async () => {
    if (!authService.isAuthenticated()) {
      set({ user: null, isAuthenticated: false });
      return;
    }
    
    try {
      set({ isLoading: true });
      const user = await authService.getCurrentUser();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      // Token might be invalid or expired
      authService.logout();
      set({ 
        user: null, 
        isAuthenticated: false, 
        isLoading: false,
        error: 'Session expired. Please login again.'
      });
    }
  },
  
  updateProfile: async (userData) => {
    try {
      set({ isLoading: true, error: null });
      const updatedUser = await authService.updateProfile(userData);
      set({ user: updatedUser, isLoading: false });
    } catch (error: any) {
      set({ 
        error: error.response?.data?.message || 'Failed to update profile', 
        isLoading: false 
      });
      throw error;
    }
  },
  
  clearError: () => {
    set({ error: null });
  },
  
  getAllUsers: async () => {
    try {
      set({ isLoading: true, error: null });
      const users = await authService.getAllUsers();
      set({ isLoading: false });
      return users;
    } catch (error: any) {
      set({ 
        error: error.response?.data?.message || 'Failed to fetch users', 
        isLoading: false 
      });
      throw error;
    }
  },
  
  updateUser: async (id, userData) => {
    try {
      set({ isLoading: true, error: null });
      await authService.updateUser(id, userData);
      set({ isLoading: false });
    } catch (error: any) {
      set({ 
        error: error.response?.data?.message || 'Failed to update user', 
        isLoading: false 
      });
      throw error;
    }
  },
  
  deleteUser: async (id) => {
    try {
      set({ isLoading: true, error: null });
      await authService.deleteUser(id);
      set({ isLoading: false });
    } catch (error: any) {
      set({ 
        error: error.response?.data?.message || 'Failed to delete user', 
        isLoading: false 
      });
      throw error;
    }
  },
  
  hasRole: (role) => {
    const { user } = get();
    return user?.role === role;
  },
  
  isAdmin: () => {
    const { user } = get();
    return user?.role === UserRole.ADMIN;
  }
}));

export default useAuthStore;