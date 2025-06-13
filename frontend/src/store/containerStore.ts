import { create } from 'zustand';
import { Container } from '../../../shared/src/models';

interface ContainerState {
  containers: Container[];
  selectedContainer: Container | null;
  isLoading: boolean;
  error: string | null;
  setContainers: (containers: Container[]) => void;
  setSelectedContainer: (container: Container | null) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  getContainerById: (id: string) => Container | undefined;
  getRunningContainers: () => Container[];
}

export const useContainerStore = create<ContainerState>((set, get) => ({
  containers: [],
  selectedContainer: null,
  isLoading: false,
  error: null,
  
  setContainers: (containers) => set({ containers }),
  
  setSelectedContainer: (container) => set({ selectedContainer: container }),
  
  setLoading: (isLoading) => set({ isLoading }),
  
  setError: (error) => set({ error }),
  
  getContainerById: (id) => {
    return get().containers.find(container => container.id === id);
  },
  
  getRunningContainers: () => {
    return get().containers.filter(container => container.state === 'RUNNING');
  }
}));