import { useEffect, useRef, useCallback, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getWebSocketUrl } from '@/lib/runtime-config';

type MessageHandler = (data: any) => void;

interface WebSocketHookOptions {
  onMessage?: MessageHandler;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  userId?: number;
  url?: string; // Optional URL path to connect to (defaults to /ws)
}

export function useWebSocket(options: WebSocketHookOptions = {}) {
  const { 
    onMessage, 
    reconnectInterval = 3000, 
    maxReconnectAttempts = 15, // Increased from 10 to 15 for more resilience
    userId,
    url = '/ws' // Default WebSocket path
  } = options;
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const authenticatedRef = useRef(false); // Track authentication state
  const userIdRef = useRef<number | undefined>(userId); // Track current userId
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const messageQueueRef = useRef<any[]>([]);
  
  // Track if we're in the process of connecting to prevent multiple connection attempts
  const connectingRef = useRef(false);
  
  // Update userIdRef when userId changes
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);
  
  // Function to send a heartbeat to keep the connection alive
  const sendHeartbeat = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'heartbeat' }));
      } catch (error) {
        console.error('WebSocket: Error sending heartbeat:', error);
      }
    }
  }, []);
  
  // Setup heartbeat interval
  const setupHeartbeat = useCallback(() => {
    // Clear any existing heartbeat
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
    }
    
    // Send a heartbeat every 15 seconds to keep the connection alive
    // Reduced from 30 seconds for more frequent checks
    heartbeatTimerRef.current = setInterval(sendHeartbeat, 15000);
  }, [sendHeartbeat]);
  
  // Function to authenticate with the server
  const authenticate = useCallback((ws: WebSocket) => {
    if (!userIdRef.current) {
      console.warn('WebSocket: No userId available for authentication');
      return false;
    }
    
    if (ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket: Cannot authenticate - socket not open', ws.readyState);
      return false;
    }
    
    try {
      console.log(`WebSocket: Authenticating with userId ${userIdRef.current}`);
      ws.send(JSON.stringify({
        type: 'authenticate',
        userId: userIdRef.current
      }));
      console.log('WebSocket: Authentication message sent successfully');
      return true;
    } catch (error) {
      console.error('WebSocket: Failed to send authentication message:', error);
      return false;
    }
  }, []);
  
  // Cleanup function to clear all timers
  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);
  
  const connect = useCallback(() => {
    // Don't attempt to connect if we're already in the process of connecting
    if (connectingRef.current) {
      console.log('WebSocket: Already attempting to connect, skipping additional attempt');
      return;
    }
    
    // Always require a userId for connection and authentication
    if (!userIdRef.current) {
      console.log('WebSocket: Waiting for valid userId before connecting');
      return;
    }
    
    connectingRef.current = true;
    
    // Don't attempt to reconnect if we've hit the max attempts
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.warn(`WebSocket: Max reconnect attempts (${maxReconnectAttempts}) reached. Giving up.`);
      clearTimers();
      
      // Make one last attempt to show an error toast to inform the user
      if (isConnected) {
        setIsConnected(false);
        toast({
          title: 'Connection Lost',
          description: 'Lost connection to the server. Please reload the page.',
          variant: 'destructive',
        });
      }
      return;
    }

    try {
      // Close existing connection if any
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      
      // Reset authentication state
      authenticatedRef.current = false;
      
      // Create new connection with correct protocol
      const wsUrl = getWebSocketUrl(url);
      
      console.log(`WebSocket: Connecting to ${wsUrl}`);
      const ws = new WebSocket(wsUrl);
      
      // Add debugging for connection issues
      console.log('WebSocket: Connection state:', ws.readyState);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket: Connection established');
        // Reset connection attempt tracking
        setIsConnected(true);
        connectingRef.current = false;
        reconnectAttemptsRef.current = 0; // Reset reconnect counter on success
        
        // Setup the heartbeat right away
        setupHeartbeat();
        
        if (userIdRef.current) {
          console.log(`WebSocket: Connection established with user ID:`, userIdRef.current);
        }
        
        // Add longer delay before authentication to ensure the connection is fully established
        setTimeout(() => {
          // Only authenticate if we're still the current connection
          if (wsRef.current === ws) {
            authenticate(ws);
          }
          
          // Process any queued messages after authentication
          setTimeout(() => {
            if (messageQueueRef.current.length > 0 && ws.readyState === WebSocket.OPEN && wsRef.current === ws) {
              console.log(`WebSocket: Processing ${messageQueueRef.current.length} queued message(s)`);
              const messagesToSend = [...messageQueueRef.current];
              messageQueueRef.current = [];
              
              messagesToSend.forEach(msg => {
                try {
                  ws.send(JSON.stringify(msg));
                } catch (error) {
                  console.error('WebSocket: Error sending queued message:', error);
                  // Add back to queue if failed
                  messageQueueRef.current.push(msg);
                }
              });
            }
          }, 200); // Wait a bit after authentication before sending messages
        }, 300); // Delay before authentication
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Don't log heartbeat responses to reduce console noise
          if (data.type !== 'heartbeat_ack') {
            console.log('WebSocket received:', data);
          }

          // Handle different message types
          switch (data.type) {
            case 'connection_established':
              console.log('WebSocket: Server acknowledged connection');
              break;
            case 'authentication_success':
              authenticatedRef.current = true;
              console.log(`WebSocket: Authentication successful for user ${data.data?.userId}`);
              // Only show toast for initial connection, not reconnects
              // and not when switching pages that use the same WebSocket hook
              const isFirstConnection = !window.localStorage.getItem('websocket_connected');
              if (isFirstConnection) {
                window.localStorage.setItem('websocket_connected', 'true');
                toast({
                  title: 'Connected',
                  description: 'Real-time updates are now active',
                });
              }
              break;
            case 'authentication_error':
              console.error(`WebSocket: Authentication failed: ${data.message}`);
              authenticatedRef.current = false;
              toast({
                title: 'Connection Error',
                description: 'Failed to authenticate for real-time updates',
                variant: 'destructive',
              });
              
              // Retry authentication after a short delay
              setTimeout(() => {
                if (wsRef.current === ws && ws.readyState === WebSocket.OPEN) {
                  authenticate(ws);
                }
              }, 2000);
              break;
            case 'auth_required':
            case 'auth_warning':
              console.warn(`WebSocket: Auth warning: ${data.message}`);
              // If we get a warning but authentication failed, try again
              if (!authenticatedRef.current && ws.readyState === WebSocket.OPEN) {
                setTimeout(() => authenticate(ws), 1000);
              }
              break;
            case 'heartbeat_ack':
              // Server acknowledged our heartbeat
              break;
            default:
              // Process all other message types with the custom handler
              break;
          }

          // Call custom message handler if provided
          if (onMessage) {
            onMessage(data);
          }
        } catch (error) {
          console.error('WebSocket: Failed to parse message:', error);
        }
      };

      ws.onclose = (event) => {
        // Only update state if this is the current websocket
        if (wsRef.current === ws) {
          setIsConnected(false);
          wsRef.current = null;
          authenticatedRef.current = false;
          
          // Clear the heartbeat interval
          if (heartbeatTimerRef.current) {
            clearInterval(heartbeatTimerRef.current);
            heartbeatTimerRef.current = null;
          }
          
          // Reset the connecting flag
          connectingRef.current = false;
          
          if (event.wasClean) {
            console.log(`WebSocket: Closed cleanly, code=${event.code}, reason=${event.reason}`);
          } else {
            console.warn('WebSocket: Connection died unexpectedly');
            reconnectAttemptsRef.current += 1;
            console.log(`WebSocket: Reconnect attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts}`);
            
            if (reconnectAttemptsRef.current < maxReconnectAttempts) {
              // Exponential backoff for reconnection with progressive delay
              // but with an upper limit to prevent extremely long delays
              const baseDelay = Math.min(
                reconnectInterval * Math.pow(1.5, reconnectAttemptsRef.current - 1),
                30000 // Max delay of 30 seconds
              );
              // Add some randomization to prevent all clients from reconnecting simultaneously
              const jitter = Math.random() * 2000;
              const delay = baseDelay + jitter;
              console.log(`WebSocket: Attempting to reconnect in ${Math.round(delay)}ms`);
              
              // Store the timer reference for cleanup
              reconnectTimerRef.current = setTimeout(() => {
                reconnectTimerRef.current = null;
                connect();
              }, delay);
            } else {
              console.warn('WebSocket: Max reconnect attempts reached. Will not try to reconnect.');
              // Reset count after waiting a while to allow future reconnects
              setTimeout(() => {
                reconnectAttemptsRef.current = 0;
              }, 60000); // Wait a minute before allowing reconnects again
              
              // Only show the toast if we were previously connected (to avoid spamming)
              toast({
                title: 'Connection Issue',
                description: 'Unable to maintain real-time connection. Please reload the page.',
                variant: 'destructive',
              });
            }
          }
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        // Don't close here - let the onclose handler deal with reconnection
      };
    } catch (error) {
      console.error('WebSocket: Error creating connection:', error);
      // Reset the connecting flag
      connectingRef.current = false;
      
      reconnectAttemptsRef.current += 1;
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        // Exponential backoff with jitter for connection errors as well
        const baseDelay = Math.min(
          reconnectInterval * Math.pow(1.5, reconnectAttemptsRef.current - 1),
          30000 // Max delay of 30 seconds
        );
        const jitter = Math.random() * 2000;
        const delay = baseDelay + jitter;
        console.log(`WebSocket: Error during connection, will retry in ${Math.round(delay)}ms`);
        
        // Store the timer reference for cleanup
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          connect();
        }, delay);
      } else {
        console.warn('WebSocket: Max reconnect attempts reached. Will not try to reconnect.');
        // Reset count after waiting a while to allow future reconnects
        setTimeout(() => {
          reconnectAttemptsRef.current = 0;
        }, 60000); // Wait a minute before allowing reconnects again
        
        // Only show the toast if we were previously connected (to avoid spamming)
        if (isConnected) {
          setIsConnected(false);
          toast({
            title: 'Connection Issue',
            description: 'Unable to establish real-time connection. Please reload the page.',
            variant: 'destructive',
          });
        }
      }
    }
  }, [onMessage, reconnectInterval, maxReconnectAttempts, toast, url, isConnected, clearTimers, setupHeartbeat, authenticate]);

  useEffect(() => {
    // Don't try to connect without a userId
    if (userId !== undefined && userId > 0) {
      console.log('WebSocket: Initial connection attempt with userId:', userId);
      // Reset reconnect attempts when userId changes
      reconnectAttemptsRef.current = 0;
      connect();
    } else {
      console.log('WebSocket: Waiting for valid userId before connecting');
    }
    
    return () => {
      clearTimers();
      
      if (wsRef.current) {
        console.log('WebSocket: Component unmounting, closing connection');
        // Use 1000 (Normal Closure) code for clean disconnection
        try {
          wsRef.current.close(1000, 'Component unmounted');
        } catch (error) {
          console.error('Error closing WebSocket:', error);
        }
        wsRef.current = null;
      }
      // Also clear any reconnection attempts
      connectingRef.current = false;
      authenticatedRef.current = false;
    };
  }, [connect, userId, clearTimers]);

  const sendMessage = useCallback((message: any) => {
    // If connected, send immediately
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        console.log('WebSocket: Sending message:', message);
        wsRef.current.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('WebSocket: Error sending message:', error);
        // Queue the message for retry
        messageQueueRef.current.push(message);
        // Try to reconnect
        connect();
        return false;
      }
    } else {
      // Otherwise queue the message for when connection is established
      console.log('WebSocket: Not connected, queueing message:', message);
      messageQueueRef.current.push(message);
      
      // If we're not connected and not attempting to connect, try to connect now
      if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
        connect();
      }
      return false;
    }
  }, [connect]);

  return { 
    sendMessage, 
    isConnected,
    isAuthenticated: authenticatedRef.current
  };
}
