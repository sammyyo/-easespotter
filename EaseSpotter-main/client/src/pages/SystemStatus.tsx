import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, SunMoon } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ThemeScheduler } from "@/components/ui/theme-scheduler";
import { useState, useEffect } from "react";

interface SystemStatus {
  status: 'healthy' | 'degraded' | 'down';
  services: {
    database: boolean;
    websocket: boolean;
    api: boolean;
  };
  metrics: {
    uptime: string;
    errorRate: number;
    responseTime: number;
  };
  systemMetrics: {
    loadAverage: number[];
    memory: {
      used: number;
      total: number;
    };
  };
}

export default function SystemStatus() {
  const { data: status, isLoading, error } = useQuery<SystemStatus>({
    queryKey: ["/api/system/status"],
    initialData: undefined,
    retry: 2,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
  
  // State to track current theme information
  const [currentTheme, setCurrentTheme] = useState<string>('system');
  const [systemPreference, setSystemPreference] = useState<string>('light');
  
  // Effect to detect and update theme information
  useEffect(() => {
    // Get current theme from localStorage
    const savedTheme = localStorage.getItem('theme') || 'system';
    setCurrentTheme(savedTheme);
    
    // Detect system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setSystemPreference(prefersDark ? 'dark' : 'light');
    
    // Listen for changes in system preferences
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPreference(e.matches ? 'dark' : 'light');
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const getOverallStatusColor = (status?: 'healthy' | 'degraded' | 'down') => {
    switch (status) {
      case 'healthy':
        return 'bg-green-500';
      case 'degraded':
        return 'bg-yellow-500';
      case 'down':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">System Status</h1>
        <div className="grid gap-4">
          <Skeleton className="h-[200px] w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-[100px]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    const isForbiddenError = (error as any)?.response?.status === 403 || 
                             (error as Error)?.message?.includes('Forbidden') ||
                             (error as Error)?.message?.includes('403');
    
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">System Status</h1>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {isForbiddenError ? 
              "Access Denied: Admin role required to view system status." : 
              "Failed to fetch system status. Please try again later."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Mock data for historical metrics
  const historicalMetrics = Array.from({ length: 24 }, (_, i) => ({
    time: `${23-i}:00`,
    responseTime: Math.random() * 100 + 100,
    errorRate: Math.random() * 2,
  })).reverse();

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">System Status</h1>

      {/* Theme Settings Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SunMoon className="h-5 w-5" />
              <CardTitle>Theme Settings</CardTitle>
            </div>
            <ThemeToggle />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <span>Current Theme</span>
                <span className="font-medium capitalize">{currentTheme}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>System Preference</span>
                <span className="font-medium capitalize">{systemPreference}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Applied Theme</span>
                <span className="font-medium capitalize">
                  {currentTheme === 'system' ? systemPreference : currentTheme}
                </span>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              The current theme can be changed using the toggle above or in the user menu.
              When set to "system", the theme will automatically adapt to your device's settings.
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Theme Scheduler */}
      <ThemeScheduler />

      {/* Overall System Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className={`h-3 w-3 rounded-full ${getOverallStatusColor(status?.status)}`} />
            <CardTitle>
              System Status: {status?.status?.charAt(0).toUpperCase()}{status?.status?.slice(1) || 'Unknown'}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            {/* Response Time Chart */}
            <div className="grid gap-4">
              <h3 className="font-semibold">Response Time (24h)</h3>
              <div className="h-[220px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historicalMetrics} margin={{ top: 12, right: 24, left: 8, bottom: 12 }}>
                    <CartesianGrid 
                      strokeDasharray="3 3" 
                      stroke="hsl(var(--muted-foreground))" 
                      opacity={0.3}
                    />
                    <XAxis
                      dataKey="time"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
                      tickMargin={10}
                      minTickGap={18}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      width={56}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
                      tickFormatter={(value) => `${Number(value).toFixed(0)}ms`}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                        color: 'hsl(var(--foreground))'
                      }}
                      itemStyle={{
                        color: 'hsl(var(--foreground))'
                      }}
                      labelStyle={{
                        color: 'hsl(var(--foreground))',
                        fontWeight: 'bold'
                      }}
                      formatter={(value: number) => [`${Number(value).toFixed(0)}ms`, 'Response Time']}
                    />
                    <Legend verticalAlign="top" align="right" height={28} wrapperStyle={{ fontSize: 12 }} />
                    <Line 
                      type="monotone" 
                      dataKey="responseTime" 
                      stroke="#FF9500" 
                      strokeWidth={2}
                      name="Response Time (ms)"
                      dot={{ fill: '#FF9500', strokeWidth: 0, r: 3 }}
                      activeDot={{ fill: '#FF9500', strokeWidth: 0, r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Error Rate Chart */}
            <div className="grid gap-4">
              <h3 className="font-semibold">Error Rate (24h)</h3>
              <div className="h-[220px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={historicalMetrics} margin={{ top: 12, right: 24, left: 8, bottom: 12 }}>
                    <CartesianGrid 
                      strokeDasharray="3 3" 
                      stroke="hsl(var(--muted-foreground))" 
                      opacity={0.3}
                    />
                    <XAxis
                      dataKey="time"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
                      tickMargin={10}
                      minTickGap={18}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      width={44}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
                      tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                        color: 'hsl(var(--foreground))'
                      }}
                      itemStyle={{
                        color: 'hsl(var(--foreground))'
                      }}
                      labelStyle={{
                        color: 'hsl(var(--foreground))',
                        fontWeight: 'bold'
                      }}
                      formatter={(value: number) => [`${Number(value).toFixed(2)}%`, 'Error Rate']}
                    />
                    <Legend verticalAlign="top" align="right" height={28} wrapperStyle={{ fontSize: 12 }} />
                    <Bar 
                      dataKey="errorRate" 
                      fill="#FF2D55" 
                      name="Error Rate (%)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Performance Metrics */}
            <div className="grid gap-4">
              <h3 className="font-semibold">Performance Metrics</h3>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <span>Uptime</span>
                  <span>{status?.metrics?.uptime || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Error Rate</span>
                  <span>{status?.metrics?.errorRate?.toFixed(2) || 0}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Average Response Time</span>
                  <span>{status?.metrics?.responseTime || 0}ms</span>
                </div>
              </div>
            </div>

            {/* System Metrics */}
            <div className="grid gap-4">
              <h3 className="font-semibold">System Resources</h3>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <span>CPU Load (1m, 5m, 15m)</span>
                  <span>
                    {status?.systemMetrics?.loadAverage?.map(load => load.toFixed(2)).join(', ') || 'N/A'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Memory Usage</span>
                  <span>
                    {status?.systemMetrics?.memory ? 
                      `${status.systemMetrics.memory.used}MB / ${status.systemMetrics.memory.total}MB` : 
                      'N/A'
                    }
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
