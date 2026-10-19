import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LineChart } from "@tremor/react";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface CompetitorAnalysisProps {
  productId: number;
}

interface CompetitorPrice {
  competitorName: string;
  price: string;
  isPromotion: boolean;
  timestamp: string;
}

interface AnalyticsData {
  marketAverage: string;
  currentPrice: string;
  minPrice: string;
  maxPrice: string;
  priceVolatility: string | number;
  priceChanges: number;
  insights: Record<string, string>;
}

interface CompetitorAnalysisData {
  analytics: AnalyticsData;
  competitorPrices: CompetitorPrice[];
}

export function CompetitorAnalysis({ productId }: CompetitorAnalysisProps) {
  const { data, isLoading } = useQuery<CompetitorAnalysisData>({
    queryKey: ["/api/products", productId, "competitor-analysis"],
    queryFn: async () => {
      const response = await fetch(`/api/products/${productId}/competitor-analysis`);
      if (!response.ok) throw new Error("Failed to fetch competitor analysis");
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-[50px]" />
          ))}
        </div>
        <Skeleton className="h-[180px] w-full" />
        <Skeleton className="h-[80px] w-full" />
      </div>
    );
  }

  const { analytics, competitorPrices } = data || {};
  const hasCompetitorPrices = (competitorPrices?.length || 0) > 0;

  // Transform price data for visualization
  const priceData = competitorPrices?.map((price: CompetitorPrice) => ({
    name: price.competitorName,
    price: Number(price.price),
    isPromotion: price.isPromotion,
    timestamp: new Date(price.timestamp).toLocaleDateString(),
  })) || [];

  // Calculate market position
  const marketPosition = analytics?.marketAverage ? 
    (Number(analytics.currentPrice) - Number(analytics.marketAverage)) / Number(analytics.marketAverage) * 100 : 0;

  if (!hasCompetitorPrices) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>No Competitor Price History</AlertTitle>
        <AlertDescription>
          Record competitor prices from the Competitor Management page to unlock product-level competitor analysis.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Market Position Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="relative overflow-hidden">
          <div className={`absolute inset-0 opacity-10 ${marketPosition >= 0 ? 'bg-green-500' : 'bg-red-500'}`} />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 py-2 px-3">
            <CardTitle className="text-xs font-medium">Market Position</CardTitle>
            {marketPosition >= 0 ? (
              <TrendingUp className="h-3 w-3 text-green-500" />
            ) : (
              <TrendingDown className="h-3 w-3 text-red-500" />
            )}
          </CardHeader>
          <CardContent className="py-2 px-3">
            <div className="text-lg font-bold">
              {Math.abs(marketPosition).toFixed(1)}% {marketPosition >= 0 ? 'Above' : 'Below'} Average
            </div>
            <p className="text-xs text-muted-foreground whitespace-nowrap">
              Market Average: ${Number(analytics?.marketAverage).toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 py-2 px-3">
            <CardTitle className="text-xs font-medium">Price Range</CardTitle>
            <Badge variant={marketPosition >= 0 ? "default" : "secondary"} className="text-xs whitespace-nowrap">
              ${Number(analytics?.minPrice).toFixed(2)} - ${Number(analytics?.maxPrice).toFixed(2)}
            </Badge>
          </CardHeader>
          <CardContent className="py-2 px-3">
            <div className="text-lg font-bold whitespace-nowrap">
              ${Number(analytics?.currentPrice).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              Your Current Price
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 py-2 px-3">
            <CardTitle className="text-xs font-medium">Price Volatility</CardTitle>
            <Badge variant={Number(analytics?.priceVolatility) > 10 ? "destructive" : "default"} className="text-xs whitespace-nowrap">
              {Number(analytics?.priceVolatility).toFixed(1)}%
            </Badge>
          </CardHeader>
          <CardContent className="py-2 px-3">
            <div className="text-lg font-bold">
              {Number(analytics?.priceChanges)} Changes
            </div>
            <p className="text-xs text-muted-foreground">
              In the last 30 days
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Competitor Price Comparison */}
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm">Price Comparison Timeline</CardTitle>
          <CardDescription className="text-xs">
            Track how your competitors are adjusting their prices over time
          </CardDescription>
        </CardHeader>
        <CardContent className="py-2 px-3">
          <div className="h-[180px] pl-2">
            <LineChart
              data={priceData}
              index="timestamp"
              categories={["price"]}
              colors={["#9F7AEA"]} // Changed to purple
              valueFormatter={(value) => `$${value?.toFixed(2)}`}
              showLegend={true}
              showGridLines={false}
              yAxisWidth={60} // Give even more space for the y-axis labels with dollar signs
              autoMinValue={true}
              curveType="monotone"
              connectNulls={true}


              customTooltip={(props) => {
                const { payload, active } = props;
                if (!active || !payload) return null;
                
                return (
                  <div className="bg-background border rounded shadow-lg p-2">
                    <div className="text-sm font-medium">{payload[0]?.payload.timestamp}</div>
                    <div className="flex items-center mt-1">
                      <div className="w-2 h-2 rounded-full bg-purple-500 mr-2"></div> {/* Changed dot color to purple */}
                      <span className="whitespace-nowrap">Price: ${typeof payload[0]?.value === 'number' ? payload[0]?.value.toFixed(2) : payload[0]?.value}</span>
                    </div>
                  </div>
                );
              }}
              className="h-full mt-4"
            />
          </div>
        </CardContent>
      </Card>

      {/* Market Insights */}
      {analytics?.insights && (
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-sm">Market Insights</CardTitle>
            <CardDescription className="text-xs">
              AI-powered analysis of market trends and competitor behavior
            </CardDescription>
          </CardHeader>
          <CardContent className="py-2 px-3">
            <div className="space-y-2">
              {Object.entries(analytics.insights).map(([key, value]) => (
                <div key={key} className="flex items-start gap-2 p-2 rounded-lg bg-muted/50">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-purple-500" />
                  <p className="text-xs">{String(value)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
