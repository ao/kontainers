import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Register } from '@frontend/src/components/auth/Register';
import { AuthContext } from '@frontend/src/contexts/AuthContext';
import { renderWithProviders } from '../../../utils/test-utils';

// Mock the auth service
jest.mock('@frontend/src/services/authService', () => ({
  register: jest.fn()
}));

import { register } from '@frontend/src/services/authService';

describe('Register Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders registration form correctly', () => {
    renderWithProviders(<Register />);
    
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument();
    expect(screen.getByText(/already have an account\?/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /login/i })).toBeInTheDocument();
  });

  it('validates form inputs', async () => {
    renderWithProviders(<Register />);
    
    const registerButton = screen.getByRole('button', { name: /register/i });
    
    // Try to submit with empty fields
    fireEvent.click(registerButton);
    
    await waitFor(() => {
      expect(screen.getByText(/username is required/i)).toBeInTheDocument();
      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
    
    // Fill in username but not other fields
    await userEvent.type(screen.getByLabelText(/username/i), 'testuser');
    fireEvent.click(registerButton);
    
    await waitFor(() => {
      expect(screen.queryByText(/username is required/i)).not.toBeInTheDocument();
      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
    
    // Test email validation
    await userEvent.type(screen.getByLabelText(/email/i), 'invalid-email');
    fireEvent.click(registerButton);
    
    await waitFor(() => {
      expect(screen.getByText(/invalid email format/i)).toBeInTheDocument();
    });
    
    // Test password confirmation
    await userEvent.clear(screen.getByLabelText(/email/i));
    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'different');
    fireEvent.click(registerButton);
    
    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
  });

  it('submits the form with valid data', async () => {
    // Mock successful registration
    (register as jest.Mock).mockResolvedValue({
      user: { id: '1', username: 'newuser', email: 'new@example.com', role: 'USER' }
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
        <Register />
      </AuthContext.Provider>
    );
    
    // Fill in the form
    await userEvent.type(screen.getByLabelText(/username/i), 'newuser');
    await userEvent.type(screen.getByLabelText(/email/i), 'new@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'password123');
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /register/i }));
    
    await waitFor(() => {
      expect(register).toHaveBeenCalledWith({
        username: 'newuser',
        email: 'new@example.com',
        password: 'password123'
      });
      expect(mockSetUser).toHaveBeenCalledWith({
        id: '1',
        username: 'newuser',
        email: 'new@example.com',
        role: 'USER'
      });
    });
  });

  it('displays error message on registration failure', async () => {
    // Mock failed registration
    (register as jest.Mock).mockRejectedValue(new Error('Username already exists'));
    
    renderWithProviders(<Register />);
    
    // Fill in the form
    await userEvent.type(screen.getByLabelText(/username/i), 'existinguser');
    await userEvent.type(screen.getByLabelText(/email/i), 'existing@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'password123');
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /register/i }));
    
    await waitFor(() => {
      expect(register).toHaveBeenCalledWith({
        username: 'existinguser',
        email: 'existing@example.com',
        password: 'password123'
      });
      expect(screen.getByText(/username already exists/i)).toBeInTheDocument();
    });
  });

  it('navigates to login page when login link is clicked', () => {
    const { history } = renderWithProviders(<Register />);
    
    fireEvent.click(screen.getByRole('link', { name: /login/i }));
    
    expect(history.location.pathname).toBe('/login');
  });

  it('shows loading state during registration process', async () => {
    // Mock registration with delay to show loading state
    (register as jest.Mock).mockImplementation(() => {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            user: { id: '1', username: 'newuser', email: 'new@example.com', role: 'USER' }
          });
        }, 100);
      });
    });
    
    renderWithProviders(<Register />);
    
    // Fill in the form
    await userEvent.type(screen.getByLabelText(/username/i), 'newuser');
    await userEvent.type(screen.getByLabelText(/email/i), 'new@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'password123');
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /register/i }));
    
    // Check for loading state
    expect(screen.getByRole('button', { name: /registering/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /registering/i })).toBeDisabled();
    
    // Wait for registration to complete
    await waitFor(() => {
      expect(register).toHaveBeenCalledWith({
        username: 'newuser',
        email: 'new@example.com',
        password: 'password123'
      });
    });
  });
});