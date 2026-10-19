import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import VendorInsightCard from "@/components/vendor/VendorInsightCard";
import VendorMetricCard from "@/components/vendor/VendorMetricCard";
import VendorRecommendationCard from "@/components/vendor/VendorRecommendationCard";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

type HealthMetrics = {
  healthScore: number;
  salesPerformance: number;
  inventoryHealth: number;
  customerSatisfaction: number;
  profitMargin: number;
};

type DetailedMetrics = {
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

type Insight = {
  id: string;
  type: 'positive' | 'negative' | 'neutral';
  title: string;
  description: string;
  metric?: string;
  change?: number;
};

type Recommendation = {
  id: string;
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'high' | 'medium' | 'low';
  category: 'inventory' | 'pricing' | 'customer' | 'operations';
};

type VendorHealthData = {
  overview: HealthMetrics;
  metrics: DetailedMetrics;
  insights: Insight[];
  recommendations: Recommendation[];
};

const defaultHealthData: VendorHealthData = {
  overview: {
    healthScore: 0,
    salesPerformance: 0,
    inventoryHealth: 0,
    customerSatisfaction: 0,
    profitMargin: 0,
  },
  metrics: {
    totalSales: 0,
    salesGrowth: 0,
    orderCount: 0,
    orderGrowth: 0,
    avgOrderValue: 0,
    itemsOutOfStock: 0,
    customerCount: 0,
    customerGrowth: 0,
    returnRate: 0,
  },
  insights: [],
  recommendations: [],
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeVendorHealthData = (data: any): VendorHealthData => ({
  overview: {
    healthScore: toNumber(data?.overview?.healthScore),
    salesPerformance: toNumber(data?.overview?.salesPerformance),
    inventoryHealth: toNumber(data?.overview?.inventoryHealth),
    customerSatisfaction: toNumber(data?.overview?.customerSatisfaction),
    profitMargin: toNumber(data?.overview?.profitMargin),
  },
  metrics: {
    totalSales: toNumber(data?.metrics?.totalSales),
    salesGrowth: toNumber(data?.metrics?.salesGrowth),
    orderCount: toNumber(data?.metrics?.orderCount),
    orderGrowth: toNumber(data?.metrics?.orderGrowth),
    avgOrderValue: toNumber(data?.metrics?.avgOrderValue),
    itemsOutOfStock: toNumber(data?.metrics?.itemsOutOfStock),
    customerCount: toNumber(data?.metrics?.customerCount),
    customerGrowth: toNumber(data?.metrics?.customerGrowth),
    returnRate: toNumber(data?.metrics?.returnRate),
  },
  insights: Array.isArray(data?.insights) ? data.insights : [],
  recommendations: Array.isArray(data?.recommendations) ? data.recommendations : [],
});

export default function VendorHealth() {
  const [healthData, setHealthData] = useState<VendorHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const { toast } = useToast();

  useEffect(() => {
    fetchVendorHealthData();
  }, []);

  async function fetchVendorHealthData() {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest("GET", "/api/vendor-health");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || data?.error || "Failed to load vendor health data");
      }

      setHealthData(normalizeVendorHealthData(data));
    } catch (err) {
      console.error("Failed to fetch vendor health data:", err);
      setHealthData(defaultHealthData);
      setError(err instanceof Error ? err.message : "Failed to load vendor health data. Please try again.");
      toast({
        title: "Error",
        description: "Failed to load vendor health data.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleImplementRecommendation(recommendationId: string) {
    try {
      const response = await apiRequest("POST", "/api/vendor-recommendations/implement", {
        recommendationId
      });
      
      if (response.ok) {
        toast({
          title: "Success",
          description: "Recommendation has been marked as implemented.",
          variant: "default",
        });
        
        // Refresh the dashboard data after implementing a recommendation
        fetchVendorHealthData();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to implement recommendation");
      }
    } catch (err) {
      console.error("Failed to implement recommendation:", err);
      toast({
        title: "Error",
        description: "Failed to implement recommendation.",
        variant: "destructive",
      });
    }
  }

  if (loading) {
    return (
        <div className="flex items-center justify-center min-h-[70vh]">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    );
  }

  if (error) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4">
          <h2 className="text-2xl font-bold text-destructive">Error Loading Data</h2>
          <p className="text-muted-foreground">{error}</p>
          <button
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
            onClick={fetchVendorHealthData}
          >
            Retry
          </button>
        </div>
    );
  }

  return (
      <div className="space-y-8">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">Vendor Health Dashboard</h1>
            <p className="text-muted-foreground">
              Get insights and recommendations to improve your business performance
            </p>
          </div>
          <div className="w-full md:w-auto">
            <div className="flex p-1 space-x-1 rounded-md bg-muted">
              <button
                onClick={() => setActiveTab("overview")}
                className={`px-3 py-1.5 text-sm font-medium rounded-sm transition-all ${activeTab === "overview" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-primary/20"}`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab("insights")}
                className={`px-3 py-1.5 text-sm font-medium rounded-sm transition-all ${activeTab === "insights" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-primary/20"}`}
              >
                Insights
              </button>
              <button
                onClick={() => setActiveTab("recommendations")}
                className={`px-3 py-1.5 text-sm font-medium rounded-sm transition-all ${activeTab === "recommendations" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-primary/20"}`}
              >
                Recommendations
              </button>
            </div>
          </div>
        </header>

        {healthData && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsContent value="overview" className="mt-4 space-y-4">
              {/* Health Score Overview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="col-span-1">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xl">Health Score</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center justify-center">
                    <div className="w-[180px] h-[180px] mb-4">
                      <CircularProgressbar
                        value={healthData.overview.healthScore}
                        text={`${healthData.overview.healthScore}%`}
                        styles={buildStyles({
                          textSize: '22px',
                          pathColor: getScoreColor(healthData.overview.healthScore),
                          textColor: 'hsl(var(--foreground))',
                          trailColor: 'hsl(var(--muted))',
                        })}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground text-center">
                      Overall health of your store based on sales, inventory, and customer metrics
                    </p>
                  </CardContent>
                </Card>

                <Card className="col-span-1 md:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xl">Performance Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${healthData.overview.salesPerformance}%` }}
                          />
                        </div>
                        <p className="text-xs font-medium">Sales Performance</p>
                        <p className="text-lg font-bold">{healthData.overview.salesPerformance}%</p>
                      </div>
                      <div className="space-y-1">
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${healthData.overview.inventoryHealth}%` }}
                          />
                        </div>
                        <p className="text-xs font-medium">Inventory Health</p>
                        <p className="text-lg font-bold">{healthData.overview.inventoryHealth}%</p>
                      </div>
                      <div className="space-y-1">
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${healthData.overview.customerSatisfaction}%` }}
                          />
                        </div>
                        <p className="text-xs font-medium">Customer Satisfaction</p>
                        <p className="text-lg font-bold">{healthData.overview.customerSatisfaction}%</p>
                      </div>
                      <div className="space-y-1">
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${healthData.overview.profitMargin}%` }}
                          />
                        </div>
                        <p className="text-xs font-medium">Profit Margin</p>
                        <p className="text-lg font-bold">{healthData.overview.profitMargin}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <VendorMetricCard
                  title="Total Sales"
                  value={healthData.metrics.totalSales}
                  type="currency"
                  description={`${healthData.metrics.salesGrowth > 0 ? '+' : ''}${healthData.metrics.salesGrowth.toFixed(1)}% from last period`}
                />
                <VendorMetricCard
                  title="Orders"
                  value={healthData.metrics.orderCount}
                  type="number"
                  description={`${healthData.metrics.orderGrowth > 0 ? '+' : ''}${healthData.metrics.orderGrowth.toFixed(1)}% from last period`}
                />
                <VendorMetricCard
                  title="Avg Order Value"
                  value={healthData.metrics.avgOrderValue}
                  type="currency"
                />
                <VendorMetricCard
                  title="Out of Stock Items"
                  value={healthData.metrics.itemsOutOfStock}
                  type="number"
                  color={healthData.metrics.itemsOutOfStock > 10 ? "red" : undefined}
                />
                <VendorMetricCard
                  title="Customers"
                  value={healthData.metrics.customerCount}
                  type="number"
                  description={`${healthData.metrics.customerGrowth > 0 ? '+' : ''}${healthData.metrics.customerGrowth.toFixed(1)}% from last period`}
                />
                <VendorMetricCard
                  title="Return Rate"
                  value={healthData.metrics.returnRate}
                  type="percent"
                  color={healthData.metrics.returnRate > 3 ? "red" : undefined}
                />
              </div>
            </TabsContent>

            <TabsContent value="insights" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {healthData.insights.map((insight) => (
                  <VendorInsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="recommendations" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {healthData.recommendations.map((recommendation) => (
                  <VendorRecommendationCard
                    key={recommendation.id}
                    recommendation={recommendation}
                    onImplement={() => handleImplementRecommendation(recommendation.id)}
                  />
                ))}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
  );
}

// Helper function to determine the color based on the score
function getScoreColor(score: number): string {
  if (score >= 80) return 'hsl(var(--success))';
  if (score >= 65) return 'hsl(var(--warning))';
  return 'hsl(var(--destructive))';
}
