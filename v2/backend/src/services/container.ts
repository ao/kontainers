import { dockerClient } from '../integrations/docker';
import { Container, ContainerState, ContainerStats, DetailedContainerStats } from '../../../shared/src/models';

/**
 * Service for managing containers
 */
export class ContainerService {
  private statsIntervals: Map<string, number> = new Map();
  private logStreams: Map<string, any> = new Map();
  private eventHandlers: Map<string, Function[]> = new Map();

  constructor() {
    // Initialize event handlers
    this.eventHandlers = new Map();
  }

  /**
   * Register event handler
   */
  on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)?.push(handler);
  }

  /**
   * Emit event
   */
  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  /**
   * Get all containers
   */
  async getContainers(all: boolean = true): Promise<Container[]> {
    return dockerClient.getContainers(all);
  }

  /**
   * Get container by ID
   */
  async getContainer(id: string): Promise<Container> {
    return dockerClient.getContainer(id);
  }

  /**
   * Create a new container
   */
  async createContainer(options: {
    name: string;
    image: string;
    ports?: { internal: number; external: number }[];
    volumes?: { source: string; destination: string; mode?: string }[];
    env?: string[];
    labels?: Record<string, string>;
  }): Promise<Container> {
    const container = await dockerClient.createContainer(options);
    this.emit('container:created', container);
    return container;
  }

  /**
   * Start a container
   */
  async startContainer(id: string): Promise<void> {
    await dockerClient.startContainer(id);
    const container = await this.getContainer(id);
    this.emit('container:started', container);
  }

  /**
   * Stop a container
   */
  async stopContainer(id: string): Promise<void> {
    await dockerClient.stopContainer(id);
    const container = await this.getContainer(id);
    this.emit('container:stopped', container);
  }

  /**
   * Restart a container
   */
  async restartContainer(id: string): Promise<void> {
    await dockerClient.restartContainer(id);
    const container = await this.getContainer(id);
    this.emit('container:restarted', container);
  }

  /**
   * Remove a container
   */
  async removeContainer(id: string, force: boolean = false): Promise<void> {
    // Stop any active stats monitoring
    this.stopStatsMonitoring(id);
    
    // Stop any active log streaming
    this.stopLogStreaming(id);
    
    await dockerClient.removeContainer(id, force);
    this.emit('container:removed', { id });
  }

  /**
   * Get container logs
   */
  async getContainerLogs(id: string, options: { tail?: number; since?: number; until?: number } = {}): Promise<string> {
    return dockerClient.getContainerLogs(id, options);
  }

  /**
   * Get container stats
   */
  async getContainerStats(id: string): Promise<ContainerStats> {
    return dockerClient.getContainerStats(id);
  }

  /**
   * Get detailed container stats
   */
  async getDetailedContainerStats(id: string): Promise<DetailedContainerStats> {
    return dockerClient.getDetailedContainerStats(id);
  }

  /**
   * Start monitoring container stats
   */
  startStatsMonitoring(id: string, interval: number = 5000): void {
    // Stop any existing monitoring for this container
    this.stopStatsMonitoring(id);
    
    // Start new monitoring interval
    const timer = setInterval(async () => {
      try {
        const stats = await this.getContainerStats(id);
        this.emit('container:stats', stats);
      } catch (error) {
        console.error(`Error monitoring stats for container ${id}:`, error);
        this.stopStatsMonitoring(id);
      }
    }, interval);
    
    this.statsIntervals.set(id, timer);
  }

  /**
   * Stop monitoring container stats
   */
  stopStatsMonitoring(id: string): void {
    const timer = this.statsIntervals.get(id);
    if (timer) {
      clearInterval(timer);
      this.statsIntervals.delete(id);
    }
  }

  /**
   * Start streaming container logs
   */
  async startLogStreaming(id: string, callback: (log: string) => void): Promise<void> {
    // Stop any existing log streaming for this container
    this.stopLogStreaming(id);
    
    try {
      // We need to use a different approach since docker is private
      // Get the logs with follow option
      const stream = await dockerClient.getContainerLogs(id, { tail: 0 });
      
      // For now, we'll simulate streaming by polling
      const pollInterval = setInterval(async () => {
        try {
          const newLogs = await dockerClient.getContainerLogs(id, { tail: 10 });
          callback(newLogs);
          this.emit('container:log', { id, log: newLogs });
        } catch (error) {
          console.error(`Error polling logs for container ${id}:`, error);
          this.stopLogStreaming(id);
        }
      }, 1000);
      
      this.logStreams.set(id, pollInterval);
      /*
      // This would be the ideal implementation if we had access to dockerClient.docker
      const stream = await container.logs({
        follow: true,
        stdout: true,
        stderr: true,
        timestamps: true
      });
      
      stream.on('data', (chunk: Buffer) => {
        const log = chunk.toString('utf-8');
        callback(log);
        this.emit('container:log', { id, log });
      });
      
      stream.on('error', (error: Error) => {
        console.error(`Error streaming logs for container ${id}:`, error);
        this.stopLogStreaming(id);
      });
      
      this.logStreams.set(id, stream);
      */
    } catch (error) {
      console.error(`Error starting log stream for container ${id}:`, error);
      throw error;
    }
  }

  /**
   * Stop streaming container logs
   */
  stopLogStreaming(id: string): void {
    const stream = this.logStreams.get(id);
    if (stream) {
      clearInterval(stream);
      this.logStreams.delete(id);
    }
  }

  /**
   * Get Docker daemon info
   */
  async getDockerInfo(): Promise<any> {
    return dockerClient.getInfo();
  }

  /**
   * Get Docker daemon version
   */
  async getDockerVersion(): Promise<any> {
    return dockerClient.getVersion();
  }
}

// Export a singleton instance
export const containerService = new ContainerService();