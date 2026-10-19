import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { setupWebSocket, getSocket } from "@/lib/websocket";
import { useCurrency } from "@/hooks/use-currency";

interface PriceUpdate {
  id: number;
  productName: string;
  oldPrice: number;
  newPrice: number;
  timestamp: string;
}

export default function PriceUpdateCard() {
  const [updates, setUpdates] = useState<PriceUpdate[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const { currency } = useCurrency();

  useEffect(() => {
    console.log('PriceUpdateCard mounted - Establishing WebSocket connection');
    
    // Initialize WebSocket connection
    const socket = setupWebSocket();
    
    // Set up reconnection if connection fails initially
    if (!socket) {
      console.log('WebSocket connection failed, retrying in 3 seconds...');
      const retryTimeout = setTimeout(() => {
        const retrySocket = setupWebSocket();
        if (retrySocket) {
          console.log('WebSocket reconnection successful');
        } else {
          console.error('WebSocket reconnection failed');
        }
      }, 3000);
      
      return () => {
        clearTimeout(retryTimeout);
        console.log('PriceUpdateCard unmounted (no socket)');
      };
    }
    
    // Set up socket message handler
    const messageHandler = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'connection_established') {
          setIsConnected(true);
          console.log('WebSocket connection established');
        }
        
        if (message.type === 'price_update') {
          // Add new price update to the list
          setUpdates(prev => [message.data, ...prev].slice(0, 20)); // Keep most recent 20 updates
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };
    
    socket.addEventListener('message', messageHandler);
    
    // Set up connection status listeners
    socket.addEventListener('open', () => {
      setIsConnected(true);
      console.log('WebSocket connection opened');
    });
    
    socket.addEventListener('close', () => {
      setIsConnected(false);
      console.log('WebSocket connection closed');
    });
    
    socket.addEventListener('error', (error) => {
      setIsConnected(false);
      console.error('WebSocket error:', error);
    });
    
    // Cleanup function
    return () => {
      console.log('PriceUpdateCard unmounted');
      socket.removeEventListener('message', messageHandler);
      socket.removeEventListener('open', () => setIsConnected(true));
      socket.removeEventListener('close', () => setIsConnected(false));
      socket.removeEventListener('error', () => setIsConnected(false));
      
      // Don't close the socket here, as it might be used by other components
      // Just remove our event listeners
    };
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Real-time Price Updates</CardTitle>
        <div className="flex items-center space-x-2">
          <div 
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} 
            title={isConnected ? 'Connected' : 'Disconnected'}
          />
          <span className="text-xs text-muted-foreground">
            {isConnected ? 'Live' : 'Offline'}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px]">
          {updates.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Waiting for price updates...
            </p>
          ) : (
            <div className="space-y-4">
              {updates.map((update, index) => (
                <div
                  key={`${update.id}-${index}`}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{update.productName}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(update.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground line-through">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(update.oldPrice)}
                    </span>
                    <span className="font-bold text-green-600">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(update.newPrice)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}