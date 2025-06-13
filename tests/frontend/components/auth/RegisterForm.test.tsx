import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../utils/test-utils';
import RegisterForm from '@frontend/src/components/auth/RegisterForm';

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

describe('RegisterForm Component', () => {
  const mockRegister = jest.fn();
  const mockNavigate = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock useNavigate
    const mockUseNavigate = jest.requireMock('react-router-dom').useNavigate;
    mockUseNavigate.mockReturnValue(mockNavigate);
    
    // Mock useAuthStore
    (useAuthStore as jest.Mock).mockReturnValue({
      register: mockRegister
    });
  });

  it('renders register form correctly', () => {
    renderWithProviders(<RegisterForm />);
    
    expect(screen.getByText('Create your account')).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByText(/already have an account/i)).toBeInTheDocument();
    expect(screen.getByText(/sign in instead/i)).toBeInTheDocument();
  });

  it('validates required fields', async () => {
    renderWithProviders(<RegisterForm />);
    
    const createAccountButton = screen.getByRole('button', { name: /create account/i });
    
    // Try to submit with empty fields
    fireEvent.click(createAccountButton);
    
    await waitFor(() => {
      expect(screen.getByText(/all fields are required/i)).toBeInTheDocument();
    });
  });

  it('validates password match', async () => {
    renderWithProviders(<RegisterForm />);
    
    // Fill in the form with mismatched passwords
    await userEvent.type(screen.getByLabelText(/username/i), 'testuser');
    await userEvent.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'password123');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'password456');
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
  });

  it('validates password length', async () => {
    renderWithProviders(<RegisterForm />);
    
    // Fill in the form with a short password
    await userEvent.type(screen.getByLabelText(/username/i), 'testuser');
    await userEvent.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'pass');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'pass');
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/password must be at least 8 characters long/i)).toBeInTheDocument();
    });
  });

  it('submits the form with valid data', async () => {
    mockRegister.mockResolvedValue({
      user: { id: '1', username: 'testuser', email: 'test@example.com', role: 'USER' }
    });
    
    renderWithProviders(<RegisterForm />);
    
    // Fill in the form with valid data
    await userEvent.type(screen.getByLabelText(/username/i), 'testuser');
    await userEvent.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'password123');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'password123');
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    
    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('testuser', 'test@example.com', 'password123');
      expect(mockNavigate).toHaveBeenCalledWith('/login?registered=true');
    });
  });

  it('displays error message on registration failure', async () => {
    const errorMessage = 'Email already in use';
    mockRegister.mockRejectedValue({
      response: {
        data: {
          message: errorMessage
        }
      }
    });
    
    renderWithProviders(<RegisterForm />);
    
    // Fill in the form with valid data
    await userEvent.type(screen.getByLabelText(/username/i), 'testuser');
    await userEvent.type(screen.getByLabelText(/email address/i), 'existing@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'password123');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'password123');
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    
    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('testuser', 'existing@example.com', 'password123');
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  it('navigates to login page when sign in link is clicked', () => {
    renderWithProviders(<RegisterForm />);
    
    fireEvent.click(screen.getByText(/sign in instead/i));
    
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  it('shows loading state during registration process', async () => {
    // Mock register with delay to show loading state
    mockRegister.mockImplementation(() => {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            user: { id: '1', username: 'testuser', email: 'test@example.com', role: 'USER' }
          });
        }, 100);
      });
    });
    
    renderWithProviders(<RegisterForm />);
    
    // Fill in the form with valid data
    await userEvent.type(screen.getByLabelText(/username/i), 'testuser');
    await userEvent.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'password123');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'password123');
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    
    // Check for loading state
    expect(screen.getByRole('button', { name: /creating account/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /creating account/i })).toBeDisabled();
    
    // Wait for registration to complete
    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('testuser', 'test@example.com', 'password123');
    });
  });
});