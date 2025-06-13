import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../utils/test-utils';
import LoginForm from '@frontend/src/components/auth/LoginForm';

// Mock react-router-dom
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn()
}));

// Mock the auth store
jest.mock('@frontend/src/store/authStore', () => ({
  useAuthStore: jest.fn()
}));

import { useAuthStore } from '@frontend/src/store/authStore';

describe('LoginForm Component', () => {
  const mockLogin = jest.fn();
  const mockNavigate = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock useNavigate
    const mockUseNavigate = jest.requireMock('react-router-dom').useNavigate;
    mockUseNavigate.mockReturnValue(mockNavigate);
    
    // Mock useAuthStore
    (useAuthStore as jest.Mock).mockReturnValue({
      login: mockLogin,
      isAuthenticated: false,
      user: null
    });
  });

  it('renders login form correctly', () => {
    renderWithProviders(<LoginForm />);
    
    expect(screen.getByText('Sign in to Kontainers')).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByText(/forgot your password/i)).toBeInTheDocument();
    expect(screen.getByText(/create a new account/i)).toBeInTheDocument();
  });

  it('validates form inputs', async () => {
    renderWithProviders(<LoginForm />);
    
    const signInButton = screen.getByRole('button', { name: /sign in/i });
    
    // Try to submit with empty fields
    fireEvent.click(signInButton);
    
    await waitFor(() => {
      expect(screen.getByText(/please enter both email and password/i)).toBeInTheDocument();
    });
    
    // Fill in email but not password
    await userEvent.type(screen.getByLabelText(/email address/i), 'test@example.com');
    fireEvent.click(signInButton);
    
    await waitFor(() => {
      expect(screen.getByText(/please enter both email and password/i)).toBeInTheDocument();
    });
  });

  it('submits the form with valid credentials', async () => {
    mockLogin.mockResolvedValue({
      user: { id: '1', email: 'test@example.com', username: 'testuser', role: 'ADMIN' },
      token: 'mock-token'
    });
    
    renderWithProviders(<LoginForm />);
    
    // Fill in the form
    await userEvent.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('displays error message on login failure', async () => {
    const errorMessage = 'Login failed. Please check your credentials.';
    mockLogin.mockRejectedValue({
      response: {
        data: {
          message: errorMessage
        }
      }
    });
    
    renderWithProviders(<LoginForm />);
    
    // Fill in the form
    await userEvent.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrongpassword');
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'wrongpassword');
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  it('navigates to register page when create account link is clicked', () => {
    renderWithProviders(<LoginForm />);
    
    fireEvent.click(screen.getByText(/create a new account/i));
    
    expect(mockNavigate).toHaveBeenCalledWith('/register');
  });

  it('navigates to forgot password page when forgot password link is clicked', () => {
    renderWithProviders(<LoginForm />);
    
    fireEvent.click(screen.getByText(/forgot your password/i));
    
    expect(mockNavigate).toHaveBeenCalledWith('/forgot-password');
  });

  it('shows loading state during login process', async () => {
    // Mock login with delay to show loading state
    mockLogin.mockImplementation(() => {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            user: { id: '1', email: 'test@example.com', username: 'testuser', role: 'ADMIN' },
            token: 'mock-token'
          });
        }, 100);
      });
    });
    
    renderWithProviders(<LoginForm />);
    
    // Fill in the form
    await userEvent.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    
    // Check for loading state
    expect(screen.getByRole('button', { name: /signing in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    
    // Wait for login to complete
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
    });
  });

  it('toggles remember me checkbox', async () => {
    renderWithProviders(<LoginForm />);
    
    const rememberMeCheckbox = screen.getByLabelText(/remember me/i);
    expect(rememberMeCheckbox).not.toBeChecked();
    
    fireEvent.click(rememberMeCheckbox);
    expect(rememberMeCheckbox).toBeChecked();
    
    fireEvent.click(rememberMeCheckbox);
    expect(rememberMeCheckbox).not.toBeChecked();
  });
});