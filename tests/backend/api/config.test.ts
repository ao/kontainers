import { describe, expect, it, beforeEach, jest, afterEach } from 'bun:test';
import { Elysia } from 'elysia';
import { configRoutes } from '@backend/src/api/config';
import { configService } from '@backend/src/services/config';

// Mock the config service
jest.mock('@backend/src/services/config', () => ({
  configService: {
    getConfig: jest.fn(),
    updateConfig: jest.fn(),
    createBackup: jest.fn(),
    getBackups: jest.fn(),
    restoreBackup: jest.fn(),
    deleteBackup: jest.fn()
  }
}));

describe('Configuration API Routes', () => {
  let app: Elysia;
  
  const mockConfig = {
    dockerEndpoint: 'unix:///var/run/docker.sock',
    proxyType: 'nginx',
    sslEnabled: true,
    autoStartContainers: false,
    logLevel: 'info',
    maxLogSize: 100,
    uiSettings: {
      theme: 'dark',
      refreshInterval: 5000,
      showSystemContainers: false
    }
  };
  
  const mockBackup = {
    id: 'backup-1',
    timestamp: new Date().toISOString(),
    description: 'Test backup',
    config: mockConfig
  };
  
  beforeEach(() => {
    // Reset all mocks
    jest.resetAllMocks();
    
    // Create a new Elysia app with the config routes
    app = new Elysia().use(configRoutes);
    
    // Default mock implementations
    (configService.getConfig as jest.Mock).mockReturnValue(mockConfig);
    (configService.updateConfig as jest.Mock).mockResolvedValue(mockConfig);
    (configService.createBackup as jest.Mock).mockResolvedValue(mockBackup);
    (configService.getBackups as jest.Mock).mockResolvedValue([mockBackup]);
    (configService.restoreBackup as jest.Mock).mockResolvedValue(mockConfig);
    (configService.deleteBackup as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /', () => {
    it('should return the current configuration', async () => {
      const response = await app.handle(new Request('http://localhost/config'));
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual(mockConfig);
      expect(configService.getConfig).toHaveBeenCalledTimes(1);
    });
  });

  describe('PUT /', () => {
    it('should update the configuration', async () => {
      const updatedConfig = {
        ...mockConfig,
        sslEnabled: false,
        logLevel: 'debug'
      };
      
      (configService.updateConfig as jest.Mock).mockResolvedValue(updatedConfig);
      
      const response = await app.handle(
        new Request('http://localhost/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sslEnabled: false,
            logLevel: 'debug'
          })
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({
        success: true,
        config: updatedConfig
      });
      expect(configService.updateConfig).toHaveBeenCalledWith({
        sslEnabled: false,
        logLevel: 'debug'
      });
    });

    it('should return an error when update fails', async () => {
      const errorMessage = 'Failed to update configuration';
      (configService.updateConfig as jest.Mock).mockRejectedValue(new Error(errorMessage));
      
      const response = await app.handle(
        new Request('http://localhost/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sslEnabled: false
          })
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(500);
      expect(body).toEqual({ error: errorMessage });
    });
  });

  describe('POST /backup', () => {
    it('should create a configuration backup', async () => {
      const response = await app.handle(
        new Request('http://localhost/config/backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: 'Test backup'
          })
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({
        success: true,
        backup: mockBackup
      });
      expect(configService.createBackup).toHaveBeenCalledWith('Test backup');
    });

    it('should create a backup without description', async () => {
      const response = await app.handle(
        new Request('http://localhost/config/backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        })
      );
      
      expect(response.status).toBe(200);
      expect(configService.createBackup).toHaveBeenCalledWith(undefined);
    });

    it('should return an error when backup creation fails', async () => {
      const errorMessage = 'Failed to create backup';
      (configService.createBackup as jest.Mock).mockRejectedValue(new Error(errorMessage));
      
      const response = await app.handle(
        new Request('http://localhost/config/backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(500);
      expect(body).toEqual({ error: errorMessage });
    });
  });

  describe('GET /backups', () => {
    it('should return all configuration backups', async () => {
      const response = await app.handle(new Request('http://localhost/config/backups'));
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({ backups: [mockBackup] });
      expect(configService.getBackups).toHaveBeenCalledTimes(1);
    });

    it('should return an error when getting backups fails', async () => {
      const errorMessage = 'Failed to get backups';
      (configService.getBackups as jest.Mock).mockRejectedValue(new Error(errorMessage));
      
      const response = await app.handle(new Request('http://localhost/config/backups'));
      const body = await response.json();
      
      expect(response.status).toBe(500);
      expect(body).toEqual({ error: errorMessage });
    });
  });

  describe('POST /restore', () => {
    it('should restore configuration from backup', async () => {
      const response = await app.handle(
        new Request('http://localhost/config/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            backupId: 'backup-1'
          })
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({
        success: true,
        backupId: 'backup-1',
        config: mockConfig
      });
      expect(configService.restoreBackup).toHaveBeenCalledWith('backup-1');
    });

    it('should return an error when restore fails', async () => {
      const errorMessage = 'Failed to restore backup';
      (configService.restoreBackup as jest.Mock).mockRejectedValue(new Error(errorMessage));
      
      const response = await app.handle(
        new Request('http://localhost/config/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            backupId: 'backup-1'
          })
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(500);
      expect(body).toEqual({ error: errorMessage });
    });
  });

  describe('DELETE /backups/:id', () => {
    it('should delete a configuration backup', async () => {
      const response = await app.handle(
        new Request('http://localhost/config/backups/backup-1', {
          method: 'DELETE'
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(200);
      expect(body).toEqual({
        success: true,
        backupId: 'backup-1'
      });
      expect(configService.deleteBackup).toHaveBeenCalledWith('backup-1');
    });

    it('should return an error when delete fails', async () => {
      const errorMessage = 'Failed to delete backup';
      (configService.deleteBackup as jest.Mock).mockRejectedValue(new Error(errorMessage));
      
      const response = await app.handle(
        new Request('http://localhost/config/backups/backup-1', {
          method: 'DELETE'
        })
      );
      const body = await response.json();
      
      expect(response.status).toBe(500);
      expect(body).toEqual({ error: errorMessage });
    });
  });
});