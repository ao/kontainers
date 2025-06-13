import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { createContainer } from '../../services/containerService';
import Card from '../common/Card';
import Button from '../common/Button';
import Alert from '../common/Alert';

interface PortMapping {
  privatePort: number;
  publicPort?: number;
  type: string;
}

interface VolumeMount {
  source: string;
  destination: string;
  mode: string;
}

interface EnvironmentVariable {
  key: string;
  value: string;
}

const ContainerCreationForm: React.FC = () => {
  const navigate = useNavigate();
  
  // Form state
  const [name, setName] = useState('');
  const [image, setImage] = useState('');
  const [ports, setPorts] = useState<PortMapping[]>([]);
  const [volumes, setVolumes] = useState<VolumeMount[]>([]);
  const [envVars, setEnvVars] = useState<EnvironmentVariable[]>([]);
  const [networks, setNetworks] = useState<string[]>([]);
  const [newNetwork, setNewNetwork] = useState('');
  
  // Temporary state for adding new items
  const [newPort, setNewPort] = useState<PortMapping>({ privatePort: 80, type: 'tcp' });
  const [newVolume, setNewVolume] = useState<VolumeMount>({ source: '', destination: '', mode: 'rw' });
  const [newEnvVar, setNewEnvVar] = useState<EnvironmentVariable>({ key: '', value: '' });
  
  // Form validation
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Create container mutation
  const createContainerMutation = useMutation({
    mutationFn: createContainer,
    onSuccess: (data) => {
      navigate(`/containers/${data.id}`);
    },
    onError: (error: Error) => {
      setErrors({ submit: error.message });
    }
  });
  
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!name.trim()) {
      newErrors.name = 'Container name is required';
    }
    
    if (!image.trim()) {
      newErrors.image = 'Image name is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    // Prepare environment variables in the format expected by the API
    const envArray = envVars.map(env => `${env.key}=${env.value}`);
    
    createContainerMutation.mutate({
      name,
      image,
      ports,
      volumes,
      networks,
      env: envArray,
      state: 'CREATED',
      status: 'Created',
      labels: {}
    });
  };
  
  const addPort = () => {
    if (newPort.privatePort > 0) {
      setPorts([...ports, { ...newPort }]);
      setNewPort({ privatePort: 80, type: 'tcp' });
    }
  };
  
  const removePort = (index: number) => {
    setPorts(ports.filter((_, i) => i !== index));
  };
  
  const addVolume = () => {
    if (newVolume.source && newVolume.destination) {
      setVolumes([...volumes, { ...newVolume }]);
      setNewVolume({ source: '', destination: '', mode: 'rw' });
    }
  };
  
  const removeVolume = (index: number) => {
    setVolumes(volumes.filter((_, i) => i !== index));
  };
  
  const addEnvVar = () => {
    if (newEnvVar.key) {
      setEnvVars([...envVars, { ...newEnvVar }]);
      setNewEnvVar({ key: '', value: '' });
    }
  };
  
  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };
  
  const addNetwork = () => {
    if (newNetwork && !networks.includes(newNetwork)) {
      setNetworks([...networks, newNetwork]);
      setNewNetwork('');
    }
  };
  
  const removeNetwork = (network: string) => {
    setNetworks(networks.filter(n => n !== network));
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-900">Create Container</h1>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {errors.submit && (
          <Alert 
            variant="error" 
            title="Error creating container" 
            message={errors.submit} 
          />
        )}
        
        <Card title="Basic Information">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Container Name
              </label>
              <input
                type="text"
                id="name"
                className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm ${
                  errors.name ? 'border-red-300' : ''
                }`}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {errors.name && (
                <p className="mt-2 text-sm text-red-600">{errors.name}</p>
              )}
            </div>
            
            <div>
              <label htmlFor="image" className="block text-sm font-medium text-gray-700">
                Image
              </label>
              <input
                type="text"
                id="image"
                className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm ${
                  errors.image ? 'border-red-300' : ''
                }`}
                placeholder="e.g., nginx:latest"
                value={image}
                onChange={(e) => setImage(e.target.value)}
              />
              {errors.image && (
                <p className="mt-2 text-sm text-red-600">{errors.image}</p>
              )}
            </div>
          </div>
        </Card>
        
        <Card title="Port Mappings">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="privatePort" className="block text-sm font-medium text-gray-700">
                  Container Port
                </label>
                <input
                  type="number"
                  id="privatePort"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  value={newPort.privatePort}
                  onChange={(e) => setNewPort({ ...newPort, privatePort: parseInt(e.target.value) || 0 })}
                />
              </div>
              
              <div>
                <label htmlFor="publicPort" className="block text-sm font-medium text-gray-700">
                  Host Port (optional)
                </label>
                <input
                  type="number"
                  id="publicPort"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  value={newPort.publicPort || ''}
                  onChange={(e) => setNewPort({ ...newPort, publicPort: parseInt(e.target.value) || undefined })}
                />
              </div>
              
              <div>
                <label htmlFor="portType" className="block text-sm font-medium text-gray-700">
                  Protocol
                </label>
                <select
                  id="portType"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  value={newPort.type}
                  onChange={(e) => setNewPort({ ...newPort, type: e.target.value })}
                >
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                </select>
              </div>
            </div>
            
            <div className="flex justify-end">
              <Button type="button" variant="secondary" size="sm" onClick={addPort}>
                Add Port
              </Button>
            </div>
            
            {ports.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Added Ports</h4>
                <div className="bg-gray-50 rounded-md p-3 space-y-2">
                  {ports.map((port, index) => (
                    <div key={index} className="flex justify-between items-center bg-white p-2 rounded-md shadow-sm">
                      <span className="text-sm">
                        {port.publicPort || port.privatePort}:{port.privatePort}/{port.type}
                      </span>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => removePort(index)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
        
        <Card title="Volume Mounts">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="source" className="block text-sm font-medium text-gray-700">
                  Host Path
                </label>
                <input
                  type="text"
                  id="source"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  value={newVolume.source}
                  onChange={(e) => setNewVolume({ ...newVolume, source: e.target.value })}
                />
              </div>
              
              <div>
                <label htmlFor="destination" className="block text-sm font-medium text-gray-700">
                  Container Path
                </label>
                <input
                  type="text"
                  id="destination"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  value={newVolume.destination}
                  onChange={(e) => setNewVolume({ ...newVolume, destination: e.target.value })}
                />
              </div>
              
              <div>
                <label htmlFor="mode" className="block text-sm font-medium text-gray-700">
                  Mode
                </label>
                <select
                  id="mode"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  value={newVolume.mode}
                  onChange={(e) => setNewVolume({ ...newVolume, mode: e.target.value })}
                >
                  <option value="rw">Read-Write</option>
                  <option value="ro">Read-Only</option>
                </select>
              </div>
            </div>
            
            <div className="flex justify-end">
              <Button type="button" variant="secondary" size="sm" onClick={addVolume}>
                Add Volume
              </Button>
            </div>
            
            {volumes.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Added Volumes</h4>
                <div className="bg-gray-50 rounded-md p-3 space-y-2">
                  {volumes.map((volume, index) => (
                    <div key={index} className="flex justify-between items-center bg-white p-2 rounded-md shadow-sm">
                      <span className="text-sm">
                        {volume.source}:{volume.destination}:{volume.mode}
                      </span>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => removeVolume(index)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
        
        <Card title="Environment Variables">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="envKey" className="block text-sm font-medium text-gray-700">
                  Key
                </label>
                <input
                  type="text"
                  id="envKey"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  value={newEnvVar.key}
                  onChange={(e) => setNewEnvVar({ ...newEnvVar, key: e.target.value })}
                />
              </div>
              
              <div>
                <label htmlFor="envValue" className="block text-sm font-medium text-gray-700">
                  Value
                </label>
                <input
                  type="text"
                  id="envValue"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  value={newEnvVar.value}
                  onChange={(e) => setNewEnvVar({ ...newEnvVar, value: e.target.value })}
                />
              </div>
            </div>
            
            <div className="flex justify-end">
              <Button type="button" variant="secondary" size="sm" onClick={addEnvVar}>
                Add Environment Variable
              </Button>
            </div>
            
            {envVars.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Added Environment Variables</h4>
                <div className="bg-gray-50 rounded-md p-3 space-y-2">
                  {envVars.map((env, index) => (
                    <div key={index} className="flex justify-between items-center bg-white p-2 rounded-md shadow-sm">
                      <span className="text-sm">
                        {env.key}={env.value}
                      </span>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => removeEnvVar(index)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
        
        <Card title="Networks">
          <div className="space-y-4">
            <div className="flex space-x-2">
              <div className="flex-1">
                <label htmlFor="network" className="block text-sm font-medium text-gray-700">
                  Network
                </label>
                <input
                  type="text"
                  id="network"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  value={newNetwork}
                  onChange={(e) => setNewNetwork(e.target.value)}
                />
              </div>
              
              <div className="flex items-end">
                <Button type="button" variant="secondary" size="sm" onClick={addNetwork}>
                  Add Network
                </Button>
              </div>
            </div>
            
            {networks.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Added Networks</h4>
                <div className="flex flex-wrap gap-2">
                  {networks.map((network) => (
                    <div key={network} className="inline-flex items-center bg-blue-100 text-blue-800 rounded-full px-3 py-1 text-sm">
                      {network}
                      <button
                        type="button"
                        className="ml-1.5 text-blue-600 hover:text-blue-800"
                        onClick={() => removeNetwork(network)}
                      >
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
        
        <div className="flex justify-end space-x-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate('/containers')}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={createContainerMutation.isPending}
          >
            Create Container
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ContainerCreationForm;