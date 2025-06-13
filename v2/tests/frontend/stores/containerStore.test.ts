import { describe, expect, it, jest, beforeEach } from 'bun:test';
import { act, renderHook } from '@testing-library/react-hooks';
import { useContainerStore } from '@frontend/src/stores/containerStore';
import { ContainerService } from '@frontend/src/services/containerService';
import { Container, ContainerStatus } from '@shared/src/models';

// Mock the container service
jest.mock('@frontend/src/services/containerService', () => ({
  ContainerService: jest.fn().mockImplementation(() => ({
    getAllContainers: jest.fn(),
    getContainerById: jest.fn(),
    startContainer: jest.fn(),
    stopContainer: jest.fn(),
    restartContainer: jest.fn(),
    getContainerLogs: jest.fn(),
    createContainer: jest.fn(),
    removeContainer: jest.fn()
  }))
}));

describe('Container Store', () => {
  // Sample container data
  const sampleContainers: Container[] = [
    {
      id: 'container1',
      name: 'test-nginx',
      image: 'nginx:latest',
      status: ContainerStatus.RUNNING,
      created: new Date().toISOString(),
      ports: [{ internal: 80, external: 8080 }],
      networks: ['bridge'],
      volumes: ['/data:/data'],
      env: ['NGINX_HOST=localhost'],
      cpu: 0.5,
      memory: 128,
      memoryLimit: 256
    },
    {
      id: 'container2',
      name: 'test-redis',
      image: 'redis:latest',
      status: ContainerStatus.STOPPED,
      created: new Date().toISOString(),
      ports: [{ internal: 6379, external: 6379 }],
      networks: ['bridge'],
      volumes: [],
      env: [],
      cpu: 0.2,
      memory: 64,
      memoryLimit: 128
    }
  ];
  
  beforeEach(() => {
    // Reset the store before each test
    const { result } = renderHook(() => useContainerStore());
    act(() => {
      result.current.reset();
    });
    
    // Reset mocks
    jest.clearAllMocks();
  });
  
  it('should initialize with empty state', () => {
    const { result } = renderHook(() => useContainerStore());
    
    expect(result.current.containers).toEqual([]);
    expect(result.current.selectedContainer).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });
  
  it('should fetch containers and update state', async () => {
    // Setup mock
    const mockService = new ContainerService('');
    (mockService.getAllContainers as jest.Mock).mockResolvedValue(sampleContainers);
    
    const { result, waitForNextUpdate } = renderHook(() => useContainerStore());
    
    // Call the fetch method
    act(() => {
      result.current.fetchContainers(mockService);
    });
    
    // Check loading state
    expect(result.current.isLoading).toBe(true);
    
    // Wait for the async operation to complete
    await waitForNextUpdate();
    
    // Check final state
    expect(result.current.containers).toEqual(sampleContainers);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockService.getAllContainers).toHaveBeenCalledTimes(1);
  });
  
  it('should handle fetch errors', async () => {
    // Setup mock to throw error
    const mockService = new ContainerService('');
    const errorMessage = 'Failed to fetch containers';
    (mockService.getAllContainers as jest.Mock).mockRejectedValue(new Error(errorMessage));
    
    const { result, waitForNextUpdate } = renderHook(() => useContainerStore());
    
    // Call the fetch method
    act(() => {
      result.current.fetchContainers(mockService);
    });
    
    // Wait for the async operation to complete
    await waitForNextUpdate();
    
    // Check error state
    expect(result.current.containers).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(errorMessage);
  });
  
  it('should select a container by ID', async () => {
    // Setup mock
    const mockService = new ContainerService('');
    (mockService.getContainerById as jest.Mock).mockResolvedValue(sampleContainers[0]);
    
    const { result, waitForNextUpdate } = renderHook(() => useContainerStore());
    
    // Call the select method
    act(() => {
      result.current.selectContainer('container1', mockService);
    });
    
    // Check loading state
    expect(result.current.isLoading).toBe(true);
    
    // Wait for the async operation to complete
    await waitForNextUpdate();
    
    // Check final state
    expect(result.current.selectedContainer).toEqual(sampleContainers[0]);
    expect(result.current.isLoading).toBe(false);
    expect(mockService.getContainerById).toHaveBeenCalledWith('container1');
  });
  
  it('should start a container', async () => {
    // Setup mocks
    const mockService = new ContainerService('');
    (mockService.startContainer as jest.Mock).mockResolvedValue(true);
    (mockService.getContainerById as jest.Mock).mockResolvedValue({
      ...sampleContainers[1],
      status: ContainerStatus.RUNNING
    });
    
    // Initialize store with containers
    const { result, waitForNextUpdate } = renderHook(() => useContainerStore());
    act(() => {
      result.current.setContainers(sampleContainers);
    });
    
    // Call the start method
    act(() => {
      result.current.startContainer('container2', mockService);
    });
    
    // Wait for the async operation to complete
    await waitForNextUpdate();
    
    // Check that the container was updated
    const updatedContainer = result.current.containers.find(c => c.id === 'container2');
    expect(updatedContainer?.status).toBe(ContainerStatus.RUNNING);
    expect(mockService.startContainer).toHaveBeenCalledWith('container2');
    expect(mockService.getContainerById).toHaveBeenCalledWith('container2');
  });
  
  it('should stop a container', async () => {
    // Setup mocks
    const mockService = new ContainerService('');
    (mockService.stopContainer as jest.Mock).mockResolvedValue(true);
    (mockService.getContainerById as jest.Mock).mockResolvedValue({
      ...sampleContainers[0],
      status: ContainerStatus.STOPPED
    });
    
    // Initialize store with containers
    const { result, waitForNextUpdate } = renderHook(() => useContainerStore());
    act(() => {
      result.current.setContainers(sampleContainers);
    });
    
    // Call the stop method
    act(() => {
      result.current.stopContainer('container1', mockService);
    });
    
    // Wait for the async operation to complete
    await waitForNextUpdate();
    
    // Check that the container was updated
    const updatedContainer = result.current.containers.find(c => c.id === 'container1');
    expect(updatedContainer?.status).toBe(ContainerStatus.STOPPED);
    expect(mockService.stopContainer).toHaveBeenCalledWith('container1');
    expect(mockService.getContainerById).toHaveBeenCalledWith('container1');
  });
  
  it('should restart a container', async () => {
    // Setup mocks
    const mockService = new ContainerService('');
    (mockService.restartContainer as jest.Mock).mockResolvedValue(true);
    (mockService.getContainerById as jest.Mock).mockResolvedValue({
      ...sampleContainers[0],
      status: ContainerStatus.RUNNING
    });
    
    // Initialize store with containers
    const { result, waitForNextUpdate } = renderHook(() => useContainerStore());
    act(() => {
      result.current.setContainers(sampleContainers);
    });
    
    // Call the restart method
    act(() => {
      result.current.restartContainer('container1', mockService);
    });
    
    // Wait for the async operation to complete
    await waitForNextUpdate();
    
    // Check that the container was updated
    expect(mockService.restartContainer).toHaveBeenCalledWith('container1');
    expect(mockService.getContainerById).toHaveBeenCalledWith('container1');
  });
  
  it('should filter containers by name', () => {
    // Initialize store with containers
    const { result } = renderHook(() => useContainerStore());
    act(() => {
      result.current.setContainers(sampleContainers);
      result.current.setFilter('nginx');
    });
    
    // Check filtered containers
    expect(result.current.filteredContainers).toHaveLength(1);
    expect(result.current.filteredContainers[0].name).toBe('test-nginx');
    
    // Change filter
    act(() => {
      result.current.setFilter('redis');
    });
    
    expect(result.current.filteredContainers).toHaveLength(1);
    expect(result.current.filteredContainers[0].name).toBe('test-redis');
    
    // Clear filter
    act(() => {
      result.current.setFilter('');
    });
    
    expect(result.current.filteredContainers).toHaveLength(2);
  });
  
  it('should filter containers by status', () => {
    // Initialize store with containers
    const { result } = renderHook(() => useContainerStore());
    act(() => {
      result.current.setContainers(sampleContainers);
      result.current.setStatusFilter(ContainerStatus.RUNNING);
    });
    
    // Check filtered containers
    expect(result.current.filteredContainers).toHaveLength(1);
    expect(result.current.filteredContainers[0].status).toBe(ContainerStatus.RUNNING);
    
    // Change filter
    act(() => {
      result.current.setStatusFilter(ContainerStatus.STOPPED);
    });
    
    expect(result.current.filteredContainers).toHaveLength(1);
    expect(result.current.filteredContainers[0].status).toBe(ContainerStatus.STOPPED);
    
    // Clear filter
    act(() => {
      result.current.setStatusFilter(null);
    });
    
    expect(result.current.filteredContainers).toHaveLength(2);
  });
});