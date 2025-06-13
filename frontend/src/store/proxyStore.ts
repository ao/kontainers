import { create } from 'zustand';
import { ProxyRule, ProxyTrafficData, ProxyErrorSummary } from '../../../shared/src/models';

interface ProxyState {
  proxyRules: ProxyRule[];
  selectedRule: ProxyRule | null;
  trafficData: Record<string, ProxyTrafficData[]>;
  errorSummaries: Record<string, ProxyErrorSummary>;
  isLoading: boolean;
  error: string | null;
  setProxyRules: (rules: ProxyRule[]) => void;
  setSelectedRule: (rule: ProxyRule | null) => void;
  setTrafficData: (ruleId: string, data: ProxyTrafficData[]) => void;
  setErrorSummary: (ruleId: string, summary: ProxyErrorSummary) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  getRuleById: (id: string) => ProxyRule | undefined;
  getActiveRules: () => ProxyRule[];
}

export const useProxyStore = create<ProxyState>((set, get) => ({
  proxyRules: [],
  selectedRule: null,
  trafficData: {},
  errorSummaries: {},
  isLoading: false,
  error: null,
  
  setProxyRules: (rules) => set({ proxyRules: rules }),
  
  setSelectedRule: (rule) => set({ selectedRule: rule }),
  
  setTrafficData: (ruleId, data) => set((state) => ({
    trafficData: {
      ...state.trafficData,
      [ruleId]: data
    }
  })),
  
  setErrorSummary: (ruleId, summary) => set((state) => ({
    errorSummaries: {
      ...state.errorSummaries,
      [ruleId]: summary
    }
  })),
  
  setLoading: (isLoading) => set({ isLoading }),
  
  setError: (error) => set({ error }),
  
  getRuleById: (id) => {
    return get().proxyRules.find(rule => rule.id === id);
  },
  
  getActiveRules: () => {
    return get().proxyRules.filter(rule => rule.enabled);
  }
}));