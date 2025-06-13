import React from 'react';
import { render, screen, fireEvent, waitFor } from '@tests/utils/test-utils';
import { ProxyRuleForm } from '@/components/proxy/ProxyRuleForm';
import { mockProxyRule } from '@tests/utils/test-utils';
import { useProxyStore } from '@/stores/proxyStore';

// Mock the proxyStore
jest.mock('@/stores/proxyStore', () => ({
  useProxyStore: jest.fn()
}));

describe('ProxyRuleForm Component', () => {
  const mockRule = mockProxyRule();
  const mockOnSubmit = jest.fn();
  const mockOnCancel = jest.fn();
  
  const mockContainers = [
    { id: 'container-1', name: 'Container 1' },
    { id: 'container-2', name: 'Container 2' },
    { id: 'container-3', name: 'Container 3' }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (useProxyStore as jest.Mock).mockReturnValue({
      containers: mockContainers
    });
  });

  test('renders form with default values when no initial rule is provided', () => {
    render(
      <ProxyRuleForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    // Check that form is rendered with default values
    expect(screen.getByLabelText(/Rule Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Source Host/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Source Path/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Target Container/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Target Port/i)).toBeInTheDocument();
    
    // Check default values
    expect(screen.getByLabelText(/Rule Name/i)).toHaveValue('');
    expect(screen.getByLabelText(/Source Host/i)).toHaveValue('');
    expect(screen.getByLabelText(/Source Path/i)).toHaveValue('/');
    expect(screen.getByLabelText(/Target Port/i)).toHaveValue('80');
  });

  test('renders form with initial rule values when provided', () => {
    render(
      <ProxyRuleForm
        initialRule={mockRule}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    // Check that form is rendered with initial values
    expect(screen.getByLabelText(/Rule Name/i)).toHaveValue(mockRule.name);
    expect(screen.getByLabelText(/Source Host/i)).toHaveValue(mockRule.sourceHost);
    expect(screen.getByLabelText(/Source Path/i)).toHaveValue(mockRule.sourcePath);
    expect(screen.getByLabelText(/Target Port/i)).toHaveValue(mockRule.targetPort.toString());
  });

  test('switches between tabs correctly', () => {
    render(
      <ProxyRuleForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    // Initially on Basic tab
    expect(screen.getByText('Routing Configuration')).toBeInTheDocument();
    
    // Click on Headers tab
    fireEvent.click(screen.getByText('Headers'));
    expect(screen.getByText('Request Headers')).toBeInTheDocument();
    
    // Click on Health Check tab
    fireEvent.click(screen.getByText('Health Check'));
    expect(screen.getByText('Health Check Configuration')).toBeInTheDocument();
    
    // Click on Load Balancing tab
    fireEvent.click(screen.getByText('Load Balancing'));
    expect(screen.getByText('Load Balancing Configuration')).toBeInTheDocument();
    
    // Click on Advanced tab
    fireEvent.click(screen.getByText('Advanced'));
    expect(screen.getByText('Advanced Configuration')).toBeInTheDocument();
    
    // Back to Basic tab
    fireEvent.click(screen.getByText('Basic'));
    expect(screen.getByText('Routing Configuration')).toBeInTheDocument();
  });

  test('validates form fields correctly', async () => {
    render(
      <ProxyRuleForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    // Submit form without required fields
    fireEvent.click(screen.getByText('Save Rule'));
    
    // Check validation errors
    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
      expect(screen.getByText('Source host is required')).toBeInTheDocument();
      expect(screen.getByText('Target container or load balancing targets are required')).toBeInTheDocument();
    });
    
    // Fill in required fields
    fireEvent.change(screen.getByLabelText(/Rule Name/i), { target: { value: 'Test Rule' } });
    fireEvent.change(screen.getByLabelText(/Source Host/i), { target: { value: 'test.example.com' } });
    fireEvent.change(screen.getByLabelText(/Target Container/i), { target: { value: 'container-1' } });
    
    // Submit form again
    fireEvent.click(screen.getByText('Save Rule'));
    
    // Check that onSubmit was called
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
    });
  });

  test('calls onCancel when cancel button is clicked', () => {
    render(
      <ProxyRuleForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(mockOnCancel).toHaveBeenCalled();
  });

  test('handles SSL configuration correctly', () => {
    render(
      <ProxyRuleForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    // Initially SSL is disabled
    expect(screen.queryByLabelText(/SSL Certificate Path/i)).not.toBeInTheDocument();
    
    // Enable SSL
    fireEvent.click(screen.getByLabelText(/Enable SSL/i));
    
    // Check that SSL fields are now visible
    expect(screen.getByLabelText(/SSL Certificate Path/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/SSL Key Path/i)).toBeInTheDocument();
    
    // Fill in SSL fields
    fireEvent.change(screen.getByLabelText(/SSL Certificate Path/i), { target: { value: '/path/to/cert.pem' } });
    fireEvent.change(screen.getByLabelText(/SSL Key Path/i), { target: { value: '/path/to/key.pem' } });
    
    // Disable SSL
    fireEvent.click(screen.getByLabelText(/Enable SSL/i));
    
    // Check that SSL fields are hidden again
    expect(screen.queryByLabelText(/SSL Certificate Path/i)).not.toBeInTheDocument();
  });

  test('handles adding and removing load balancing targets', () => {
    render(
      <ProxyRuleForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    // Go to Load Balancing tab
    fireEvent.click(screen.getByText('Load Balancing'));
    
    // Initially no targets
    expect(screen.queryByText('Remove Target')).not.toBeInTheDocument();
    
    // Add a target
    fireEvent.click(screen.getByText('Add Target'));
    
    // Check that target fields are visible
    expect(screen.getByText('Remove Target')).toBeInTheDocument();
    
    // Add another target
    fireEvent.click(screen.getByText('Add Target'));
    
    // Check that we now have two targets
    const removeButtons = screen.getAllByText('Remove Target');
    expect(removeButtons.length).toBe(2);
    
    // Remove a target
    fireEvent.click(removeButtons[0]);
    
    // Check that we now have one target
    expect(screen.getAllByText('Remove Target').length).toBe(1);
  });
});