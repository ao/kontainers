import React from 'react';
import { render, screen, fireEvent, waitFor } from '@tests/utils/test-utils';
import { ProxyTrafficMonitor } from '@/components/proxy/ProxyTrafficMonitor';
import { useProxyStore } from '@/stores/proxyStore';

// Mock the proxyStore
jest.mock('@/stores/proxyStore', () => ({
  useProxyStore: jest.fn()
}));

describe('ProxyTrafficMonitor Component', () => {
  const mockTrafficData = {
    'rule-1': {
      ruleName: 'Test Rule 1',
      totalRequests: 1000,
      totalResponses: 980,
      avgResponseTime: 120.5,
      bytesTransferred: 52428800, // 50MB in bytes
      statusCodeDistribution: {
        '200': 850,
        '404': 100,
        '500': 30
      },
      methodDistribution: {
        'GET': 700,
        'POST': 200,
        'PUT': 50,
        'DELETE': 30
      },
      topPaths: [
        ['/api/users', 300],
        ['/api/products', 250],
        ['/api/orders', 150]
      ],
      topClientIps: [
        ['192.168.1.10', 200],
        ['192.168.1.11', 150],
        ['192.168.1.12', 100]
      ]
    },
    'rule-2': {
      ruleName: 'Test Rule 2',
      totalRequests: 500,
      totalResponses: 490,
      avgResponseTime: 80.2,
      bytesTransferred: 26214400, // 25MB in bytes
      statusCodeDistribution: {
        '200': 450,
        '404': 30,
        '500': 10
      },
      methodDistribution: {
        'GET': 400,
        'POST': 80,
        'PUT': 10,
        'DELETE': 10
      },
      topPaths: [
        ['/api/products', 200],
        ['/api/categories', 150],
        ['/api/orders', 100]
      ],
      topClientIps: [
        ['192.168.1.20', 150],
        ['192.168.1.21', 100],
        ['192.168.1.22', 50]
      ]
    }
  };

  const mockGetProxyTrafficData = jest.fn().mockResolvedValue(mockTrafficData);

  beforeEach(() => {
    jest.clearAllMocks();
    (useProxyStore as jest.Mock).mockReturnValue({
      getProxyTrafficData: mockGetProxyTrafficData
    });
  });

  test('renders loading state initially', () => {
    render(<ProxyTrafficMonitor />);
    
    // Check for loading indicator
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  test('renders traffic data after loading', async () => {
    render(<ProxyTrafficMonitor />);
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Proxy Traffic Monitor')).toBeInTheDocument();
      expect(screen.getByText('Total Requests')).toBeInTheDocument();
      expect(screen.getByText('1,500')).toBeInTheDocument(); // Combined total requests
    });
    
    // Check that summary cards are rendered
    expect(screen.getByText('Total Responses')).toBeInTheDocument();
    expect(screen.getByText('Avg Response Time')).toBeInTheDocument();
    expect(screen.getByText('Data Transferred')).toBeInTheDocument();
    
    // Check that status code distribution is rendered
    expect(screen.getByText('Status Code Distribution')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('Client Error')).toBeInTheDocument();
    expect(screen.getByText('Server Error')).toBeInTheDocument();
    
    // Check that method distribution is rendered
    expect(screen.getByText('Request Method Distribution')).toBeInTheDocument();
    expect(screen.getByText('GET')).toBeInTheDocument();
    expect(screen.getByText('POST')).toBeInTheDocument();
    
    // Check that top paths are rendered
    expect(screen.getByText('Top Paths')).toBeInTheDocument();
    expect(screen.getByText('/api/products')).toBeInTheDocument();
    
    // Check that top client IPs are rendered
    expect(screen.getByText('Top Client IPs')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.10')).toBeInTheDocument();
    
    // Check that traffic by proxy rule is rendered
    expect(screen.getByText('Traffic by Proxy Rule')).toBeInTheDocument();
    expect(screen.getByText('Test Rule 1')).toBeInTheDocument();
    expect(screen.getByText('Test Rule 2')).toBeInTheDocument();
  });

  test('renders error state when there is an error', async () => {
    const errorMessage = 'Failed to fetch traffic data';
    mockGetProxyTrafficData.mockRejectedValueOnce(new Error(errorMessage));
    
    render(<ProxyTrafficMonitor />);
    
    // Wait for error to be displayed
    await waitFor(() => {
      expect(screen.getByText('Error loading traffic data')).toBeInTheDocument();
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
    
    // Check that try again button is rendered
    const tryAgainButton = screen.getByText('Try again');
    expect(tryAgainButton).toBeInTheDocument();
    
    // Click try again button
    fireEvent.click(tryAgainButton);
    
    // Check that getProxyTrafficData was called again
    expect(mockGetProxyTrafficData).toHaveBeenCalledTimes(2);
  });

  test('changes timeframe when dropdown is changed', async () => {
    render(<ProxyTrafficMonitor />);
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Proxy Traffic Monitor')).toBeInTheDocument();
    });
    
    // Check that timeframe dropdown is rendered
    const timeframeDropdown = screen.getByLabelText('Timeframe:');
    expect(timeframeDropdown).toBeInTheDocument();
    
    // Change timeframe
    fireEvent.change(timeframeDropdown, { target: { value: '24h' } });
    
    // Check that getProxyTrafficData was called with new timeframe
    expect(mockGetProxyTrafficData).toHaveBeenCalledWith('24h');
  });

  test('refreshes data when refresh button is clicked', async () => {
    render(<ProxyTrafficMonitor />);
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Proxy Traffic Monitor')).toBeInTheDocument();
    });
    
    // Find and click refresh button
    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);
    
    // Check that getProxyTrafficData was called again
    expect(mockGetProxyTrafficData).toHaveBeenCalledTimes(2);
  });

  test('formats bytes correctly', async () => {
    render(<ProxyTrafficMonitor />);
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Proxy Traffic Monitor')).toBeInTheDocument();
    });
    
    // Check that bytes are formatted correctly
    expect(screen.getByText('75.00 MB')).toBeInTheDocument(); // Combined data transferred
  });

  test('renders empty state when there is no traffic data', async () => {
    mockGetProxyTrafficData.mockResolvedValueOnce({});
    
    render(<ProxyTrafficMonitor />);
    
    // Wait for empty state to be displayed
    await waitFor(() => {
      expect(screen.getByText('No traffic data available.')).toBeInTheDocument();
    });
  });
});