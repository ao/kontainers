import React, { useEffect, useState } from 'react';
import { useProxyStore } from '../../store/proxyStore';
import { ProxyRule, ProxyTrafficSummary, ProxyErrorSummary } from '../../../shared/src/models';
import { fetchProxyRuleById, fetchProxyTrafficSummary, fetchProxyErrorSummary } from '../../services/proxyService';
import Card from '../common/Card';
import Button from '../common/Button';
import LoadingIndicator from '../common/LoadingIndicator';
import Alert from '../common/Alert';
import websocketService, { WebSocketEventType } from '../../services/websocketService';

interface ProxyRuleDetailProps {
  ruleId: string;
  onEdit: (rule: ProxyRule) => void;
  onBack: () => void;
}

// Helper functions for status code styling
const getStatusCodeColor = (code: number): string => {
  if (code < 300) return 'bg-green-100 text-green-800';
  if (code < 400) return 'bg-blue-100 text-blue-800';
  if (code < 500) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
};

const getStatusCodeBarColor = (code: number): string => {
  if (code < 300) return 'bg-green-500';
  if (code < 400) return 'bg-blue-500';
  if (code < 500) return 'bg-yellow-500';
  return 'bg-red-500';
};

const getStatusCodeLabel = (code: number): string => {
  if (code < 300) return 'Success';
  if (code < 400) return 'Redirect';
  if (code < 500) return 'Client Error';
  return 'Server Error';
};

const formatPeriod = (period: string): string => {
  switch (period) {
    case 'last_hour': return 'Last Hour';
    case 'last_day': return 'Last 24 Hours';
    case 'last_week': return 'Last 7 Days';
    case 'last_month': return 'Last 30 Days';
    default: return period.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
};

export const ProxyRuleDetail: React.FC<ProxyRuleDetailProps> = ({ ruleId, onEdit, onBack }) => {
  const { getRuleById, setSelectedRule, setTrafficData, setErrorSummary, isLoading, error, setLoading, setError } = useProxyStore();
  const [rule, setRule] = useState<ProxyRule | null>(null);
  const [trafficSummary, setTrafficSummary] = useState<ProxyTrafficSummary | null>(null);
  const [errorSummaryState, setErrorSummaryState] = useState<ProxyErrorSummary | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'traffic' | 'errors'>('overview');

  useEffect(() => {
    const loadRuleDetails = async () => {
      try {
        setLoading(true);
        
        // Try to get the rule from the store first
        let ruleData = getRuleById(ruleId);
        
        // If not found in store, fetch from API
        if (!ruleData) {
          ruleData = await fetchProxyRuleById(ruleId);
        }
        
        setRule(ruleData);
        setSelectedRule(ruleData);
        
        // Fetch traffic and error summaries
        const traffic = await fetchProxyTrafficSummary(ruleId);
        const errors = await fetchProxyErrorSummary(ruleId);
        
        setTrafficSummary(traffic);
        setErrorSummaryState(errors);
        
        // Update store
        if (traffic.dataPoints) {
          setTrafficData(ruleId, traffic.dataPoints);
        }
        setErrorSummary(ruleId, errors);
        
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load rule details');
      } finally {
        setLoading(false);
      }
    };

    loadRuleDetails();

    // Set up WebSocket listeners for real-time updates
    websocketService.connect().catch(err => {
      console.error('Failed to connect to WebSocket:', err);
    });

    const handleRuleUpdated = (updatedRule: ProxyRule) => {
      if (updatedRule.id === ruleId) {
        setRule(updatedRule);
        setSelectedRule(updatedRule);
      }
    };

    websocketService.addEventListener(WebSocketEventType.PROXY_RULE_UPDATED, handleRuleUpdated);
    websocketService.addEventListener(WebSocketEventType.PROXY_RULE_STATE_CHANGED, handleRuleUpdated);

    return () => {
      websocketService.removeEventListener(WebSocketEventType.PROXY_RULE_UPDATED, handleRuleUpdated);
      websocketService.removeEventListener(WebSocketEventType.PROXY_RULE_STATE_CHANGED, handleRuleUpdated);
    };
  }, [ruleId, getRuleById, setSelectedRule, setTrafficData, setErrorSummary, setLoading, setError]);

  if (isLoading) {
    return <LoadingIndicator />;
  }

  if (error) {
    return <Alert type="error" message={error} />;
  }

  if (!rule) {
    return <Alert type="warning" message="Proxy rule not found" />;
  }

  const renderOverviewTab = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-medium mb-4">Basic Information</h3>
          <div className="bg-gray-50 p-4 rounded-md">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <span className="text-sm text-gray-500">Name</span>
                <p className="font-medium">{rule.name}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Status</span>
                <p>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${rule.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {rule.enabled ? 'Active' : 'Inactive'}
                  </span>
                </p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Created</span>
                <p>{new Date(rule.created).toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium mb-4">Routing Configuration</h3>
          <div className="bg-gray-50 p-4 rounded-md">
            <div className="grid grid-cols-1 gap-3">
              {rule.domain && (
                <div>
                  <span className="text-sm text-gray-500">Domain Name</span>
                  <p className="font-medium">{rule.domain}</p>
                </div>
              )}
              <div>
                <span className="text-sm text-gray-500">Source Host</span>
                <p className="font-medium">{rule.sourceHost}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Source Path</span>
                <p className="font-medium">{rule.sourcePath}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Protocol</span>
                <p>{rule.protocol}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-4">Target Configuration</h3>
        <div className="bg-gray-50 p-4 rounded-md">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <span className="text-sm text-gray-500">Target Container</span>
              <p className="font-medium">{rule.targetContainer}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">Target Port</span>
              <p>{rule.targetPort}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">SSL Enabled</span>
              <p>{rule.sslEnabled ? 'Yes' : 'No'}</p>
            </div>
            {rule.letsEncryptEnabled && (
              <>
                <div>
                  <span className="text-sm text-gray-500">Let's Encrypt</span>
                  <p>Enabled</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Let's Encrypt Email</span>
                  <p>{rule.letsEncryptEmail || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Certificate Status</span>
                  <p>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      !rule.letsEncryptStatus || rule.letsEncryptStatus === 'PENDING'
                        ? 'bg-yellow-100 text-yellow-800'
                        : rule.letsEncryptStatus === 'VALID'
                          ? 'bg-green-100 text-green-800'
                          : rule.letsEncryptStatus === 'EXPIRED'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-red-100 text-red-800'
                    }`}>
                      {rule.letsEncryptStatus || 'PENDING'}
                    </span>
                  </p>
                </div>
                {rule.letsEncryptLastRenewal && (
                  <div>
                    <span className="text-sm text-gray-500">Last Renewal</span>
                    <p>{new Date(rule.letsEncryptLastRenewal).toLocaleString()}</p>
                  </div>
                )}
                {rule.sslCertificate?.expiryDate && (
                  <div>
                    <span className="text-sm text-gray-500">Expires</span>
                    <p>{new Date(rule.sslCertificate.expiryDate).toLocaleString()}</p>
                  </div>
                )}
              </>
            )}
            {rule.sslEnabled && !rule.letsEncryptEnabled && (
              <>
                <div>
                  <span className="text-sm text-gray-500">SSL Certificate Path</span>
                  <p className="font-mono text-sm break-all">{rule.sslCertPath || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">SSL Key Path</span>
                  <p className="font-mono text-sm break-all">{rule.sslKeyPath || 'N/A'}</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {rule.headers && Object.keys(rule.headers).length > 0 && (
        <div>
          <h3 className="text-lg font-medium mb-4">Request Headers</h3>
          <div className="bg-gray-50 p-4 rounded-md">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(rule.headers).map(([key, value]) => (
                <div key={key}>
                  <span className="text-sm text-gray-500">{key}</span>
                  <p className="font-mono text-sm break-all">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {rule.responseHeaders && Object.keys(rule.responseHeaders).length > 0 && (
        <div>
          <h3 className="text-lg font-medium mb-4">Response Headers</h3>
          <div className="bg-gray-50 p-4 rounded-md">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(rule.responseHeaders).map(([key, value]) => (
                <div key={key}>
                  <span className="text-sm text-gray-500">{key}</span>
                  <p className="font-mono text-sm break-all">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {rule.healthCheck && (
        <div>
          <h3 className="text-lg font-medium mb-4">Health Check Configuration</h3>
          <div className="bg-gray-50 p-4 rounded-md">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <span className="text-sm text-gray-500">Path</span>
                <p>{rule.healthCheck.path}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Interval (ms)</span>
                <p>{rule.healthCheck.interval}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Timeout (ms)</span>
                <p>{rule.healthCheck.timeout}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Retries</span>
                <p>{rule.healthCheck.retries}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Success Codes</span>
                <p>{rule.healthCheck.successCodes}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {rule.loadBalancing && (
        <div>
          <h3 className="text-lg font-medium mb-4">Load Balancing Configuration</h3>
          <div className="bg-gray-50 p-4 rounded-md">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div>
                <span className="text-sm text-gray-500">Method</span>
                <p>{rule.loadBalancing.method}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Sticky Sessions</span>
                <p>{rule.loadBalancing.sticky ? 'Enabled' : 'Disabled'}</p>
              </div>
              {rule.loadBalancing.sticky && (
                <>
                  <div>
                    <span className="text-sm text-gray-500">Cookie Name</span>
                    <p>{rule.loadBalancing.cookieName || 'Default'}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Cookie Expiry (seconds)</span>
                    <p>{rule.loadBalancing.cookieExpiry || 'Session'}</p>
                  </div>
                </>
              )}
            </div>

            <h4 className="text-md font-medium mb-2">Targets</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Container</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Port</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Weight</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {rule.loadBalancing.targets.map((target, index) => (
                    <tr key={index}>
                      <td className="px-4 py-2 text-sm">{target.container}</td>
                      <td className="px-4 py-2 text-sm">{target.port}</td>
                      <td className="px-4 py-2 text-sm">{target.weight}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {rule.advancedConfig && (
        <div>
          <h3 className="text-lg font-medium mb-4">Advanced Configuration</h3>
          <div className="bg-gray-50 p-4 rounded-md">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rule.advancedConfig.clientMaxBodySize && (
                <div>
                  <span className="text-sm text-gray-500">Client Max Body Size</span>
                  <p>{rule.advancedConfig.clientMaxBodySize}</p>
                </div>
              )}
              <div>
                <span className="text-sm text-gray-500">Connect Timeout (ms)</span>
                <p>{rule.advancedConfig.proxyConnectTimeout}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Send Timeout (ms)</span>
                <p>{rule.advancedConfig.proxySendTimeout}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Read Timeout (ms)</span>
                <p>{rule.advancedConfig.proxyReadTimeout}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Cache Enabled</span>
                <p>{rule.advancedConfig.cacheEnabled ? 'Yes' : 'No'}</p>
              </div>
              {rule.advancedConfig.cacheEnabled && rule.advancedConfig.cacheDuration && (
                <div>
                  <span className="text-sm text-gray-500">Cache Duration</span>
                  <p>{rule.advancedConfig.cacheDuration}</p>
                </div>
              )}
              <div>
                <span className="text-sm text-gray-500">CORS Enabled</span>
                <p>{rule.advancedConfig.corsEnabled ? 'Yes' : 'No'}</p>
              </div>
              {rule.advancedConfig.corsEnabled && (
                <>
                  <div>
                    <span className="text-sm text-gray-500">CORS Allow Origin</span>
                    <p>{rule.advancedConfig.corsAllowOrigin || '*'}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">CORS Allow Methods</span>
                    <p>{rule.advancedConfig.corsAllowMethods || 'GET, POST, PUT, DELETE, OPTIONS'}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">CORS Allow Headers</span>
                    <p>{rule.advancedConfig.corsAllowHeaders || 'Content-Type, Authorization'}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">CORS Allow Credentials</span>
                    <p>{rule.advancedConfig.corsAllowCredentials ? 'Yes' : 'No'}</p>
                  </div>
                </>
              )}
            </div>

            {rule.advancedConfig.rateLimit && (
              <div className="mt-4">
                <h4 className="text-md font-medium mb-2">Rate Limiting</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <span className="text-sm text-gray-500">Requests Per Second</span>
                    <p>{rule.advancedConfig.rateLimit.requestsPerSecond}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Burst Size</span>
                    <p>{rule.advancedConfig.rateLimit.burstSize}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">No Delay</span>
                    <p>{rule.advancedConfig.rateLimit.nodelay ? 'Yes' : 'No'}</p>
                  </div>
                </div>
              </div>
            )}

            {rule.advancedConfig.rewriteRules && rule.advancedConfig.rewriteRules.length > 0 && (
              <div className="mt-4">
                <h4 className="text-md font-medium mb-2">URL Rewrite Rules</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Pattern</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Replacement</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Flag</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {rule.advancedConfig.rewriteRules.map((rewrite, index) => (
                        <tr key={index}>
                          <td className="px-4 py-2 text-sm font-mono">{rewrite.pattern}</td>
                          <td className="px-4 py-2 text-sm font-mono">{rewrite.replacement}</td>
                          <td className="px-4 py-2 text-sm">{rewrite.flag}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {rule.customNginxConfig && (
        <div>
          <h3 className="text-lg font-medium mb-4">Custom Nginx Configuration</h3>
          <div className="bg-gray-50 p-4 rounded-md">
            <pre className="text-sm font-mono whitespace-pre-wrap">{rule.customNginxConfig}</pre>
          </div>
        </div>
      )}
    </div>
  );

  // Tab navigation UI
  const renderTabNavigation = () => (
    <div className="mb-6 border-b border-gray-200">
      <nav className="flex -mb-px">
        <button
          onClick={() => setActiveTab('overview')}
          className={`mr-4 py-2 px-1 ${
            activeTab === 'overview'
              ? 'border-b-2 border-blue-500 text-blue-600 font-medium'
              : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('traffic')}
          className={`mr-4 py-2 px-1 ${
            activeTab === 'traffic'
              ? 'border-b-2 border-blue-500 text-blue-600 font-medium'
              : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Traffic
        </button>
        <button
          onClick={() => setActiveTab('errors')}
          className={`mr-4 py-2 px-1 ${
            activeTab === 'errors'
              ? 'border-b-2 border-blue-500 text-blue-600 font-medium'
              : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Errors
        </button>
      </nav>
    </div>
  );

  const renderTrafficTab = () => (
    <div className="space-y-6">
      {trafficSummary ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white shadow rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-500">Total Requests</h4>
              <p className="text-2xl font-bold">{trafficSummary.totalRequests.toLocaleString()}</p>
            </div>
            <div className="bg-white shadow rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-500">Total Responses</h4>
              <p className="text-2xl font-bold">{trafficSummary.totalResponses.toLocaleString()}</p>
            </div>
            <div className="bg-white shadow rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-500">Avg Response Time</h4>
              <p className="text-2xl font-bold">{trafficSummary.avgResponseTime.toFixed(2)} ms</p>
            </div>
            <div className="bg-white shadow rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-500">Data Transferred</h4>
              <p className="text-2xl font-bold">
                {(trafficSummary.totalBytesSent / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-medium mb-4">Status Code Distribution</h3>
              <div className="bg-gray-50 p-4 rounded-md">
                <div className="space-y-2">
                  {Object.entries(trafficSummary.statusCodeDistribution)
                    .sort(([a], [b]) => parseInt(a) - parseInt(b))
                    .map(([code, count]) => (
                      <div key={code} className="flex items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-2 ${getStatusCodeColor(parseInt(code))}`}>
                          {code.charAt(0)}xx
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between mb-1">
                            <span className="text-sm font-medium">{getStatusCodeLabel(parseInt(code))}</span>
                            <span className="text-sm text-gray-500">{count.toLocaleString()} ({((count / trafficSummary.totalResponses) * 100).toFixed(1)}%)</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${getStatusCodeBarColor(parseInt(code))}`}
                              style={{ width: `${(count / trafficSummary.totalResponses) * 100}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium mb-4">Request Method Distribution</h3>
              <div className="bg-gray-50 p-4 rounded-md">
                <div className="space-y-2">
                  {Object.entries(trafficSummary.requestMethodDistribution)
                    .sort(([, a], [, b]) => b - a)
                    .map(([method, count]) => (
                      <div key={method} className="flex items-center">
                        <div className="w-16 text-xs font-medium text-center bg-blue-100 text-blue-800 py-1 px-2 rounded mr-2">
                          {method}
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between mb-1">
                            <span className="text-sm font-medium">{method}</span>
                            <span className="text-sm text-gray-500">{count.toLocaleString()} ({((count / trafficSummary.totalRequests) * 100).toFixed(1)}%)</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="h-2 rounded-full bg-blue-500"
                              style={{ width: `${(count / trafficSummary.totalRequests) * 100}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-medium mb-4">Top Paths</h3>
              <div className="bg-gray-50 p-4 rounded-md overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Path</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Hits</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trafficSummary.topPaths.map(([path, count], index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-2 text-sm font-mono truncate max-w-xs">{path}</td>
                        <td className="px-4 py-2 text-sm">{count.toLocaleString()}</td>
                        <td className="px-4 py-2 text-sm">
                          {((count / trafficSummary.totalRequests) * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium mb-4">Top Client IPs</h3>
              <div className="bg-gray-50 p-4 rounded-md overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">IP Address</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Requests</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trafficSummary.topClientIps.map(([ip, count], index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-2 text-sm font-mono">{ip}</td>
                        <td className="px-4 py-2 text-sm">{count.toLocaleString()}</td>
                        <td className="px-4 py-2 text-sm">
                          {((count / trafficSummary.totalRequests) * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-8">
          <p className="text-gray-500">No traffic data available for this proxy rule.</p>
        </div>
      )}
    </div>
  );

  const renderErrorsTab = () => (
    <div className="space-y-6">
      {errorSummaryState ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white shadow rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-500">Total Errors</h4>
              <p className="text-2xl font-bold">{errorSummaryState.totalErrors.toLocaleString()}</p>
            </div>
            <div className="bg-white shadow rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-500">Error Rate</h4>
              <p className="text-2xl font-bold">{(errorSummaryState.errorRate * 100).toFixed(2)}%</p>
            </div>
            <div className="bg-white shadow rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-500">Most Common Error</h4>
              <p className="text-2xl font-bold">
                {errorSummaryState.mostCommonError ? errorSummaryState.mostCommonError.code : 'N/A'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-medium mb-4">Error Distribution by Type</h3>
              <div className="bg-gray-50 p-4 rounded-md">
                <div className="space-y-2">
                  {errorSummaryState.errorsByType.map(([type, count], index) => (
                    <div key={index} className="flex items-center">
                      <div className="w-24 text-xs font-medium text-center bg-red-100 text-red-800 py-1 px-2 rounded mr-2">
                        {type}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between mb-1">
                          <span className="text-sm font-medium">{type}</span>
                          <span className="text-sm text-gray-500">
                            {count.toLocaleString()} ({((count / errorSummaryState.totalErrors) * 100).toFixed(1)}%)
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="h-2 rounded-full bg-red-500"
                            style={{ width: `${(count / errorSummaryState.totalErrors) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium mb-4">Error Distribution by Status Code</h3>
              <div className="bg-gray-50 p-4 rounded-md">
                <div className="space-y-2">
                  {errorSummaryState.errorsByStatusCode.map(([code, count], index) => (
                    <div key={index} className="flex items-center">
                      <div className={`w-12 h-8 rounded flex items-center justify-center mr-2 ${getStatusCodeColor(parseInt(code))}`}>
                        {code}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between mb-1">
                          <span className="text-sm font-medium">{getStatusCodeLabel(parseInt(code))}</span>
                          <span className="text-sm text-gray-500">
                            {count.toLocaleString()} ({((count / errorSummaryState.totalErrors) * 100).toFixed(1)}%)
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${getStatusCodeBarColor(parseInt(code))}`}
                            style={{ width: `${(count / errorSummaryState.totalErrors) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium mb-4">Recent Errors</h3>
            <div className="bg-gray-50 p-4 rounded-md overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Path</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {errorSummaryState.recentErrors.map((error, index) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-2 text-sm">{new Date(error.timestamp).toLocaleString()}</td>
                      <td className="px-4 py-2 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusCodeColor(error.code)}`}>
                          {error.code}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm">{error.type}</td>
                      <td className="px-4 py-2 text-sm font-mono truncate max-w-xs">{error.path}</td>
                      <td className="px-4 py-2 text-sm">{error.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-8">
          <p className="text-gray-500">No error data available for this proxy rule.</p>
        </div>
      )}
    </div>
  );
};