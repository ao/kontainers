import { create } from 'zustand';
import { HealthStatus, SystemResourceMetrics, HealthCheckResult } from '../../../shared/src/models';

interface SystemHealth {
  status: HealthStatus;
  metrics: SystemResourceMetrics;
}

interface HealthState {
  systemHealth: SystemHealth | null;
  componentHealth: Record<string, HealthCheckResult>;
  metricsHistory: SystemResourceMetrics[];
  maxHistoryLength: number;
  isLoading: boolean;
  error: string | null;
  setSystemHealth: (health: SystemHealth) => void;
  setComponentHealth: (componentId: string, health: HealthCheckResult) => void;
  addMetricsSnapshot: (metrics: SystemResourceMetrics) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  getUnhealthyComponents: () => HealthCheckResult[];
}

export const useHealthStore = create<HealthState>((set, get) => ({
  systemHealth: null,
  componentHealth: {},
  metricsHistory: [],
  maxHistoryLength: 100, // Keep last 100 metrics snapshots
  isLoading: false,
  error: null,
  
  setSystemHealth: (health) => {
    set({ systemHealth: health });
    // Also add the metrics to history
    get().addMetricsSnapshot(health.metrics);
  },
  
  setComponentHealth: (componentId, health) => set((state) => ({
    componentHealth: {
      ...state.componentHealth,
      [componentId]: health
    }
  })),
  
  addMetricsSnapshot: (metrics) => set((state) => {
    const newHistory = [...state.metricsHistory, metrics];
    // Limit the history length
    if (newHistory.length > state.maxHistoryLength) {
      newHistory.shift(); // Remove oldest entry
    }
    return { metricsHistory: newHistory };
  }),
  
  setLoading: (isLoading) => set({ isLoading }),
  
  setError: (error) => set({ error }),
  
  getUnhealthyComponents: () => {
    return Object.values(get().componentHealth).filter(
      component => component.status === HealthStatus.UNHEALTHY || component.status === HealthStatus.DEGRADED
    );
  }
}));