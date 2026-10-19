import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, AlertTriangle, Loader2, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/hooks/use-currency";
import VendorInsightCard from "./VendorInsightCard";
import VendorRecommendationCard from "./VendorRecommendationCard";
import VendorMetricCard from "./VendorMetricCard";

interface VendorHealth {
  overview: {
    healthScore: number;
    salesPerformance: number;
    inventoryHealth: number;
    customerSatisfaction: number;
    profitMargin: number;
  };
  metrics: {
    totalSales: number;
    salesGrowth: number;
    orderCount: number;
    orderGrowth: number;
    avgOrderValue: number;
    itemsOutOfStock: number;
    customerCount: number;
    customerGrowth: number;
    returnRate: number;
  };
  insights: Array<{
    id: string;
    type: 'positive' | 'negative' | 'neutral';
    title: string;
    description: string;
    metric?: string;
    change?: number;
  }>;
  recommendations: Array<{
    id: string;
    title: string;
    description: string;
    impact: 'high' | 'medium' | 'low';
    effort: 'high' | 'medium' | 'low';
    category: 'inventory' | 'pricing' | 'customer' | 'operations';
  }>;
}

export default function VendorHealthDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [implementedRecommendations, setImplementedRecommendations] = useState<string[]>([]);

  const { data, isLoading, isError, refetch } = useQuery<VendorHealth>({
    queryKey: ["vendor-health"],
    queryFn: async () => {
      const response = await fetch("/api/vendor-health");
      if (!response.ok) {
        throw new Error("Failed to fetch vendor health data");
      }
      return response.json();
    },
  });

  const handleImplementRecommendation = async (recommendationId: string) => {
    try {
      const response = await fetch("/api/vendor-recommendations/implement", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ recommendationId }),
      });

      if (!response.ok) {
        throw new Error("Failed to implement recommendation");
      }

      setImplementedRecommendations(prev => [...prev, recommendationId]);
      toast({
        title: "Recommendation implemented",
        description: "The recommendation has been successfully implemented.",
      });
      
      // Refetch data to update health metrics
      refetch();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to implement recommendation. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertTriangle className="w-12 h-12 text-destructive" />
        <h3 className="text-xl font-semibold">Failed to load vendor health data</h3>
        <Button onClick={() => refetch()}>Try Again</Button>
      </div>
    );
  }

  const getProgressColor = (score: number) => {
    if (score >= 70) return "#10b981"; // green
    if (score >= 50) return "#f59e0b"; // amber
    return "#ef4444"; // red
  };

  const getGrowthIcon = (value: number) => {
    if (value > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (value < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return null;
  };

  const formatNumber = (num: number, precision = 0) => {
    return num.toLocaleString(undefined, { 
      minimumFractionDigits: precision,
      maximumFractionDigits: precision
    });
  };

  const formatPercent = (num: number) => {
    return `${num > 0 ? '+' : ''}${num.toFixed(1)}%`;
  };

  const { currency } = useCurrency();
  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  };

  const filteredRecommendations = data.recommendations.filter(
    recommendation => !implementedRecommendations.includes(recommendation.id)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Vendor Health Dashboard</h1>
        <p className="text-muted-foreground">
          Monitor your store's performance, identify areas for improvement, and get actionable recommendations.
        </p>
      </div>

      <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Health Score Overview */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card className="md:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-center text-lg">Overall Health</CardTitle>
              </CardHeader>
              <CardContent className="flex justify-center pt-0">
                <div className="w-32 h-32">
                  <CircularProgressbar
                    value={data.overview.healthScore}
                    text={`${data.overview.healthScore}%`}
                    styles={buildStyles({
                      textSize: '1.5rem',
                      pathColor: getProgressColor(data.overview.healthScore),
                      textColor: 'var(--foreground)',
                      trailColor: 'var(--muted)'
                    })}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Health Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <VendorMetricCard 
                    title="Sales Performance" 
                    value={data.overview.salesPerformance} 
                    type="percent" 
                    color={getProgressColor(data.overview.salesPerformance)}
                  />
                  <VendorMetricCard 
                    title="Inventory Health" 
                    value={data.overview.inventoryHealth} 
                    type="percent" 
                    color={getProgressColor(data.overview.inventoryHealth)}
                  />
                  <VendorMetricCard 
                    title="Customer Satisfaction" 
                    value={data.overview.customerSatisfaction} 
                    type="percent" 
                    color={getProgressColor(data.overview.customerSatisfaction)}
                  />
                  <VendorMetricCard 
                    title="Profit Margin" 
                    value={data.overview.profitMargin} 
                    type="percent" 
                    color={getProgressColor(data.overview.profitMargin)}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Key Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Key Performance Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total Sales</span>
                    <div className="flex items-center gap-1">
                      {getGrowthIcon(data.metrics.salesGrowth)}
                      <span className={`text-xs ${data.metrics.salesGrowth > 0 ? 'text-green-500' : data.metrics.salesGrowth < 0 ? 'text-red-500' : ''}`}>
                        {formatPercent(data.metrics.salesGrowth)}
                      </span>
                    </div>
                  </div>
                  <p className="text-2xl font-semibold">{formatCurrency(data.metrics.totalSales)}</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Orders</span>
                    <div className="flex items-center gap-1">
                      {getGrowthIcon(data.metrics.orderGrowth)}
                      <span className={`text-xs ${data.metrics.orderGrowth > 0 ? 'text-green-500' : data.metrics.orderGrowth < 0 ? 'text-red-500' : ''}`}>
                        {formatPercent(data.metrics.orderGrowth)}
                      </span>
                    </div>
                  </div>
                  <p className="text-2xl font-semibold">{formatNumber(data.metrics.orderCount)}</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Avg Order Value</span>
                  </div>
                  <p className="text-2xl font-semibold">{formatCurrency(data.metrics.avgOrderValue)}</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Items Out of Stock</span>
                  </div>
                  <p className="text-2xl font-semibold">{data.metrics.itemsOutOfStock}</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Customers</span>
                    <div className="flex items-center gap-1">
                      {getGrowthIcon(data.metrics.customerGrowth)}
                      <span className={`text-xs ${data.metrics.customerGrowth > 0 ? 'text-green-500' : data.metrics.customerGrowth < 0 ? 'text-red-500' : ''}`}>
                        {formatPercent(data.metrics.customerGrowth)}
                      </span>
                    </div>
                  </div>
                  <p className="text-2xl font-semibold">{formatNumber(data.metrics.customerCount)}</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Return Rate</span>
                  </div>
                  <p className="text-2xl font-semibold">{data.metrics.returnRate.toFixed(1)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top Insights Preview */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Key Insights</h3>
              <Button variant="ghost" size="sm" className="gap-1" onClick={() => setActiveTab("insights")}>
                View All <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.insights.slice(0, 2).map((insight) => (
                <VendorInsightCard key={insight.id} insight={insight} />
              ))}
            </div>
          </div>

          {/* Top Recommendations Preview */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Recommendations</h3>
              <Button variant="ghost" size="sm" className="gap-1" onClick={() => setActiveTab("recommendations")}>
                View All <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {filteredRecommendations.slice(0, 2).map((recommendation) => (
                <VendorRecommendationCard 
                  key={recommendation.id}
                  recommendation={recommendation}
                  onImplement={() => handleImplementRecommendation(recommendation.id)}
                />
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="insights" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">All Insights</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4">
                {data.insights.map((insight) => (
                  <VendorInsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">All Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4">
                {filteredRecommendations.length > 0 ? (
                  filteredRecommendations.map((recommendation) => (
                    <VendorRecommendationCard 
                      key={recommendation.id}
                      recommendation={recommendation}
                      onImplement={() => handleImplementRecommendation(recommendation.id)}
                    />
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Check className="h-12 w-12 text-green-500 mb-4" />
                    <h3 className="text-xl font-semibold mb-2">All caught up!</h3>
                    <p className="text-muted-foreground">
                      You've implemented all our recommendations. Check back later for new insights.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}