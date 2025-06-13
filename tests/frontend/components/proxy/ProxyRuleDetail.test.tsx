import React from 'react';
import { render, screen, fireEvent, waitFor } from '@tests/utils/test-utils';
import { ProxyRuleDetail } from '@/components/proxy/ProxyRuleDetail';
import { mockProxyRule } from '@tests/utils/test-utils';
import { useProxyStore } from '@/store/proxyStore';

// Mock the proxyStore
jest.mock('@/store/proxyStore', () => ({
  useProxyStore: jest.fn()
}));

// Mock the websocketService
jest.mock('@/services/websocketService', () => ({
  __esModule: true,
  default: {
    connect: jest.fn().mockResolvedValue(undefined),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  },
  WebSocketEventType: {
    PROXY_RULE_UPDATED: 'proxy_rule_updated',
    PROXY_RULE_STATE_CHANGED: 'proxy_rule_state_changed'
  }
}));

describe('ProxyRuleDetail Component', () => {
  const mockRule = mockProxyRule();
  const mockTrafficSummary = {
    totalRequests: 1000,
    totalResponses: 980,
    avgResponseTime: 120.5,
    bytesTransferred: 52428800,
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
    ],
    dataPoints: []
  };
  
  const mockErrorSummary = {
    totalErrors: 50,
    errorsByType: [
      ['Connection refused', 20],
      ['Timeout', 15],
      ['Bad gateway', 10],
      ['Internal server error', 5]
    ],
    errorsByStatusCode: [
      ['502', 25],
      ['504', 15],
      ['500', 10]
    ],
    recentErrors: [
      {
        id: 'err1',
        timestamp: new Date().toISOString(),
        type: 'Connection refused',
        message: 'Connection refused to target container',
        statusCode: 502,
        path: '/api/users',
        resolved: false
      }
    ]
  };

  const mockProxyStoreFunctions = {
    getRuleById: jest.fn().mockReturnValue(mockRule),
    setSelectedRule: jest.fn(),
    setTrafficData: jest.fn(),
    setErrorSummary: jest.fn(),
    isLoading: false,
    error: null,
    setLoading: jest.fn(),
    setError: jest.fn()
  };

  // Mock fetch functions
  const mockFetchProxyRuleById = jest.fn().mockResolvedValue(mockRule);
  const mockFetchProxyTrafficSummary = jest.fn().mockResolvedValue(mockTrafficSummary);
  const mockFetchProxyErrorSummary = jest.fn().mockResolvedValue(mockErrorSummary);

  beforeEach(() => {
    jest.clearAllMocks();
    (useProxyStore as jest.Mock).mockReturnValue(mockProxyStoreFunctions);
    
    // Mock the imported fetch functions
    jest.mock('@/services/proxyService', () => ({
      fetchProxyRuleById: mockFetchProxyRuleById,
      fetchProxyTrafficSummary: mockFetchProxyTrafficSummary,
      fetchProxyErrorSummary: mockFetchProxyErrorSummary
    }));
  });

  test('renders loading state initially', () => {
    (useProxyStore as jest.Mock).mockReturnValue({
      ...mockProxyStoreFunctions,
      isLoading: true
    });

    render(
      <ProxyRuleDetail 
        ruleId={mockRule.id} 
        onEdit={jest.fn()} 
        onBack={jest.fn()} 
      />
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  test('renders error state when there is an error', () => {
    const errorMessage = 'Failed to load rule details';
    (useProxyStore as jest.Mock).mockReturnValue({
      ...mockProxyStoreFunctions,
      error: errorMessage
    });

    render(
      <ProxyRuleDetail 
        ruleId={mockRule.id} 
        onEdit={jest.fn()} 
        onBack={jest.fn()} 
      />
    );

    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  test('renders rule not found message when rule is null', () => {
    (useProxyStore as jest.Mock).mockReturnValue({
      ...mockProxyStoreFunctions,
      getRuleById: jest.fn().mockReturnValue(null)
    });

    render(
      <ProxyRuleDetail 
        ruleId="non-existent-id" 
        onEdit={jest.fn()} 
        onBack={jest.fn()} 
      />
    );

    expect(screen.getByText('Proxy rule not found')).toBeInTheDocument();
  });

  test('renders rule details correctly', async () => {
    render(
      <ProxyRuleDetail 
        ruleId={mockRule.id} 
        onEdit={jest.fn()} 
        onBack={jest.fn()} 
      />
    );

    // Check that basic rule information is displayed
    expect(screen.getByText(mockRule.name)).toBeInTheDocument();
    expect(screen.getByText(mockRule.sourceHost)).toBeInTheDocument();
    expect(screen.getByText(mockRule.sourcePath)).toBeInTheDocument();
    expect(screen.getByText(mockRule.targetContainer)).toBeInTheDocument();
    expect(screen.getByText(mockRule.targetPort.toString())).toBeInTheDocument();
  });

  test('switches between tabs correctly', async () => {
    render(
      <ProxyRuleDetail 
        ruleId={mockRule.id} 
        onEdit={jest.fn()} 
        onBack={jest.fn()} 
      />
    );

    // Initially on Overview tab
    expect(screen.getByText('Basic Information')).toBeInTheDocument();
    
    // Click on Traffic tab
    fireEvent.click(screen.getByText('Traffic'));
    expect(screen.getByText('Total Requests')).toBeInTheDocument();
    
    // Click on Errors tab
    fireEvent.click(screen.getByText('Errors'));
    expect(screen.getByText('Error Distribution')).toBeInTheDocument();
    
    // Back to Overview tab
    fireEvent.click(screen.getByText('Overview'));
    expect(screen.getByText('Basic Information')).toBeInTheDocument();
  });

  test('calls onEdit when edit button is clicked', () => {
    const mockOnEdit = jest.fn();
    render(
      <ProxyRuleDetail 
        ruleId={mockRule.id} 
        onEdit={mockOnEdit} 
        onBack={jest.fn()} 
      />
    );

    fireEvent.click(screen.getByText('Edit Rule'));
    expect(mockOnEdit).toHaveBeenCalledWith(mockRule);
  });

  test('calls onBack when back button is clicked', () => {
    const mockOnBack = jest.fn();
    render(
      <ProxyRuleDetail 
        ruleId={mockRule.id} 
        onEdit={jest.fn()} 
        onBack={mockOnBack} 
      />
    );

    fireEvent.click(screen.getByText('Back to Rules'));
    expect(mockOnBack).toHaveBeenCalled();
  });
});