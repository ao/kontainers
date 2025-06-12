import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchContainerLogs } from '../../services/containerService';
import Card from '../common/Card';
import Button from '../common/Button';
import LoadingIndicator from '../common/LoadingIndicator';

interface ContainerLogsProps {
  logs?: string;
  isLoading?: boolean;
  containerId: string;
  onRefresh?: () => void;
}

const ContainerLogs: React.FC<ContainerLogsProps> = ({
  logs: initialLogs,
  isLoading: initialLoading,
  containerId,
  onRefresh
}) => {
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState('');
  const [logLines, setLogLines] = useState<string[]>([]);
  const [filteredLogLines, setFilteredLogLines] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  // Use the provided logs or fetch them if not provided
  const { 
    data: logs, 
    isLoading,
    refetch
  } = useQuery<string>({
    queryKey: ['containerLogs', containerId],
    queryFn: () => fetchContainerLogs(containerId, 1000),
    enabled: !initialLogs,
    initialData: initialLogs,
  });

  // Parse logs into lines when logs change
  useEffect(() => {
    if (logs) {
      const lines = logs.split('\n');
      setLogLines(lines);
    }
  }, [logs]);

  // Apply filter when filter or log lines change
  useEffect(() => {
    if (filter) {
      const filtered = logLines.filter(line => 
        line.toLowerCase().includes(filter.toLowerCase())
      );
      setFilteredLogLines(filtered);
    } else {
      setFilteredLogLines(logLines);
    }
  }, [filter, logLines]);

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredLogLines, autoScroll]);

  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh();
    } else {
      refetch();
    }
  };

  const loading = initialLoading || isLoading;

  // Color-code log lines based on content
  const getLogLineClass = (line: string): string => {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('error') || lowerLine.includes('exception') || lowerLine.includes('fail')) {
      return 'text-red-600';
    } else if (lowerLine.includes('warn')) {
      return 'text-yellow-600';
    } else if (lowerLine.includes('info')) {
      return 'text-blue-600';
    } else if (lowerLine.includes('debug')) {
      return 'text-gray-500';
    }
    return '';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between space-y-2 sm:space-y-0 sm:space-x-2">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Filter logs..."
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
        <div className="flex space-x-2">
          <div className="flex items-center">
            <input
              id="autoScroll"
              type="checkbox"
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            <label htmlFor="autoScroll" className="ml-2 block text-sm text-gray-900">
              Auto-scroll
            </label>
          </div>
          <Button 
            variant="secondary" 
            size="sm"
            onClick={handleRefresh}
          >
            Refresh
          </Button>
        </div>
      </div>

      <Card noPadding>
        {loading ? (
          <div className="p-4">
            <LoadingIndicator text="Loading logs..." />
          </div>
        ) : filteredLogLines.length > 0 ? (
          <div className="bg-gray-900 text-gray-100 rounded-md p-1 overflow-x-auto">
            <pre className="font-mono text-xs leading-5 h-96 overflow-y-auto p-2">
              {filteredLogLines.map((line, index) => (
                <div key={index} className={getLogLineClass(line)}>
                  {line}
                </div>
              ))}
              <div ref={logsEndRef} />
            </pre>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            No logs available
          </div>
        )}
      </Card>

      <div className="flex justify-between items-center text-sm text-gray-500">
        <div>
          {filter ? `Showing ${filteredLogLines.length} of ${logLines.length} lines` : `${logLines.length} lines total`}
        </div>
        <div>
          <Button 
            variant="secondary" 
            size="sm"
            onClick={() => {
              // Create a blob and download it
              const blob = new Blob([filteredLogLines.join('\n')], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `container-${containerId}-logs.txt`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
          >
            Download Logs
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ContainerLogs;