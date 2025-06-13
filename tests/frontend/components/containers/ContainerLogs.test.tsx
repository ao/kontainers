import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../utils/test-utils';
import ContainerLogs from '@frontend/src/components/containers/ContainerLogs';

// Mock the container service
jest.mock('@frontend/src/services/containerService', () => ({
  fetchContainerLogs: jest.fn()
}));

// Mock react-query
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: jest.fn()
}));

import { fetchContainerLogs } from '@frontend/src/services/containerService';
import { useQuery } from '@tanstack/react-query';

describe('ContainerLogs Component', () => {
  const mockLogs = 'Line 1: Starting container\nLine 2: Initializing\nLine 3: INFO: Service started\nLine 4: WARN: Low disk space\nLine 5: ERROR: Connection failed\nLine 6: DEBUG: Connection attempt details';
  const mockContainerId = 'container-1';
  
  beforeEach(() => {
    jest.clearAllMocks();
    (useQuery as jest.Mock).mockReturnValue({
      data: mockLogs,
      isLoading: false,
      error: null,
      refetch: jest.fn()
    });
    (fetchContainerLogs as jest.Mock).mockResolvedValue(mockLogs);
  });

  it('renders logs correctly', () => {
    renderWithProviders(
      <ContainerLogs 
        logs={mockLogs} 
        isLoading={false} 
        containerId={mockContainerId} 
      />
    );
    
    expect(screen.getByText('Line 1: Starting container')).toBeInTheDocument();
    expect(screen.getByText('Line 3: INFO: Service started')).toBeInTheDocument();
    expect(screen.getByText('Line 5: ERROR: Connection failed')).toBeInTheDocument();
  });

  it('shows loading state when fetching logs', () => {
    renderWithProviders(
      <ContainerLogs 
        isLoading={true} 
        containerId={mockContainerId} 
      />
    );
    
    expect(screen.getByText('Loading logs...')).toBeInTheDocument();
  });

  it('shows empty state when no logs are available', () => {
    renderWithProviders(
      <ContainerLogs 
        logs="" 
        isLoading={false} 
        containerId={mockContainerId} 
      />
    );
    
    expect(screen.getByText('No logs available')).toBeInTheDocument();
  });

  it('filters logs based on search term', async () => {
    renderWithProviders(
      <ContainerLogs 
        logs={mockLogs} 
        isLoading={false} 
        containerId={mockContainerId} 
      />
    );
    
    const filterInput = screen.getByPlaceholderText('Filter logs...');
    fireEvent.change(filterInput, { target: { value: 'ERROR' } });
    
    await waitFor(() => {
      expect(screen.getByText('Line 5: ERROR: Connection failed')).toBeInTheDocument();
      expect(screen.queryByText('Line 1: Starting container')).not.toBeInTheDocument();
    });
  });

  it('toggles auto-scroll when checkbox is clicked', () => {
    renderWithProviders(
      <ContainerLogs 
        logs={mockLogs} 
        isLoading={false} 
        containerId={mockContainerId} 
      />
    );
    
    const autoScrollCheckbox = screen.getByLabelText('Auto-scroll');
    expect(autoScrollCheckbox).toBeChecked(); // Default is checked
    
    fireEvent.click(autoScrollCheckbox);
    expect(autoScrollCheckbox).not.toBeChecked();
  });

  it('refreshes logs when refresh button is clicked', () => {
    const mockRefetch = jest.fn();
    (useQuery as jest.Mock).mockReturnValue({
      data: mockLogs,
      isLoading: false,
      error: null,
      refetch: mockRefetch
    });
    
    renderWithProviders(
      <ContainerLogs 
        containerId={mockContainerId} 
      />
    );
    
    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(refreshButton);
    
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('calls onRefresh prop when refresh button is clicked and prop is provided', () => {
    const mockOnRefresh = jest.fn();
    
    renderWithProviders(
      <ContainerLogs 
        logs={mockLogs} 
        isLoading={false} 
        containerId={mockContainerId} 
        onRefresh={mockOnRefresh}
      />
    );
    
    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(refreshButton);
    
    expect(mockOnRefresh).toHaveBeenCalledTimes(1);
  });

  it('applies correct color coding to log lines', () => {
    renderWithProviders(
      <ContainerLogs 
        logs={mockLogs} 
        isLoading={false} 
        containerId={mockContainerId} 
      />
    );
    
    // Get the elements by text content
    const errorLine = screen.getByText('Line 5: ERROR: Connection failed');
    const warnLine = screen.getByText('Line 4: WARN: Low disk space');
    const infoLine = screen.getByText('Line 3: INFO: Service started');
    const debugLine = screen.getByText('Line 6: DEBUG: Connection attempt details');
    
    // Check that they have the correct CSS classes
    expect(errorLine).toHaveClass('text-red-600');
    expect(warnLine).toHaveClass('text-yellow-600');
    expect(infoLine).toHaveClass('text-blue-600');
    expect(debugLine).toHaveClass('text-gray-500');
  });

  it('shows the correct count of filtered lines', async () => {
    renderWithProviders(
      <ContainerLogs 
        logs={mockLogs} 
        isLoading={false} 
        containerId={mockContainerId} 
      />
    );
    
    // Initially shows total count
    expect(screen.getByText('6 lines total')).toBeInTheDocument();
    
    // Filter logs
    const filterInput = screen.getByPlaceholderText('Filter logs...');
    fireEvent.change(filterInput, { target: { value: 'Line' } });
    
    // Should still show all lines
    expect(screen.getByText('6 lines total')).toBeInTheDocument();
    
    // More specific filter
    fireEvent.change(filterInput, { target: { value: 'ERROR' } });
    
    await waitFor(() => {
      expect(screen.getByText('Showing 1 of 6 lines')).toBeInTheDocument();
    });
  });

  it('triggers download when download button is clicked', () => {
    // Mock the URL.createObjectURL and document methods
    const mockCreateObjectURL = jest.fn(() => 'mock-url');
    const mockRevokeObjectURL = jest.fn();
    URL.createObjectURL = mockCreateObjectURL;
    URL.revokeObjectURL = mockRevokeObjectURL;
    
    const mockAppendChild = jest.fn();
    const mockRemoveChild = jest.fn();
    const mockClick = jest.fn();
    
    document.body.appendChild = mockAppendChild;
    document.body.removeChild = mockRemoveChild;
    
    // Mock createElement to return an object with a click method
    document.createElement = jest.fn(() => ({
      href: '',
      download: '',
      click: mockClick
    }));
    
    renderWithProviders(
      <ContainerLogs 
        logs={mockLogs} 
        isLoading={false} 
        containerId={mockContainerId} 
      />
    );
    
    const downloadButton = screen.getByRole('button', { name: /download logs/i });
    fireEvent.click(downloadButton);
    
    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalled();
  });
});