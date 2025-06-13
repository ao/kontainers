import Dockerode from 'dockerode';
import { Container, ContainerState, PortMapping, VolumeMount, ContainerStats, DetailedContainerStats } from '../../../shared/src/models';
import { HealthStatus } from '../../../shared/src/models';

/**
 * Docker API client for interacting with Docker daemon
 */
export class DockerClient {
  private docker: Dockerode;

  constructor(socketPath: string = '/var/run/docker.sock') {
    this.docker = new Dockerode({ socketPath });
  }

  /**
   * Get all containers
   */
  async getContainers(all: boolean = true): Promise<Container[]> {
    try {
      const containers = await this.docker.listContainers({ all });
      return containers.map(this.mapDockerContainerToModel);
    } catch (error: any) {
      console.error('Error fetching containers:', error);
      throw new Error(`Failed to fetch containers: ${error.message}`);
    }
  }

  /**
   * Get container by ID
   */
  async getContainer(id: string): Promise<Container> {
    try {
      const container = this.docker.getContainer(id);
      const [info, stats] = await Promise.all([
        container.inspect(),
        this.getContainerStats(id)
      ]);
      
      return this.mapDockerContainerToModel({
        Id: info.Id,
        Names: [info.Name],
        Image: info.Config.Image,
        ImageID: info.Image,
        Command: info.Config.Cmd?.join(' ') || '',
        Created: new Date(info.Created).getTime() / 1000,
        State: info.State,
        Status: `${info.State.Status} (${info.State.Running ? 'running' : 'stopped'})`,
        Ports: info.NetworkSettings.Ports || [],
        Labels: info.Config.Labels || {},
        Mounts: info.Mounts || [],
        NetworkSettings: info.NetworkSettings
      });
    } catch (error: any) {
      console.error(`Error fetching container ${id}:`, error);
      throw new Error(`Failed to fetch container ${id}: ${error.message}`);
    }
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
    try {
      const createOptions: Dockerode.ContainerCreateOptions = {
        Image: options.image,
        name: options.name,
        ExposedPorts: {},
        HostConfig: {
          PortBindings: {},
          Binds: []
        },
        Env: options.env,
        Labels: options.labels
      };

      // Configure port mappings
      if (options.ports && options.ports.length > 0) {
        options.ports.forEach(port => {
          createOptions.ExposedPorts[`${port.internal}/tcp`] = {};
          createOptions.HostConfig.PortBindings[`${port.internal}/tcp`] = [
            { HostPort: `${port.external}` }
          ];
        });
      }

      // Configure volume mounts
      if (options.volumes && options.volumes.length > 0) {
        options.volumes.forEach(volume => {
          createOptions.HostConfig.Binds.push(
            `${volume.source}:${volume.destination}:${volume.mode || 'rw'}`
          );
        });
      }

      const container = await this.docker.createContainer(createOptions);
      const info = await container.inspect();
      
      return this.mapDockerContainerToModel({
        Id: info.Id,
        Names: [info.Name],
        Image: info.Config.Image,
        ImageID: info.Image,
        Command: info.Config.Cmd?.join(' ') || '',
        Created: new Date(info.Created).getTime() / 1000,
        State: info.State,
        Status: `${info.State.Status} (${info.State.Running ? 'running' : 'stopped'})`,
        Ports: info.NetworkSettings.Ports || [],
        Labels: info.Config.Labels || {},
        Mounts: info.Mounts || [],
        NetworkSettings: info.NetworkSettings
      });
    } catch (error: any) {
      console.error('Error creating container:', error);
      throw new Error(`Failed to create container: ${error.message}`);
    }
  }

  /**
   * Start a container
   */
  async startContainer(id: string): Promise<void> {
    try {
      const container = this.docker.getContainer(id);
      await container.start();
    } catch (error: any) {
      console.error(`Error starting container ${id}:`, error);
      throw new Error(`Failed to start container ${id}: ${error.message}`);
    }
  }

  /**
   * Stop a container
   */
  async stopContainer(id: string): Promise<void> {
    try {
      const container = this.docker.getContainer(id);
      await container.stop();
    } catch (error: any) {
      console.error(`Error stopping container ${id}:`, error);
      throw new Error(`Failed to stop container ${id}: ${error.message}`);
    }
  }

  /**
   * Restart a container
   */
  async restartContainer(id: string): Promise<void> {
    try {
      const container = this.docker.getContainer(id);
      await container.restart();
    } catch (error: any) {
      console.error(`Error restarting container ${id}:`, error);
      throw new Error(`Failed to restart container ${id}: ${error.message}`);
    }
  }

  /**
   * Remove a container
   */
  async removeContainer(id: string, force: boolean = false): Promise<void> {
    try {
      const container = this.docker.getContainer(id);
      await container.remove({ force });
    } catch (error: any) {
      console.error(`Error removing container ${id}:`, error);
      throw new Error(`Failed to remove container ${id}: ${error.message}`);
    }
  }

  /**
   * Get container logs
   */
  async getContainerLogs(id: string, options: { tail?: number; since?: number; until?: number } = {}): Promise<string> {
    try {
      const container = this.docker.getContainer(id);
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: options.tail || 100,
        since: options.since,
        until: options.until,
        timestamps: true
      });
      
      return logs.toString('utf-8');
    } catch (error: any) {
      console.error(`Error fetching logs for container ${id}:`, error);
      throw new Error(`Failed to fetch logs for container ${id}: ${error.message}`);
    }
  }

  /**
   * Get container stats
   */
  async getContainerStats(id: string): Promise<ContainerStats> {
    try {
      const container = this.docker.getContainer(id);
      const stats = await container.stats({ stream: false });
      
      // Calculate CPU usage percentage
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const systemCpuDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const cpuUsage = (cpuDelta / systemCpuDelta) * stats.cpu_stats.online_cpus * 100;
      
      // Calculate memory usage
      const memoryUsage = stats.memory_stats.usage;
      const memoryLimit = stats.memory_stats.limit;
      const memoryUsagePercentage = (memoryUsage / memoryLimit) * 100;
      
      return {
        containerId: id,
        timestamp: Date.now(),
        cpuUsage,
        memoryUsage,
        memoryLimit,
        memoryUsagePercentage,
        networkRx: stats.networks ? Object.values(stats.networks as Record<string, any>).reduce((sum, net) => sum + net.rx_bytes, 0) : 0,
        networkTx: stats.networks ? Object.values(stats.networks as Record<string, any>).reduce((sum, net) => sum + net.tx_bytes, 0) : 0,
        blockRead: stats.blkio_stats.io_service_bytes_recursive?.find((stat: any) => stat.op === 'Read')?.value || 0,
        blockWrite: stats.blkio_stats.io_service_bytes_recursive?.find((stat: any) => stat.op === 'Write')?.value || 0
      };
    } catch (error: any) {
      console.error(`Error fetching stats for container ${id}:`, error);
      throw new Error(`Failed to fetch stats for container ${id}: ${error.message}`);
    }
  }

  /**
   * Get detailed container stats
   */
  async getDetailedContainerStats(id: string): Promise<DetailedContainerStats> {
    try {
      const container = this.docker.getContainer(id);
      const [stats, info] = await Promise.all([
        container.stats({ stream: false }),
        container.inspect()
      ]);
      
      // Calculate CPU usage
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const systemCpuDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const cpuUsage = (cpuDelta / systemCpuDelta) * stats.cpu_stats.online_cpus * 100;
      
      // Calculate memory usage
      const memoryUsage = stats.memory_stats.usage;
      const memoryLimit = stats.memory_stats.limit;
      const memoryUsagePercentage = (memoryUsage / memoryLimit) * 100;
      
      // Calculate swap usage
      const memorySwap = stats.memory_stats.stats?.swap || 0;
      const memorySwapLimit = stats.memory_stats.stats?.total_swap || 0;
      const swapUsagePercentage = memorySwapLimit > 0 ? (memorySwap / memorySwapLimit) * 100 : 0;
      
      // Network throughput
      const networkRx = stats.networks ? Object.values(stats.networks as Record<string, any>).reduce((sum, net) => sum + net.rx_bytes, 0) : 0;
      const networkTx = stats.networks ? Object.values(stats.networks as Record<string, any>).reduce((sum, net) => sum + net.tx_bytes, 0) : 0;
      const networkThroughput = networkRx + networkTx;
      
      // Block I/O throughput
      const blockRead = stats.blkio_stats.io_service_bytes_recursive?.find((stat: any) => stat.op === 'Read')?.value || 0;
      const blockWrite = stats.blkio_stats.io_service_bytes_recursive?.find((stat: any) => stat.op === 'Write')?.value || 0;
      const blockThroughput = blockRead + blockWrite;
      
      // Health status
      let healthStatus = HealthStatus.UNKNOWN;
      let healthCheckLogs: string[] = [];
      
      if (info.State.Health) {
        switch (info.State.Health.Status) {
          case 'healthy':
            healthStatus = HealthStatus.HEALTHY;
            break;
          case 'unhealthy':
            healthStatus = HealthStatus.UNHEALTHY;
            break;
          case 'starting':
            healthStatus = HealthStatus.STARTING;
            break;
          default:
            healthStatus = HealthStatus.UNKNOWN;
        }
        
        healthCheckLogs = info.State.Health.Log?.map((log: any) => log.Output) || [];
      } else if (info.State.Running) {
        healthStatus = HealthStatus.HEALTHY;
      } else {
        healthStatus = HealthStatus.UNHEALTHY;
      }
      
      return {
        containerId: id,
        timestamp: Date.now(),
        cpuUsage,
        cpuKernelUsage: stats.cpu_stats.cpu_usage.usage_in_kernelmode,
        cpuUserUsage: stats.cpu_stats.cpu_usage.usage_in_usermode,
        cpuSystemUsage: stats.cpu_stats.system_cpu_usage,
        cpuOnlineCpus: stats.cpu_stats.online_cpus,
        memoryUsage,
        memoryLimit,
        memoryUsagePercentage,
        memoryCache: stats.memory_stats.stats?.cache || 0,
        memorySwap,
        memorySwapLimit,
        swapUsagePercentage,
        networkRx,
        networkTx,
        networkThroughput,
        networkPacketsRx: stats.networks ? Object.values(stats.networks as Record<string, any>).reduce((sum, net) => sum + net.rx_packets, 0) : 0,
        networkPacketsTx: stats.networks ? Object.values(stats.networks as Record<string, any>).reduce((sum, net) => sum + net.tx_packets, 0) : 0,
        networkDroppedRx: stats.networks ? Object.values(stats.networks as Record<string, any>).reduce((sum, net) => sum + net.rx_dropped, 0) : 0,
        networkDroppedTx: stats.networks ? Object.values(stats.networks as Record<string, any>).reduce((sum, net) => sum + net.tx_dropped, 0) : 0,
        networkErrorsRx: stats.networks ? Object.values(stats.networks as Record<string, any>).reduce((sum, net) => sum + net.rx_errors, 0) : 0,
        networkErrorsTx: stats.networks ? Object.values(stats.networks as Record<string, any>).reduce((sum, net) => sum + net.tx_errors, 0) : 0,
        blockRead,
        blockWrite,
        blockThroughput,
        blockReadOps: stats.blkio_stats.io_serviced_recursive?.find((stat: any) => stat.op === 'Read')?.value || 0,
        blockWriteOps: stats.blkio_stats.io_serviced_recursive?.find((stat: any) => stat.op === 'Write')?.value || 0,
        pids: stats.pids_stats.current,
        restartCount: info.RestartCount,
        healthStatus,
        healthCheckLogs
      };
    } catch (error: any) {
      console.error(`Error fetching detailed stats for container ${id}:`, error);
      throw new Error(`Failed to fetch detailed stats for container ${id}: ${error.message}`);
    }
  }

  /**
   * Get Docker daemon info
   */
  async getInfo(): Promise<any> {
    try {
      return await this.docker.info();
    } catch (error: any) {
      console.error('Error fetching Docker info:', error);
      throw new Error(`Failed to fetch Docker info: ${error.message}`);
    }
  }

  /**
   * Get Docker daemon version
   */
  async getVersion(): Promise<any> {
    try {
      return await this.docker.version();
    } catch (error: any) {
      console.error('Error fetching Docker version:', error);
      throw new Error(`Failed to fetch Docker version: ${error.message}`);
    }
  }

  /**
   * Map Docker container object to our Container model
   */
  private mapDockerContainerToModel(container: any): Container {
    // Map container state
    let state: ContainerState;
    if (container.State?.Running) {
      state = ContainerState.RUNNING;
    } else if (container.State?.Paused) {
      state = ContainerState.PAUSED;
    } else if (container.State?.Restarting) {
      state = ContainerState.RESTARTING;
    } else if (container.State?.Dead) {
      state = ContainerState.DEAD;
    } else if (container.State?.Status === 'created') {
      state = ContainerState.CREATED;
    } else if (container.State?.Status === 'removing') {
      state = ContainerState.REMOVING;
    } else {
      state = ContainerState.STOPPED;
    }

    // Map port bindings
    const ports: PortMapping[] = [];
    if (container.Ports) {
      container.Ports.forEach((port: any) => {
        ports.push({
          privatePort: port.PrivatePort,
          publicPort: port.PublicPort,
          type: port.Type,
          ip: port.IP || '0.0.0.0'
        });
      });
    } else if (container.NetworkSettings?.Ports) {
      Object.entries(container.NetworkSettings.Ports).forEach(([key, value]) => {
        const [privatePort, type] = key.split('/');
        if (Array.isArray(value)) {
          value.forEach(binding => {
            ports.push({
              privatePort: parseInt(privatePort),
              publicPort: binding.HostPort ? parseInt(binding.HostPort) : undefined,
              type,
              ip: binding.HostIp || '0.0.0.0'
            });
          });
        }
      });
    }

    // Map volume mounts
    const volumes: VolumeMount[] = [];
    if (container.Mounts) {
      container.Mounts.forEach((mount: any) => {
        volumes.push({
          source: mount.Source,
          destination: mount.Destination,
          mode: mount.Mode
        });
      });
    }

    // Map networks
    const networks: string[] = [];
    if (container.NetworkSettings?.Networks) {
      networks.push(...Object.keys(container.NetworkSettings.Networks));
    }

    // Extract environment variables
    let env: string[] = [];
    if (container.Config?.Env) {
      env = container.Config.Env;
    }

    return {
      id: container.Id,
      name: container.Names ? container.Names[0].replace(/^\//, '') : '',
      image: container.Image,
      state,
      status: container.Status,
      ports,
      volumes,
      networks,
      created: container.Created,
      labels: container.Labels,
      env
    };
  }
}

// Export a singleton instance
export const dockerClient = new DockerClient();