import { containerService } from '../services/container';
import { proxyService } from '../services/proxy';
import { monitoringService } from '../services/monitoring';

/**
 * Handle container events and send them to the WebSocket client
 */
export function handleContainerEvents(ws: any, containerId?: string) {
  // Handler for container created events
  const containerCreatedHandler = (container: any) => {
    if (!containerId || container.id === containerId) {
      ws.send(JSON.stringify({
        type: 'container-event',
        event: 'created',
        container
      }));
    }
  };
  
  // Handler for container started events
  const containerStartedHandler = (container: any) => {
    if (!containerId || container.id === containerId) {
      ws.send(JSON.stringify({
        type: 'container-event',
        event: 'started',
        container
      }));
    }
  };
  
  // Handler for container stopped events
  const containerStoppedHandler = (container: any) => {
    if (!containerId || container.id === containerId) {
      ws.send(JSON.stringify({
        type: 'container-event',
        event: 'stopped',
        container
      }));
    }
  };
  
  // Handler for container restarted events
  const containerRestartedHandler = (container: any) => {
    if (!containerId || container.id === containerId) {
      ws.send(JSON.stringify({
        type: 'container-event',
        event: 'restarted',
        container
      }));
    }
  };
  
  // Handler for container removed events
  const containerRemovedHandler = (data: any) => {
    if (!containerId || data.id === containerId) {
      ws.send(JSON.stringify({
        type: 'container-event',
        event: 'removed',
        id: data.id
      }));
    }
  };
  
  // Handler for container stats events
  const containerStatsHandler = (stats: any) => {
    if (!containerId || stats.containerId === containerId) {
      ws.send(JSON.stringify({
        type: 'container-stats',
        stats
      }));
    }
  };
  
  // Register event handlers
  containerService.on('container:created', containerCreatedHandler);
  containerService.on('container:started', containerStartedHandler);
  containerService.on('container:stopped', containerStoppedHandler);
  containerService.on('container:restarted', containerRestartedHandler);
  containerService.on('container:removed', containerRemovedHandler);
  containerService.on('container:stats', containerStatsHandler);
  
  // Store handlers on the WebSocket object for cleanup
  ws.containerEventHandlers = {
    'container:created': containerCreatedHandler,
    'container:started': containerStartedHandler,
    'container:stopped': containerStoppedHandler,
    'container:restarted': containerRestartedHandler,
    'container:removed': containerRemovedHandler,
    'container:stats': containerStatsHandler
  };
}

/**
 * Handle proxy events and send them to the WebSocket client
 */
export function handleProxyEvents(ws: any, ruleId?: string) {
  // Handler for proxy rule created events
  const proxyRuleCreatedHandler = (rule: any) => {
    if (!ruleId || rule.id === ruleId) {
      ws.send(JSON.stringify({
        type: 'proxy-event',
        event: 'created',
        rule
      }));
    }
  };
  
  // Handler for proxy rule updated events
  const proxyRuleUpdatedHandler = (rule: any) => {
    if (!ruleId || rule.id === ruleId) {
      ws.send(JSON.stringify({
        type: 'proxy-event',
        event: 'updated',
        rule
      }));
    }
  };
  
  // Handler for proxy rule deleted events
  const proxyRuleDeletedHandler = (data: any) => {
    if (!ruleId || data.id === ruleId) {
      ws.send(JSON.stringify({
        type: 'proxy-event',
        event: 'deleted',
        id: data.id
      }));
    }
  };
  
  // Handler for proxy traffic events
  const proxyTrafficHandler = (traffic: any) => {
    if (!ruleId || traffic.ruleId === ruleId) {
      ws.send(JSON.stringify({
        type: 'proxy-traffic',
        traffic
      }));
    }
  };
  
  // Handler for proxy error events
  const proxyErrorHandler = (error: any) => {
    if (!ruleId || error.ruleId === ruleId) {
      ws.send(JSON.stringify({
        type: 'proxy-error',
        error
      }));
    }
  };
  
  // Register event handlers
  proxyService.on('proxy:rule-created', proxyRuleCreatedHandler);
  proxyService.on('proxy:rule-updated', proxyRuleUpdatedHandler);
  proxyService.on('proxy:rule-deleted', proxyRuleDeletedHandler);
  proxyService.on('proxy:traffic', proxyTrafficHandler);
  proxyService.on('proxy:error', proxyErrorHandler);
  
  // Store handlers on the WebSocket object for cleanup
  ws.proxyEventHandlers = {
    'proxy:rule-created': proxyRuleCreatedHandler,
    'proxy:rule-updated': proxyRuleUpdatedHandler,
    'proxy:rule-deleted': proxyRuleDeletedHandler,
    'proxy:traffic': proxyTrafficHandler,
    'proxy:error': proxyErrorHandler
  };
}

/**
 * Handle system events and send them to the WebSocket client
 */
export function handleSystemEvents(ws: any) {
  // Handler for system metrics events
  const systemMetricsHandler = (metrics: any) => {
    ws.send(JSON.stringify({
      type: 'system-metrics',
      metrics
    }));
  };
  
  // Handler for system health events
  const systemHealthHandler = (health: any) => {
    ws.send(JSON.stringify({
      type: 'system-health',
      health
    }));
  };
  
  // Register event handlers
  monitoringService.on('system:metrics', systemMetricsHandler);
  monitoringService.on('system:health', systemHealthHandler);
  
  // Store handlers on the WebSocket object for cleanup
  ws.systemEventHandlers = {
    'system:metrics': systemMetricsHandler,
    'system:health': systemHealthHandler
  };
}

/**
 * Clean up event handlers for a WebSocket connection
 */
export function cleanupEventHandlers(ws: any) {
  // Since we don't have an 'off' method in our services,
  // we'll just remove the references to the handlers
  // In a real implementation, we would unregister these handlers
  
  // Clean up container event handlers
  if (ws.containerEventHandlers) {
    console.log('Cleaning up container event handlers');
    // In a real implementation with proper event unsubscription:
    // Object.entries(ws.containerEventHandlers).forEach(([event, handler]) => {
    //   containerService.off(event, handler);
    // });
    delete ws.containerEventHandlers;
  }
  
  // Clean up proxy event handlers
  if (ws.proxyEventHandlers) {
    console.log('Cleaning up proxy event handlers');
    delete ws.proxyEventHandlers;
  }
  
  // Clean up system event handlers
  if (ws.systemEventHandlers) {
    console.log('Cleaning up system event handlers');
    delete ws.systemEventHandlers;
  }
}