import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { ContainerState } from '@shared/src/models';
import { renderWithProviders } from '../../../utils/test-utils';
import ContainerList from '@frontend/src/components/containers/ContainerList';

// Mock the container service
jest.mock('@frontend/src/services/containerService', () => ({
  fetchContainers: jest.fn()
}));

// Mock react-query
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: jest.fn()
}));

import { fetchContainers } from '@frontend/src/services/containerService';
import { useQuery } from '@tanstack/react-query';

describe('ContainerList Component', () => {
  const mockContainers = [
    {
      id: 'container-1',
      name: 'nginx-web',
      image: 'nginx:latest',
      state: ContainerState.RUNNING,
      status: 'Up 2 hours',
      created: new Date().toISOString(),
      ports: [{ privatePort: 80, publicPort: 8080, type: 'tcp' }],
      networks: ['bridge'],
      volumes: []
    },
    {
      id: 'container-2',
      name: 'redis-cache',
      image: 'redis:alpine',
      state: ContainerState.STOPPED,
      status: 'Exited (0) 30 minutes ago',
      created: new Date().toISOString(),
      ports: [{ privatePort: 6379, publicPort: 6379, type: 'tcp' }],
      networks: ['bridge'],
      volumes: []
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (useQuery as jest.Mock).mockReturnValue({
      data: mockContainers,
      isLoading: false,
      error: null,
      refetch: jest.fn()
    });
  });

  it('renders container list correctly', () => {
    renderWithProviders(<ContainerList />);
    
    expect(screen.getByText('Containers')).toBeInTheDocument();
    expect(screen.getByText('nginx-web')).toBeInTheDocument();
    expect(screen.getByText('redis-cache')).toBeInTheDocument();
    expect(screen.getByText('nginx:latest')).toBeInTheDocument();
    expect(screen.getByText('redis:alpine')).toBeInTheDocument();
  });

  it('shows loading state when fetching containers', () => {
    (useQuery as jest.Mock).mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      refetch: jest.fn()
    });
    
    renderWithProviders(<ContainerList />);
    
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows error message when fetch fails', () => {
    const errorMessage = 'Failed to fetch containers';
    (useQuery as jest.Mock).mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error(errorMessage),
      refetch: jest.fn()
    });
    
    renderWithProviders(<ContainerList />);
    
    expect(screen.getByText('Error loading containers')).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('filters containers by search term', async () => {
    renderWithProviders(<ContainerList />);
    
    const searchInput = screen.getByPlaceholderText('Search containers...');
    fireEvent.change(searchInput, { target: { value: 'nginx' } });
    
    await waitFor(() => {
      expect(screen.getByText('nginx-web')).toBeInTheDocument();
      expect(screen.queryByText('redis-cache')).not.toBeInTheDocument();
    });
  });

  it('filters containers by state', async () => {
    renderWithProviders(<ContainerList />);
    
    const stateFilter = screen.getByRole('combobox');
    fireEvent.change(stateFilter, { target: { value: ContainerState.RUNNING } });
    
    await waitFor(() => {
      expect(screen.getByText('nginx-web')).toBeInTheDocument();
      expect(screen.queryByText('redis-cache')).not.toBeInTheDocument();
    });
  });

  it('refreshes container list when refresh button is clicked', () => {
    const mockRefetch = jest.fn();
    (useQuery as jest.Mock).mockReturnValue({
      data: mockContainers,
      isLoading: false,
      error: null,
      refetch: mockRefetch
    });
    
    renderWithProviders(<ContainerList />);
    
    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(refreshButton);
    
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('navigates to container detail page when container name is clicked', () => {
    const { history } = renderWithProviders(<ContainerList />);
    
    const containerLink = screen.getByText('nginx-web');
    fireEvent.click(containerLink);
    
    expect(history.location.pathname).toBe('/containers/container-1');
  });

  it('navigates to new container page when New Container button is clicked', () => {
    const { history } = renderWithProviders(<ContainerList />);
    
    const newContainerButton = screen.getByRole('button', { name: /new container/i });
    fireEvent.click(newContainerButton);
    
    expect(history.location.pathname).toBe('/containers/new');
  });

  it('updates container store when containers are loaded', async () => {
    const mockSetContainers = jest.fn();
    const useContainerStoreMock = jest.fn(() => ({
      setContainers: mockSetContainers
    }));
    
    jest.mock('@frontend/src/store/containerStore', () => ({
      useContainerStore: useContainerStoreMock
    }));
    
    renderWithProviders(<ContainerList />);
    
    await waitFor(() => {
      expect(mockSetContainers).toHaveBeenCalledWith(mockContainers);
    });
  });
});