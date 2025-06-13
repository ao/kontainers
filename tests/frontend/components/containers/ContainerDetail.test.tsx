import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../utils/test-utils';
import ContainerDetail from '@frontend/src/components/containers/ContainerDetail';
import { ContainerState } from '@shared/src/models';

// Mock react-router-dom
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ id: 'container-1' }),
  useNavigate: () => jest.fn()
}));

// Mock the container service
jest.mock('@frontend/src/services/containerService', () => ({
  fetchContainerById: jest.fn(),
  fetchDetailedContainerStats: jest.fn(),
  fetchContainerLogs: jest.fn(),
  startContainer: jest.fn(),
  stopContainer: jest.fn(),
  restartContainer: jest.fn(),
  pauseContainer: jest.fn(),
  unpauseContainer: jest.fn(),
  deleteContainer: jest.fn()
}));

// Mock react-query
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: jest.fn(),
  useMutation: jest.fn(),
  useQueryClient: jest.fn()
}));

import { 
  fetchContainerById, 
  fetchDetailedContainerStats, 
  fetchContainerLogs,
  startContainer,
  stopContainer,
  restartContainer,
  pauseContainer,
  unpauseContainer,
  deleteContainer
} from '@frontend/src/services/containerService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

describe('ContainerDetail Component', () => {
  const mockContainer = {
    id: 'container-1',
    name: 'nginx-web',
    image: 'nginx:latest',
    state: ContainerState.RUNNING,
    status: 'Up 2 hours',
    created: new Date().toISOString(),
    ports: [{ privatePort: 80, publicPort: 8080, type: 'tcp', ip: '0.0.0.0' }],
    networks: ['bridge'],
    volumes: [{ source: '/host/path', destination: '/container/path', mode: 'rw' }],
    env: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'NGINX_VERSION=1.21.0'],
    labels: { 'com.example.vendor': 'ACME', 'com.example.version': '1.0' }
  };

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
    healthStatus: 'HEALTHY',
    healthCheckLogs: ['Health check passed']
  };

  const mockLogs = 'Line 1\nLine 2\nLine 3\nError: Something went wrong\nLine 5';

  const mockQueryClient = {
    invalidateQueries: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock useQuery for container details
    (useQuery as jest.Mock).mockImplementation(({ queryKey }) => {
      if (queryKey[0] === 'container') {
        return {
          data: mockContainer,
          isLoading: false,
          error: null,
          refetch: jest.fn()
        };
      } else if (queryKey[0] === 'containerStats') {
        return {
          data: mockStats,
          isLoading: false,
          refetch: jest.fn()
        };
      } else if (queryKey[0] === 'containerLogs') {
        return {
          data: mockLogs,
          isLoading: false,
          refetch: jest.fn()
        };
      }
      return { data: null, isLoading: false, error: null, refetch: jest.fn() };
    });

    // Mock useMutation
    (useMutation as jest.Mock).mockImplementation(({ mutationFn }) => {
      return {
        mutate: mutationFn,
        isPending: false
      };
    });

    // Mock useQueryClient
    (useQueryClient as jest.Mock).mockReturnValue(mockQueryClient);

    // Mock container service functions
    (fetchContainerById as jest.Mock).mockResolvedValue(mockContainer);
    (fetchDetailedContainerStats as jest.Mock).mockResolvedValue(mockStats);
    (fetchContainerLogs as jest.Mock).mockResolvedValue(mockLogs);
    (startContainer as jest.Mock).mockResolvedValue({ success: true });
    (stopContainer as jest.Mock).mockResolvedValue({ success: true });
    (restartContainer as jest.Mock).mockResolvedValue({ success: true });
    (pauseContainer as jest.Mock).mockResolvedValue({ success: true });
    (unpauseContainer as jest.Mock).mockResolvedValue({ success: true });
    (deleteContainer as jest.Mock).mockResolvedValue({ success: true });
  });

  it('renders container details correctly', () => {
    renderWithProviders(<ContainerDetail />);
    
    expect(screen.getByText('nginx-web')).toBeInTheDocument();
    expect(screen.getByText('nginx:latest')).toBeInTheDocument();
    expect(screen.getByText('Container Information')).toBeInTheDocument();
    expect(screen.getByText('Ports')).toBeInTheDocument();
    expect(screen.getByText('Volumes')).toBeInTheDocument();
    expect(screen.getByText('Networks')).toBeInTheDocument();
    expect(screen.getByText('Environment Variables')).toBeInTheDocument();
    expect(screen.getByText('Labels')).toBeInTheDocument();
  });

  it('shows loading state when fetching container details', () => {
    (useQuery as jest.Mock).mockImplementation(({ queryKey }) => {
      if (queryKey[0] === 'container') {
        return {
          data: null,
          isLoading: true,
          error: null,
          refetch: jest.fn()
        };
      }
      return { data: null, isLoading: false, error: null, refetch: jest.fn() };
    });
    
    renderWithProviders(<ContainerDetail />);
    
    expect(screen.getByText('Loading container details...')).toBeInTheDocument();
  });

  it('shows error message when fetch fails', () => {
    const errorMessage = 'Failed to fetch container details';
    (useQuery as jest.Mock).mockImplementation(({ queryKey }) => {
      if (queryKey[0] === 'container') {
        return {
          data: null,
          isLoading: false,
          error: new Error(errorMessage),
          refetch: jest.fn()
        };
      }
      return { data: null, isLoading: false, error: null, refetch: jest.fn() };
    });
    
    renderWithProviders(<ContainerDetail />);
    
    expect(screen.getByText('Error loading container')).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('switches between tabs correctly', async () => {
    renderWithProviders(<ContainerDetail />);
    
    // Default tab is overview
    expect(screen.getByText('Container Information')).toBeInTheDocument();
    
    // Switch to stats tab
    const statsTab = screen.getByRole('button', { name: /stats/i });
    fireEvent.click(statsTab);
    
    await waitFor(() => {
      expect(screen.getByText('CPU Usage')).toBeInTheDocument();
      expect(screen.getByText('Memory Usage')).toBeInTheDocument();
    });
    
    // Switch to logs tab
    const logsTab = screen.getByRole('button', { name: /logs/i });
    fireEvent.click(logsTab);
    
    await waitFor(() => {
      expect(screen.getByText('Line 1')).toBeInTheDocument();
      expect(screen.getByText('Error: Something went wrong')).toBeInTheDocument();
    });
  });

  it('calls startContainer when Start button is clicked', async () => {
    // Mock a stopped container
    const stoppedContainer = { ...mockContainer, state: ContainerState.STOPPED };
    (useQuery as jest.Mock).mockImplementation(({ queryKey }) => {
      if (queryKey[0] === 'container') {
        return {
          data: stoppedContainer,
          isLoading: false,
          error: null,
          refetch: jest.fn()
        };
      }
      return { data: null, isLoading: false, error: null, refetch: jest.fn() };
    });
    
    renderWithProviders(<ContainerDetail />);
    
    const startButton = screen.getByRole('button', { name: /start/i });
    fireEvent.click(startButton);
    
    await waitFor(() => {
      expect(startContainer).toHaveBeenCalledWith('container-1');
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['container', 'container-1'] });
    });
  });

  it('calls stopContainer when Stop button is clicked', async () => {
    renderWithProviders(<ContainerDetail />);
    
    const stopButton = screen.getByRole('button', { name: /stop/i });
    fireEvent.click(stopButton);
    
    await waitFor(() => {
      expect(stopContainer).toHaveBeenCalledWith('container-1');
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['container', 'container-1'] });
    });
  });

  it('calls restartContainer when Restart button is clicked', async () => {
    renderWithProviders(<ContainerDetail />);
    
    const restartButton = screen.getByRole('button', { name: /restart/i });
    fireEvent.click(restartButton);
    
    await waitFor(() => {
      expect(restartContainer).toHaveBeenCalledWith('container-1');
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['container', 'container-1'] });
    });
  });

  it('calls pauseContainer when Pause button is clicked', async () => {
    renderWithProviders(<ContainerDetail />);
    
    const pauseButton = screen.getByRole('button', { name: /pause/i });
    fireEvent.click(pauseButton);
    
    await waitFor(() => {
      expect(pauseContainer).toHaveBeenCalledWith('container-1');
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['container', 'container-1'] });
    });
  });

  it('opens delete confirmation modal when Delete button is clicked', () => {
    renderWithProviders(<ContainerDetail />);
    
    const deleteButton = screen.getByRole('button', { name: /delete/i });
    fireEvent.click(deleteButton);
    
    expect(screen.getByText('Delete Container')).toBeInTheDocument();
  });

  it('refreshes container data when Refresh button is clicked', () => {
    const mockRefetch = jest.fn();
    (useQuery as jest.Mock).mockImplementation(({ queryKey }) => {
      if (queryKey[0] === 'container') {
        return {
          data: mockContainer,
          isLoading: false,
          error: null,
          refetch: mockRefetch
        };
      }
      return { data: null, isLoading: false, error: null, refetch: jest.fn() };
    });
    
    renderWithProviders(<ContainerDetail />);
    
    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(refreshButton);
    
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});