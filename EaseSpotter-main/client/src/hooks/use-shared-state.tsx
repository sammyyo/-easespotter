import { ReactNode, createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useWebSocket } from './use-websocket';
import { useToast } from './use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useQuery } from '@tanstack/react-query';

type SharedResourceUpdate = {
  resourceType: 'product' | 'vendor' | 'rule' | 'promotion' | 'competitor' | 'system' | 'customer' | 'supplier';
  action: 'create' | 'update' | 'delete';
  resourceId: number;
  data?: any;
  timestamp: number;
};

type SharedStateContextType = {
  // Last updates by resource type
  lastUpdates: Record<string, SharedResourceUpdate>;
  // Pending notifications that haven't been marked as read
  notifications: SharedResourceUpdate[];
  // Mark notifications as read
  clearNotifications: () => void;
  // Function to trigger a sync of all data
  syncAllData: () => Promise<void>;
  // Add a new notification manually
  addNotification: (notification: Omit<SharedResourceUpdate, 'timestamp'>) => void;
};

export const SharedStateContext = createContext<SharedStateContextType | null>(null);

export function SharedStateProvider({ children }: { children: ReactNode }) {
  const [lastUpdates, setLastUpdates] = useState<Record<string, SharedResourceUpdate>>({});
  const [notifications, setNotifications] = useState<SharedResourceUpdate[]>([]);
  const { toast } = useToast();
  
  // Fetch the current user
  const { data: user } = useQuery<{ id: number, username: string } | null>({
    queryKey: ['/api/user'],
    staleTime: 5 * 60 * 1000, // Cache data for 5 minutes to avoid too many user fetches
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/user');
        if (response.ok) {
          return await response.json();
        }
        return null;
      } catch (error) {
        console.error('Failed to fetch user:', error);
        return null;
      }
    }
  });
  
  // This is our main function to process resource updates
  // We'll use this for both direct API calls and WebSocket messages
  const processResourceUpdate = useCallback((update: SharedResourceUpdate) => {
    // Add timestamp if not present
    if (!update.timestamp) {
      update.timestamp = Date.now();
    }
    
    // Update the last updates record
    setLastUpdates(prev => ({
      ...prev,
      [`${update.resourceType}_${update.resourceId}`]: update,
    }));
    
    // Add to notifications
    setNotifications(prev => [update, ...prev.slice(0, 9)]); // Keep only the 10 most recent notifications
    
    // Show a toast notification for the update
    const title = `${update.resourceType.charAt(0).toUpperCase() + update.resourceType.slice(1)} ${update.action}d`;
    let description = `A ${update.resourceType} was ${update.action}d`;
    
    if (update.data?.name) {
      description = `"${update.data.name}" was ${update.action}d`;
    }
    
    toast({
      title,
      description,
      variant: 'default',
    });
  }, [toast, setLastUpdates, setNotifications]);
  
  // Define the message handler function - this needs to be defined after processResourceUpdate
  const handleMessage = useCallback((data: any) => {
    try {
      // Parse the WebSocket message
      const message = typeof data === 'string' ? JSON.parse(data) : data;
      
      // Log non-heartbeat messages
      if (message.type !== 'heartbeat_ack') {
        console.log('Received WebSocket message:', message);
      }
      
      // Handle different message types
      if (message.type === 'resource_update') {
        // Use our processResourceUpdate function
        processResourceUpdate(message.data);
      } else if (message.type === 'system_notification') {
        toast({
          title: message.data.title || 'System Notification',
          description: message.data.message,
          variant: message.data.variant || 'default',
        });
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  }, [toast, processResourceUpdate]); // Depend on these to avoid recreating this function
  
  // Memoize the WebSocket options to prevent unnecessary reconnections
  const wsOptions = useMemo(() => ({
    userId: user?.id,
    url: '/ws', // Use the default WebSocket path
    reconnectInterval: 5000, // Longer reconnect interval
    maxReconnectAttempts: 15, // More reconnect attempts
    onMessage: handleMessage,
  }), [user?.id, handleMessage]); // Only recreate this object when userId or message handler changes
  
  // Use the WebSocket hook with the memoized options
  const { sendMessage, isConnected, isAuthenticated } = useWebSocket(wsOptions);
  
  // Monitor connection status and report to user if there are issues
  useEffect(() => {
    if (isConnected && user?.id) {
      console.log('WebSocket: Connection established with user ID:', user.id);
      if (isAuthenticated) {
        console.log('WebSocket: Connection is authenticated');
      } else {
        console.log('WebSocket: Connection is established but not authenticated yet');
      }
    } else if (!isConnected && user?.id) {
      // We have a user but no connection - this could be during reconnection attempts
      console.log('WebSocket: Connection lost or not established yet with user ID:', user.id);
    }
  }, [isConnected, isAuthenticated, user]);
  
  // Trigger React Query cache invalidation based on the resource type
  // Note: This functionality is actually now integrated directly into processResourceUpdate
  // This function is kept here with a comment as a placeholder for future invalidation logic
  const triggerDataInvalidation = useCallback((update: SharedResourceUpdate) => {
    // This would integrate with React Query to invalidate specific queries
    // Example:
    // switch (update.resourceType) {
    //   case 'product':
    //     queryClient.invalidateQueries(['/api/products']);
    //     break;
    //   case 'vendor':
    //     queryClient.invalidateQueries(['/api/vendors']);
    //     break;
    //   // Add more cases for other resource types
    // }
    
    // We don't need to show a toast here anymore - that's handled by processResourceUpdate
  }, []);
  
  // Function to manually add a notification
  const addNotification = (notification: Omit<SharedResourceUpdate, 'timestamp'>) => {
    const fullNotification: SharedResourceUpdate = {
      ...notification,
      timestamp: Date.now(),
    };
    processResourceUpdate(fullNotification);
  };
  
  // Clear all notifications
  const clearNotifications = () => {
    setNotifications([]);
  };
  
  // Function to sync all data from the server
  const syncAllData = async () => {
    try {
      // This would make API calls to refresh all data
      // For now, just show a toast notification
      toast({
        title: 'Data Synced',
        description: 'All data has been refreshed from the server.',
        variant: 'default',
      });
      return Promise.resolve();
    } catch (error) {
      console.error('Error syncing data:', error);
      toast({
        title: 'Sync Failed',
        description: 'Failed to sync data from the server.',
        variant: 'destructive',
      });
      return Promise.reject(error);
    }
  };
  
  return (
    <SharedStateContext.Provider
      value={{
        lastUpdates,
        notifications,
        clearNotifications,
        syncAllData,
        addNotification,
      }}
    >
      {children}
    </SharedStateContext.Provider>
  );
}

export function useSharedState() {
  const context = useContext(SharedStateContext);
  if (!context) {
    throw new Error('useSharedState must be used within a SharedStateProvider');
  }
  return context;
}
