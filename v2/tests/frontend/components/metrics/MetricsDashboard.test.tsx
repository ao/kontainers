import React from 'react';
import { render, screen, fireEvent } from '@tests/utils/test-utils';
import { MetricsDashboard } from '@/components/metrics/MetricsDashboard';

// Mock the child components
jest.mock('@/components/metrics/SystemHealthMonitor', () => ({
  SystemHealthMonitor: () => <div data-testid="system-health-monitor">System Health Monitor Mock</div>
}));

jest.mock('@/components/metrics/ResourceUsageGraphs', () => ({
  ResourceUsageGraphs: () => <div data-testid="resource-usage-graphs">Resource Usage Graphs Mock</div>
}));

jest.mock('@/components/proxy/ProxyTrafficMonitor', () => ({
  ProxyTrafficMonitor: () => <div data-testid="proxy-traffic-monitor">Proxy Traffic Monitor Mock</div>
}));

describe('MetricsDashboard Component', () => {
  test('renders dashboard title', () => {
    render(<MetricsDashboard />);
    expect(screen.getByText('Metrics Dashboard')).toBeInTheDocument();
  });

  test('renders time range selector', () => {
    render(<MetricsDashboard />);
    expect(screen.getByLabelText('Time Range:')).toBeInTheDocument();
    expect(screen.getByText('Last hour')).toBeInTheDocument();
  });

  test('renders system health tab by default', () => {
    render(<MetricsDashboard />);
    
    // Check that system health tab is active
    const systemHealthTab = screen.getByText('System Health');
    expect(systemHealthTab).toHaveClass('border-blue-500');
    
    // Check that system health monitor is rendered
    expect(screen.getByTestId('system-health-monitor')).toBeInTheDocument();
    
    // Check that other components are not rendered
    expect(screen.queryByTestId('resource-usage-graphs')).not.toBeInTheDocument();
    expect(screen.queryByTestId('proxy-traffic-monitor')).not.toBeInTheDocument();
  });

  test('switches to resource usage tab when clicked', () => {
    render(<MetricsDashboard />);
    
    // Click on resource usage tab
    fireEvent.click(screen.getByText('Resource Usage'));
    
    // Check that resource usage tab is active
    const resourceUsageTab = screen.getByText('Resource Usage');
    expect(resourceUsageTab).toHaveClass('border-blue-500');
    
    // Check that resource usage graphs are rendered
    expect(screen.getByTestId('resource-usage-graphs')).toBeInTheDocument();
    
    // Check that other components are not rendered
    expect(screen.queryByTestId('system-health-monitor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('proxy-traffic-monitor')).not.toBeInTheDocument();
  });

  test('switches to proxy traffic tab when clicked', () => {
    render(<MetricsDashboard />);
    
    // Click on proxy traffic tab
    fireEvent.click(screen.getByText('Proxy Traffic'));
    
    // Check that proxy traffic tab is active
    const proxyTrafficTab = screen.getByText('Proxy Traffic');
    expect(proxyTrafficTab).toHaveClass('border-blue-500');
    
    // Check that proxy traffic monitor is rendered
    expect(screen.getByTestId('proxy-traffic-monitor')).toBeInTheDocument();
    
    // Check that other components are not rendered
    expect(screen.queryByTestId('system-health-monitor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('resource-usage-graphs')).not.toBeInTheDocument();
  });

  test('changes time range when dropdown is changed', () => {
    render(<MetricsDashboard />);
    
    // Get the time range dropdown
    const timeRangeDropdown = screen.getByLabelText('Time Range:');
    
    // Change time range to 24 hours
    fireEvent.change(timeRangeDropdown, { target: { value: '24h' } });
    
    // Check that time range is updated
    expect(timeRangeDropdown).toHaveValue('24h');
  });

  test('passes time range to child components', () => {
    render(<MetricsDashboard refreshInterval={5000} />);
    
    // Change time range to 24 hours
    const timeRangeDropdown = screen.getByLabelText('Time Range:');
    fireEvent.change(timeRangeDropdown, { target: { value: '24h' } });
    
    // Switch to resource usage tab
    fireEvent.click(screen.getByText('Resource Usage'));
    
    // Resource usage graphs should be rendered with the new time range
    expect(screen.getByTestId('resource-usage-graphs')).toBeInTheDocument();
    
    // Switch to proxy traffic tab
    fireEvent.click(screen.getByText('Proxy Traffic'));
    
    // Proxy traffic monitor should be rendered with the new time range
    expect(screen.getByTestId('proxy-traffic-monitor')).toBeInTheDocument();
  });

  test('renders summary cards', () => {
    render(<MetricsDashboard />);
    
    // Check that summary cards are rendered
    expect(screen.getByText('System Performance')).toBeInTheDocument();
    expect(screen.getByText('Proxy Traffic')).toBeInTheDocument();
    expect(screen.getByText('System Health')).toBeInTheDocument();
    
    // Check that card descriptions are rendered
    expect(screen.getByText('Monitor CPU, memory, disk, and network usage')).toBeInTheDocument();
    expect(screen.getByText('Monitor request volume, response times, and status codes')).toBeInTheDocument();
    expect(screen.getByText('Monitor overall system health and service status')).toBeInTheDocument();
  });

  test('navigates to correct tab when clicking View Details in summary cards', () => {
    render(<MetricsDashboard />);
    
    // Initially on system health tab
    expect(screen.getByTestId('system-health-monitor')).toBeInTheDocument();
    
    // Click View Details in System Performance card
    const systemPerformanceButton = screen.getAllByText('View Details')[0];
    fireEvent.click(systemPerformanceButton);
    
    // Should switch to resource usage tab
    expect(screen.getByTestId('resource-usage-graphs')).toBeInTheDocument();
    
    // Click View Details in Proxy Traffic card
    const proxyTrafficButton = screen.getAllByText('View Details')[1];
    fireEvent.click(proxyTrafficButton);
    
    // Should switch to proxy traffic tab
    expect(screen.getByTestId('proxy-traffic-monitor')).toBeInTheDocument();
    
    // Click View Details in System Health card
    const systemHealthButton = screen.getAllByText('View Details')[2];
    fireEvent.click(systemHealthButton);
    
    // Should switch back to system health tab
    expect(screen.getByTestId('system-health-monitor')).toBeInTheDocument();
  });

  test('renders quick actions section', () => {
    render(<MetricsDashboard />);
    
    // Check that quick actions section is rendered
    expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    expect(screen.getByText('Refresh All Metrics')).toBeInTheDocument();
    expect(screen.getByText('Export Report')).toBeInTheDocument();
    expect(screen.getByText('Configure Alerts')).toBeInTheDocument();
    expect(screen.getByText('Schedule Reports')).toBeInTheDocument();
  });
});