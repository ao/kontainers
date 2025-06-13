import React from 'react';
import { render, screen, fireEvent, waitFor } from '@tests/utils/test-utils';
import { SystemHealthMonitor } from '@/components/metrics/SystemHealthMonitor';
import { useMetricsStore } from '@/stores/metricsStore';
import { mockSystemHealth } from '@tests/utils/test-utils';

// Mock the metricsStore
jest.mock('@/stores/metricsStore', () => ({
  useMetricsStore: jest.fn()
}));

describe('SystemHealthMonitor Component', () => {
  const mockHealth = mockSystemHealth();
  const mockGetSystemHealth = jest.fn().mockResolvedValue(mockHealth);

  beforeEach(() => {
    jest.clearAllMocks();
    (useMetricsStore as jest.Mock).mockReturnValue({
      getSystemHealth: mockGetSystemHealth
    });
  });

  test('renders loading state initially', () => {
    render(<SystemHealthMonitor />);
    
    // Check for loading indicator
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  test('renders health data after loading', async () => {
    render(<SystemHealthMonitor />);
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('System Health Monitor')).toBeInTheDocument();
    });
    
    // Check that system status is rendered
    expect(screen.getByText('System Status')).toBeInTheDocument();
    expect(screen.getByText(mockHealth.status)).toBeInTheDocument();
    
    // Check that uptime is rendered
    expect(screen.getByText('Uptime')).toBeInTheDocument();
    
    // Check that CPU usage is rendered
    expect(screen.getByText('CPU Usage')).toBeInTheDocument();
    expect(screen.getByText(`${mockHealth.cpu.usagePercent.toFixed(1)}%`)).toBeInTheDocument();
    
    // Check that memory usage is rendered
    expect(screen.getByText('Memory Usage')).toBeInTheDocument();
    expect(screen.getByText(`${mockHealth.memory.usedPercent.toFixed(1)}%`)).toBeInTheDocument();
    
    // Check that disk usage is rendered
    expect(screen.getByText('Disk Usage')).toBeInTheDocument();
    mockHealth.disks.forEach(disk => {
      expect(screen.getByText(disk.mountPoint)).toBeInTheDocument();
    });
    
    // Check that network interfaces are rendered
    expect(screen.getByText('Network')).toBeInTheDocument();
    mockHealth.network.interfaces.forEach(iface => {
      expect(screen.getByText(iface.name)).toBeInTheDocument();
    });
    
    // Check that services are rendered
    expect(screen.getByText('Services Status')).toBeInTheDocument();
    mockHealth.services.forEach(service => {
      expect(screen.getByText(service.name)).toBeInTheDocument();
    });
    
    // Check that system information is rendered
    expect(screen.getByText('System Information')).toBeInTheDocument();
    expect(screen.getByText('Hostname')).toBeInTheDocument();
    expect(screen.getByText(mockHealth.hostname)).toBeInTheDocument();
  });

  test('renders error state when there is an error', async () => {
    const errorMessage = 'Failed to fetch system health data';
    mockGetSystemHealth.mockRejectedValueOnce(new Error(errorMessage));
    
    render(<SystemHealthMonitor />);
    
    // Wait for error to be displayed
    await waitFor(() => {
      expect(screen.getByText('Error loading system health data')).toBeInTheDocument();
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
    
    // Check that try again button is rendered
    const tryAgainButton = screen.getByText('Try again');
    expect(tryAgainButton).toBeInTheDocument();
    
    // Click try again button
    fireEvent.click(tryAgainButton);
    
    // Check that getSystemHealth was called again
    expect(mockGetSystemHealth).toHaveBeenCalledTimes(2);
  });

  test('refreshes data when refresh button is clicked', async () => {
    render(<SystemHealthMonitor />);
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('System Health Monitor')).toBeInTheDocument();
    });
    
    // Find and click refresh button
    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);
    
    // Check that getSystemHealth was called again
    expect(mockGetSystemHealth).toHaveBeenCalledTimes(2);
  });

  test('formats uptime correctly', async () => {
    // Mock health with specific uptime
    const healthWithUptime = {
      ...mockHealth,
      uptime: 90061 // 1 day, 1 hour, 1 minute
    };
    mockGetSystemHealth.mockResolvedValueOnce(healthWithUptime);
    
    render(<SystemHealthMonitor />);
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('System Health Monitor')).toBeInTheDocument();
    });
    
    // Check that uptime is formatted correctly
    expect(screen.getByText('1d 1h 1m')).toBeInTheDocument();
  });

  test('formats memory correctly', async () => {
    render(<SystemHealthMonitor />);
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('System Health Monitor')).toBeInTheDocument();
    });
    
    // Check that memory is formatted correctly
    // 8GB total, 4GB used from the mock data
    expect(screen.getByText('4.00 GB / 8.00 GB')).toBeInTheDocument();
  });

  test('applies correct status colors', async () => {
    // Mock health with different statuses
    const healthWithStatuses = {
      ...mockHealth,
      status: 'degraded',
      services: [
        { name: 'healthy-service', status: 'healthy', description: 'Healthy service', uptime: 86400, memory: 104857600, cpu: 2.5 },
        { name: 'warning-service', status: 'warning', description: 'Warning service', uptime: 43200, memory: 209715200, cpu: 5.0 },
        { name: 'critical-service', status: 'critical', description: 'Critical service', uptime: 3600, memory: 314572800, cpu: 10.0 }
      ]
    };
    mockGetSystemHealth.mockResolvedValueOnce(healthWithStatuses);
    
    render(<SystemHealthMonitor />);
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('System Health Monitor')).toBeInTheDocument();
    });
    
    // Check that status colors are applied correctly
    expect(screen.getByText('degraded')).toBeInTheDocument();
    expect(screen.getByText('healthy-service')).toBeInTheDocument();
    expect(screen.getByText('warning-service')).toBeInTheDocument();
    expect(screen.getByText('critical-service')).toBeInTheDocument();
  });
});