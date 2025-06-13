import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Container, DetailedContainerStats } from '../../../shared/src/models';
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
} from '../../services/containerService';
import { useContainerStore } from '../../store/containerStore';
import Card from '../common/Card';
import Button from '../common/Button';
import LoadingIndicator from '../common/LoadingIndicator';
import Alert from '../common/Alert';
import Modal, { useModal } from '../common/Modal';
import ContainerStatusBadge from './ContainerStatusBadge';
import ContainerStats from './ContainerStats';
import ContainerLogs from './ContainerLogs';

const ContainerDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setSelectedContainer } = useContainerStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'stats' | 'logs'>('overview');
  const deleteModal = useModal();
  
  // Fetch container details
  const { 
    data: container, 
    isLoading: containerLoading, 
    error: containerError,
    refetch: refetchContainer
  } = useQuery<Container>({
    queryKey: ['container', id],
    queryFn: () => fetchContainerById(id!),
    enabled: !!id,
  });

  // Fetch container stats
  const { 
    data: stats, 
    isLoading: statsLoading,
    refetch: refetchStats
  } = useQuery<DetailedContainerStats>({
    queryKey: ['containerStats', id],
    queryFn: () => fetchDetailedContainerStats(id!),
    enabled: !!id && activeTab === 'stats',
    refetchInterval: activeTab === 'stats' ? 5000 : false,
  });

  // Fetch container logs
  const { 
    data: logs, 
    isLoading: logsLoading,
    refetch: refetchLogs
  } = useQuery<string>({
    queryKey: ['containerLogs', id],
    queryFn: () => fetchContainerLogs(id!, 1000),
    enabled: !!id && activeTab === 'logs',
  });

  // Container action mutations
  const startMutation = useMutation({
    mutationFn: () => startContainer(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['container', id] });
      queryClient.invalidateQueries({ queryKey: ['containers'] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => stopContainer(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['container', id] });
      queryClient.invalidateQueries({ queryKey: ['containers'] });
    },
  });

  const restartMutation = useMutation({
    mutationFn: () => restartContainer(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['container', id] });
      queryClient.invalidateQueries({ queryKey: ['containers'] });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () => pauseContainer(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['container', id] });
      queryClient.invalidateQueries({ queryKey: ['containers'] });
    },
  });

  const unpauseMutation = useMutation({
    mutationFn: () => unpauseContainer(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['container', id] });
      queryClient.invalidateQueries({ queryKey: ['containers'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteContainer(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      navigate('/containers');
    },
  });

  useEffect(() => {
    if (container) {
      setSelectedContainer(container);
    }
    
    return () => {
      setSelectedContainer(null);
    };
  }, [container, setSelectedContainer]);

  const handleRefresh = () => {
    refetchContainer();
    if (activeTab === 'stats') {
      refetchStats();
    } else if (activeTab === 'logs') {
      refetchLogs();
    }
  };

  const handleDelete = () => {
    deleteMutation.mutate();
    deleteModal.close();
  };

  if (containerLoading) {
    return <LoadingIndicator size="lg" fullScreen text="Loading container details..." />;
  }

  if (containerError) {
    return (
      <Alert 
        variant="error" 
        title="Error loading container" 
        message={containerError instanceof Error ? containerError.message : 'An unknown error occurred'} 
      />
    );
  }

  if (!container) {
    return (
      <Alert 
        variant="error" 
        title="Container not found" 
        message="The requested container could not be found." 
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center space-x-2">
            <Link to="/containers" className="text-blue-600 hover:text-blue-900">
              <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
            </Link>
            <h1 className="text-2xl font-semibold text-gray-900">{container.name}</h1>
            <ContainerStatusBadge state={container.state} />
          </div>
          <p className="text-gray-500 mt-1">{container.image}</p>
        </div>
        <div className="flex space-x-2">
          <Button 
            variant="secondary" 
            size="sm"
            onClick={handleRefresh}
          >
            Refresh
          </Button>
          {container.state === 'RUNNING' && (
            <>
              <Button 
                variant="warning" 
                size="sm"
                onClick={() => pauseMutation.mutate()}
                isLoading={pauseMutation.isPending}
              >
                Pause
              </Button>
              <Button 
                variant="danger" 
                size="sm"
                onClick={() => stopMutation.mutate()}
                isLoading={stopMutation.isPending}
              >
                Stop
              </Button>
              <Button 
                variant="info" 
                size="sm"
                onClick={() => restartMutation.mutate()}
                isLoading={restartMutation.isPending}
              >
                Restart
              </Button>
            </>
          )}
          {container.state === 'PAUSED' && (
            <Button 
              variant="success" 
              size="sm"
              onClick={() => unpauseMutation.mutate()}
              isLoading={unpauseMutation.isPending}
            >
              Unpause
            </Button>
          )}
          {(container.state === 'STOPPED' || container.state === 'CREATED') && (
            <Button 
              variant="success" 
              size="sm"
              onClick={() => startMutation.mutate()}
              isLoading={startMutation.isPending}
            >
              Start
            </Button>
          )}
          <Button 
            variant="danger" 
            size="sm"
            onClick={deleteModal.open}
          >
            Delete
          </Button>
        </div>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              className={`py-4 px-6 text-center border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button
              className={`py-4 px-6 text-center border-b-2 font-medium text-sm ${
                activeTab === 'stats'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              onClick={() => setActiveTab('stats')}
            >
              Stats
            </button>
            <button
              className={`py-4 px-6 text-center border-b-2 font-medium text-sm ${
                activeTab === 'logs'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              onClick={() => setActiveTab('logs')}
            >
              Logs
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <Card title="Container Information">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">ID</h3>
                    <p className="mt-1 text-sm text-gray-900 font-mono">{container.id}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Created</h3>
                    <p className="mt-1 text-sm text-gray-900">
                      {new Date(container.created).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Status</h3>
                    <p className="mt-1 text-sm text-gray-900">{container.status}</p>
                  </div>
                </div>
              </Card>

              <Card title="Ports">
                {container.ports.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Host IP
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Host Port
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Container Port
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Protocol
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {container.ports.map((port, index) => (
                          <tr key={index}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {port.ip || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {port.publicPort || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {port.privatePort}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {port.type}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No ports exposed</p>
                )}
              </Card>

              <Card title="Volumes">
                {container.volumes.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Host Path
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Container Path
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Mode
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {container.volumes.map((volume, index) => (
                          <tr key={index}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {volume.source}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {volume.destination}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {volume.mode}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No volumes mounted</p>
                )}
              </Card>

              <Card title="Networks">
                {container.networks.length > 0 ? (
                  <div className="space-y-2">
                    {container.networks.map((network, index) => (
                      <div key={index} className="inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium bg-blue-100 text-blue-800 mr-2">
                        {network}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No networks connected</p>
                )}
              </Card>

              {container.env && container.env.length > 0 && (
                <Card title="Environment Variables">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Variable
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Value
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {container.env.map((env, index) => {
                          const [key, ...valueParts] = env.split('=');
                          const value = valueParts.join('=');
                          return (
                            <tr key={index}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {key}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {value}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {container.labels && Object.keys(container.labels).length > 0 && (
                <Card title="Labels">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Key
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Value
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {Object.entries(container.labels).map(([key, value], index) => (
                          <tr key={index}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {key}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          )}

          {activeTab === 'stats' && (
            <ContainerStats 
              stats={stats} 
              isLoading={statsLoading} 
              containerId={container.id} 
            />
          )}

          {activeTab === 'logs' && (
            <ContainerLogs 
              logs={logs || ''} 
              isLoading={logsLoading} 
              containerId={container.id} 
              onRefresh={refetchLogs}
            />
          )}
        </div>
      </div>

      <Modal
        isOpen={deleteModal.isOpen}
        onClose={deleteModal.close}
        title="Delete Container"
        footer={
          <div className="flex justify-end space-x-2">
            <Button variant="secondary" onClick={deleteModal.close}>
              Cancel
            </Button>
            <Button 
              variant="danger" 
              onClick={handleDelete}
              isLoading={deleteMutation.isPending}
            >
              Delete
            </Button>
          </div>
        }
      >
        <p className="text-sm text-gray-500">
          Are you sure you want to delete the container <span className="font-semibold">{container.name}</span>? This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
};

export default ContainerDetail;