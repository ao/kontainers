import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Card from '../common/Card';
import LoadingIndicator from '../common/LoadingIndicator';
import Button from '../common/Button';
import { Container, HealthStatus, ProxyRule, SystemResourceMetrics } from '../../../shared/src/models';
import { useContainerStore } from '../../store/containerStore';
import { useProxyStore } from '../../store/proxyStore';
import { useHealthStore } from '../../store/healthStore';
import { fetchContainers } from '../../services/containerService';
import { fetchProxyRules } from '../../services/proxyService';
import { fetchSystemHealth } from '../../services/healthService';
import SystemHealthMonitor from '../metrics/SystemHealthMonitor';
import ResourceUsageGraphs from '../metrics/ResourceUsageGraphs';

const Dashboard: React.FC = () => {
  const { setContainers } = useContainerStore();
  const { setProxyRules } = useProxyStore();
  const { setSystemHealth } = useHealthStore();

  const { data: containers, isLoading: containersLoading } = useQuery<Container[]>({
    queryKey: ['containers'],
    queryFn: fetchContainers,
  });

  const { data: proxyRules, isLoading: proxyLoading } = useQuery<ProxyRule[]>({
    queryKey: ['proxyRules'],
    queryFn: fetchProxyRules,
  });

  const { data: systemHealth, isLoading: healthLoading } = useQuery<{
    status: HealthStatus;
    metrics: SystemResourceMetrics;
  }>({
    queryKey: ['systemHealth'],
    queryFn: fetchSystemHealth,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  useEffect(() => {
    if (containers) {
      setContainers(containers);
    }
  }, [containers, setContainers]);

  useEffect(() => {
    if (proxyRules) {
      setProxyRules(proxyRules);
    }
  }, [proxyRules, setProxyRules]);

  useEffect(() => {
    if (systemHealth) {
      setSystemHealth(systemHealth);
    }
  }, [systemHealth, setSystemHealth]);

  const runningContainers = containers?.filter(c => c.state === 'RUNNING').length || 0;
  const totalContainers = containers?.length || 0;
  const activeProxyRules = proxyRules?.filter(r => r.enabled).length || 0;
  const totalProxyRules = proxyRules?.length || 0;

  if (containersLoading || proxyLoading || healthLoading) {
    return <LoadingIndicator size="lg" fullScreen text="Loading dashboard..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <div className="flex space-x-2">
          <Link to="/containers/new">
            <Button variant="primary" size="sm">New Container</Button>
          </Link>
          <Link to="/proxy/new">
            <Button variant="secondary" size="sm">New Proxy Rule</Button>
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <div className="flex flex-col">
            <div className="text-sm font-medium uppercase tracking-wider">Running Containers</div>
            <div className="mt-2 flex items-baseline">
              <div className="text-3xl font-semibold">{runningContainers}</div>
              <div className="ml-2 text-sm">/ {totalContainers}</div>
            </div>
            <div className="mt-4">
              <Link to="/containers">
                <Button variant="info" size="sm" fullWidth>View All</Button>
              </Link>
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
          <div className="flex flex-col">
            <div className="text-sm font-medium uppercase tracking-wider">Active Proxy Rules</div>
            <div className="mt-2 flex items-baseline">
              <div className="text-3xl font-semibold">{activeProxyRules}</div>
              <div className="ml-2 text-sm">/ {totalProxyRules}</div>
            </div>
            <div className="mt-4">
              <Link to="/proxy">
                <Button variant="info" size="sm" fullWidth>View All</Button>
              </Link>
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
          <div className="flex flex-col">
            <div className="text-sm font-medium uppercase tracking-wider">CPU Usage</div>
            <div className="mt-2 flex items-baseline">
              <div className="text-3xl font-semibold">
                {systemHealth?.metrics.cpuUsagePercent.toFixed(1)}%
              </div>
            </div>
            <div className="mt-4">
              <Link to="/metrics">
                <Button variant="info" size="sm" fullWidth>View Details</Button>
              </Link>
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white">
          <div className="flex flex-col">
            <div className="text-sm font-medium uppercase tracking-wider">Memory Usage</div>
            <div className="mt-2 flex items-baseline">
              <div className="text-3xl font-semibold">
                {systemHealth?.metrics.memoryUsagePercent.toFixed(1)}%
              </div>
              <div className="ml-2 text-sm">
                {systemHealth?.metrics.memoryUsedMB.toFixed(0)} MB / {systemHealth?.metrics.memoryTotalMB.toFixed(0)} MB
              </div>
            </div>
            <div className="mt-4">
              <Link to="/metrics">
                <Button variant="info" size="sm" fullWidth>View Details</Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>

      {/* System Health */}
      <Card title="System Health">
        <SystemHealthMonitor compact />
      </Card>

      {/* Resource Usage */}
      <Card title="Resource Usage">
        <ResourceUsageGraphs compact />
      </Card>

      {/* Recent Containers */}
      <Card 
        title="Recent Containers" 
        headerActions={
          <Link to="/containers">
            <Button variant="secondary" size="sm">View All</Button>
          </Link>
        }
      >
        {containers && containers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Image</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ports</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {containers.slice(0, 5).map((container) => (
                  <tr key={container.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link to={`/containers/${container.id}`} className="text-blue-600 hover:text-blue-900">
                        {container.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{container.image}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${container.state === 'RUNNING' ? 'bg-green-100 text-green-800' : 
                          container.state === 'STOPPED' ? 'bg-red-100 text-red-800' : 
                          'bg-yellow-100 text-yellow-800'}`}>
                        {container.state}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {container.ports.map(port => `${port.publicPort || port.privatePort}:${port.privatePort}`).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500">No containers found</div>
        )}
      </Card>

      {/* Recent Proxy Rules */}
      <Card 
        title="Recent Proxy Rules" 
        headerActions={
          <Link to="/proxy">
            <Button variant="secondary" size="sm">View All</Button>
          </Link>
        }
      >
        {proxyRules && proxyRules.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Target</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {proxyRules.slice(0, 5).map((rule) => (
                  <tr key={rule.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link to={`/proxy/${rule.id}`} className="text-blue-600 hover:text-blue-900">
                        {rule.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {rule.sourceHost}{rule.sourcePath}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {rule.targetContainer}:{rule.targetPort}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${rule.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {rule.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500">No proxy rules found</div>
        )}
      </Card>
    </div>
  );
};

export default Dashboard;