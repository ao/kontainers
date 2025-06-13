import { describe, expect, it, jest, beforeEach, afterEach } from 'bun:test';
import { server } from '@backend/src/server';
import { ContainerService } from '@frontend/src/services/containerService';
import { Container, ContainerStatus } from '@shared/src/models';
import fetch from 'node-fetch';

// Mock fetch for frontend service
global.fetch = fetch as any;

describe('Container Management Integration', () => {
  let baseUrl: string;
  let containerService: ContainerService;
  let testServer: any;
  
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
  
  beforeEach(async () => {
    // Start the backend server on a random port
    testServer = server.listen(0);
    const address = testServer.address();
    baseUrl = `http://localhost:${address.port}`;
    
    // Initialize the container service with the test server URL
    containerService = new ContainerService(baseUrl);
    
    // Mock the Docker API responses in the backend
    jest.spyOn(global, 'fetch').mockImplementation(async (url: string, options?: any) => {
      if (url.includes('/api/containers')) {
        if (url.endsWith('/api/containers')) {
          return {
            ok: true,
            json: async () => ({ containers: sampleContainers })
          } as Response;
        } else if (url.includes('/api/containers/container1')) {
          return {
            ok: true,
            json: async () => ({ container: sampleContainers[0] })
          } as Response;
        } else if (url.includes('/api/containers/container2')) {
          return {
            ok: true,
            json: async () => ({ container: sampleContainers[1] })
          } as Response;
        } else if (url.includes('/start')) {
          return {
            ok: true,
            json: async () => ({ success: true })
          } as Response;
        } else if (url.includes('/stop')) {
          return {
            ok: true,
            json: async () => ({ success: true })
          } as Response;
        } else if (url.includes('/restart')) {
          return {
            ok: true,
            json: async () => ({ success: true })
          } as Response;
        } else if (url.includes('/logs')) {
          return {
            ok: true,
            text: async () => 'Container logs...'
          } as Response;
        }
      }
      
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' })
      } as Response;
    });
  });
  
  afterEach(() => {
    // Close the test server
    testServer.close();
    jest.restoreAllMocks();
  });
  
  it('should fetch all containers', async () => {
    const result = await containerService.getAllContainers();
    
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('container1');
    expect(result[0].name).toBe('test-nginx');
    expect(result[1].id).toBe('container2');
    expect(result[1].name).toBe('test-redis');
  });
  
  it('should fetch a single container by ID', async () => {
    const result = await containerService.getContainerById('container1');
    
    expect(result).toBeDefined();
    expect(result.id).toBe('container1');
    expect(result.name).toBe('test-nginx');
    expect(result.status).toBe(ContainerStatus.RUNNING);
  });
  
  it('should start a stopped container', async () => {
    const result = await containerService.startContainer('container2');
    
    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}/api/containers/container2/start`,
      expect.objectContaining({
        method: 'POST'
      })
    );
  });
  
  it('should stop a running container', async () => {
    const result = await containerService.stopContainer('container1');
    
    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}/api/containers/container1/stop`,
      expect.objectContaining({
        method: 'POST'
      })
    );
  });
  
  it('should restart a container', async () => {
    const result = await containerService.restartContainer('container1');
    
    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}/api/containers/container1/restart`,
      expect.objectContaining({
        method: 'POST'
      })
    );
  });
  
  it('should fetch container logs', async () => {
    const result = await containerService.getContainerLogs('container1');
    
    expect(result).toBe('Container logs...');
    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}/api/containers/container1/logs`,
      expect.objectContaining({
        method: 'GET'
      })
    );
  });
  
  it('should handle errors when fetching containers', async () => {
    // Override the mock to simulate an error
    jest.spyOn(global, 'fetch').mockImplementationOnce(async () => {
      return {
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' })
      } as Response;
    });
    
    await expect(containerService.getAllContainers()).rejects.toThrow();
  });
  
  it('should handle network errors', async () => {
    // Override the mock to simulate a network error
    jest.spyOn(global, 'fetch').mockImplementationOnce(async () => {
      throw new Error('Network error');
    });
    
    await expect(containerService.getAllContainers()).rejects.toThrow('Network error');
  });
});