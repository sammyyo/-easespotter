import { useQuery } from "@tanstack/react-query";
import StatsGrid from "@/components/dashboard/StatsGrid";
import PriceUpdateCard from "@/components/dashboard/PriceUpdateCard";
import CircularProgressDemo from "@/components/dashboard/CircularProgressDemo";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, Area, AreaChart 
} from 'recharts';
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from "lucide-react";
import { 
  CircularStat, 
  CircularStatGroup 
} from "@/components/ui/circular-stat";
import { PROGRESS_COLORS } from "@/components/ui/circular-progress";
import { useCurrency } from "@/hooks/use-currency";
import { buildDashboardMetrics } from "@/lib/dashboard-metrics";

export default function Dashboard() {
  const { data: priceChanges = [], isLoading: isLoadingChanges } = useQuery({
    queryKey: ["/api/analytics/price-changes"],
    initialData: []
  });

  const { data: products = [], isLoading: isLoadingProducts } = useQuery({
    queryKey: ["/api/products"],
    initialData: []
  });

  const { data: performanceMetrics = [], isLoading: isLoadingPerformanceMetrics } = useQuery({
    queryKey: ["/api/analytics/performance-metrics?period=monthly"],
    initialData: []
  });

  if (isLoadingChanges || isLoadingProducts || isLoadingPerformanceMetrics) {
    return <div className="space-y-4">
      <Skeleton className="h-[200px] w-full" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-[100px]" />
        ))}
      </div>
    </div>;
  }

  const dashboardMetrics = buildDashboardMetrics(products, priceChanges, performanceMetrics);

  const recentPriceChanges = dashboardMetrics.recentPriceChanges.map((change: any) => ({
    date: new Date(change.timestamp).toLocaleDateString(),
    value: Number(change.newPrice),
    change: ((Number(change.newPrice) - Number(change.oldPrice)) / Number(change.oldPrice) * 100).toFixed(2)
  }));

  // Calculate overall trend
  const firstPrice = recentPriceChanges.length > 0 ? Number(recentPriceChanges[0].value) : 0;
  const lastPrice = recentPriceChanges.length > 0 ? Number(recentPriceChanges[recentPriceChanges.length - 1].value) : 0;
  const trend = recentPriceChanges.length > 1 && firstPrice > 0
    ? ((lastPrice - firstPrice) / firstPrice) * 100
    : 0;

  const { currency } = useCurrency();
  const formatCompactCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
      notation: Math.abs(value) >= 10000 ? "compact" : "standard",
    }).format(value);
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">
              Monitor your store's performance and price changes
            </p>
          </div>
        </div>
      </div>

      <StatsGrid products={products} priceChanges={priceChanges} />

      {/* Key Performance Indicators */}
      <Card>
        <CardHeader>
          <CardTitle>Key Performance Indicators</CardTitle>
          <CardDescription>Store performance at a glance</CardDescription>
        </CardHeader>
        <CardContent>
          <CircularStatGroup>
            {dashboardMetrics.kpis.map((metric, index) => (
              <CircularStat
                key={metric.label}
                value={metric.value}
                label={metric.label}
                description={metric.description}
                color={[
                  PROGRESS_COLORS.green,
                  PROGRESS_COLORS.orange,
                  PROGRESS_COLORS.cyan,
                  PROGRESS_COLORS.purple,
                ][index]}
                valueFormatter={(value) => `${Math.round(value)}%`}
              />
            ))}
          </CircularStatGroup>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle>Price Trend Analysis</CardTitle>
              <CardDescription>30-day price movement analysis</CardDescription>
            </div>
            <Badge variant={trend >= 0 ? "default" : "destructive"} className="ml-2">
              {trend >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {Math.abs(trend).toFixed(2)}%
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={recentPriceChanges} margin={{ top: 12, right: 24, left: 8, bottom: 12 }}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF9500" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#FF9500" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'currentColor', fontSize: 12 }}
                    tickMargin={10}
                    minTickGap={18}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    width={64}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'currentColor', fontSize: 12 }}
                    tickFormatter={(value) => formatCompactCurrency(Number(value))}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => formatCurrency(Number(value))}
                  />
                  <Legend verticalAlign="top" align="right" height={32} wrapperStyle={{ fontSize: 12 }} />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#FF9500" // Bright Orange
                    fillOpacity={1}
                    fill="url(#colorValue)"
                    name="Price"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <PriceUpdateCard />
      </div>
      
      {/* Circular Progress Demo Section */}
      <CircularProgressDemo metrics={dashboardMetrics} />
    </div>
  );
}
