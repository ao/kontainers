import React from 'react';
import { render, screen, fireEvent, waitFor } from '@tests/utils/test-utils';
import { ConfigurationForm } from '@/components/settings/ConfigurationForm';

describe('ConfigurationForm Component', () => {
  const mockOnSave = jest.fn().mockResolvedValue(undefined);
  const mockOnCancel = jest.fn();
  
  const mockInitialConfig = {
    general: {
      systemName: 'Test System',
      adminEmail: 'admin@example.com',
      logLevel: 'info',
      dataRetentionDays: 30,
      enableTelemetry: true,
    },
    proxy: {
      defaultTimeout: 30000,
      maxConnections: 1000,
      enableCompression: true,
      tlsVersion: 'TLS 1.3',
      cipherSuites: ['TLS_AES_128_GCM_SHA256', 'TLS_AES_256_GCM_SHA384'],
      headerTransformation: false,
    },
    security: {
      enableFirewall: true,
      allowedIPs: ['192.168.1.1', '10.0.0.1'],
      blockedIPs: ['1.2.3.4'],
      rateLimiting: {
        enabled: true,
        requestsPerMinute: 60,
        burstSize: 10,
      },
      authMethods: ['basic', 'jwt'],
    },
    notifications: {
      email: {
        enabled: false,
        smtpServer: '',
        smtpPort: 587,
        smtpUsername: '',
        smtpPassword: '',
        useTLS: true,
      },
      slack: {
        enabled: false,
        webhookUrl: '',
        channel: '',
      },
      alertThresholds: {
        cpuUsage: 80,
        memoryUsage: 80,
        diskUsage: 85,
        errorRate: 5,
      },
    },
    advanced: {
      customEnvironmentVariables: {
        NODE_ENV: 'production',
        DEBUG: 'false'
      },
      startupCommands: [],
      shutdownCommands: [],
      enableDebugMode: false,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders form with default values when no initial config is provided', () => {
    render(
      <ConfigurationForm
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    // Check that form is rendered with default values
    expect(screen.getByLabelText(/System Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Admin Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Log Level/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Data Retention/i)).toBeInTheDocument();
    
    // Check default values
    expect(screen.getByLabelText(/System Name/i)).toHaveValue('Kontainers');
    expect(screen.getByLabelText(/Admin Email/i)).toHaveValue('');
    expect(screen.getByLabelText(/Data Retention/i)).toHaveValue('30');
  });

  test('renders form with initial config values when provided', () => {
    render(
      <ConfigurationForm
        initialConfig={mockInitialConfig}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    // Check that form is rendered with initial values
    expect(screen.getByLabelText(/System Name/i)).toHaveValue('Test System');
    expect(screen.getByLabelText(/Admin Email/i)).toHaveValue('admin@example.com');
    expect(screen.getByLabelText(/Data Retention/i)).toHaveValue('30');
  });

  test('switches between tabs correctly', () => {
    render(
      <ConfigurationForm
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    // Initially on General tab
    expect(screen.getByText('General Settings')).toBeInTheDocument();
    
    // Click on Proxy Settings tab
    fireEvent.click(screen.getByText('Proxy Settings'));
    expect(screen.getByText('Proxy Settings')).toBeInTheDocument();
    expect(screen.getByLabelText(/Default Timeout/i)).toBeInTheDocument();
    
    // Click on Security tab
    fireEvent.click(screen.getByText('Security'));
    expect(screen.getByText('Security Settings')).toBeInTheDocument();
    expect(screen.getByLabelText(/Enable Firewall/i)).toBeInTheDocument();
    
    // Click on Notifications tab
    fireEvent.click(screen.getByText('Notifications'));
    expect(screen.getByText('Email Notifications')).toBeInTheDocument();
    expect(screen.getByLabelText(/SMTP Server/i)).toBeInTheDocument();
    
    // Click on Advanced tab
    fireEvent.click(screen.getByText('Advanced'));
    expect(screen.getByText('Custom Environment Variables')).toBeInTheDocument();
    
    // Back to General tab
    fireEvent.click(screen.getByText('General'));
    expect(screen.getByText('General Settings')).toBeInTheDocument();
  });

  test('validates form fields correctly', async () => {
    render(
      <ConfigurationForm
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    // Clear required fields
    fireEvent.change(screen.getByLabelText(/System Name/i), { target: { value: '' } });
    
    // Submit form
    fireEvent.click(screen.getByText('Save Configuration'));
    
    // Check validation errors
    await waitFor(() => {
      expect(screen.getByText('System name is required')).toBeInTheDocument();
    });
    
    // Fill in required fields
    fireEvent.change(screen.getByLabelText(/System Name/i), { target: { value: 'Test System' } });
    
    // Submit form again
    fireEvent.click(screen.getByText('Save Configuration'));
    
    // Check that onSave was called
    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalled();
    });
  });

  test('validates email format correctly', async () => {
    render(
      <ConfigurationForm
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    // Enter invalid email
    fireEvent.change(screen.getByLabelText(/Admin Email/i), { target: { value: 'invalid-email' } });
    
    // Submit form
    fireEvent.click(screen.getByText('Save Configuration'));
    
    // Check validation errors
    await waitFor(() => {
      expect(screen.getByText('Invalid email format')).toBeInTheDocument();
    });
    
    // Fix email
    fireEvent.change(screen.getByLabelText(/Admin Email/i), { target: { value: 'admin@example.com' } });
    
    // Submit form again
    fireEvent.click(screen.getByText('Save Configuration'));
    
    // Check that validation error is gone
    await waitFor(() => {
      expect(screen.queryByText('Invalid email format')).not.toBeInTheDocument();
    });
  });

  test('calls onCancel when cancel button is clicked', () => {
    render(
      <ConfigurationForm
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(mockOnCancel).toHaveBeenCalled();
  });

  test('handles adding and removing allowed IPs', async () => {
    render(
      <ConfigurationForm
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    // Go to Security tab
    fireEvent.click(screen.getByText('Security'));
    
    // Check that IP input field is rendered
    const ipInput = screen.getByPlaceholderText('Enter IP address');
    expect(ipInput).toBeInTheDocument();
    
    // Add an IP
    fireEvent.change(ipInput, { target: { value: '192.168.1.1' } });
    fireEvent.click(screen.getByText('Add IP'));
    
    // Check that IP was added
    await waitFor(() => {
      expect(screen.getByText('192.168.1.1')).toBeInTheDocument();
    });
    
    // Add another IP
    fireEvent.change(ipInput, { target: { value: '10.0.0.1' } });
    fireEvent.click(screen.getByText('Add IP'));
    
    // Check that both IPs are displayed
    await waitFor(() => {
      expect(screen.getByText('192.168.1.1')).toBeInTheDocument();
      expect(screen.getByText('10.0.0.1')).toBeInTheDocument();
    });
    
    // Remove an IP
    const removeButtons = screen.getAllByText('Remove');
    fireEvent.click(removeButtons[0]);
    
    // Check that IP was removed
    await waitFor(() => {
      expect(screen.queryByText('192.168.1.1')).not.toBeInTheDocument();
      expect(screen.getByText('10.0.0.1')).toBeInTheDocument();
    });
  });

  test('handles adding and removing environment variables', async () => {
    render(
      <ConfigurationForm
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    // Go to Advanced tab
    fireEvent.click(screen.getByText('Advanced'));
    
    // Check that environment variable inputs are rendered
    const keyInput = screen.getByPlaceholderText('Key');
    const valueInput = screen.getByPlaceholderText('Value');
    expect(keyInput).toBeInTheDocument();
    expect(valueInput).toBeInTheDocument();
    
    // Add an environment variable
    fireEvent.change(keyInput, { target: { value: 'DEBUG' } });
    fireEvent.change(valueInput, { target: { value: 'true' } });
    fireEvent.click(screen.getByText('Add Variable'));
    
    // Check that variable was added
    await waitFor(() => {
      expect(screen.getByText('DEBUG')).toBeInTheDocument();
      expect(screen.getByText('true')).toBeInTheDocument();
    });
    
    // Add another variable
    fireEvent.change(keyInput, { target: { value: 'NODE_ENV' } });
    fireEvent.change(valueInput, { target: { value: 'development' } });
    fireEvent.click(screen.getByText('Add Variable'));
    
    // Check that both variables are displayed
    await waitFor(() => {
      expect(screen.getByText('DEBUG')).toBeInTheDocument();
      expect(screen.getByText('true')).toBeInTheDocument();
      expect(screen.getByText('NODE_ENV')).toBeInTheDocument();
      expect(screen.getByText('development')).toBeInTheDocument();
    });
    
    // Remove a variable
    const removeButtons = screen.getAllByText('Remove');
    fireEvent.click(removeButtons[0]);
    
    // Check that variable was removed
    await waitFor(() => {
      expect(screen.queryByText('DEBUG')).not.toBeInTheDocument();
      expect(screen.queryByText('true')).not.toBeInTheDocument();
      expect(screen.getByText('NODE_ENV')).toBeInTheDocument();
      expect(screen.getByText('development')).toBeInTheDocument();
    });
  });
});