import React from 'react';
import { render, screen, fireEvent, waitFor } from '@tests/utils/test-utils';
import { ResourceUsageGraphs } from '@/components/metrics/ResourceUsageGraphs';
import { useMetricsStore } from '@/stores/metricsStore';

// Mock the metricsStore
jest.mock('@/stores/metricsStore', () => ({
  useMetricsStore: jest.fn()
}));

describe('ResourceUsageGraphs Component', () => {
  const mockMetrics = {
    timestamps: [
      Date.now() - 3600000, // 1 hour ago
      Date.now() - 2700000, // 45 minutes ago
      Date.now() - 1800000, // 30 minutes ago
      Date.now() - 900000,  // 15 minutes ago
      Date.now()            // now
    ],
    cpu: {
      usage: [20, 35, 25, 40, 30]
    },
    memory: {
      usage: [
        2147483648,  // 2GB
        2684354560,  // 2.5GB
        3221225472,  // 3GB
        2684354560,  // 2.5GB
        3221225472   // 3GB
      ],
      usagePercent: [25, 31.25, 37.5, 31.25, 37.5],
      total: 8589934592 // 8GB
    },
    disk: {
      readBytes: [1048576, 2097152, 1572864, 3145728, 2621440], // in bytes/s
      writeBytes: [2097152, 3145728, 2621440, 4194304, 3670016] // in bytes/s
    },
    network: {
      received: [524288, 1048576, 786432, 1572864, 1310720], // in bytes/s
      sent: [262144, 524288, 393216, 786432, 655360] // in bytes/s
    },
    containers: [
      {
        id: 'container-1',
        name: 'nginx',
        cpu: 5.2,
        memory: 209715200, // 200MB
        memoryPercent: 2.4,
        disk: {
          read: 1048576, // 1MB/s
          write: 2097152 // 2MB/s
        },
        network: {
          received: 524288, // 512KB/s
          sent: 262144 // 256KB/s
        }
      },
      {
        id: 'container-2',
        name: 'postgres',
        cpu: 12.8,
        memory: 734003200, // 700MB
        memoryPercent: 8.5,
        disk: {
          read: 2097152, // 2MB/s
          write: 4194304 // 4MB/s
        },
        network: {
          received: 262144, // 256KB/s
          sent: 131072 // 128KB/s
        }
      }
    ]
  };

  const mockGetResourceMetrics = jest.fn().mockResolvedValue(mockMetrics);

  beforeEach(() => {
    jest.clearAllMocks();
    (useMetricsStore as jest.Mock).mockReturnValue({
      getResourceMetrics: mockGetResourceMetrics
    });
  });

  test('renders loading state initially', () => {
    render(<ResourceUsageGraphs />);
    
    // Check for loading indicator
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  test('renders resource metrics after loading', async () => {
    render(<ResourceUsageGraphs />);
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Resource Usage Graphs')).toBeInTheDocument();
    });
    
    // Check that CPU usage graph is rendered
    expect(screen.getByText('CPU Usage')).toBeInTheDocument();
    expect(screen.getByText('Current:')).toBeInTheDocument();
    expect(screen.getByText('Average:')).toBeInTheDocument();
    expect(screen.getByText('Max:')).toBeInTheDocument();
    
    // Check that Memory usage graph is rendered
    expect(screen.getByText('Memory Usage')).toBeInTheDocument();
    expect(screen.getByText('Current:')).toBeInTheDocument();
    expect(screen.getByText('Total:')).toBeInTheDocument();
    expect(screen.getByText('Max Used:')).toBeInTheDocument();
    
    // Check that Disk I/O graph is rendered
    expect(screen.getByText('Disk I/O')).toBeInTheDocument();
    expect(screen.getByText('Read')).toBeInTheDocument();
    expect(screen.getByText('Write')).toBeInTheDocument();
    expect(screen.getByText('Current Read:')).toBeInTheDocument();
    expect(screen.getByText('Current Write:')).toBeInTheDocument();
    
    // Check that Network Traffic graph is rendered
    expect(screen.getByText('Network Traffic')).toBeInTheDocument();
    expect(screen.getByText('Received')).toBeInTheDocument();
    expect(screen.getByText('Sent')).toBeInTheDocument();
    expect(screen.getByText('Current Received:')).toBeInTheDocument();
    expect(screen.getByText('Current Sent:')).toBeInTheDocument();
    
    // Check that Container Resource Usage table is rendered
    expect(screen.getByText('Container Resource Usage')).toBeInTheDocument();
    expect(screen.getByText('Container')).toBeInTheDocument();
    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
    expect(screen.getByText('Disk I/O')).toBeInTheDocument();
    expect(screen.getByText('Network I/O')).toBeInTheDocument();
    
    // Check that container data is rendered
    expect(screen.getByText('nginx')).toBeInTheDocument();
    expect(screen.getByText('postgres')).toBeInTheDocument();
  });

  test('renders error state when there is an error', async () => {
    const errorMessage = 'Failed to fetch resource metrics';
    mockGetResourceMetrics.mockRejectedValueOnce(new Error(errorMessage));
    
    render(<ResourceUsageGraphs />);
    
    // Wait for error to be displayed
    await waitFor(() => {
      expect(screen.getByText('Error loading resource metrics')).toBeInTheDocument();
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
    
    // Check that try again button is rendered
    const tryAgainButton = screen.getByText('Try again');
    expect(tryAgainButton).toBeInTheDocument();
    
    // Click try again button
    fireEvent.click(tryAgainButton);
    
    // Check that getResourceMetrics was called again
    expect(mockGetResourceMetrics).toHaveBeenCalledTimes(2);
  });

  test('changes time range when dropdown is changed', async () => {
    render(<ResourceUsageGraphs />);
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Resource Usage Graphs')).toBeInTheDocument();
    });
    
    // Check that time range dropdown is rendered
    const timeRangeDropdown = screen.getByLabelText('Time Range:');
    expect(timeRangeDropdown).toBeInTheDocument();
    
    // Change time range
    fireEvent.change(timeRangeDropdown, { target: { value: '24h' } });
    
    // Check that getResourceMetrics was called with new time range
    expect(mockGetResourceMetrics).toHaveBeenCalledWith('24h');
  });

  test('refreshes data when refresh button is clicked', async () => {
    render(<ResourceUsageGraphs />);
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Resource Usage Graphs')).toBeInTheDocument();
    });
    
    // Find and click refresh button
    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);
    
    // Check that getResourceMetrics was called again
    expect(mockGetResourceMetrics).toHaveBeenCalledTimes(2);
  });

  test('formats memory correctly', async () => {
    render(<ResourceUsageGraphs />);
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Resource Usage Graphs')).toBeInTheDocument();
    });
    
    // Check that memory is formatted correctly
    expect(screen.getByText('3.00 GB')).toBeInTheDocument(); // Current memory usage
    expect(screen.getByText('8.00 GB')).toBeInTheDocument(); // Total memory
  });

  test('renders SVG elements for graphs', async () => {
    render(<ResourceUsageGraphs />);
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Resource Usage Graphs')).toBeInTheDocument();
    });
    
    // Check that SVG elements are rendered
    const svgElements = document.querySelectorAll('svg');
    expect(svgElements.length).toBeGreaterThan(0);
    
    // Check that paths are rendered in SVGs
    const pathElements = document.querySelectorAll('path');
    expect(pathElements.length).toBeGreaterThan(0);
    
    // Check that circles (data points) are rendered in SVGs
    const circleElements = document.querySelectorAll('circle');
    expect(circleElements.length).toBeGreaterThan(0);
  });
});