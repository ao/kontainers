import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../utils/test-utils';
import ContainerStats from '@frontend/src/components/containers/ContainerStats';
import { HealthStatus } from '@shared/src/models';

// Mock the container service
jest.mock('@frontend/src/services/containerService', () => ({
  fetchDetailedContainerStats: jest.fn()
}));

// Mock react-query
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: jest.fn()
}));

import { fetchDetailedContainerStats } from '@frontend/src/services/containerService';
import { useQuery } from '@tanstack/react-query';

describe('ContainerStats Component', () => {
  const mockContainerId = 'container-1';
  const mockStats = {
    cpuUsage: 5.2,
    cpuKernelUsage: 1.3,
    cpuUserUsage: 3.9,
    cpuSystemUsage: 0.5,
    cpuOnlineCpus: 4,
    memoryUsage: 52428800, // 50MB
    memoryLimit: 1073741824, // 1GB
    memoryUsagePercentage: 4.88,
    memoryCache: 10485760, // 10MB
    memorySwap: 0,
    memorySwapLimit: 2147483648, // 2GB
    networkRx: 1024000, // 1MB
    networkTx: 512000, // 0.5MB
    networkPacketsRx: 1000,
    networkPacketsTx: 500,
    networkThroughput: 10240, // 10KB/s
    blockRead: 2048000, // 2MB
    blockWrite: 1024000, // 1MB
    blockReadOps: 200,
    blockWriteOps: 100,
    blockThroughput: 5120, // 5KB/s
    pids: 5,
    restartCount: 0,
    healthStatus: HealthStatus.HEALTHY,
    healthCheckLogs: ['Health check passed']
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useQuery as jest.Mock).mockReturnValue({
      data: mockStats,
      isLoading: false,
      error: null,
      refetch: jest.fn()
    });
    (fetchDetailedContainerStats as jest.Mock).mockResolvedValue(mockStats);
  });

  it('renders container stats correctly', () => {
    renderWithProviders(
      <ContainerStats 
        stats={mockStats} 
        isLoading={false} 
        containerId={mockContainerId} 
      />
    );
    
    // CPU stats
    expect(screen.getByText('CPU Usage')).toBeInTheDocument();
    expect(screen.getByText('5.20%')).toBeInTheDocument();
    expect(screen.getByText(/Kernel: 1.30%/)).toBeInTheDocument();
    expect(screen.getByText(/User: 3.90%/)).toBeInTheDocument();
    
    // Memory stats
    expect(screen.getByText('Memory Usage')).toBeInTheDocument();
    expect(screen.getByText('4.88%')).toBeInTheDocument();
    expect(screen.getByText(/50 MB \/ 1 GB/)).toBeInTheDocument();
    
    // Network stats
    expect(screen.getByText('Network I/O')).toBeInTheDocument();
    expect(screen.getByText(/10 KB\/s/)).toBeInTheDocument();
    expect(screen.getByText(/Rx: 1 MB/)).toBeInTheDocument();
    expect(screen.getByText(/Tx: 512 KB/)).toBeInTheDocument();
    
    // Block I/O stats
    expect(screen.getByText('Block I/O')).toBeInTheDocument();
    expect(screen.getByText(/5 KB\/s/)).toBeInTheDocument();
    expect(screen.getByText(/Read: 2 MB/)).toBeInTheDocument();
    expect(screen.getByText(/Write: 1 MB/)).toBeInTheDocument();
    
    // Health status
    expect(screen.getByText('Health Status')).toBeInTheDocument();
    expect(screen.getByText('HEALTHY')).toBeInTheDocument();
    expect(screen.getByText('Health check passed')).toBeInTheDocument();
  });

  it('shows loading state when fetching stats', () => {
    (useQuery as jest.Mock).mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      refetch: jest.fn()
    });
    
    renderWithProviders(
      <ContainerStats 
        isLoading={true} 
        containerId={mockContainerId} 
      />
    );
    
    expect(screen.getByText('Loading container statistics...')).toBeInTheDocument();
  });

  it('shows empty state when no stats are available', () => {
    (useQuery as jest.Mock).mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: jest.fn()
    });
    
    renderWithProviders(
      <ContainerStats 
        stats={undefined} 
        isLoading={false} 
        containerId={mockContainerId} 
      />
    );
    
    expect(screen.getByText('No statistics available')).toBeInTheDocument();
  });

  it('formats bytes correctly', () => {
    renderWithProviders(
      <ContainerStats 
        stats={mockStats} 
        isLoading={false} 
        containerId={mockContainerId} 
      />
    );
    
    // Check that bytes are formatted correctly
    expect(screen.getByText(/50 MB \/ 1 GB/)).toBeInTheDocument();
    expect(screen.getByText(/Rx: 1 MB/)).toBeInTheDocument();
    expect(screen.getByText(/Tx: 512 KB/)).toBeInTheDocument();
  });

  it('displays health status with correct color', () => {
    // Test with different health statuses
    const healthyStats = { ...mockStats, healthStatus: HealthStatus.HEALTHY };
    const degradedStats = { ...mockStats, healthStatus: HealthStatus.DEGRADED };
    const unhealthyStats = { ...mockStats, healthStatus: HealthStatus.UNHEALTHY };
    
    // Test HEALTHY status
    (useQuery as jest.Mock).mockReturnValue({
      data: healthyStats,
      isLoading: false,
      error: null,
      refetch: jest.fn()
    });
    
    const { rerender } = renderWithProviders(
      <ContainerStats 
        stats={healthyStats} 
        isLoading={false} 
        containerId={mockContainerId} 
      />
    );
    
    let healthStatus = screen.getByText('HEALTHY');
    expect(healthStatus).toHaveClass('text-green-500');
    
    // Test DEGRADED status
    (useQuery as jest.Mock).mockReturnValue({
      data: degradedStats,
      isLoading: false,
      error: null,
      refetch: jest.fn()
    });
    
    rerender(
      <ContainerStats 
        stats={degradedStats} 
        isLoading={false} 
        containerId={mockContainerId} 
      />
    );
    
    healthStatus = screen.getByText('DEGRADED');
    expect(healthStatus).toHaveClass('text-yellow-500');
    
    // Test UNHEALTHY status
    (useQuery as jest.Mock).mockReturnValue({
      data: unhealthyStats,
      isLoading: false,
      error: null,
      refetch: jest.fn()
    });
    
    rerender(
      <ContainerStats 
        stats={unhealthyStats} 
        isLoading={false} 
        containerId={mockContainerId} 
      />
    );
    
    healthStatus = screen.getByText('UNHEALTHY');
    expect(healthStatus).toHaveClass('text-red-500');
  });

  it('updates historical data when stats change', async () => {
    // Mock implementation to track state updates
    const mockSetHistoricalData = jest.fn();
    const useStateSpy = jest.spyOn(React, 'useState');
    
    // Mock useState to return our mock function for setHistoricalData
    useStateSpy.mockImplementation((initialState) => {
      if (typeof initialState === 'object' && initialState !== null && 'cpu' in initialState) {
        return [initialState, mockSetHistoricalData];
      }
      return [initialState, jest.fn()];
    });
    
    renderWithProviders(
      <ContainerStats 
        stats={mockStats} 
        isLoading={false} 
        containerId={mockContainerId} 
      />
    );
    
    await waitFor(() => {
      expect(mockSetHistoricalData).toHaveBeenCalled();
    });
    
    // Restore the original implementation
    useStateSpy.mockRestore();
  });

  it('refreshes stats when refresh button is clicked', () => {
    const mockRefetch = jest.fn();
    (useQuery as jest.Mock).mockReturnValue({
      data: mockStats,
      isLoading: false,
      error: null,
      refetch: mockRefetch
    });
    
    renderWithProviders(
      <ContainerStats 
        containerId={mockContainerId} 
      />
    );
    
    const refreshButton = screen.getByRole('button', { name: /refresh stats/i });
    refreshButton.click();
    
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});