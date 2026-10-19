import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  BarChart as BarChartIcon,
  LineChart as LineChartIcon,
  AlertCircle,
  DatabaseIcon,
  RefreshCw 
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import PerformanceScorecard from "@/components/analytics/PerformanceScorecard";
import TimeSeriesForecast from "@/components/analytics/TimeSeriesForecast";
import { useCurrency } from "@/hooks/use-currency";

interface ProductRecord {
  id: number;
  name: string;
  category?: string | null;
  currentPrice?: string | null;
}

interface CatalogSnapshot {
  id: number;
  vendorId: number;
  snapshotDate: string;
  productCount: number;
  averagePrice: string;
  minPrice: string;
  maxPrice: string;
  totalCatalogValue: string;
  totalInventoryValue: string;
  categoryBreakdown?: Record<string, unknown> | null;
}

interface DailyPricingMovement {
  dateKey: string;
  changedProducts: number;
  avgOldPrice: number;
  avgNewPrice: number;
  avgChangeAmount: number;
  avgChangePercent: number;
}

interface CategoryPricingMovement {
  category: string;
  changes: number;
  avgChangeAmount: number;
  avgChangePercent: number;
}

interface LargestPriceMove {
  id: number;
  productId: number;
  productName: string;
  category: string;
  dateKey: string;
  oldPrice: number;
  newPrice: number;
  changeAmount: number;
  changePercent: number;
}

interface AdvancedPricingAnalytics {
  snapshots: CatalogSnapshot[];
  dailyMovements: DailyPricingMovement[];
  categoryMovements: CategoryPricingMovement[];
  largestMoves: {
    increase: LargestPriceMove | null;
    decrease: LargestPriceMove | null;
  };
  summary: {
    totalChanges: number;
    averageChangeAmount: number;
    averageChangePercent: number;
    priceVolatility: number;
  };
}

const formatDateLabel = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
};

const truncateChartLabel = (label: string, maxLength = 18) =>
  label.length > maxLength ? `${label.slice(0, maxLength - 1)}...` : label;

const AdvancedAnalytics: React.FC = () => {
  useAuth();
  const { toast } = useToast();
  const { currency } = useCurrency();
  const [selectedPeriod, setSelectedPeriod] = useState<string>("monthly");
  // Default to performance tab since competitors tab has been removed
  const [selectedTab, setSelectedTab] = useState<string>("performance");
  const [selectedProductId, setSelectedProductId] = useState<number | undefined>(undefined);
  
  // Fetch product list for filtering
  const { data: products = [], isLoading: isLoadingProducts } = useQuery<ProductRecord[]>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/products");
      return await res.json();
    }
  });

  const pricingQueryKey = selectedProductId
    ? ["/api/analytics/pricing", selectedProductId]
    : ["/api/analytics/pricing"];
  const { data: pricingAnalytics, isLoading: isLoadingPricingAnalytics } = useQuery<AdvancedPricingAnalytics>({
    queryKey: pricingQueryKey,
    queryFn: async () => {
      const url = selectedProductId
        ? `/api/analytics/pricing?productId=${selectedProductId}`
        : "/api/analytics/pricing";
      const res = await apiRequest("GET", url);
      if (!res.ok) throw new Error("Failed to fetch pricing analytics");
      return res.json();
    }
  });
  
  // Fetch performance metrics
  const { data: performanceMetrics, isLoading: isLoadingMetrics } = useQuery({
    queryKey: ["/api/analytics/performance-metrics", selectedPeriod],
    queryFn: async () => {
      const url = selectedProductId 
        ? `/api/analytics/performance-metrics?period=${selectedPeriod}&productId=${selectedProductId}`
        : `/api/analytics/performance-metrics?period=${selectedPeriod}`;
      
      const res = await apiRequest("GET", url);
      return await res.json();
    }
  });
  
  // Fetch forecasts
  const { data: forecasts, isLoading: isLoadingForecasts } = useQuery({
    queryKey: ["/api/analytics/forecasts", selectedProductId],
    queryFn: async () => {
      const url = selectedProductId 
        ? `/api/analytics/forecasts?productId=${selectedProductId}`
        : "/api/analytics/forecasts";
      
      const res = await apiRequest("GET", url);
      return await res.json();
    }
  });
  
  // Competitor trends data is now handled in the Competitors page
  
  // Get queryClient from tanstack/react-query
  const queryClient = useQueryClient();

  const createSnapshotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/analytics/catalog-price-snapshots");
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to capture catalog snapshot");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/pricing"] });
      toast({
        title: "Snapshot captured",
        description: "Today's catalog pricing snapshot has been saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Snapshot failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Function to regenerate sample data
  const handleGenerateSampleData = async () => {
    try {
      // Show loading toast
      toast({
        title: "Generating data",
        description: "This may take a few seconds...",
      });
      
      const response = await apiRequest("POST", "/api/analytics/generate-sample-data");
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error("Failed to generate sample data:", errorData);
        
        // Show toast notification for authentication errors
        if (response.status === 401) {
          toast({
            title: "Authentication Required",
            description: "Please log in to generate sample data",
            variant: "destructive"
          });
          
          // Redirect to auth page after a short delay
          setTimeout(() => {
            window.location.href = "/auth";
          }, 2000);
          return;
        }
        
        toast({
          title: "Error",
          description: errorData.error || "Failed to generate sample data",
          variant: "destructive"
        });
        return;
      }
      
      toast({
        title: "Success",
        description: "Sample data generated successfully. Refreshing data...",
        variant: "default"
      });
      
      // Use React Query's invalidation to trigger refetches of all analytics queries
      try {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["/api/analytics/performance-metrics"] }),
          queryClient.invalidateQueries({ queryKey: ["/api/analytics/forecasts"] }),
          queryClient.invalidateQueries({ queryKey: ["/api/analytics/pricing"] })
        ]);
        
        // Add a short delay to allow queries to revalidate
        setTimeout(() => {
          // Check if we have data after refetching
          const hasData = 
            queryClient.getQueryData(["/api/analytics/performance-metrics", selectedPeriod]) || 
            queryClient.getQueryData(["/api/analytics/forecasts", selectedProductId]);
          
          // If still no data, redirect to reload the page
          if (!hasData) {
            toast({
              title: "Refreshing page",
              description: "Getting the latest analytics data..."
            });
            
            setTimeout(() => {
              window.location.href = window.location.pathname;
            }, 1000);
          }
        }, 500);
      } catch (refetchError) {
        console.error("Error refetching data:", refetchError);
        // If refetching fails, fall back to a full page reload
        toast({
          title: "Reloading page",
          description: "Please wait while we refresh the data..."
        });
        
        setTimeout(() => {
          window.location.href = window.location.pathname;
        }, 1500);
      }
    } catch (error) {
      console.error("Failed to generate sample data:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
    }
  };
  
  // Find selected product name
  const selectedProductName = selectedProductId && products 
    ? products.find(p => p.id === selectedProductId)?.name 
    : undefined;
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  const formatCompactCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  const pricingSummary = pricingAnalytics?.summary ?? {
    totalChanges: 0,
    averageChangeAmount: 0,
    averageChangePercent: 0,
    priceVolatility: 0,
  };
  const dailyPricingData = (pricingAnalytics?.dailyMovements ?? []).map((day) => ({
    date: formatDateLabel(day.dateKey),
    changedProducts: day.changedProducts,
    avgOldPrice: day.avgOldPrice,
    avgNewPrice: day.avgNewPrice,
    avgChangeAmount: day.avgChangeAmount,
    avgChangePercent: day.avgChangePercent,
  }));
  const catalogSnapshotData = (pricingAnalytics?.snapshots ?? []).map((snapshot) => ({
    date: formatDateLabel(String(snapshot.snapshotDate).slice(0, 10)),
    averagePrice: Number(snapshot.averagePrice),
    productCount: snapshot.productCount,
    totalInventoryValue: Number(snapshot.totalInventoryValue),
  }));
  const categoryPricingData = (pricingAnalytics?.categoryMovements ?? []).slice(0, 8);
  const totalChanges = pricingSummary.totalChanges;
  const avgChangeAmount = pricingSummary.averageChangeAmount;
  const avgChangePercent = pricingSummary.averageChangePercent;
  const priceVolatility = pricingSummary.priceVolatility;
  const biggestIncrease = pricingAnalytics?.largestMoves.increase ?? null;
  const biggestDecrease = pricingAnalytics?.largestMoves.decrease ?? null;
  const hasPricingData = totalChanges > 0 || catalogSnapshotData.length > 0;
  
  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Advanced Analytics</h1>
          <p className="text-muted-foreground">
            Comprehensive data analysis and forecasting for your business
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" size="sm" onClick={handleGenerateSampleData}>
            <DatabaseIcon className="h-4 w-4 mr-2" />
            Generate Sample Data
          </Button>
          
          <div className="flex items-center space-x-2">
            <Label htmlFor="period-select" className="sr-only">
              Period
            </Label>
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row gap-4">
        <div className="md:w-2/3">
          <Tabs 
            value={selectedTab} 
            onValueChange={setSelectedTab} 
            className="w-full"
          >
            <TabsList className="grid grid-cols-3 w-full max-w-xl">
              <TabsTrigger value="performance" className="flex items-center">
                <BarChartIcon className="h-4 w-4 mr-2" />
                <span>Performance</span>
              </TabsTrigger>
              <TabsTrigger value="pricing" className="flex items-center">
                <LineChartIcon className="h-4 w-4 mr-2" />
                <span>Pricing</span>
              </TabsTrigger>
              <TabsTrigger value="forecasts" className="flex items-center">
                <LineChartIcon className="h-4 w-4 mr-2" />
                <span>Forecasts</span>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="performance" className="pt-4">
              {isLoadingMetrics ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-1/3" />
                  <Skeleton className="h-[400px] w-full" />
                </div>
              ) : (
                <PerformanceScorecard 
                  metrics={performanceMetrics || []} 
                  isLoading={isLoadingMetrics}
                  selectedPeriod={selectedPeriod}
                />
              )}
            </TabsContent>

            <TabsContent value="pricing" className="pt-4">
              {isLoadingPricingAnalytics || isLoadingProducts ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, index) => (
                      <Skeleton key={index} className="h-28 w-full" />
                    ))}
                  </div>
                  <Skeleton className="h-[360px] w-full" />
                  <Skeleton className="h-[360px] w-full" />
                </div>
              ) : !hasPricingData ? (
                <Card>
                  <CardContent className="py-10">
                    <div className="text-center text-muted-foreground">
                      <LineChartIcon className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p className="font-medium text-foreground">No advanced pricing data yet</p>
                      <p className="text-sm max-w-md mx-auto">
                        Capture a catalog snapshot to start tracking current prices, then price updates will add movement data.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4"
                        onClick={() => createSnapshotMutation.mutate()}
                        disabled={createSnapshotMutation.isPending}
                      >
                        {createSnapshotMutation.isPending ? "Capturing..." : "Capture Today"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Total price changes</CardDescription>
                        <CardTitle className="text-2xl">{totalChanges}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Average change</CardDescription>
                        <CardTitle className="text-2xl">{formatCurrency(avgChangeAmount)}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Average change percent</CardDescription>
                        <CardTitle className="text-2xl">{avgChangePercent.toFixed(1)}%</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Price volatility</CardDescription>
                        <CardTitle className="text-2xl">{priceVolatility.toFixed(1)}%</CardTitle>
                      </CardHeader>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div>
                          <CardTitle>Catalog Price Snapshot Trend</CardTitle>
                          <CardDescription>
                            Daily snapshots of average catalog price and product count.
                          </CardDescription>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => createSnapshotMutation.mutate()}
                          disabled={createSnapshotMutation.isPending}
                        >
                          {createSnapshotMutation.isPending ? "Capturing..." : "Capture Today"}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="h-[340px] min-w-0">
                      {catalogSnapshotData.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-center text-muted-foreground">
                          <div>
                            <LineChartIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="font-medium text-foreground">No catalog snapshots yet</p>
                            <p className="text-sm">Capture today to start tracking catalog price movement.</p>
                          </div>
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={catalogSnapshotData} margin={{ top: 12, right: 24, left: 8, bottom: 12 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis
                              dataKey="date"
                              tickLine={false}
                              axisLine={false}
                              tick={{ fontSize: 11 }}
                              tickMargin={10}
                              minTickGap={18}
                              interval="preserveStartEnd"
                            />
                            <YAxis
                              yAxisId="price"
                              width={64}
                              tickLine={false}
                              axisLine={false}
                              tick={{ fontSize: 11 }}
                              tickFormatter={(value) => formatCompactCurrency(Number(value))}
                            />
                            <YAxis
                              yAxisId="count"
                              orientation="right"
                              width={44}
                              tickLine={false}
                              axisLine={false}
                              tick={{ fontSize: 11 }}
                              allowDecimals={false}
                            />
                            <Tooltip
                              formatter={(value, name) => {
                                if (name === "Product count") return [Number(value).toLocaleString(), name];
                                return [formatCurrency(Number(value)), name];
                              }}
                            />
                            <Legend verticalAlign="top" align="right" height={32} wrapperStyle={{ fontSize: 12 }} />
                            <Bar
                              yAxisId="count"
                              dataKey="productCount"
                              name="Product count"
                              fill="#4472C4"
                              radius={[3, 3, 0, 0]}
                            />
                            <Line
                              yAxisId="price"
                              type="monotone"
                              dataKey="averagePrice"
                              name="Average catalog price"
                              stroke="#ED7D31"
                              strokeWidth={3}
                              dot={{ r: 3 }}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Catalog Price Movement</CardTitle>
                      <CardDescription>
                        Average old/new prices with the number of changed products per day.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="h-[360px] min-w-0">
                      {dailyPricingData.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-center text-muted-foreground">
                          <div>
                            <LineChartIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="font-medium text-foreground">No price movements recorded</p>
                            <p className="text-sm">This chart fills in after products receive price updates.</p>
                          </div>
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={dailyPricingData} margin={{ top: 12, right: 24, left: 8, bottom: 12 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis
                              dataKey="date"
                              tickLine={false}
                              axisLine={false}
                              tick={{ fontSize: 11 }}
                              tickMargin={10}
                              minTickGap={18}
                              interval="preserveStartEnd"
                            />
                            <YAxis
                              yAxisId="price"
                              width={64}
                              tickLine={false}
                              axisLine={false}
                              tick={{ fontSize: 11 }}
                              tickFormatter={(value) => formatCompactCurrency(Number(value))}
                            />
                            <YAxis
                              yAxisId="count"
                              orientation="right"
                              width={44}
                              tickLine={false}
                              axisLine={false}
                              tick={{ fontSize: 11 }}
                              allowDecimals={false}
                            />
                            <Tooltip
                              formatter={(value, name) => {
                                if (name === "Changed products") return [Number(value).toLocaleString(), name];
                                return [formatCurrency(Number(value)), name];
                              }}
                            />
                            <Legend verticalAlign="top" align="right" height={32} wrapperStyle={{ fontSize: 12 }} />
                            <Bar
                              yAxisId="count"
                              dataKey="changedProducts"
                              name="Changed products"
                              fill="#4472C4"
                              radius={[3, 3, 0, 0]}
                            />
                            <Line
                              yAxisId="price"
                              type="monotone"
                              dataKey="avgOldPrice"
                              name="Avg old price"
                              stroke="#ED7D31"
                              strokeWidth={3}
                              dot={{ r: 3 }}
                            />
                            <Line
                              yAxisId="price"
                              type="monotone"
                              dataKey="avgNewPrice"
                              name="Avg new price"
                              stroke="#70AD47"
                              strokeWidth={3}
                              dot={{ r: 3 }}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Average Change Size</CardTitle>
                      <CardDescription>
                        Daily average price change amount and percentage.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="h-[340px] min-w-0">
                      {dailyPricingData.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-center text-muted-foreground">
                          <div>
                            <LineChartIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="font-medium text-foreground">No average change data yet</p>
                            <p className="text-sm">Average change size appears after price updates are recorded.</p>
                          </div>
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={dailyPricingData} margin={{ top: 12, right: 24, left: 8, bottom: 12 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis
                              dataKey="date"
                              tickLine={false}
                              axisLine={false}
                              tick={{ fontSize: 11 }}
                              tickMargin={10}
                              minTickGap={18}
                              interval="preserveStartEnd"
                            />
                            <YAxis
                              yAxisId="amount"
                              width={64}
                              tickLine={false}
                              axisLine={false}
                              tick={{ fontSize: 11 }}
                              tickFormatter={(value) => formatCompactCurrency(Number(value))}
                            />
                            <YAxis
                              yAxisId="percent"
                              orientation="right"
                              width={44}
                              tickLine={false}
                              axisLine={false}
                              tick={{ fontSize: 11 }}
                              tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
                            />
                            <Tooltip
                              formatter={(value, name) => {
                                if (name === "Avg change percent") return [`${Number(value).toFixed(2)}%`, name];
                                return [formatCurrency(Number(value)), name];
                              }}
                            />
                            <Legend verticalAlign="top" align="right" height={32} wrapperStyle={{ fontSize: 12 }} />
                            <Bar
                              yAxisId="amount"
                              dataKey="avgChangeAmount"
                              name="Avg change amount"
                              fill="#56CCF2"
                              radius={[3, 3, 0, 0]}
                            />
                            <Line
                              yAxisId="percent"
                              type="monotone"
                              dataKey="avgChangePercent"
                              name="Avg change percent"
                              stroke="#FFC000"
                              strokeWidth={3}
                              dot={{ r: 3 }}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>Category Pricing Movement</CardTitle>
                        <CardDescription>Average price movement by category.</CardDescription>
                      </CardHeader>
                      <CardContent className="h-[320px] min-w-0">
                        {categoryPricingData.length === 0 ? (
                          <div className="flex h-full items-center justify-center text-center text-muted-foreground">
                            <div>
                              <LineChartIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              <p className="font-medium text-foreground">No category movement yet</p>
                              <p className="text-sm">Category movement appears after product prices change.</p>
                            </div>
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={categoryPricingData} layout="vertical" margin={{ top: 12, right: 24, left: 8, bottom: 12 }}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                              <XAxis
                                type="number"
                                tickLine={false}
                                axisLine={false}
                                tick={{ fontSize: 11 }}
                                tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
                              />
                              <YAxis
                                type="category"
                                dataKey="category"
                                width={140}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fontSize: 11 }}
                                tickFormatter={(value) => truncateChartLabel(String(value))}
                              />
                              <Tooltip formatter={(value, name) => [`${Number(value).toFixed(2)}%`, name]} />
                              <Bar
                                dataKey="avgChangePercent"
                                name="Avg change percent"
                                fill="#70AD47"
                                radius={[0, 3, 3, 0]}
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Largest Price Moves</CardTitle>
                        <CardDescription>Products with the biggest increase and decrease.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="rounded-md border p-4">
                          <div className="text-sm text-muted-foreground">Biggest increase</div>
                          <div className="mt-1 text-lg font-semibold">
                            {biggestIncrease?.productName || "N/A"}
                          </div>
                          <div className="mt-2 text-sm">
                            {biggestIncrease
                              ? `${formatCurrency(biggestIncrease.oldPrice)} to ${formatCurrency(biggestIncrease.newPrice)} (${biggestIncrease.changePercent.toFixed(1)}%)`
                              : "No increase recorded"}
                          </div>
                        </div>
                        <div className="rounded-md border p-4">
                          <div className="text-sm text-muted-foreground">Biggest decrease</div>
                          <div className="mt-1 text-lg font-semibold">
                            {biggestDecrease?.productName || "N/A"}
                          </div>
                          <div className="mt-2 text-sm">
                            {biggestDecrease
                              ? `${formatCurrency(biggestDecrease.oldPrice)} to ${formatCurrency(biggestDecrease.newPrice)} (${biggestDecrease.changePercent.toFixed(1)}%)`
                              : "No decrease recorded"}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="forecasts" className="pt-4">
              {isLoadingForecasts ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-1/3" />
                  <Skeleton className="h-[400px] w-full" />
                </div>
              ) : (
                <TimeSeriesForecast 
                  forecasts={forecasts || []} 
                  isLoading={isLoadingForecasts}
                  productName={selectedProductName}
                />
              )}
            </TabsContent>
            
            {/* Competitors section removed - see dedicated Competitors page */}
          </Tabs>
        </div>
        
        <div className="md:w-1/3 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Product Filter</CardTitle>
              <CardDescription>
                Select a specific product to view its analytics
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingProducts ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select 
                  value={selectedProductId?.toString() || "all"} 
                  onValueChange={(value) => setSelectedProductId(value === "all" ? undefined : parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Products" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Products</SelectItem>
                    {products?.map(product => (
                      <SelectItem key={product.id} value={product.id.toString()}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              
              <div className="flex justify-end mt-4">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setSelectedProductId(undefined)}
                  disabled={!selectedProductId}
                >
                  Reset Filter
                </Button>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Analytics Insights</CardTitle>
              <CardDescription>
                Automated insights based on your data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!performanceMetrics || performanceMetrics.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No Data Available</AlertTitle>
                  <AlertDescription>
                    Generate sample data to see analytics insights.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="p-4 bg-muted rounded-md">
                    <h4 className="font-medium mb-1">Performance Trend</h4>
                    <p className="text-sm text-muted-foreground">
                      {selectedProductId ? 'This product has' : 'Your products have'} shown a 
                      {Math.random() > 0.5 ? 'positive' : 'moderate'} performance trend over the {selectedPeriod} period.
                    </p>
                  </div>
                  
                  <div className="p-4 bg-muted rounded-md">
                    <h4 className="font-medium mb-1">Inventory Optimization</h4>
                    <p className="text-sm text-muted-foreground">
                      Based on turnover rates, consider adjusting inventory levels for 
                      {selectedProductId ? ' this product' : ' products with low demand'}.
                    </p>
                  </div>
                  
                  <div className="p-4 bg-muted rounded-md">
                    <h4 className="font-medium mb-1">Pricing Recommendation</h4>
                    <p className="text-sm text-muted-foreground">
                      {selectedProductId ? 'This product has' : 'Several products have'} price sensitivity 
                      and may benefit from strategic price adjustments.
                    </p>
                  </div>
                </>
              )}
              
              <div className="flex justify-center mt-4">
                <Button variant="outline" size="sm" className="flex items-center">
                  <RefreshCw className="h-3 w-3 mr-2" />
                  <span>Refresh Insights</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdvancedAnalytics;
