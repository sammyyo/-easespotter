import { useState, useEffect, useCallback, useRef } from 'react';
import { getWebSocketUrl } from '@/lib/runtime-config';

type WebSocketStatus = 'connecting' | 'open' | 'closing' | 'closed';

interface UseWebSocketProps {
  url?: string; // Default is '/ws'
  onOpen?: (event: Event) => void;
  onMessage?: (data: any) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  reconnectInterval?: number;
  reconnectAttempts?: number;
  manualConnect?: boolean;
}

// This function also accepts a simple string path parameter
export function useWebSocket(pathOrOptions: string | UseWebSocketProps = {}) {
  // Handle both string and options object
  const options: UseWebSocketProps = typeof pathOrOptions === 'string' 
    ? { url: pathOrOptions } 
    : pathOrOptions;
    
  const {
    url = '/ws',
    onOpen,
    onMessage,
    onClose,
    onError,
    reconnectInterval = 3000,
    reconnectAttempts = 10,
    manualConnect = false,
  } = options;
  
  const [status, setStatus] = useState<WebSocketStatus>('closed');
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const webSocketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const attemptRef = useRef(0);

  // Function to create a WebSocket connection
  const connect = useCallback(() => {
    // Close existing connections
    if (webSocketRef.current) {
      webSocketRef.current.close();
    }

    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    try {
      // Use relative URL if provided without protocol, otherwise use absolute URL
      const wsUrl = url.startsWith('ws://') || url.startsWith('wss://')
        ? url
        : getWebSocketUrl(url);
      
      console.log('Attempting WebSocket connection to:', wsUrl);
      setStatus('connecting');
      
      const socket = new WebSocket(wsUrl);
      webSocketRef.current = socket;

      socket.onopen = (event) => {
        setStatus('open');
        setIsConnected(true);
        attemptRef.current = 0;
        console.log('WebSocket connected');
        onOpen?.(event);
      };

      socket.onmessage = (event) => {
        setLastMessage(event.data);
        onMessage?.(event.data);
      };

      socket.onclose = (event) => {
        setStatus('closed');
        setIsConnected(false);
        console.log('WebSocket disconnected');
        onClose?.(event);

        // Try to reconnect if not explicitly closed by the application
        if (!event.wasClean && attemptRef.current < reconnectAttempts) {
          attemptRef.current += 1;
          console.log(`Attempting reconnection in ${reconnectInterval}ms...`);
          reconnectTimeoutRef.current = setTimeout(connect, reconnectInterval * attemptRef.current);
        }
      };

      socket.onerror = (event) => {
        console.error('WebSocket error:', event);
        onError?.(event);
        // WebSocket onerror is always followed by onclose, so don't reconnect here
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      setStatus('closed');
      setIsConnected(false);

      // Try to reconnect
      if (attemptRef.current < reconnectAttempts) {
        attemptRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(connect, reconnectInterval * attemptRef.current);
      }
    }
  }, [url, onOpen, onMessage, onClose, onError, reconnectInterval, reconnectAttempts]);

  // Manually trigger a connection
  const reconnect = useCallback(() => {
    attemptRef.current = 0;
    connect();
  }, [connect]);

  // Connect on mount unless manual connection is specified
  useEffect(() => {
    if (!manualConnect) {
      connect();
    }

    // Cleanup function to close the WebSocket and clear any timeouts
    return () => {
      if (webSocketRef.current) {
        webSocketRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect, manualConnect]);

  // Function to send messages
  const sendMessage = useCallback((message: string | ArrayBufferLike | Blob | ArrayBufferView) => {
    if (webSocketRef.current && webSocketRef.current.readyState === WebSocket.OPEN) {
      webSocketRef.current.send(message);
      return true;
    }
    return false;
  }, []);

  // Function to close the connection
  const disconnect = useCallback(() => {
    if (webSocketRef.current) {
      webSocketRef.current.close(1000, 'Closed by client');
      setStatus('closing');
    }
  }, []);

  return {
    status,
    isConnected,
    lastMessage,
    sendMessage,
    connect: reconnect, // Use reconnect as the public connect method
    disconnect,
  };
}
