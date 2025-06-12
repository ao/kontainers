import { create } from 'zustand';
import { ConfigurationBackup } from '../../../shared/src/models';

interface AppConfig {
  theme: 'light' | 'dark' | 'system';
  autoRefresh: boolean;
  refreshInterval: number;
  showNotifications: boolean;
  compactView: boolean;
}

interface ConfigState {
  config: AppConfig;
  backups: ConfigurationBackup[];
  isLoading: boolean;
  error: string | null;
  setConfig: (config: Partial<AppConfig>) => void;
  setBackups: (backups: ConfigurationBackup[]) => void;
  addBackup: (backup: ConfigurationBackup) => void;
  removeBackup: (backupId: string) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

const DEFAULT_CONFIG: AppConfig = {
  theme: 'system',
  autoRefresh: true,
  refreshInterval: 10000, // 10 seconds
  showNotifications: true,
  compactView: false,
};

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: DEFAULT_CONFIG,
  backups: [],
  isLoading: false,
  error: null,
  
  setConfig: (newConfig) => set((state) => ({
    config: {
      ...state.config,
      ...newConfig
    }
  })),
  
  setBackups: (backups) => set({ backups }),
  
  addBackup: (backup) => set((state) => ({
    backups: [...state.backups, backup]
  })),
  
  removeBackup: (backupId) => set((state) => ({
    backups: state.backups.filter(backup => backup.id !== backupId)
  })),
  
  setLoading: (isLoading) => set({ isLoading }),
  
  setError: (error) => set({ error })
}));