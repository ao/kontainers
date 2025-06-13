import { Elysia } from 'elysia';
import { websocket } from '@elysiajs/websocket';
import { containerService } from '../services/container';
import { proxyService } from '../services/proxy';
import { monitoringService } from '../services/monitoring';
import { proxyAnalyticsService } from '../services/proxyAnalytics';
import {
  handleContainerEvents,
  handleProxyEvents,
  handleSystemEvents,
  handleProxyAnalyticsEvents
} from './handlers';

/**
 * WebSocket server for real-time updates
 */
export const websocketServer = new Elysia()
  .use(websocket())
  .ws('/ws', {
    open(ws) {
      console.log('WebSocket connection opened');
      
      // Send initial data
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to Kontainers WebSocket server'
      }));
    },
    message(ws, message) {
      try {
        const data = JSON.parse(message as string);
        
        // Handle different message types
        switch (data.type) {
          case 'subscribe':
            handleSubscription(ws, data);
            break;
            
          case 'unsubscribe':
            handleUnsubscription(ws, data);
            break;
            
          default:
            ws.send(JSON.stringify({
              type: 'error',
              message: `Unknown message type: ${data.type}`
            }));
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    },
    close(ws) {
      console.log('WebSocket connection closed');
      // Clean up any subscriptions
      cleanupSubscriptions(ws);
    }
  });

/**
 * Handle subscription requests
 */
function handleSubscription(ws: any, data: any) {
  const { channel, id } = data;
  
  switch (channel) {
    case 'containers':
      handleContainerEvents(ws, id);
      break;
      
    case 'container-stats':
      if (id) {
        containerService.startStatsMonitoring(id);
      }
      break;
      
    case 'container-logs':
      if (id) {
        containerService.startLogStreaming(id, (log) => {
          ws.send(JSON.stringify({ type: 'container-log', id, log }));
        });
      }
      break;
      
    case 'proxy':
      handleProxyEvents(ws, id);
      break;
      
    case 'proxy-analytics':
      handleProxyAnalyticsEvents(ws, id);
      break;
      
    case 'system':
      handleSystemEvents(ws);
      break;
      
    default:
      ws.send(JSON.stringify({
        type: 'error',
        message: `Unknown channel: ${channel}`
      }));
  }
}

/**
 * Handle unsubscription requests
 */
function handleUnsubscription(ws: any, data: any) {
  const { channel, id } = data;
  
  switch (channel) {
    case 'container-stats':
      if (id) {
        containerService.stopStatsMonitoring(id);
      }
      break;
      
    case 'container-logs':
      if (id) {
        containerService.stopLogStreaming(id);
      }
      break;
  }
}

/**
 * Clean up subscriptions when a connection is closed
 */
function cleanupSubscriptions(ws: any) {
  // This would ideally track active subscriptions per connection
  // For now, we'll just log that cleanup would happen here
  console.log('Cleaning up subscriptions for closed connection');
}

export default websocketServer;