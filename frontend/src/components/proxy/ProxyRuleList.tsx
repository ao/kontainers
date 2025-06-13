import React, { useEffect, useState } from 'react';
import { useProxyStore } from '../../store/proxyStore';
import { ProxyRule, ProxyProtocol } from '../../../shared/src/models';
import { fetchProxyRules, enableProxyRule, disableProxyRule, deleteProxyRule } from '../../services/proxyService';
import Card from '../common/Card';
import Button from '../common/Button';
import LoadingIndicator from '../common/LoadingIndicator';
import Alert from '../common/Alert';
import Table from '../common/Table';
import websocketService, { WebSocketEventType } from '../../services/websocketService';

interface ProxyRuleListProps {
  onSelectRule: (rule: ProxyRule) => void;
  onCreateRule: () => void;
}

export const ProxyRuleList: React.FC<ProxyRuleListProps> = ({ onSelectRule, onCreateRule }) => {
  const { proxyRules, isLoading, error, setProxyRules, setLoading, setError } = useProxyStore();
  const [sortField, setSortField] = useState<keyof ProxyRule>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filterText, setFilterText] = useState('');
  const [filterProtocol, setFilterProtocol] = useState<ProxyProtocol | 'ALL'>('ALL');

  useEffect(() => {
    const loadProxyRules = async () => {
      try {
        setLoading(true);
        const rules = await fetchProxyRules();
        setProxyRules(rules);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load proxy rules');
      } finally {
        setLoading(false);
      }
    };

    loadProxyRules();

    // Set up WebSocket listeners for real-time updates
    websocketService.connect().catch(err => {
      console.error('Failed to connect to WebSocket:', err);
    });

    const handleRuleCreated = (rule: ProxyRule) => {
      setProxyRules([...proxyRules, rule]);
    };

    const handleRuleUpdated = (rule: ProxyRule) => {
      setProxyRules(proxyRules.map(r => r.id === rule.id ? rule : r));
    };

    const handleRuleDeleted = (ruleId: string) => {
      setProxyRules(proxyRules.filter(r => r.id !== ruleId));
    };

    websocketService.addEventListener(WebSocketEventType.PROXY_RULE_CREATED, handleRuleCreated);
    websocketService.addEventListener(WebSocketEventType.PROXY_RULE_UPDATED, handleRuleUpdated);
    websocketService.addEventListener(WebSocketEventType.PROXY_RULE_DELETED, handleRuleDeleted);
    websocketService.addEventListener(WebSocketEventType.PROXY_RULE_STATE_CHANGED, handleRuleUpdated);

    return () => {
      websocketService.removeEventListener(WebSocketEventType.PROXY_RULE_CREATED, handleRuleCreated);
      websocketService.removeEventListener(WebSocketEventType.PROXY_RULE_UPDATED, handleRuleUpdated);
      websocketService.removeEventListener(WebSocketEventType.PROXY_RULE_DELETED, handleRuleDeleted);
      websocketService.removeEventListener(WebSocketEventType.PROXY_RULE_STATE_CHANGED, handleRuleUpdated);
    };
  }, [proxyRules, setProxyRules, setLoading, setError]);

  const handleSort = (field: keyof ProxyRule) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleToggleStatus = async (rule: ProxyRule) => {
    try {
      setLoading(true);
      if (rule.enabled) {
        await disableProxyRule(rule.id);
      } else {
        await enableProxyRule(rule.id);
      }
      // The WebSocket will update the state
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update rule status');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRule = async (rule: ProxyRule) => {
    if (window.confirm(`Are you sure you want to delete the rule "${rule.name}"?`)) {
      try {
        setLoading(true);
        await deleteProxyRule(rule.id);
        // The WebSocket will update the state
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete rule');
      } finally {
        setLoading(false);
      }
    }
  };

  // Filter and sort the rules
  const filteredRules = proxyRules.filter(rule => {
    const matchesText = filterText === '' ||
      rule.name.toLowerCase().includes(filterText.toLowerCase()) ||
      rule.sourceHost.toLowerCase().includes(filterText.toLowerCase()) ||
      rule.sourcePath.toLowerCase().includes(filterText.toLowerCase()) ||
      rule.targetContainer.toLowerCase().includes(filterText.toLowerCase()) ||
      (rule.domain && rule.domain.toLowerCase().includes(filterText.toLowerCase()));
    
    const matchesProtocol = filterProtocol === 'ALL' || rule.protocol === filterProtocol;
    
    return matchesText && matchesProtocol;
  });

  const sortedRules = [...filteredRules].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];
    
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc' 
        ? aValue.localeCompare(bValue) 
        : bValue.localeCompare(aValue);
    }
    
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    }
    
    if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
      return sortDirection === 'asc' 
        ? (aValue === bValue ? 0 : aValue ? 1 : -1)
        : (aValue === bValue ? 0 : aValue ? -1 : 1);
    }
    
    return 0;
  });

  const columns = [
    { header: 'Name', accessor: 'name' as keyof ProxyRule },
    {
      header: 'Domain',
      accessor: (rule: ProxyRule) => rule.domain || '-'
    },
    { header: 'Source Host', accessor: 'sourceHost' as keyof ProxyRule },
    { header: 'Path', accessor: 'sourcePath' as keyof ProxyRule },
    { header: 'Protocol', accessor: 'protocol' as keyof ProxyRule },
    { header: 'Target Container', accessor: 'targetContainer' as keyof ProxyRule },
    { header: 'Port', accessor: 'targetPort' as keyof ProxyRule },
    { 
      header: 'Status', 
      accessor: (rule: ProxyRule) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${rule.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
          {rule.enabled ? 'Active' : 'Inactive'}
        </span>
      )
    },
    { 
      header: 'Actions', 
      accessor: (rule: ProxyRule) => (
        <div className="flex space-x-2">
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={() => onSelectRule(rule)}
          >
            View
          </Button>
          <Button 
            variant={rule.enabled ? "warning" : "success"} 
            size="sm" 
            onClick={() => handleToggleStatus(rule)}
          >
            {rule.enabled ? 'Disable' : 'Enable'}
          </Button>
          <Button 
            variant="danger" 
            size="sm" 
            onClick={() => handleDeleteRule(rule)}
          >
            Delete
          </Button>
        </div>
      )
    }
  ];

  return (
    <Card className="w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
        <h2 className="text-xl font-semibold">Proxy Rules</h2>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search rules..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
          </div>
          <div className="flex-1 sm:flex-initial">
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterProtocol}
              onChange={(e) => setFilterProtocol(e.target.value as ProxyProtocol | 'ALL')}
            >
              <option value="ALL">All Protocols</option>
              {Object.values(ProxyProtocol).map(protocol => (
                <option key={protocol} value={protocol}>{protocol}</option>
              ))}
            </select>
          </div>
          <Button variant="primary" onClick={onCreateRule}>
            Create Rule
          </Button>
        </div>
      </div>

      {isLoading && <LoadingIndicator />}
      
      {error && <Alert type="error" message={error} className="mb-4" />}
      
      {!isLoading && !error && (
        <>
          {sortedRules.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-md">
              <p className="text-gray-500">No proxy rules found. Create your first rule to get started.</p>
              <Button variant="primary" className="mt-4" onClick={onCreateRule}>
                Create Rule
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table
                columns={columns}
                data={sortedRules}
                keyExtractor={(rule) => rule.id}
              />
            </div>
          )}
          <div className="mt-4 text-sm text-gray-500">
            Showing {sortedRules.length} of {proxyRules.length} rules
          </div>
        </>
      )}
    </Card>
  );
};