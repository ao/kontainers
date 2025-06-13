/**
 * Container-related models for Kontainers application
 */

/**
 * Represents a Docker container with its properties.
 */
export interface Container {
  id: string;
  name: string;
  image: string;
  state: ContainerState;
  status: string;
  ports: PortMapping[];
  volumes: VolumeMount[];
  networks: string[];
  created: number;
  labels?: Record<string, string>;
  env?: string[];
}

/**
 * Enum representing possible container states.
 */
export enum ContainerState {
  RUNNING = 'RUNNING',
  STOPPED = 'STOPPED',
  PAUSED = 'PAUSED',
  RESTARTING = 'RESTARTING',
  REMOVING = 'REMOVING',
  DEAD = 'DEAD',
  CREATED = 'CREATED'
}

/**
 * Represents a port mapping between container and host.
 */
export interface PortMapping {
  privatePort: number;
  publicPort?: number;
  type: string;
  ip: string;
}

/**
 * Represents a volume mount between host and container.
 */
export interface VolumeMount {
  source: string;
  destination: string;
  mode: string;
}