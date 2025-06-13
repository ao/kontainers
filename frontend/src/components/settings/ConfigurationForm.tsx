import React, { useState } from 'react';

interface ConfigurationFormProps {
  onSave: (config: SystemConfiguration) => Promise<void>;
  onCancel: () => void;
  initialConfig?: SystemConfiguration;
}

interface SystemConfiguration {
  general: {
    systemName: string;
    adminEmail: string;
    logLevel: string;
    dataRetentionDays: number;
    enableTelemetry: boolean;
  };
  proxy: {
    defaultTimeout: number;
    maxConnections: number;
    enableCompression: boolean;
    tlsVersion: string;
    cipherSuites: string[];
    headerTransformation: boolean;
  };
  security: {
    enableFirewall: boolean;
    allowedIPs: string[];
    blockedIPs: string[];
    rateLimiting: {
      enabled: boolean;
      requestsPerMinute: number;
      burstSize: number;
    };
    authMethods: string[];
  };
  notifications: {
    email: {
      enabled: boolean;
      smtpServer: string;
      smtpPort: number;
      smtpUsername: string;
      smtpPassword: string;
      useTLS: boolean;
    };
    slack: {
      enabled: boolean;
      webhookUrl: string;
      channel: string;
    };
    alertThresholds: {
      cpuUsage: number;
      memoryUsage: number;
      diskUsage: number;
      errorRate: number;
    };
  };
  advanced: {
    customEnvironmentVariables: Record<string, string>;
    startupCommands: string[];
    shutdownCommands: string[];
    enableDebugMode: boolean;
  };
}

// Default configuration
const defaultConfig: SystemConfiguration = {
  general: {
    systemName: 'Kontainers',
    adminEmail: '',
    logLevel: 'info',
    dataRetentionDays: 30,
    enableTelemetry: true,
  },
  proxy: {
    defaultTimeout: 30000,
    maxConnections: 1000,
    enableCompression: true,
    tlsVersion: 'TLS 1.3',
    cipherSuites: ['TLS_AES_128_GCM_SHA256', 'TLS_AES_256_GCM_SHA384'],
    headerTransformation: false,
  },
  security: {
    enableFirewall: true,
    allowedIPs: [],
    blockedIPs: [],
    rateLimiting: {
      enabled: true,
      requestsPerMinute: 60,
      burstSize: 10,
    },
    authMethods: ['basic', 'jwt'],
  },
  notifications: {
    email: {
      enabled: false,
      smtpServer: '',
      smtpPort: 587,
      smtpUsername: '',
      smtpPassword: '',
      useTLS: true,
    },
    slack: {
      enabled: false,
      webhookUrl: '',
      channel: '',
    },
    alertThresholds: {
      cpuUsage: 80,
      memoryUsage: 80,
      diskUsage: 85,
      errorRate: 5,
    },
  },
  advanced: {
    customEnvironmentVariables: {},
    startupCommands: [],
    shutdownCommands: [],
    enableDebugMode: false,
  },
};

export const ConfigurationForm: React.FC<ConfigurationFormProps> = ({
  onSave,
  onCancel,
  initialConfig,
}) => {
  const [config, setConfig] = useState<SystemConfiguration>(initialConfig || defaultConfig);
  const [activeTab, setActiveTab] = useState<string>('general');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [newIP, setNewIP] = useState<string>('');
  const [newEnvVarKey, setNewEnvVarKey] = useState<string>('');
  const [newEnvVarValue, setNewEnvVarValue] = useState<string>('');

  // Tab options
  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'proxy', label: 'Proxy Settings' },
    { id: 'security', label: 'Security' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'advanced', label: 'Advanced' },
  ];

  // Log level options
  const logLevelOptions = [
    { value: 'debug', label: 'Debug' },
    { value: 'info', label: 'Info' },
    { value: 'warn', label: 'Warning' },
    { value: 'error', label: 'Error' },
  ];

  // Handle form field changes
  const handleChange = (section: keyof SystemConfiguration, field: string, value: any) => {
    setConfig({
      ...config,
      [section]: {
        ...config[section],
        [field]: value,
      },
    });
  };

  // Handle nested field changes
  const handleNestedChange = (section: keyof SystemConfiguration, nestedSection: string, field: string, value: any) => {
    setConfig({
      ...config,
      [section]: {
        ...config[section],
        [nestedSection]: {
          ...config[section][nestedSection],
          [field]: value,
        },
      },
    });
  };

  // Add allowed IP
  const addAllowedIP = () => {
    if (newIP.trim() === '') return;
    
    setConfig({
      ...config,
      security: {
        ...config.security,
        allowedIPs: [...config.security.allowedIPs, newIP],
      },
    });
    
    setNewIP('');
  };

  // Remove allowed IP
  const removeAllowedIP = (ip: string) => {
    setConfig({
      ...config,
      security: {
        ...config.security,
        allowedIPs: config.security.allowedIPs.filter(item => item !== ip),
      },
    });
  };

  // Add environment variable
  const addEnvironmentVariable = () => {
    if (newEnvVarKey.trim() === '') return;
    
    setConfig({
      ...config,
      advanced: {
        ...config.advanced,
        customEnvironmentVariables: {
          ...config.advanced.customEnvironmentVariables,
          [newEnvVarKey]: newEnvVarValue,
        },
      },
    });
    
    setNewEnvVarKey('');
    setNewEnvVarValue('');
  };

  // Remove environment variable
  const removeEnvironmentVariable = (key: string) => {
    const newVars = { ...config.advanced.customEnvironmentVariables };
    delete newVars[key];
    
    setConfig({
      ...config,
      advanced: {
        ...config.advanced,
        customEnvironmentVariables: newVars,
      },
    });
  };

  // Validate form
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    // General section validation
    if (!config.general.systemName.trim()) {
      errors['general.systemName'] = 'System name is required';
    }
    
    if (config.general.adminEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.general.adminEmail)) {
      errors['general.adminEmail'] = 'Invalid email format';
    }
    
    if (config.general.dataRetentionDays < 1) {
      errors['general.dataRetentionDays'] = 'Data retention must be at least 1 day';
    }
    
    // Proxy section validation
    if (config.proxy.defaultTimeout < 1000) {
      errors['proxy.defaultTimeout'] = 'Timeout must be at least 1000ms';
    }
    
    if (config.proxy.maxConnections < 1) {
      errors['proxy.maxConnections'] = 'Max connections must be at least 1';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await onSave(config);
    } catch (error) {
      console.error('Error saving configuration:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg">
      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                w-1/5 py-4 px-1 text-center border-b-2 font-medium text-sm
                ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-6">
        {/* General Settings */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-gray-900">General Settings</h3>
            
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <label htmlFor="systemName" className="block text-sm font-medium text-gray-700">
                  System Name
                </label>
                <div className="mt-1">
                  <input
                    type="text"
                    id="systemName"
                    value={config.general.systemName}
                    onChange={(e) => handleChange('general', 'systemName', e.target.value)}
                    className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  />
                </div>
                {validationErrors['general.systemName'] && (
                  <p className="mt-2 text-sm text-red-600">{validationErrors['general.systemName']}</p>
                )}
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="adminEmail" className="block text-sm font-medium text-gray-700">
                  Admin Email
                </label>
                <div className="mt-1">
                  <input
                    type="email"
                    id="adminEmail"
                    value={config.general.adminEmail}
                    onChange={(e) => handleChange('general', 'adminEmail', e.target.value)}
                    className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  />
                </div>
                {validationErrors['general.adminEmail'] && (
                  <p className="mt-2 text-sm text-red-600">{validationErrors['general.adminEmail']}</p>
                )}
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="logLevel" className="block text-sm font-medium text-gray-700">
                  Log Level
                </label>
                <div className="mt-1">
                  <select
                    id="logLevel"
                    value={config.general.logLevel}
                    onChange={(e) => handleChange('general', 'logLevel', e.target.value)}
                    className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  >
                    {logLevelOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="dataRetentionDays" className="block text-sm font-medium text-gray-700">
                  Data Retention (days)
                </label>
                <div className="mt-1">
                  <input
                    type="number"
                    id="dataRetentionDays"
                    min="1"
                    value={config.general.dataRetentionDays}
                    onChange={(e) => handleChange('general', 'dataRetentionDays', parseInt(e.target.value) || 0)}
                    className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  />
                </div>
                {validationErrors['general.dataRetentionDays'] && (
                  <p className="mt-2 text-sm text-red-600">{validationErrors['general.dataRetentionDays']}</p>
                )}
              </div>

              <div className="sm:col-span-6">
                <div className="flex items-start">
                  <div className="flex items-center h-5">
                    <input
                      id="enableTelemetry"
                      type="checkbox"
                      checked={config.general.enableTelemetry}
                      onChange={(e) => handleChange('general', 'enableTelemetry', e.target.checked)}
                      className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                    />
                  </div>
                  <div className="ml-3 text-sm">
                    <label htmlFor="enableTelemetry" className="font-medium text-gray-700">
                      Enable Telemetry
                    </label>
                    <p className="text-gray-500">
                      Allow anonymous usage data collection to help improve the product.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Proxy Settings */}
        {activeTab === 'proxy' && (
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-gray-900">Proxy Settings</h3>
            
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <label htmlFor="defaultTimeout" className="block text-sm font-medium text-gray-700">
                  Default Timeout (ms)
                </label>
                <div className="mt-1">
                  <input
                    type="number"
                    id="defaultTimeout"
                    min="1000"
                    value={config.proxy.defaultTimeout}
                    onChange={(e) => handleChange('proxy', 'defaultTimeout', parseInt(e.target.value) || 0)}
                    className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  />
                </div>
                {validationErrors['proxy.defaultTimeout'] && (
                  <p className="mt-2 text-sm text-red-600">{validationErrors['proxy.defaultTimeout']}</p>
                )}
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="maxConnections" className="block text-sm font-medium text-gray-700">
                  Max Connections
                </label>
                <div className="mt-1">
                  <input
                    type="number"
                    id="maxConnections"
                    min="1"
                    value={config.proxy.maxConnections}
                    onChange={(e) => handleChange('proxy', 'maxConnections', parseInt(e.target.value) || 0)}
                    className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  />
                </div>
                {validationErrors['proxy.maxConnections'] && (
                  <p className="mt-2 text-sm text-red-600">{validationErrors['proxy.maxConnections']}</p>
                )}
              </div>

              <div className="sm:col-span-6">
                <div className="flex items-start">
                  <div className="flex items-center h-5">
                    <input
                      id="enableCompression"
                      type="checkbox"
                      checked={config.proxy.enableCompression}
                      onChange={(e) => handleChange('proxy', 'enableCompression', e.target.checked)}
                      className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                    />
                  </div>
                  <div className="ml-3 text-sm">
                    <label htmlFor="enableCompression" className="font-medium text-gray-700">
                      Enable Compression
                    </label>
                    <p className="text-gray-500">
                      Compress responses to reduce bandwidth usage.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Security Settings */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-gray-900">Security Settings</h3>
            
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
              <div className="sm:col-span-6">
                <div className="flex items-start">
                  <div className="flex items-center h-5">
                    <input
                      id="enableFirewall"
                      type="checkbox"
                      checked={config.security.enableFirewall}
                      onChange={(e) => handleChange('security', 'enableFirewall', e.target.checked)}
                      className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                    />
                  </div>
                  <div className="ml-3 text-sm">
                    <label htmlFor="enableFirewall" className="font-medium text-gray-700">
                      Enable Firewall
                    </label>
                    <p className="text-gray-500">
                      Enable IP-based access control.
                    </p>
                  </div>
                </div>
              </div>

              <div className="sm:col-span-6">
                <label className="block text-sm font-medium text-gray-700">
                  Allowed IPs
                </label>
                <div className="mt-1">
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={newIP}
                      onChange={(e) => setNewIP(e.target.value)}
                      placeholder="Enter IP address"
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    />
                    <button
                      type="button"
                      onClick={addAllowedIP}
                      className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      Add
                    </button>
                  </div>
                </div>
                <div className="mt-2 space-y-2">
                  {config.security.allowedIPs.map((ip) => (
                    <div key={ip} className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded-md">
                      <span className="text-sm">{ip}</span>
                      <button
                        type="button"
                        onClick={() => removeAllowedIP(ip)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notifications Settings */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-gray-900">Notification Settings</h3>
            
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
              <div className="sm:col-span-6">
                <div className="flex items-start">
                  <div className="flex items-center h-5">
                    <input
                      id="emailEnabled"
                      type="checkbox"
                      checked={config.notifications.email.enabled}
                      onChange={(e) => handleNestedChange('notifications', 'email', 'enabled', e.target.checked)}
                      className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                    />
                  </div>
                  <div className="ml-3 text-sm">
                    <label htmlFor="emailEnabled" className="font-medium text-gray-700">
                      Enable Email Notifications
                    </label>
                    <p className="text-gray-500">
                      Send notifications via email.
                    </p>
                  </div>
                </div>
              </div>

              {config.notifications.email.enabled && (
                <>
                  <div className="sm:col-span-3">
                    <label htmlFor="smtpServer" className="block text-sm font-medium text-gray-700">
                      SMTP Server
                    </label>
                    <div className="mt-1">
                      <input
                        type="text"
                        id="smtpServer"
                        value={config.notifications.email.smtpServer}
                        onChange={(e) => handleNestedChange('notifications', 'email', 'smtpServer', e.target.value)}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-3">
                    <label htmlFor="smtpPort" className="block text-sm font-medium text-gray-700">
                      SMTP Port
                    </label>
                    <div className="mt-1">
                      <input
                        type="number"
                        id="smtpPort"
                        value={config.notifications.email.smtpPort}
                        onChange={(e) => handleNestedChange('notifications', 'email', 'smtpPort', parseInt(e.target.value) || 0)}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Advanced Settings */}
        {activeTab === 'advanced' && (
          <div className="space-y-6">
            <h3 className="text-lg font-medium text-gray-900">Advanced Settings</h3>
            
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
              <div className="sm:col-span-6">
                <div className="flex items-start">
                  <div className="flex items-center h-5">
                    <input
                      id="enableDebugMode"
                      type="checkbox"
                      checked={config.advanced.enableDebugMode}
                      onChange={(e) => handleChange('advanced', 'enableDebugMode', e.target.checked)}
                      className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                    />
                  </div>
                  <div className="ml-3 text-sm">
                    <label htmlFor="enableDebugMode" className="font-medium text-gray-700">
                      Enable Debug Mode
                    </label>
                    <p className="text-gray-500">
                      Enable additional logging and debugging features.
                    </p>
                  </div>
                </div>
              </div>

              <div className="sm:col-span-6">
                <label className="block text-sm font-medium text-gray-700">
                  Environment Variables
                </label>
                <div className="mt-1">
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={newEnvVarKey}
                      onChange={(e) => setNewEnvVarKey(e.target.value)}
                      placeholder="Key"
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    />
                    <input
                      type="text"
                      value={newEnvVarValue}
                      onChange={(e) => setNewEnvVarValue(e.target.value)}
                      placeholder="Value"
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    />
                    <button
                      type="button"
                      onClick={addEnvironmentVariable}
                      className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      Add
                    </button>
                  </div>
                </div>
                <div className="mt-2 space-y-2">
                  {Object.entries(config.advanced.customEnvironmentVariables).map(([key, value]) => (
                    <div key={key} className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded-md">
                      <div>
                        <span className="font-medium text-sm">{key}</span>
                        <span className="text-gray-500 text-sm ml-2">{value}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeEnvironmentVariable(key)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Form Actions */}
        <div className="mt-8 pt-5 border-t border-gray-200">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};