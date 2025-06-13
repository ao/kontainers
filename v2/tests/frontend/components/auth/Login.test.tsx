import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Login } from '@frontend/src/components/auth/Login';
import { AuthContext } from '@frontend/src/contexts/AuthContext';
import { renderWithProviders } from '../../../utils/test-utils';

// Mock the auth service
jest.mock('@frontend/src/services/authService', () => ({
  login: jest.fn()
}));

import { login } from '@frontend/src/services/authService';

describe('Login Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders login form correctly', () => {
    renderWithProviders(<Login />);
    
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
    expect(screen.getByText(/don't have an account\?/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /register/i })).toBeInTheDocument();
  });

  it('validates form inputs', async () => {
    renderWithProviders(<Login />);
    
    const loginButton = screen.getByRole('button', { name: /login/i });
    
    // Try to submit with empty fields
    fireEvent.click(loginButton);
    
    await waitFor(() => {
      expect(screen.getByText(/username is required/i)).toBeInTheDocument();
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
    
    // Fill in username but not password
    await userEvent.type(screen.getByLabelText(/username/i), 'testuser');
    fireEvent.click(loginButton);
    
    await waitFor(() => {
      expect(screen.queryByText(/username is required/i)).not.toBeInTheDocument();
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
  });

  it('submits the form with valid credentials', async () => {
    // Mock successful login
    (login as jest.Mock).mockResolvedValue({
      user: { id: '1', username: 'testuser', role: 'ADMIN' },
      token: 'mock-token'
    });
    
    const mockLogin = jest.fn();
    const mockSetUser = jest.fn();
    
    render(
      <AuthContext.Provider value={{ 
        user: null, 
        login: mockLogin, 
        logout: jest.fn(), 
        setUser: mockSetUser,
        isAuthenticated: false 
      }}>
        <Login />
      </AuthContext.Provider>
    );
    
    // Fill in the form
    await userEvent.type(screen.getByLabelText(/username/i), 'testuser');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /login/i }));
    
    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('testuser', 'password123');
      expect(mockLogin).toHaveBeenCalledWith('mock-token');
      expect(mockSetUser).toHaveBeenCalledWith({
        id: '1',
        username: 'testuser',
        role: 'ADMIN'
      });
    });
  });

  it('displays error message on login failure', async () => {
    // Mock failed login
    (login as jest.Mock).mockRejectedValue(new Error('Invalid credentials'));
    
    renderWithProviders(<Login />);
    
    // Fill in the form
    await userEvent.type(screen.getByLabelText(/username/i), 'testuser');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrongpassword');
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /login/i }));
    
    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('testuser', 'wrongpassword');
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
    });
  });

  it('navigates to register page when register link is clicked', () => {
    const { history } = renderWithProviders(<Login />);
    
    fireEvent.click(screen.getByRole('link', { name: /register/i }));
    
    expect(history.location.pathname).toBe('/register');
  });

  it('shows loading state during login process', async () => {
    // Mock login with delay to show loading state
    (login as jest.Mock).mockImplementation(() => {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            user: { id: '1', username: 'testuser', role: 'ADMIN' },
            token: 'mock-token'
          });
        }, 100);
      });
    });
    
    renderWithProviders(<Login />);
    
    // Fill in the form
    await userEvent.type(screen.getByLabelText(/username/i), 'testuser');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /login/i }));
    
    // Check for loading state
    expect(screen.getByRole('button', { name: /logging in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /logging in/i })).toBeDisabled();
    
    // Wait for login to complete
    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('testuser', 'password123');
    });
  });
});