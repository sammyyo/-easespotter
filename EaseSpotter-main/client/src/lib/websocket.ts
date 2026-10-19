import { getWebSocketUrl } from "./runtime-config";

let socket: WebSocket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 1000; // Start with 1 second delay

export function setupWebSocket() {
  if (socket?.readyState === WebSocket.OPEN) return socket;

  let wsUrl;
  
  // Use the current window URL to determine the WebSocket URL
  try {
    // Get the host from the current window location
    wsUrl = getWebSocketUrl("/ws");
    console.log('Attempting WebSocket connection to:', wsUrl);
  } catch (error) {
    console.error('Error creating WebSocket URL:', error);
    return null;
  }

  try {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('WebSocket connected');
      reconnectAttempts = 0;
    };

    socket.onclose = () => {
      console.log('WebSocket disconnected');
      socket = null;
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = RECONNECT_DELAY * Math.pow(2, reconnectAttempts);
        console.log(`Attempting reconnection in ${delay}ms...`);
        setTimeout(() => {
          reconnectAttempts++;
          setupWebSocket();
        }, delay);
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return socket;
  } catch (error) {
    console.error('Failed to create WebSocket connection:', error);
    return null;
  }
}

export function getSocket() {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return setupWebSocket();
  }
  return socket;
}

export function sendMessage(type: string, data?: any) {
  const socket = getSocket();
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, data }));
  } else {
    console.warn('WebSocket not connected, message not sent:', { type, data });
  }
}
