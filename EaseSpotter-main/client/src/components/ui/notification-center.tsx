import { Bell, Check, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useSharedState } from '@/hooks/use-shared-state';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type SavedNotification = {
  id: number;
  title: string;
  message: string;
  type: string;
  isRead: boolean | null;
  createdAt: string;
};

export function NotificationCenter() {
  const queryClient = useQueryClient();
  const { notifications: liveNotifications, clearNotifications } = useSharedState();
  const { data: savedNotifications = [] } = useQuery<SavedNotification[]>({
    queryKey: ['/api/stores/notifications'],
  });
  const unreadSavedNotifications = savedNotifications.filter((notification) => !notification.isRead);
  const hasNotifications = liveNotifications.length > 0 || unreadSavedNotifications.length > 0;
  const notificationCount = liveNotifications.length + unreadSavedNotifications.length;

  const markNotificationReadMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      const response = await apiRequest('PATCH', `/api/stores/notifications/${notificationId}/read`);

      if (!response.ok) {
        throw new Error('Failed to mark notification as read');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stores/notifications'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(
        unreadSavedNotifications.map(async (notification) => {
          const response = await apiRequest('PATCH', `/api/stores/notifications/${notification.id}/read`);

          if (!response.ok) {
            throw new Error('Failed to mark all notifications as read');
          }
        })
      );
    },
    onSuccess: () => {
      clearNotifications();
      queryClient.invalidateQueries({ queryKey: ['/api/stores/notifications'] });
    },
  });

  // Function to format timestamp for display
  const formatTime = (timestamp: number | string) => {
    const now = Date.now();
    const time = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
    const diff = now - time;
    
    // Less than a minute
    if (diff < 60 * 1000) {
      return 'Just now';
    }
    
    // Less than an hour
    if (diff < 60 * 60 * 1000) {
      const minutes = Math.floor(diff / (60 * 1000));
      return `${minutes}m ago`;
    }
    
    // Less than a day
    if (diff < 24 * 60 * 60 * 1000) {
      const hours = Math.floor(diff / (60 * 60 * 1000));
      return `${hours}h ago`;
    }
    
    // Otherwise just show the date
    const date = new Date(time);
    return date.toLocaleDateString();
  };

  // Function to get notification text based on type
  const getNotificationText = (notification: any) => {
    const { resourceType, action, data } = notification;
    
    const name = data?.name || 'Item';
    const resourceName = resourceType.charAt(0).toUpperCase() + resourceType.slice(1);
    
    switch (action) {
      case 'create':
        return `New ${resourceName}: ${name} was created`;
      case 'update':
        return `${resourceName}: ${name} was updated`;
      case 'delete':
        return `${resourceName}: ${name} was deleted`;
      default:
        return `${resourceName} notification: ${name}`;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="relative">
        <div className={cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'relative rounded-full'
        )}>
          <Bell className="h-5 w-5" />
          {hasNotifications && (
            <Badge 
              variant="destructive" 
              className="absolute top-0 right-0 px-1 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] translate-x-1/2 -translate-y-1/3"
            >
              {notificationCount}
            </Badge>
          )}
        </div>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="w-[300px] p-0">
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <h2 className="font-semibold">Notifications</h2>
          {hasNotifications && (
            <button 
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <Check className="h-3 w-3" />
              <span>Mark all as read</span>
            </button>
          )}
        </div>
        
        <div className="max-h-[300px] overflow-y-auto">
          {!hasNotifications ? (
            <div className="p-4 text-center text-muted-foreground">
              <p>No new notifications</p>
            </div>
          ) : (
            <ul>
              {unreadSavedNotifications.map((notification) => (
                <li key={`saved-${notification.id}`} className="border-b last:border-b-0">
                  <div className="p-3 hover:bg-muted cursor-pointer flex justify-between gap-2 items-start">
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {notification.title}
                      </p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTime(notification.createdAt)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        markNotificationReadMutation.mutate(notification.id);
                      }}
                      className="opacity-70 hover:opacity-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
              {liveNotifications.map((notification) => (
                <li key={notification.timestamp} className="border-b last:border-b-0">
                  <div className="p-3 hover:bg-muted cursor-pointer flex justify-between gap-2 items-start">
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {getNotificationText(notification)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTime(notification.timestamp)}
                      </p>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        clearNotifications();
                      }} 
                      className="opacity-70 hover:opacity-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
