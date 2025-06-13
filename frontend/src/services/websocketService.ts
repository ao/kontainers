/**
 * WebSocket service for real-time communication
 */

type MessageHandler = (data: any) => void;
type ConnectionHandler = () => void;
type ErrorHandler = (error: string) => void;

class WebSocketService {
  private socket: WebSocket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: number | null = null;
  private subscriptions: Map<string, MessageHandler[]> = new Map();
  private connectHandlers: ConnectionHandler[] = [];
  private disconnectHandlers: ConnectionHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];

  /**
   * Connect to the WebSocket server
   */
  connect(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      console.log('WebSocket already connected or connecting');
      return;
    }

    try {
      // Determine WebSocket URL based on current location
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      this.socket = new WebSocket(wsUrl);
      
      this.socket.onopen = this.handleOpen.bind(this);
      this.socket.onclose = this.handleClose.bind(this);
      this.socket.onerror = this.handleError.bind(this);
      this.socket.onmessage = this.handleMessage.bind(this);
      
      console.log('WebSocket connecting to', wsUrl);
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
      this.notifyErrorHandlers('Failed to connect to WebSocket server');
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    this.isConnected = false;
    this.reconnectAttempts = 0;
  }

  /**
   * Subscribe to a specific event
   */
  subscribe(event: string, handler: MessageHandler): void {
    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, []);
    }
    
    this.subscriptions.get(event)?.push(handler);
  }

  /**
   * Unsubscribe from a specific event
   */
  unsubscribe(event: string, handler?: MessageHandler): void {
    if (!handler) {
      // Remove all handlers for this event
      this.subscriptions.delete(event);
      return;
    }
    
    const handlers = this.subscriptions.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
      
      if (handlers.length === 0) {
        this.subscriptions.delete(event);
      }
    }
  }

  /**
   * Send a message to the server
   */
  send(event: string, data: any): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error('Cannot send message, WebSocket is not connected');
      return;
    }
    
    const message = {
      event,
      data
    };
    
    this.socket.send(JSON.stringify(message));
  }

  /**
   * Register a handler for connection events
   */
  onConnect(handler: ConnectionHandler): void {
    this.connectHandlers.push(handler);
    
    // If already connected, call the handler immediately
    if (this.isConnected) {
      handler();
    }
  }

  /**
   * Register a handler for disconnection events
   */
  onDisconnect(handler: ConnectionHandler): void {
    this.disconnectHandlers.push(handler);
  }

  /**
   * Register a handler for error events
   */
  onError(handler: ErrorHandler): void {
    this.errorHandlers.push(handler);
  }

  /**
   * Handle WebSocket open event
   */
  private handleOpen(): void {
    console.log('WebSocket connected');
    this.isConnected = true;
    this.reconnectAttempts = 0;
    this.notifyConnectHandlers();
  }

  /**
   * Handle WebSocket close event
   */
  private handleClose(event: CloseEvent): void {
    console.log('WebSocket disconnected:', event.code, event.reason);
    this.isConnected = false;
    this.notifyDisconnectHandlers();
    
    // Attempt to reconnect if not a clean close
    if (event.code !== 1000) {
      this.attemptReconnect();
    }
  }

  /**
   * Handle WebSocket error event
   */
  private handleError(event: Event): void {
    console.error('WebSocket error:', event);
    this.notifyErrorHandlers('WebSocket connection error');
    
    // Error usually followed by close, but just in case
    if (this.isConnected) {
      this.isConnected = false;
      this.notifyDisconnectHandlers();
      this.attemptReconnect();
    }
  }

  /**
   * Handle WebSocket message event
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data);
      
      if (message && message.event) {
        const handlers = this.subscriptions.get(message.event);
        if (handlers) {
          handlers.forEach(handler => {
            try {
              handler(message.data);
            } catch (error) {
              console.error(`Error in handler for event ${message.event}:`, error);
            }
          });
        }
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  /**
   * Attempt to reconnect to the WebSocket server
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Maximum reconnect attempts reached');
      return;
    }
    
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
    
    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  /**
   * Notify all connection handlers
   */
  private notifyConnectHandlers(): void {
    this.connectHandlers.forEach(handler => {
      try {
        handler();
      } catch (error) {
        console.error('Error in connect handler:', error);
      }
    });
  }

  /**
   * Notify all disconnection handlers
   */
  private notifyDisconnectHandlers(): void {
    this.disconnectHandlers.forEach(handler => {
      try {
        handler();
      } catch (error) {
        console.error('Error in disconnect handler:', error);
      }
    });
  }

  /**
   * Notify all error handlers
   */
  private notifyErrorHandlers(errorMessage: string): void {
    this.errorHandlers.forEach(handler => {
      try {
        handler(errorMessage);
      } catch (error) {
        console.error('Error in error handler:', error);
      }
    });
  }
}

// Export a singleton instance
export const websocketService = new WebSocketService();