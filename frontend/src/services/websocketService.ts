import { Container, ProxyRule, HealthStatus, SystemResourceMetrics } from '../../../shared/src/models';

// Event types for WebSocket messages
export enum WebSocketEventType {
  CONTAINER_CREATED = 'CONTAINER_CREATED',
  CONTAINER_UPDATED = 'CONTAINER_UPDATED',
  CONTAINER_DELETED = 'CONTAINER_DELETED',
  CONTAINER_STATE_CHANGED = 'CONTAINER_STATE_CHANGED',
  PROXY_RULE_CREATED = 'PROXY_RULE_CREATED',
  PROXY_RULE_UPDATED = 'PROXY_RULE_UPDATED',
  PROXY_RULE_DELETED = 'PROXY_RULE_DELETED',
  PROXY_RULE_STATE_CHANGED = 'PROXY_RULE_STATE_CHANGED',
  HEALTH_STATUS_CHANGED = 'HEALTH_STATUS_CHANGED',
  METRICS_UPDATED = 'METRICS_UPDATED',
  ERROR_OCCURRED = 'ERROR_OCCURRED',
  SYSTEM_NOTIFICATION = 'SYSTEM_NOTIFICATION',
}

// WebSocket message interface
export interface WebSocketMessage<T = any> {
  type: WebSocketEventType;
  payload: T;
  timestamp: number;
}

// Event listener type
type EventListener<T = any> = (data: T) => void;

class WebSocketService {
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout = 1000; // Start with 1 second timeout
  private eventListeners: Map<WebSocketEventType, EventListener[]> = new Map();
  private url: string;
  private isConnecting = false;

  constructor(url: string = `ws://${window.location.host}/api/ws`) {
    this.url = url;
  }

  // Connect to WebSocket server
  public connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (this.isConnecting) {
      return new Promise((resolve) => {
        const checkConnected = setInterval(() => {
          if (this.socket?.readyState === WebSocket.OPEN) {
            clearInterval(checkConnected);
            resolve();
          }
        }, 100);
      });
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(this.url);

        this.socket.onopen = () => {
          console.log('WebSocket connection established');
          this.reconnectAttempts = 0;
          this.isConnecting = false;
          resolve();
        };

        this.socket.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        this.socket.onclose = (event) => {
          this.isConnecting = false;
          if (!event.wasClean) {
            console.warn(`WebSocket connection closed unexpectedly, code: ${event.code}`);
            this.attemptReconnect();
          } else {
            console.log('WebSocket connection closed cleanly');
          }
        };

        this.socket.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.isConnecting = false;
          reject(error);
        };
      } catch (error) {
        this.isConnecting = false;
        console.error('Error creating WebSocket:', error);
        reject(error);
      }
    });
  }

  // Disconnect from WebSocket server
  public disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  // Add event listener
  public addEventListener<T>(type: WebSocketEventType, listener: EventListener<T>): void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, []);
    }
    this.eventListeners.get(type)!.push(listener as EventListener);
  }

  // Remove event listener
  public removeEventListener<T>(type: WebSocketEventType, listener: EventListener<T>): void {
    if (!this.eventListeners.has(type)) {
      return;
    }
    
    const listeners = this.eventListeners.get(type)!;
    const index = listeners.indexOf(listener as EventListener);
    
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  }

  // Handle incoming message
  private handleMessage(message: WebSocketMessage): void {
    const { type, payload } = message;
    
    if (this.eventListeners.has(type)) {
      const listeners = this.eventListeners.get(type)!;
      listeners.forEach(listener => listener(payload));
    }
  }

  // Attempt to reconnect
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Maximum reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const timeout = this.reconnectTimeout * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Attempting to reconnect in ${timeout}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      this.connect().catch(() => {
        // Error handling is done in the connect method
      });
    }, timeout);
  }

  // Check if WebSocket is connected
  public isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  // Send message to server
  public sendMessage(type: string, payload: any): void {
    if (!this.isConnected()) {
      console.error('Cannot send message: WebSocket is not connected');
      return;
    }

    const message = {
      type,
      payload,
      timestamp: Date.now()
    };

    this.socket!.send(JSON.stringify(message));
  }
}

// Create singleton instance
const websocketService = new WebSocketService();

export default websocketService;