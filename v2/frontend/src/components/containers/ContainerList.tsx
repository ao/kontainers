import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Container, ContainerState } from '../../../shared/src/models';
import { fetchContainers } from '../../services/containerService';
import { useContainerStore } from '../../store/containerStore';
import Card from '../common/Card';
import Button from '../common/Button';
import Table, { Column } from '../common/Table';
import LoadingIndicator from '../common/LoadingIndicator';
import Alert from '../common/Alert';
import ContainerStatusBadge from './ContainerStatusBadge';

const ContainerList: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterState, setFilterState] = useState<ContainerState | 'ALL'>('ALL');
  const [sortBy, setSortBy] = useState<keyof Container>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  const { setContainers } = useContainerStore();
  
  const { data: containers, isLoading, error, refetch } = useQuery<Container[]>({
    queryKey: ['containers'],
    queryFn: fetchContainers,
  });

  useEffect(() => {
    if (containers) {
      setContainers(containers);
    }
  }, [containers, setContainers]);

  const handleSort = (column: keyof Container) => {
    if (sortBy === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDirection('asc');
    }
  };

  const filteredContainers = containers
    ? containers
        .filter(container => 
          (filterState === 'ALL' || container.state === filterState) &&
          (searchTerm === '' || 
            container.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            container.image.toLowerCase().includes(searchTerm.toLowerCase()))
        )
        .sort((a, b) => {
          const aValue = a[sortBy];
          const bValue = b[sortBy];
          
          if (typeof aValue === 'string' && typeof bValue === 'string') {
            return sortDirection === 'asc' 
              ? aValue.localeCompare(bValue) 
              : bValue.localeCompare(aValue);
          }
          
          if (typeof aValue === 'number' && typeof bValue === 'number') {
            return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
          }
          
          return 0;
        })
    : [];

  const columns: Column<Container>[] = [
    {
      header: 'Name',
      accessor: (container) => (
        <Link to={`/containers/${container.id}`} className="text-blue-600 hover:text-blue-900 font-medium">
          {container.name}
        </Link>
      ),
    },
    {
      header: 'Image',
      accessor: 'image',
    },
    {
      header: 'Status',
      accessor: (container) => <ContainerStatusBadge state={container.state} />,
    },
    {
      header: 'Ports',
      accessor: (container) => (
        <div className="space-x-1">
          {container.ports.map((port, index) => (
            <span key={index} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
              {port.publicPort || port.privatePort}:{port.privatePort}
            </span>
          ))}
        </div>
      ),
    },
    {
      header: 'Created',
      accessor: (container) => new Date(container.created).toLocaleString(),
    },
    {
      header: 'Actions',
      accessor: (container) => (
        <div className="flex space-x-2">
          <Link to={`/containers/${container.id}`}>
            <Button size="sm" variant="secondary">Details</Button>
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-900">Containers</h1>
        <div className="flex space-x-2">
          <Button 
            variant="secondary" 
            size="sm"
            onClick={() => refetch()}
          >
            Refresh
          </Button>
          <Link to="/containers/new">
            <Button variant="primary" size="sm">New Container</Button>
          </Link>
        </div>
      </div>

      <Card>
        <div className="flex flex-col sm:flex-row justify-between space-y-2 sm:space-y-0 sm:space-x-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search containers..."
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <select
            className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filterState}
            onChange={(e) => setFilterState(e.target.value as ContainerState | 'ALL')}
          >
            <option value="ALL">All States</option>
            <option value={ContainerState.RUNNING}>Running</option>
            <option value={ContainerState.STOPPED}>Stopped</option>
            <option value={ContainerState.PAUSED}>Paused</option>
            <option value={ContainerState.RESTARTING}>Restarting</option>
            <option value={ContainerState.CREATED}>Created</option>
          </select>
        </div>
      </Card>

      {error ? (
        <Alert 
          variant="error" 
          title="Error loading containers" 
          message={error instanceof Error ? error.message : 'An unknown error occurred'} 
        />
      ) : (
        <Card noPadding>
          <Table<Container>
            columns={columns}
            data={filteredContainers}
            keyExtractor={(container) => container.id}
            isLoading={isLoading}
            emptyMessage="No containers found"
            onRowClick={(container) => {
              window.location.href = `/containers/${container.id}`;
            }}
          />
        </Card>
      )}
    </div>
  );
};

export default ContainerList;