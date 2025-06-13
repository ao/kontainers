import fs from 'fs/promises';
import path from 'path';
import { ConfigurationBackup } from '../../../shared/src/models';

/**
 * Service for managing application configuration
 */
export class ConfigService {
  private configDir: string;
  private configPath: string;
  private backupsDir: string;
  private config: Record<string, any>;
  private eventHandlers: Map<string, Function[]> = new Map();

  constructor(options: {
    configDir?: string;
    configFileName?: string;
    backupsDir?: string;
  } = {}) {
    this.configDir = options.configDir || './config';
    this.configPath = path.join(this.configDir, options.configFileName || 'kontainers.json');
    this.backupsDir = options.backupsDir || path.join(this.configDir, 'backups');
    this.config = {};
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
   * Initialize configuration service
   */
  async initialize(): Promise<void> {
    try {
      // Ensure config directory exists
      await fs.mkdir(this.configDir, { recursive: true });
      
      // Ensure backups directory exists
      await fs.mkdir(this.backupsDir, { recursive: true });
      
      // Load configuration
      await this.loadConfig();
      
      this.emit('config:initialized', { success: true });
    } catch (error: any) {
      console.error('Error initializing configuration service:', error);
      this.emit('config:initialized', { success: false, error: error.message });
      throw error;
    }
  }

  /**
   * Load configuration from file
   */
  private async loadConfig(): Promise<void> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(data);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Config file doesn't exist, create default config
        await this.createDefaultConfig();
      } else {
        console.error('Error loading configuration:', error);
        throw error;
      }
    }
  }

  /**
   * Create default configuration
   */
  private async createDefaultConfig(): Promise<void> {
    const defaultConfig = {
      dockerEndpoint: '/var/run/docker.sock',
      proxyType: 'nginx',
      sslEnabled: false,
      autoStartContainers: true,
      logLevel: 'info',
      maxLogSize: 100,
      uiSettings: {
        theme: 'light',
        refreshInterval: 5000,
        showSystemContainers: false
      },
      version: '2.0.0',
      created: Date.now()
    };
    
    this.config = defaultConfig;
    await this.saveConfig();
  }

  /**
   * Save configuration to file
   */
  private async saveConfig(): Promise<void> {
    try {
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Error saving configuration:', error);
      throw error;
    }
  }

  /**
   * Get configuration
   */
  getConfig(): Record<string, any> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  async updateConfig(updates: Record<string, any>): Promise<Record<string, any>> {
    // Create a backup before updating
    await this.createBackup('pre-update');
    
    // Update config
    this.config = {
      ...this.config,
      ...updates
    };
    
    // Save updated config
    await this.saveConfig();
    
    this.emit('config:updated', this.config);
    return this.getConfig();
  }

  /**
   * Create a configuration backup
   */
  async createBackup(description?: string): Promise<ConfigurationBackup> {
    const timestamp = Date.now();
    const id = `backup-${timestamp}`;
    const name = `Backup ${new Date(timestamp).toLocaleString()}`;
    
    const backup: ConfigurationBackup = {
      id,
      name,
      timestamp,
      version: this.config.version || '2.0.0',
      description: description || `Automatic backup at ${new Date(timestamp).toLocaleString()}`,
      size: 0,
      components: ['config', 'proxy-rules']
    };
    
    try {
      // Create backup file
      const backupPath = path.join(this.backupsDir, `${id}.json`);
      const backupData = {
        metadata: backup,
        config: this.config
      };
      
      await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2));
      
      // Update backup size
      const stats = await fs.stat(backupPath);
      backup.size = stats.size;
      
      this.emit('config:backup:created', backup);
      return backup;
    } catch (error: any) {
      console.error('Error creating configuration backup:', error);
      this.emit('config:backup:error', { action: 'create', error: error.message });
      throw error;
    }
  }

  /**
   * Get all configuration backups
   */
  async getBackups(): Promise<ConfigurationBackup[]> {
    try {
      const files = await fs.readdir(this.backupsDir);
      const backups: ConfigurationBackup[] = [];
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const data = await fs.readFile(path.join(this.backupsDir, file), 'utf-8');
            const backupData = JSON.parse(data);
            
            if (backupData.metadata) {
              backups.push(backupData.metadata);
            }
          } catch (error) {
            console.warn(`Error reading backup file ${file}:`, error);
          }
        }
      }
      
      // Sort backups by timestamp (newest first)
      backups.sort((a, b) => b.timestamp - a.timestamp);
      
      return backups;
    } catch (error: any) {
      console.error('Error getting configuration backups:', error);
      throw error;
    }
  }

  /**
   * Restore configuration from backup
   */
  async restoreBackup(backupId: string): Promise<Record<string, any>> {
    try {
      // Create a backup of current config before restoring
      await this.createBackup('pre-restore');
      
      // Load backup file
      const backupPath = path.join(this.backupsDir, `${backupId}.json`);
      const data = await fs.readFile(backupPath, 'utf-8');
      const backupData = JSON.parse(data);
      
      if (!backupData.config) {
        throw new Error('Invalid backup file: missing configuration data');
      }
      
      // Restore config
      this.config = backupData.config;
      await this.saveConfig();
      
      this.emit('config:backup:restored', { backupId, config: this.config });
      return this.getConfig();
    } catch (error: any) {
      console.error(`Error restoring configuration from backup ${backupId}:`, error);
      this.emit('config:backup:error', { action: 'restore', backupId, error: error.message });
      throw error;
    }
  }

  /**
   * Delete a configuration backup
   */
  async deleteBackup(backupId: string): Promise<void> {
    try {
      const backupPath = path.join(this.backupsDir, `${backupId}.json`);
      await fs.unlink(backupPath);
      
      this.emit('config:backup:deleted', { backupId });
    } catch (error: any) {
      console.error(`Error deleting configuration backup ${backupId}:`, error);
      this.emit('config:backup:error', { action: 'delete', backupId, error: error.message });
      throw error;
    }
  }
}

// Export a singleton instance
export const configService = new ConfigService();