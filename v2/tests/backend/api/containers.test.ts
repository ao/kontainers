import { describe, expect, it, beforeEach, jest, afterEach } from 'bun:test';
import { Elysia } from 'elysia';
import { containersRoutes } from '@backend/src/api/containers';
import { containerService } from '@backend/src/services/container';

// Mock the container service
jest.mock('@backend/src/services/container', () => ({
  containerService: {
    getContainers: jest.fn(),
    getContainer: jest.fn(),
    createContainer: jest.fn(),
    startContainer: jest.fn(),
    stopContainer: jest.fn(),
    restartContainer: jest.fn(),
    getContainerLogs: jest.fn(),
    getContainerStats: jest.fn(),
    getDetailedContainerStats: jest.fn(),
    removeContainer: jest.fn(),
    startLogStreaming: jest.fn(),
    stopLogStreaming: jest.fn(),
    startStatsMonitoring: jest.fn(),
    stopStatsMonitoring: jest.fn(),
    on: jest.fn()
  }
}));

describe('Containers API Routes', () => {
  let app: Elysia;
  
  beforeEach(() => {
    // Reset all mocks
    jest.resetAllMocks();
    
    // Create a new Elysia app with the containers routes
    app = new Elysia().use(containersRoutes);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /', () => {
    it('should return all containers', async () => {
      const mockContainers = [
        { id: 'container-1', name: 'Container 1' },
        { id: 'container-2', name: 'Container 2' }
      ];
      
      (containerService.getContainers as jest.Mock).mockResolvedValue(mockContainers);
      
      const response = await app.handle(new Request('http://localhost/containers'));
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({ containers: mockContainers });
      expect(containerService.getContainers).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /:id', () => {
    it('should return a container by ID', async () => {
      const mockContainer = { id: 'container-1', name: 'Container 1' };
      
      (containerService.getContainer as jest.Mock).mockResolvedValue(mockContainer);
      
      const response = await app.handle(new Request('http://localhost/containers/container-1'));
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual(mockContainer);
      expect(containerService.getContainer).toHaveBeenCalledWith('container-1');
    });
  });

  describe('POST /', () => {
    it('should create a new container', async () => {
      const mockContainer = { id: 'container-1', name: 'Container 1' };
      const mockRequest = {
        name: 'Container 1',
        image: 'nginx:latest',
        ports: [{ internal: 80, external: 8080 }]
      };
      
      (containerService.createContainer as jest.Mock).mockResolvedValue(mockContainer);
      
      const response = await app.handle(
        new Request('http://localhost/containers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mockRequest)
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual(mockContainer);
      expect(containerService.createContainer).toHaveBeenCalledWith(mockRequest);
    });
  });

  describe('POST /:id/start', () => {
    it('should start a container', async () => {
      (containerService.startContainer as jest.Mock).mockResolvedValue(undefined);
      
      const response = await app.handle(
        new Request('http://localhost/containers/container-1/start', {
          method: 'POST'
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({ success: true, id: 'container-1' });
      expect(containerService.startContainer).toHaveBeenCalledWith('container-1');
    });
  });

  describe('POST /:id/stop', () => {
    it('should stop a container', async () => {
      (containerService.stopContainer as jest.Mock).mockResolvedValue(undefined);
      
      const response = await app.handle(
        new Request('http://localhost/containers/container-1/stop', {
          method: 'POST'
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({ success: true, id: 'container-1' });
      expect(containerService.stopContainer).toHaveBeenCalledWith('container-1');
    });
  });

  describe('POST /:id/restart', () => {
    it('should restart a container', async () => {
      (containerService.restartContainer as jest.Mock).mockResolvedValue(undefined);
      
      const response = await app.handle(
        new Request('http://localhost/containers/container-1/restart', {
          method: 'POST'
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({ success: true, id: 'container-1' });
      expect(containerService.restartContainer).toHaveBeenCalledWith('container-1');
    });
  });

  describe('GET /:id/logs', () => {
    it('should get container logs', async () => {
      const mockLogs = ['log1', 'log2', 'log3'];
      
      (containerService.getContainerLogs as jest.Mock).mockResolvedValue(mockLogs);
      
      const response = await app.handle(
        new Request('http://localhost/containers/container-1/logs?tail=100')
      );
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({ id: 'container-1', logs: mockLogs });
      expect(containerService.getContainerLogs).toHaveBeenCalledWith('container-1', {
        tail: 100,
        since: undefined,
        until: undefined
      });
    });
  });

  describe('GET /:id/stats', () => {
    it('should get container stats', async () => {
      const mockStats = { cpu: 5, memory: 100 };
      
      (containerService.getContainerStats as jest.Mock).mockResolvedValue(mockStats);
      
      const response = await app.handle(
        new Request('http://localhost/containers/container-1/stats')
      );
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({ id: 'container-1', stats: mockStats });
      expect(containerService.getContainerStats).toHaveBeenCalledWith('container-1');
    });

    it('should get detailed container stats when detailed=true', async () => {
      const mockDetailedStats = { cpu: 5, memory: 100, network: {}, disk: {} };
      
      (containerService.getDetailedContainerStats as jest.Mock).mockResolvedValue(mockDetailedStats);
      
      const response = await app.handle(
        new Request('http://localhost/containers/container-1/stats?detailed=true')
      );
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({ id: 'container-1', stats: mockDetailedStats });
      expect(containerService.getDetailedContainerStats).toHaveBeenCalledWith('container-1');
    });
  });

  describe('DELETE /:id', () => {
    it('should remove a container', async () => {
      (containerService.removeContainer as jest.Mock).mockResolvedValue(undefined);
      
      const response = await app.handle(
        new Request('http://localhost/containers/container-1', {
          method: 'DELETE'
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({ success: true, id: 'container-1' });
      expect(containerService.removeContainer).toHaveBeenCalledWith('container-1', false);
    });

    it('should force remove a container when force=true', async () => {
      (containerService.removeContainer as jest.Mock).mockResolvedValue(undefined);
      
      const response = await app.handle(
        new Request('http://localhost/containers/container-1?force=true', {
          method: 'DELETE'
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({ success: true, id: 'container-1' });
      expect(containerService.removeContainer).toHaveBeenCalledWith('container-1', true);
    });
  });
});