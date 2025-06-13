import { Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import Layout from './components/layout/Layout';
import Dashboard from './components/dashboard/Dashboard';
import ContainerList from './components/containers/ContainerList';
import ContainerDetail from './components/containers/ContainerDetail';
import ContainerCreationForm from './components/containers/ContainerCreationForm';
import ProxyRuleList from './components/proxy/ProxyRuleList';
import ProxyRuleDetail from './components/proxy/ProxyRuleDetail';
import ProxyRuleForm from './components/proxy/ProxyRuleForm';
import ProxyTrafficMonitor from './components/proxy/ProxyTrafficMonitor';
import MetricsDashboard from './components/metrics/MetricsDashboard';
import ConfigurationForm from './components/settings/ConfigurationForm';
import BackupRestorePanel from './components/settings/BackupRestorePanel';
import NotFound from './components/common/NotFound';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000,
    },
  },
});

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          
          {/* Container Routes */}
          <Route path="/containers" element={<ContainerList />} />
          <Route path="/containers/new" element={<ContainerCreationForm />} />
          <Route path="/containers/:id" element={<ContainerDetail />} />
          
          {/* Proxy Routes */}
          <Route path="/proxy" element={<ProxyRuleList />} />
          <Route path="/proxy/new" element={<ProxyRuleForm />} />
          <Route path="/proxy/:id" element={<ProxyRuleDetail />} />
          <Route path="/proxy/:id/edit" element={<ProxyRuleForm />} />
          <Route path="/proxy/traffic" element={<ProxyTrafficMonitor />} />
          
          {/* Metrics Routes */}
          <Route path="/metrics" element={<MetricsDashboard />} />
          
          {/* Settings Routes */}
          <Route path="/settings" element={<ConfigurationForm />} />
          <Route path="/settings/backup" element={<BackupRestorePanel />} />
          
          {/* 404 Route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
};

export default App;