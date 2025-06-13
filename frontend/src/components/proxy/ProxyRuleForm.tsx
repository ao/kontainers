import React, { useState, useEffect } from 'react';
import { useProxyStore } from '../../store/proxyStore';
import { ProxyRule, ProxyProtocol } from '../../../shared/src/models';

interface ProxyRuleFormProps {
  initialRule?: ProxyRule;
  onSubmit: (rule: ProxyRule) => void;
  onCancel: () => void;
}

export const ProxyRuleForm: React.FC<ProxyRuleFormProps> = ({
  initialRule,
  onSubmit,
  onCancel
}) => {
  const { containers } = useProxyStore();
  
  const [rule, setRule] = useState<ProxyRule>(
    initialRule || {
      id: '',
      name: '',
      enabled: true,
      sourceHost: '',
      sourcePath: '/',
      protocol: ProxyProtocol.HTTP,
      targetContainer: '',
      targetPort: 80,
      sslEnabled: false,
      sslCertPath: '',
      sslKeyPath: '',
      headers: {},
      responseHeaders: {},
      domain: '',
      healthCheck: {
        path: '/health',
        interval: 30000,
        timeout: 5000,
        retries: 3,
        successCodes: '200-299'
      },
      loadBalancing: {
        method: 'round-robin',
        sticky: false,
        cookieName: '',
        cookieExpiry: 3600,
        targets: []
      },
      advancedConfig: {
        clientMaxBodySize: '1m',
        proxyConnectTimeout: 60000,
        proxySendTimeout: 60000,
        proxyReadTimeout: 60000,
        cacheEnabled: false,
        cacheDuration: 300,
        corsEnabled: false,
        corsAllowOrigin: '*',
        corsAllowMethods: 'GET, POST, PUT, DELETE, OPTIONS',
        corsAllowHeaders: 'Content-Type, Authorization',
        corsAllowCredentials: false,
        rateLimit: {
          enabled: false,
          requestsPerSecond: 10,
          burstSize: 20,
          nodelay: false,
          perIp: true,
          responseCode: 429,
          logLevel: 'error',
          zone: ''
        },
        rewriteRules: [],
        securityHeaders: {
          xFrameOptions: 'SAMEORIGIN',
          xContentTypeOptions: 'nosniff',
          xXssProtection: '1; mode=block',
          strictTransportSecurity: 'max-age=31536000; includeSubDomains',
          contentSecurityPolicy: '',
          referrerPolicy: 'strict-origin-when-cross-origin',
          permissionsPolicy: '',
          customHeaders: {}
        },
        wafConfig: {
          enabled: false,
          mode: 'detection',
          rulesets: [],
          customRules: ''
        },
        ipAccessControl: {
          enabled: false,
          defaultAction: 'allow',
          rules: []
        }
      },
      customNginxConfig: '',
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    }
  );

  const [activeTab, setActiveTab] = useState('basic');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [targetContainers, setTargetContainers] = useState<Array<{id: string, name: string}>>([]);
  const [showAdvancedSSL, setShowAdvancedSSL] = useState(rule.sslEnabled);
  const [showStickySessions, setShowStickySessions] = useState(rule.loadBalancing.sticky);
  const [showCorsSettings, setShowCorsSettings] = useState(rule.advancedConfig.corsEnabled);
  const [showCacheSettings, setShowCacheSettings] = useState(rule.advancedConfig.cacheEnabled);
  const [showSecurityHeadersSettings, setShowSecurityHeadersSettings] = useState(true);
  const [showWafSettings, setShowWafSettings] = useState(rule.advancedConfig.wafConfig?.enabled || false);
  const [showIpAccessControlSettings, setShowIpAccessControlSettings] = useState(rule.advancedConfig.ipAccessControl?.enabled || false);

  // Load available containers for target selection
  useEffect(() => {
    if (containers) {
      const availableContainers = containers.map(container => ({
        id: container.id,
        name: container.name
      }));
      setTargetContainers(availableContainers);
    }
  }, [containers]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    // Basic validation
    if (!rule.name.trim()) newErrors.name = 'Name is required';
    if (!rule.sourceHost.trim()) newErrors.sourceHost = 'Source host is required';
    if (!rule.targetContainer && rule.loadBalancing.targets.length === 0) {
      newErrors.targetContainer = 'Target container or load balancing targets are required';
    }
    
    // Domain validation - domain is optional but if provided should be valid
    if (rule.domain && !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/.test(rule.domain)) {
      newErrors.domain = 'Please enter a valid domain name';
    }
    
    // Port validation
    if (isNaN(rule.targetPort) || rule.targetPort < 1 || rule.targetPort > 65535) {
      newErrors.targetPort = 'Port must be between 1 and 65535';
    }
    
    // SSL validation
    if (rule.sslEnabled) {
      if (!rule.sslCertPath.trim()) newErrors.sslCertPath = 'SSL certificate path is required';
      if (!rule.sslKeyPath.trim()) newErrors.sslKeyPath = 'SSL key path is required';
    }
    
    // Health check validation
    if (rule.healthCheck.interval < 1000) {
      newErrors['healthCheck.interval'] = 'Interval must be at least 1000ms';
    }
    if (rule.healthCheck.timeout < 100) {
      newErrors['healthCheck.timeout'] = 'Timeout must be at least 100ms';
    }
    if (rule.healthCheck.retries < 1) {
      newErrors['healthCheck.retries'] = 'At least 1 retry is required';
    }
    
    // Load balancing validation
    if (rule.loadBalancing.sticky && !rule.loadBalancing.cookieName.trim()) {
      newErrors['loadBalancing.cookieName'] = 'Cookie name is required for sticky sessions';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateForm()) {
      // Generate ID if this is a new rule
      const submittedRule = {
        ...rule,
        id: rule.id || `rule-${Date.now()}`,
        updated: new Date().toISOString()
      };
      
      onSubmit(submittedRule);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const isCheckbox = type === 'checkbox';
    const checked = (e.target as HTMLInputElement).checked;
    
    // Handle nested properties
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setRule(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent as keyof ProxyRule],
          [child]: isCheckbox ? checked : value
        }
      }));
    } else {
      setRule(prev => ({
        ...prev,
        [name]: isCheckbox ? checked : value
      }));
      
      // Special handling for toggles that show/hide sections
      if (name === 'sslEnabled') setShowAdvancedSSL(checked);
      if (name === 'loadBalancing.sticky') setShowStickySessions(checked);
      if (name === 'advancedConfig.corsEnabled') setShowCorsSettings(checked);
      if (name === 'advancedConfig.cacheEnabled') setShowCacheSettings(checked);
      if (name === 'advancedConfig.wafConfig.enabled') setShowWafSettings(checked);
      if (name === 'advancedConfig.ipAccessControl.enabled') setShowIpAccessControlSettings(checked);
    }
  };

  const handleNestedChange = (section: string, field: string, value: any) => {
    setRule(prev => ({
      ...prev,
      [section]: {
        ...prev[section as keyof ProxyRule],
        [field]: value
      }
    }));
  };

  const handleAddLoadBalancingTarget = () => {
    setRule(prev => ({
      ...prev,
      loadBalancing: {
        ...prev.loadBalancing,
        targets: [
          ...prev.loadBalancing.targets,
          { container: '', port: 80, weight: 1 }
        ]
      }
    }));
  };

  const handleUpdateLoadBalancingTarget = (index: number, field: string, value: any) => {
    setRule(prev => {
      const updatedTargets = [...prev.loadBalancing.targets];
      updatedTargets[index] = {
        ...updatedTargets[index],
        [field]: field === 'port' || field === 'weight' ? parseInt(value) : value
      };
      
      return {
        ...prev,
        loadBalancing: {
          ...prev.loadBalancing,
          targets: updatedTargets
        }
      };
    });
  };

  const handleRemoveLoadBalancingTarget = (index: number) => {
    setRule(prev => {
      const updatedTargets = [...prev.loadBalancing.targets];
      updatedTargets.splice(index, 1);
      
      return {
        ...prev,
        loadBalancing: {
          ...prev.loadBalancing,
          targets: updatedTargets
        }
      };
    });
  };

  const handleAddRewriteRule = () => {
    setRule(prev => ({
      ...prev,
      advancedConfig: {
        ...prev.advancedConfig,
        rewriteRules: [
          ...prev.advancedConfig.rewriteRules,
          { pattern: '', replacement: '', flag: 'last' }
        ]
      }
    }));
  };

  const handleUpdateRewriteRule = (index: number, field: string, value: string) => {
    setRule(prev => {
      const updatedRules = [...prev.advancedConfig.rewriteRules];
      updatedRules[index] = {
        ...updatedRules[index],
        [field]: value
      };
      
      return {
        ...prev,
        advancedConfig: {
          ...prev.advancedConfig,
          rewriteRules: updatedRules
        }
      };
    });
  };

  const handleRemoveRewriteRule = (index: number) => {
    setRule(prev => {
      const updatedRules = [...prev.advancedConfig.rewriteRules];
      updatedRules.splice(index, 1);
      
      return {
        ...prev,
        advancedConfig: {
          ...prev.advancedConfig,
          rewriteRules: updatedRules
        }
      };
    });
  };

  const handleAddHeader = (type: 'headers' | 'responseHeaders') => {
    setRule(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        '': ''
      }
    }));
  };

  const handleUpdateHeader = (
    type: 'headers' | 'responseHeaders',
    oldKey: string,
    newKey: string,
    value: string
  ) => {
    setRule(prev => {
      const headers = { ...prev[type] };
      
      // If the key changed, remove the old one
      if (oldKey !== newKey && oldKey in headers) {
        delete headers[oldKey];
      }
      
      // Set the new key-value pair
      headers[newKey] = value;
      
      return {
        ...prev,
        [type]: headers
      };
    });
  };

  const handleRemoveHeader = (type: 'headers' | 'responseHeaders', key: string) => {
    setRule(prev => {
      const headers = { ...prev[type] };
      delete headers[key];
      
      return {
        ...prev,
        [type]: headers
      };
    });
  };

  const renderBasicTab = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Rule Name
          </label>
          <input
            type="text"
            name="name"
            value={rule.name}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-md ${
              errors.name ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.name && (
            <p className="mt-1 text-sm text-red-500">{errors.name}</p>
          )}
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <div className="flex items-center mt-2">
            <input
              type="checkbox"
              name="enabled"
              checked={rule.enabled}
              onChange={handleChange}
              className="h-4 w-4 text-blue-600 rounded"
            />
            <span className="ml-2 text-sm text-gray-700">Enabled</span>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-lg font-medium mb-4">Routing Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Domain Name
            </label>
            <input
              type="text"
              name="domain"
              value={rule.domain || ''}
              onChange={handleChange}
              placeholder="app.example.com"
              className={`w-full px-3 py-2 border rounded-md ${
                errors.domain ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.domain && (
              <p className="mt-1 text-sm text-red-500">{errors.domain}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Optional. If provided, this domain will be routed to the target container.
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Source Host
            </label>
            <input
              type="text"
              name="sourceHost"
              value={rule.sourceHost}
              onChange={handleChange}
              placeholder="example.com"
              className={`w-full px-3 py-2 border rounded-md ${
                errors.sourceHost ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.sourceHost && (
              <p className="mt-1 text-sm text-red-500">{errors.sourceHost}</p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Source Path
            </label>
            <input
              type="text"
              name="sourcePath"
              value={rule.sourcePath}
              onChange={handleChange}
              placeholder="/"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Protocol
            </label>
            <select
              name="protocol"
              value={rule.protocol}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
            </select>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-lg font-medium mb-4">Target Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Target Container
            </label>
            <select
              name="targetContainer"
              value={rule.targetContainer}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded-md ${
                errors.targetContainer ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">Select a container</option>
              {targetContainers.map(container => (
                <option key={container.id} value={container.id}>
                  {container.name}
                </option>
              ))}
            </select>
            {errors.targetContainer && (
              <p className="mt-1 text-sm text-red-500">{errors.targetContainer}</p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Target Port
            </label>
            <input
              type="number"
              name="targetPort"
              value={rule.targetPort}
              onChange={handleChange}
              min="1"
              max="65535"
              className={`w-full px-3 py-2 border rounded-md ${
                errors.targetPort ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.targetPort && (
              <p className="mt-1 text-sm text-red-500">{errors.targetPort}</p>
            )}
          </div>
        </div>
        
        <div className="mt-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              name="sslEnabled"
              checked={rule.sslEnabled}
              onChange={handleChange}
              className="h-4 w-4 text-blue-600 rounded"
            />
            <span className="ml-2 text-sm text-gray-700">Enable SSL</span>
          </div>
          
          {showAdvancedSSL && (
            <div className="mt-4 pl-6 border-l-2 border-gray-200">
              <div className="flex items-center mb-4">
                <input
                  type="radio"
                  id="ssl-path-option"
                  name="sslOption"
                  checked={!rule.sslCertificate}
                  onChange={() => {
                    setRule(prev => ({
                      ...prev,
                      sslCertificate: undefined
                    }));
                  }}
                  className="h-4 w-4 text-blue-600"
                />
                <label htmlFor="ssl-path-option" className="ml-2 text-sm font-medium text-gray-700">
                  Use certificate paths
                </label>
              </div>
              
              {!rule.sslCertificate && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 pl-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      SSL Certificate Path
                    </label>
                    <input
                      type="text"
                      name="sslCertPath"
                      value={rule.sslCertPath}
                      onChange={handleChange}
                      placeholder="/path/to/cert.pem"
                      className={`w-full px-3 py-2 border rounded-md ${
                        errors.sslCertPath ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    {errors.sslCertPath && (
                      <p className="mt-1 text-sm text-red-500">{errors.sslCertPath}</p>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      SSL Key Path
                    </label>
                    <input
                      type="text"
                      name="sslKeyPath"
                      value={rule.sslKeyPath}
                      onChange={handleChange}
                      placeholder="/path/to/key.pem"
                      className={`w-full px-3 py-2 border rounded-md ${
                        errors.sslKeyPath ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    {errors.sslKeyPath && (
                      <p className="mt-1 text-sm text-red-500">{errors.sslKeyPath}</p>
                    )}
                  </div>
                </div>
              )}
              
              <div className="flex items-center mb-4">
                <input
                  type="radio"
                  id="ssl-upload-option"
                  name="sslOption"
                  checked={!!rule.sslCertificate}
                  onChange={() => {
                    setRule(prev => ({
                      ...prev,
                      sslCertificate: {
                        id: '',
                        name: '',
                        domain: prev.domain || '',
                        certificate: '',
                        privateKey: '',
                        expiryDate: '',
                        created: Date.now()
                      },
                      sslCertPath: '',
                      sslKeyPath: ''
                    }));
                  }}
                  className="h-4 w-4 text-blue-600"
                />
                <label htmlFor="ssl-upload-option" className="ml-2 text-sm font-medium text-gray-700">
                  Upload certificate
                </label>
              </div>
              
              {rule.sslCertificate && (
                <div className="pl-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Certificate Name
                      </label>
                      <input
                        type="text"
                        name="sslCertificate.name"
                        value={rule.sslCertificate.name}
                        onChange={handleChange}
                        placeholder="My Certificate"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Domain
                      </label>
                      <input
                        type="text"
                        name="sslCertificate.domain"
                        value={rule.sslCertificate.domain}
                        onChange={handleChange}
                        placeholder="example.com"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Domain name for the certificate
                      </p>
                    </div>
                  </div>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Certificate (PEM format)
                    </label>
                    <textarea
                      name="sslCertificate.certificate"
                      value={rule.sslCertificate.certificate}
                      onChange={handleChange}
                      rows={5}
                      placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
                    />
                  </div>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Private Key (PEM format)
                    </label>
                    <textarea
                      name="sslCertificate.privateKey"
                      value={rule.sslCertificate.privateKey}
                      onChange={handleChange}
                      rows={5}
                      placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
                    />
                  </div>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Chain Certificate (optional)
                    </label>
                    <textarea
                      name="sslCertificate.chainCertificate"
                      value={rule.sslCertificate.chainCertificate || ''}
                      onChange={handleChange}
                      rows={5}
                      placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Intermediate certificate chain if needed
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Expiry Date
                    </label>
                    <input
                      type="date"
                      name="sslCertificate.expiryDate"
                      value={rule.sslCertificate.expiryDate}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderHeadersTab = () => (
    <div className="space-y-6">
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">Request Headers</h3>
          <button
            type="button"
            onClick={() => handleAddHeader('headers')}
            className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm"
          >
            Add Header
          </button>
        </div>
        
        {Object.entries(rule.headers || {}).map(([key, value], index) => (
          <div key={`req-${index}`} className="flex items-center gap-2 mb-2">
            <input
              type="text"
              value={key}
              onChange={(e) => handleUpdateHeader('headers', key, e.target.value, value)}
              placeholder="Header name"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
            />
            <input
              type="text"
              value={value}
              onChange={(e) => handleUpdateHeader('headers', key, key, e.target.value)}
              placeholder="Header value"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
            />
            <button
              type="button"
              onClick={() => handleRemoveHeader('headers', key)}
              className="p-2 text-red-600 hover:text-red-800"
            >
              <span className="sr-only">Remove</span>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        
        {(!rule.headers || Object.keys(rule.headers).length === 0) && (
          <p className="text-sm text-gray-500 italic">No request headers configured</p>
        )}
      </div>
      
      <div className="border-t border-gray-200 pt-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">Response Headers</h3>
          <button
            type="button"
            onClick={() => handleAddHeader('responseHeaders')}
            className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm"
          >
            Add Header
          </button>
        </div>
        
        {Object.entries(rule.responseHeaders).map(([key, value], index) => (
          <div key={`res-${index}`} className="flex items-center gap-2 mb-2">
            <input
              type="text"
              value={key}
              onChange={(e) => handleUpdateHeader('responseHeaders', key, e.target.value, value)}
              placeholder="Header name"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
            />
            <input
              type="text"
              value={value}
              onChange={(e) => handleUpdateHeader('responseHeaders', key, key, e.target.value)}
              placeholder="Header value"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
            />
            <button
              type="button"
              onClick={() => handleRemoveHeader('responseHeaders', key)}
              className="p-2 text-red-600 hover:text-red-800"
            >
              <span className="sr-only">Remove</span>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        
        {Object.keys(rule.responseHeaders).length === 0 && (
          <p className="text-sm text-gray-500 italic">No response headers configured</p>
        )}
      </div>
    </div>
  );

  const renderHealthCheckTab = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-medium mb-4">Health Check Configuration</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Health Check Path
          </label>
          <input
            type="text"
            name="healthCheck.path"
            value={rule.healthCheck.path}
            onChange={handleChange}
            placeholder="/health"
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Interval (ms)
          </label>
          <input
            type="number"
            name="healthCheck.interval"
            value={rule.healthCheck.interval}
            onChange={handleChange}
            min="1000"
            className={`w-full px-3 py-2 border rounded-md ${
              errors['healthCheck.interval'] ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors['healthCheck.interval'] && (
            <p className="mt-1 text-sm text-red-500">{errors['healthCheck.interval']}</p>
          )}
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Timeout (ms)
          </label>
          <input
            type="number"
            name="healthCheck.timeout"
            value={rule.healthCheck.timeout}
            onChange={handleChange}
            min="100"
            className={`w-full px-3 py-2 border rounded-md ${
              errors['healthCheck.timeout'] ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors['healthCheck.timeout'] && (
            <p className="mt-1 text-sm text-red-500">{errors['healthCheck.timeout']}</p>
          )}
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Retries
          </label>
          <input
            type="number"
            name="healthCheck.retries"
            value={rule.healthCheck.retries}
            onChange={handleChange}
            min="1"
            className={`w-full px-3 py-2 border rounded-md ${
              errors['healthCheck.retries'] ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors['healthCheck.retries'] && (
            <p className="mt-1 text-sm text-red-500">{errors['healthCheck.retries']}</p>
          )}
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Success Codes
          </label>
          <input
            type="text"
            name="healthCheck.successCodes"
            value={rule.healthCheck.successCodes}
            onChange={handleChange}
            placeholder="200-299"
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
          <p className="mt-1 text-xs text-gray-500">
            Format: single code (200), range (200-299), or comma-separated (200,201,204)
          </p>
        </div>
      </div>
    </div>
  );

  const renderLoadBalancingTab = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-medium mb-4">Load Balancing Configuration</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Load Balancing Method
          </label>
          <select
            name="loadBalancing.method"
            value={rule.loadBalancing.method}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="round-robin">Round Robin</option>
            <option value="least-connections">Least Connections</option>
            <option value="ip-hash">IP Hash</option>
            <option value="weighted">Weighted</option>
          </select>
        </div>
        
        <div>
          <div className="flex items-center mt-7">
            <input
              type="checkbox"
              name="loadBalancing.sticky"
              checked={rule.loadBalancing.sticky}
              onChange={handleChange}
              className="h-4 w-4 text-blue-600 rounded"
            />
            <span className="ml-2 text-sm text-gray-700">Enable Sticky Sessions</span>
          </div>
        </div>
      </div>
      
      {showStickySessions && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6 border-l-2 border-gray-200">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cookie Name
            </label>
            <input
              type="text"
              name="loadBalancing.cookieName"
              value={rule.loadBalancing.cookieName}
              onChange={handleChange}
              placeholder="SERVERID"
              className={`w-full px-3 py-2 border rounded-md ${
                errors['loadBalancing.cookieName'] ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors['loadBalancing.cookieName'] && (
              <p className="mt-1 text-sm text-red-500">{errors['loadBalancing.cookieName']}</p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cookie Expiry (seconds)
            </label>
            <input
              type="number"
              name="loadBalancing.cookieExpiry"
              value={rule.loadBalancing.cookieExpiry}
              onChange={handleChange}
              min="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
            <p className="mt-1 text-xs text-gray-500">
              Set to 0 for session cookies
            </p>
          </div>
        </div>
      )}
      
      <div className="mt-6">
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-md font-medium">Load Balancing Targets</h4>
          <button
            type="button"
            onClick={handleAddLoadBalancingTarget}
            className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm"
          >
            Add Target
          </button>
        </div>
        
        {rule.loadBalancing.targets.map((target, index) => (
          <div key={index} className="flex items-center gap-2 mb-2 border p-3 rounded-md bg-gray-50">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Container
              </label>
              <select
                value={target.container}
                onChange={(e) => handleUpdateLoadBalancingTarget(index, 'container', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select a container</option>
                {targetContainers.map(container => (
                  <option key={container.id} value={container.id}>
                    {container.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Port
              </label>
              <input
                type="number"
                value={target.port}
                onChange={(e) => handleUpdateLoadBalancingTarget(index, 'port', e.target.value)}
                min="1"
                max="65535"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Weight
              </label>
              <input
                type="number"
                value={target.weight}
                onChange={(e) => handleUpdateLoadBalancingTarget(index, 'weight', e.target.value)}
                min="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => handleRemoveLoadBalancingTarget(index)}
                className="p-2 text-red-600 hover:text-red-800 mb-1"
              >
                <span className="sr-only">Remove</span>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        ))}
        
        {rule.loadBalancing.targets.length === 0 && (
          <p className="text-sm text-gray-500 italic">No load balancing targets configured</p>
        )}
      </div>
    </div>
  );

  const renderAdvancedTab = () => (
    <div className="space-y-6">
      <div>
        <div className="flex items-center mb-4">
          <input
            type="checkbox"
            name="advancedConfig.rateLimit.enabled"
            checked={rule.advancedConfig.rateLimit.enabled}
            onChange={handleChange}
            className="h-4 w-4 text-blue-600 rounded"
          />
          <span className="ml-2 text-sm font-medium">Enable Rate Limiting</span>
        </div>
        
        {rule.advancedConfig.rateLimit.enabled && (
          <div className="pl-6 border-l-2 border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Requests Per Second
                </label>
                <input
                  type="number"
                  name="advancedConfig.rateLimit.requestsPerSecond"
                  value={rule.advancedConfig.rateLimit.requestsPerSecond}
                  onChange={handleChange}
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Burst Size
                </label>
                <input
                  type="number"
                  name="advancedConfig.rateLimit.burstSize"
                  value={rule.advancedConfig.rateLimit.burstSize}
                  onChange={handleChange}
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <div className="flex items-center mt-7">
                  <input
                    type="checkbox"
                    name="advancedConfig.rateLimit.nodelay"
                    checked={rule.advancedConfig.rateLimit.nodelay}
                    onChange={handleChange}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">No Delay</span>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="flex items-center mt-2">
                  <input
                    type="checkbox"
                    name="advancedConfig.rateLimit.perIp"
                    checked={rule.advancedConfig.rateLimit.perIp}
                    onChange={handleChange}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">Limit Per IP</span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Response Code
                </label>
                <input
                  type="number"
                  name="advancedConfig.rateLimit.responseCode"
                  value={rule.advancedConfig.rateLimit.responseCode || 429}
                  onChange={handleChange}
                  min="400"
                  max="599"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
                <p className="mt-1 text-xs text-gray-500">
                  HTTP status code for rate limit errors (default: 429)
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Log Level
                </label>
                <select
                  name="advancedConfig.rateLimit.logLevel"
                  value={rule.advancedConfig.rateLimit.logLevel || 'error'}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="info">Info</option>
                  <option value="notice">Notice</option>
                  <option value="warn">Warning</option>
                  <option value="error">Error</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <div className="border-t border-gray-200 pt-4">
        <div className="flex items-center mb-4">
          <input
            type="checkbox"
            name="advancedConfig.cacheEnabled"
            checked={rule.advancedConfig.cacheEnabled}
            onChange={handleChange}
            className="h-4 w-4 text-blue-600 rounded"
          />
          <span className="ml-2 text-sm font-medium">Enable Caching</span>
        </div>
        
        {showCacheSettings && (
          <div className="pl-6 border-l-2 border-gray-200">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cache Duration (seconds)
              </label>
              <input
                type="number"
                name="advancedConfig.cacheDuration"
                value={rule.advancedConfig.cacheDuration}
                onChange={handleChange}
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
        )}
      </div>
      
      <div className="border-t border-gray-200 pt-4">
        <div className="flex items-center mb-4">
          <input
            type="checkbox"
            name="advancedConfig.corsEnabled"
            checked={rule.advancedConfig.corsEnabled}
            onChange={handleChange}
            className="h-4 w-4 text-blue-600 rounded"
          />
          <span className="ml-2 text-sm font-medium">Enable CORS</span>
        </div>
        
        {showCorsSettings && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6 border-l-2 border-gray-200">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Allow Origin
              </label>
              <input
                type="text"
                name="advancedConfig.corsAllowOrigin"
                value={rule.advancedConfig.corsAllowOrigin}
                onChange={handleChange}
                placeholder="*"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Allow Methods
              </label>
              <input
                type="text"
                name="advancedConfig.corsAllowMethods"
                value={rule.advancedConfig.corsAllowMethods}
                onChange={handleChange}
                placeholder="GET, POST, PUT, DELETE, OPTIONS"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Allow Headers
              </label>
              <input
                type="text"
                name="advancedConfig.corsAllowHeaders"
                value={rule.advancedConfig.corsAllowHeaders}
                onChange={handleChange}
                placeholder="Content-Type, Authorization"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            
            <div>
              <div className="flex items-center mt-7">
                <input
                  type="checkbox"
                  name="advancedConfig.corsAllowCredentials"
                  checked={rule.advancedConfig.corsAllowCredentials}
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Allow Credentials</span>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-lg font-medium mb-4">Security Headers</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              X-Frame-Options
            </label>
            <select
              name="advancedConfig.securityHeaders.xFrameOptions"
              value={rule.advancedConfig.securityHeaders?.xFrameOptions || 'SAMEORIGIN'}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="DENY">DENY</option>
              <option value="SAMEORIGIN">SAMEORIGIN</option>
              <option value="ALLOW-FROM">ALLOW-FROM</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Controls whether the page can be displayed in frames
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              X-Content-Type-Options
            </label>
            <select
              name="advancedConfig.securityHeaders.xContentTypeOptions"
              value={rule.advancedConfig.securityHeaders?.xContentTypeOptions || 'nosniff'}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="nosniff">nosniff</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Prevents MIME type sniffing
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              X-XSS-Protection
            </label>
            <select
              name="advancedConfig.securityHeaders.xXssProtection"
              value={rule.advancedConfig.securityHeaders?.xXssProtection || '1; mode=block'}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="0">0 (Disabled)</option>
              <option value="1">1 (Enabled)</option>
              <option value="1; mode=block">1; mode=block</option>
              <option value="1; report=">1; report=</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Enables XSS filtering in browsers
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Strict-Transport-Security
            </label>
            <input
              type="text"
              name="advancedConfig.securityHeaders.strictTransportSecurity"
              value={rule.advancedConfig.securityHeaders?.strictTransportSecurity || 'max-age=31536000; includeSubDomains'}
              onChange={handleChange}
              placeholder="max-age=31536000; includeSubDomains"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
            <p className="mt-1 text-xs text-gray-500">
              Forces HTTPS connections
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Content-Security-Policy
            </label>
            <input
              type="text"
              name="advancedConfig.securityHeaders.contentSecurityPolicy"
              value={rule.advancedConfig.securityHeaders?.contentSecurityPolicy || ''}
              onChange={handleChange}
              placeholder="default-src 'self'"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
            <p className="mt-1 text-xs text-gray-500">
              Controls resources the browser is allowed to load
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Referrer-Policy
            </label>
            <select
              name="advancedConfig.securityHeaders.referrerPolicy"
              value={rule.advancedConfig.securityHeaders?.referrerPolicy || 'strict-origin-when-cross-origin'}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="no-referrer">no-referrer</option>
              <option value="no-referrer-when-downgrade">no-referrer-when-downgrade</option>
              <option value="origin">origin</option>
              <option value="origin-when-cross-origin">origin-when-cross-origin</option>
              <option value="same-origin">same-origin</option>
              <option value="strict-origin">strict-origin</option>
              <option value="strict-origin-when-cross-origin">strict-origin-when-cross-origin</option>
              <option value="unsafe-url">unsafe-url</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Controls referrer information sent with requests
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Permissions-Policy
            </label>
            <input
              type="text"
              name="advancedConfig.securityHeaders.permissionsPolicy"
              value={rule.advancedConfig.securityHeaders?.permissionsPolicy || ''}
              onChange={handleChange}
              placeholder="camera=(), microphone=(), geolocation=()"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
            <p className="mt-1 text-xs text-gray-500">
              Controls browser features available to the site
            </p>
          </div>
        </div>
      </div>
      
      <div className="border-t border-gray-200 pt-4">
        <div className="flex items-center mb-4">
          <input
            type="checkbox"
            name="advancedConfig.wafConfig.enabled"
            checked={rule.advancedConfig.wafConfig?.enabled || false}
            onChange={handleChange}
            className="h-4 w-4 text-blue-600 rounded"
          />
          <span className="ml-2 text-sm font-medium">Enable Web Application Firewall (WAF)</span>
        </div>
        
        {showWafSettings && (
          <div className="pl-6 border-l-2 border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  WAF Mode
                </label>
                <select
                  name="advancedConfig.wafConfig.mode"
                  value={rule.advancedConfig.wafConfig?.mode || 'detection'}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="detection">Detection Only</option>
                  <option value="blocking">Blocking</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Detection mode logs violations, blocking mode rejects requests
                </p>
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enabled Rulesets
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="advancedConfig.wafConfig.rulesets.core"
                    checked={rule.advancedConfig.wafConfig?.rulesets?.includes('core') || false}
                    onChange={(e) => {
                      const rulesets = [...(rule.advancedConfig.wafConfig?.rulesets || [])];
                      if (e.target.checked) {
                        if (!rulesets.includes('core')) rulesets.push('core');
                      } else {
                        const index = rulesets.indexOf('core');
                        if (index !== -1) rulesets.splice(index, 1);
                      }
                      handleNestedChange('advancedConfig', 'wafConfig', {
                        ...rule.advancedConfig.wafConfig,
                        rulesets
                      });
                    }}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">Core Rules</span>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="advancedConfig.wafConfig.rulesets.sql"
                    checked={rule.advancedConfig.wafConfig?.rulesets?.includes('sql') || false}
                    onChange={(e) => {
                      const rulesets = [...(rule.advancedConfig.wafConfig?.rulesets || [])];
                      if (e.target.checked) {
                        if (!rulesets.includes('sql')) rulesets.push('sql');
                      } else {
                        const index = rulesets.indexOf('sql');
                        if (index !== -1) rulesets.splice(index, 1);
                      }
                      handleNestedChange('advancedConfig', 'wafConfig', {
                        ...rule.advancedConfig.wafConfig,
                        rulesets
                      });
                    }}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">SQL Injection</span>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="advancedConfig.wafConfig.rulesets.xss"
                    checked={rule.advancedConfig.wafConfig?.rulesets?.includes('xss') || false}
                    onChange={(e) => {
                      const rulesets = [...(rule.advancedConfig.wafConfig?.rulesets || [])];
                      if (e.target.checked) {
                        if (!rulesets.includes('xss')) rulesets.push('xss');
                      } else {
                        const index = rulesets.indexOf('xss');
                        if (index !== -1) rulesets.splice(index, 1);
                      }
                      handleNestedChange('advancedConfig', 'wafConfig', {
                        ...rule.advancedConfig.wafConfig,
                        rulesets
                      });
                    }}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">XSS Protection</span>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="advancedConfig.wafConfig.rulesets.lfi"
                    checked={rule.advancedConfig.wafConfig?.rulesets?.includes('lfi') || false}
                    onChange={(e) => {
                      const rulesets = [...(rule.advancedConfig.wafConfig?.rulesets || [])];
                      if (e.target.checked) {
                        if (!rulesets.includes('lfi')) rulesets.push('lfi');
                      } else {
                        const index = rulesets.indexOf('lfi');
                        if (index !== -1) rulesets.splice(index, 1);
                      }
                      handleNestedChange('advancedConfig', 'wafConfig', {
                        ...rule.advancedConfig.wafConfig,
                        rulesets
                      });
                    }}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">LFI Protection</span>
                </div>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Custom WAF Rules
              </label>
              <textarea
                name="advancedConfig.wafConfig.customRules"
                value={rule.advancedConfig.wafConfig?.customRules || ''}
                onChange={handleChange}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
                placeholder="# Custom ModSecurity rules"
              />
              <p className="mt-1 text-xs text-gray-500">
                Add custom ModSecurity rules in the format: SecRule VARIABLES "OPERATOR" "ACTIONS"
              </p>
            </div>
          </div>
        )}
      </div>
      
      <div className="border-t border-gray-200 pt-4">
        <div className="flex items-center mb-4">
          <input
            type="checkbox"
            name="advancedConfig.ipAccessControl.enabled"
            checked={rule.advancedConfig.ipAccessControl?.enabled || false}
            onChange={handleChange}
            className="h-4 w-4 text-blue-600 rounded"
          />
          <span className="ml-2 text-sm font-medium">Enable IP Access Control</span>
        </div>
        
        {showIpAccessControlSettings && (
          <div className="pl-6 border-l-2 border-gray-200">
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Action
              </label>
              <select
                name="advancedConfig.ipAccessControl.defaultAction"
                value={rule.advancedConfig.ipAccessControl?.defaultAction || 'allow'}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="allow">Allow All (Deny Listed)</option>
                <option value="deny">Deny All (Allow Listed)</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Default action for IPs not in the rules list
              </p>
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-md font-medium">IP Rules</h4>
                <button
                  type="button"
                  onClick={() => {
                    const ipRules = [...(rule.advancedConfig.ipAccessControl?.rules || [])];
                    ipRules.push({
                      ip: '',
                      action: rule.advancedConfig.ipAccessControl?.defaultAction === 'allow' ? 'deny' : 'allow',
                      comment: ''
                    });
                    handleNestedChange('advancedConfig', 'ipAccessControl', {
                      ...rule.advancedConfig.ipAccessControl,
                      rules: ipRules
                    });
                  }}
                  className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm"
                >
                  Add IP Rule
                </button>
              </div>
              
              {(rule.advancedConfig.ipAccessControl?.rules || []).map((ipRule, index) => (
                <div key={index} className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={ipRule.ip}
                    onChange={(e) => {
                      const ipRules = [...(rule.advancedConfig.ipAccessControl?.rules || [])];
                      ipRules[index] = { ...ipRules[index], ip: e.target.value };
                      handleNestedChange('advancedConfig', 'ipAccessControl', {
                        ...rule.advancedConfig.ipAccessControl,
                        rules: ipRules
                      });
                    }}
                    placeholder="IP or CIDR (e.g., 192.168.1.1 or 10.0.0.0/24)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                  />
                  
                  <select
                    value={ipRule.action}
                    onChange={(e) => {
                      const ipRules = [...(rule.advancedConfig.ipAccessControl?.rules || [])];
                      ipRules[index] = { ...ipRules[index], action: e.target.value };
                      handleNestedChange('advancedConfig', 'ipAccessControl', {
                        ...rule.advancedConfig.ipAccessControl,
                        rules: ipRules
                      });
                    }}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="allow">Allow</option>
                    <option value="deny">Deny</option>
                  </select>
                  
                  <input
                    type="text"
                    value={ipRule.comment || ''}
                    onChange={(e) => {
                      const ipRules = [...(rule.advancedConfig.ipAccessControl?.rules || [])];
                      ipRules[index] = { ...ipRules[index], comment: e.target.value };
                      handleNestedChange('advancedConfig', 'ipAccessControl', {
                        ...rule.advancedConfig.ipAccessControl,
                        rules: ipRules
                      });
                    }}
                    placeholder="Comment"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                  />
                  
                  <button
                    type="button"
                    onClick={() => {
                      const ipRules = [...(rule.advancedConfig.ipAccessControl?.rules || [])];
                      ipRules.splice(index, 1);
                      handleNestedChange('advancedConfig', 'ipAccessControl', {
                        ...rule.advancedConfig.ipAccessControl,
                        rules: ipRules
                      });
                    }}
                    className="p-2 text-red-600 hover:text-red-800"
                  >
                    <span className="sr-only">Remove</span>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              
              {(!rule.advancedConfig.ipAccessControl?.rules || rule.advancedConfig.ipAccessControl.rules.length === 0) && (
                <p className="text-sm text-gray-500 italic">No IP rules configured</p>
              )}
            </div>
          </div>
        )}
      </div>
      
      <div className="border-t border-gray-200 pt-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">URL Rewrite Rules</h3>
          <button
            type="button"
            onClick={handleAddRewriteRule}
            className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm"
          >
            Add Rule
          </button>
        </div>
        
        {rule.advancedConfig.rewriteRules.map((rewrite, index) => (
          <div key={index} className="flex items-center gap-2 mb-2">
            <input
              type="text"
              value={rewrite.pattern}
              onChange={(e) => handleUpdateRewriteRule(index, 'pattern', e.target.value)}
              placeholder="Pattern"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
            />
            <input
              type="text"
              value={rewrite.replacement}
              onChange={(e) => handleUpdateRewriteRule(index, 'replacement', e.target.value)}
              placeholder="Replacement"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
            />
            <select
              value={rewrite.flag}
              onChange={(e) => handleUpdateRewriteRule(index, 'flag', e.target.value)}
              className="w-24 px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="last">last</option>
              <option value="break">break</option>
              <option value="redirect">redirect</option>
              <option value="permanent">permanent</option>
            </select>
            <button
              type="button"
              onClick={() => handleRemoveRewriteRule(index)}
              className="p-2 text-red-600 hover:text-red-800"
            >
              <span className="sr-only">Remove</span>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        
        {rule.advancedConfig.rewriteRules.length === 0 && (
          <p className="text-sm text-gray-500 italic">No URL rewrite rules configured</p>
        )}
      </div>
      
      <div className="border-t border-gray-200 pt-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Client Max Body Size
          </label>
          <input
            type="text"
            name="advancedConfig.clientMaxBodySize"
            value={rule.advancedConfig.clientMaxBodySize}
            onChange={handleChange}
            placeholder="1m"
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
          <p className="mt-1 text-xs text-gray-500">
            Format: 1k, 1m, 1g, etc.
          </p>
        </div>
      </div>
      
      <div className="border-t border-gray-200 pt-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Connect Timeout (ms)
            </label>
            <input
              type="number"
              name="advancedConfig.proxyConnectTimeout"
              value={rule.advancedConfig.proxyConnectTimeout}
              onChange={handleChange}
              min="100"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Send Timeout (ms)
            </label>
            <input
              type="number"
              name="advancedConfig.proxySendTimeout"
              value={rule.advancedConfig.proxySendTimeout}
              onChange={handleChange}
              min="100"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Read Timeout (ms)
            </label>
            <input
              type="number"
              name="advancedConfig.proxyReadTimeout"
              value={rule.advancedConfig.proxyReadTimeout}
              onChange={handleChange}
              min="100"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderCustomConfigTab = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-medium mb-4">Custom Nginx Configuration</h3>
      <p className="text-sm text-gray-500 mb-4">
        Add custom Nginx configuration directives that will be included in the server block.
      </p>
      <textarea
        name="customNginxConfig"
        value={rule.customNginxConfig}
        onChange={handleChange}
        rows={10}
        className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
        placeholder="# Custom Nginx configuration"
      />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="bg-white shadow-md rounded-lg p-6">
      <div className="mb-6 border-b border-gray-200">
        <nav className="flex -mb-px">
          <button
            type="button"
            onClick={() => setActiveTab('basic')}
            className={`mr-8 py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'basic'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Basic Settings
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('headers')}
            className={`mr-8 py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'headers'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Headers
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('health')}
            className={`mr-8 py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'health'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Health Check
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('loadBalancing')}
            className={`mr-8 py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'loadBalancing'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Load Balancing
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('advanced')}
            className={`mr-8 py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'advanced'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Advanced
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`mr-8 py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'custom'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Custom Config
          </button>
        </nav>
      </div>

      <div className="mb-8">
        {activeTab === 'basic' && renderBasicTab()}
        {activeTab === 'headers' && renderHeadersTab()}
        {activeTab === 'health' && renderHealthCheckTab()}
        {activeTab === 'loadBalancing' && renderLoadBalancingTab()}
        {activeTab === 'advanced' && renderAdvancedTab()}
        {activeTab === 'custom' && renderCustomConfigTab()}
      </div>

      <div className="flex justify-end space-x-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700"
        >
          {initialRule ? 'Update Rule' : 'Create Rule'}
        </button>
      </div>
    </form>
  );
};