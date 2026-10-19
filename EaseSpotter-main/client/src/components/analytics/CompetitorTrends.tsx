import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LabelList,
  PieChart, 
  Pie, 
  Cell, 
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from "recharts";
import { 
  ArrowDownIcon, 
  ArrowUpIcon, 
  TrendingDown, 
  TrendingUp, 
  PieChart as PieChartIcon, 
  BarChart2, 
  AlertCircle,
  Lightbulb
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface CompetitorMetrics {
  changeRate: string;
  averagePrice: string;
  productCount: number;
  priceRanking: number;
}

interface CompetitorTrend {
  id: number;
  vendorId: number;
  competitorId: number;
  analysisType: string;
  period: string;
  metrics: CompetitorMetrics;
  insights: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
}

interface Competitor {
  id: number;
  name: string;
}

interface CompetitorTrendsProps {
  trends: CompetitorTrend[];
  isLoading: boolean;
  selectedPeriod: string;
}

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c43', '#f95d6a', '#d45087'];
const truncateChartLabel = (label: string, maxLength = 16) =>
  label.length > maxLength ? `${label.slice(0, maxLength - 1)}...` : label;
const formatCurrencyAxis = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: Math.abs(value) >= 10000 ? "compact" : "standard",
  }).format(value);

const CompetitorTrends: React.FC<CompetitorTrendsProps> = ({ trends, isLoading, selectedPeriod }) => {
  const [selectedAnalysisType, setSelectedAnalysisType] = useState<string>("price_volatility");

  const { data: competitors = [] } = useQuery<Competitor[]>({
    queryKey: ["/api/competitors"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/competitors");
      if (!response.ok) {
        throw new Error("Failed to fetch competitors");
      }
      return response.json();
    },
    initialData: [],
  });
  
  // Filter trends by selected period and analysis type
  const filteredTrends = trends.filter(
    trend => trend.period === selectedPeriod && trend.analysisType === selectedAnalysisType
  );
  
  // Group by competitor ID for comparison
  const competitorData = filteredTrends.reduce((acc, trend) => {
    acc[trend.competitorId] = trend;
    return acc;
  }, {} as Record<number, CompetitorTrend>);
  
  // Extract unique competitor IDs
  const competitorIds = Object.keys(competitorData).map(Number);
  
  const getCompetitorName = (id: number) =>
    competitors.find((competitor) => competitor.id === id)?.name || `Competitor ${id}`;
  
  // Format data for different chart types
  const formatPriceData = () => {
    return competitorIds.map(id => ({
      name: getCompetitorName(id),
      id,
      averagePrice: parseFloat(competitorData[id].metrics.averagePrice),
      changeRate: parseFloat(competitorData[id].metrics.changeRate) * 100,
      ranking: competitorData[id].metrics.priceRanking
    }));
  };
  
  const formatMarketShareData = () => {
    const total = competitorIds.reduce((sum, id) => sum + competitorData[id].metrics.productCount, 0);
    
    return competitorIds.map(id => ({
      name: getCompetitorName(id),
      id,
      value: competitorData[id].metrics.productCount,
      percentage: (competitorData[id].metrics.productCount / total) * 100
    }));
  };
  
  const formatRadarData = () => {
    const maxPriceRanking = Math.max(...competitorIds.map(id => competitorData[id].metrics.priceRanking));
    const maxProductCount = Math.max(...competitorIds.map(id => competitorData[id].metrics.productCount));
    const maxAveragePrice = Math.max(...competitorIds.map(id => parseFloat(competitorData[id].metrics.averagePrice)));
    
    return competitorIds.map(id => {
      const metrics = competitorData[id].metrics;
      return {
        name: getCompetitorName(id),
        id,
        "Price Ranking": (maxPriceRanking - metrics.priceRanking + 1) / maxPriceRanking * 100, // Invert so higher is better
        "Product Count": (metrics.productCount / maxProductCount) * 100,
        "Price Point": (1 - (parseFloat(metrics.averagePrice) / maxAveragePrice)) * 100, // Lower price is better
        "Price Stability": (1 - Math.abs(parseFloat(metrics.changeRate))) * 100, // Lower volatility is better
      };
    });
  };
  
  // Generate insights based on data
  const generateInsights = () => {
    if (competitorIds.length === 0) return [];
    
    const insights = [];
    
    if (selectedAnalysisType === "price_volatility") {
      // Find competitor with highest price change
      const mostVolatileId = competitorIds.reduce((a, b) => 
        Math.abs(parseFloat(competitorData[a].metrics.changeRate)) > 
        Math.abs(parseFloat(competitorData[b].metrics.changeRate)) ? a : b
      );
      
      const volatileRate = parseFloat(competitorData[mostVolatileId].metrics.changeRate) * 100;
      const direction = volatileRate >= 0 ? "increased" : "decreased";
      
      insights.push({
        title: "Price Volatility Alert",
        description: `${getCompetitorName(mostVolatileId)} has ${direction} prices by ${Math.abs(volatileRate).toFixed(1)}% in the ${selectedPeriod} period.`,
        icon: volatileRate >= 0 ? <ArrowUpIcon className="text-red-500" /> : <ArrowDownIcon className="text-green-500" />
      });
      
      // Find lowest-priced competitor
      const lowestPriceId = competitorIds.reduce((a, b) => 
        parseFloat(competitorData[a].metrics.averagePrice) < 
        parseFloat(competitorData[b].metrics.averagePrice) ? a : b
      );
      
      insights.push({
        title: "Price Leader Identified",
        description: `${getCompetitorName(lowestPriceId)} has the lowest average price at $${parseFloat(competitorData[lowestPriceId].metrics.averagePrice).toFixed(2)}.`,
        icon: <TrendingDown className="text-blue-500" />
      });
    } else if (selectedAnalysisType === "market_share") {
      // Find competitor with most products
      const largestId = competitorIds.reduce((a, b) => 
        competitorData[a].metrics.productCount > competitorData[b].metrics.productCount ? a : b
      );
      
      const totalProducts = competitorIds.reduce((sum, id) => sum + competitorData[id].metrics.productCount, 0);
      const sharePercentage = (competitorData[largestId].metrics.productCount / totalProducts) * 100;
      
      insights.push({
        title: "Market Leader",
        description: `${getCompetitorName(largestId)} holds the largest market share at ${sharePercentage.toFixed(1)}% with ${competitorData[largestId].metrics.productCount} products.`,
        icon: <PieChartIcon className="text-purple-500" />
      });
    } else if (selectedAnalysisType === "product_launch") {
      // Generate insight about product launches
      const launchDate = new Date();
      launchDate.setDate(launchDate.getDate() - Math.floor(Math.random() * 30));
      
      insights.push({
        title: "Recent Product Launches",
        description: `New product launches detected from multiple competitors in the last month, potentially indicating a market shift.`,
        icon: <Lightbulb className="text-yellow-500" />
      });
    }
    
    return insights;
  };
  
  const insights = generateInsights();
  
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-1/4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (trends.length === 0 || competitorIds.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>No Competitor Data</AlertTitle>
        <AlertDescription>
          No competitor analysis data available for this period.
        </AlertDescription>
      </Alert>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold">
            Competitor Analysis
          </h3>
          <p className="text-sm text-muted-foreground">
            Comparing {competitorIds.length} competitors for {selectedPeriod} period
          </p>
        </div>
        
        <Select value={selectedAnalysisType} onValueChange={setSelectedAnalysisType}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select analysis type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="price_volatility">Price Analysis</SelectItem>
            <SelectItem value="market_share">Market Share</SelectItem>
            <SelectItem value="product_launch">Product Launches</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <Tabs defaultValue="bar" className="w-full">
        <TabsList className="grid grid-cols-3 w-80">
          <TabsTrigger value="bar">Bar Chart</TabsTrigger>
          <TabsTrigger value="pie">Pie Chart</TabsTrigger>
          <TabsTrigger value="radar">Radar Chart</TabsTrigger>
        </TabsList>
        
        <TabsContent value="bar" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedAnalysisType === 'price_volatility' && 'Price Comparison'}
                {selectedAnalysisType === 'market_share' && 'Market Share Comparison'}
                {selectedAnalysisType === 'product_launch' && 'Product Launch Activity'}
              </CardTitle>
              <CardDescription>
                {selectedAnalysisType === 'price_volatility' && 'Average prices and change rates by competitor'}
                {selectedAnalysisType === 'market_share' && 'Product count by competitor'}
                {selectedAnalysisType === 'product_launch' && 'New products launched by competitor'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[360px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={selectedAnalysisType === 'price_volatility' ? formatPriceData() : formatMarketShareData()} 
                    margin={{ top: 12, right: 24, left: 8, bottom: 12 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      tickMargin={10}
                      minTickGap={18}
                      interval="preserveStartEnd"
                      tickFormatter={(value) => truncateChartLabel(String(value))}
                    />
                    <YAxis 
                      yAxisId="left" 
                      orientation="left" 
                      stroke="#8884d8"
                      width={64}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) =>
                        selectedAnalysisType === 'price_volatility'
                          ? formatCurrencyAxis(Number(value))
                          : Number(value).toLocaleString()
                      }
                    />
                    
                    {selectedAnalysisType === 'price_volatility' && (
                      <YAxis 
                        yAxisId="right" 
                        orientation="right" 
                        stroke="#82ca9d"
                        width={48}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11 }}
                        tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
                      />
                    )}
                    
                    <Tooltip
                      formatter={(value, name) => {
                        if (name === "Average Price ($)") return [formatCurrencyAxis(Number(value)), name];
                        if (name === "Price Change (%)") return [`${Number(value).toFixed(2)}%`, name];
                        return [Number(value).toLocaleString(), name];
                      }}
                    />
                    <Legend verticalAlign="top" align="right" height={32} wrapperStyle={{ fontSize: 12 }} />
                    <Bar 
                      yAxisId="left" 
                      dataKey={selectedAnalysisType === 'price_volatility' ? "averagePrice" : "value"} 
                      name={selectedAnalysisType === 'price_volatility' ? "Average Price ($)" : "Product Count"} 
                      fill="#8884d8"
                      radius={[3, 3, 0, 0]}
                    >
                      {selectedAnalysisType !== 'price_volatility' && (
                        <LabelList dataKey="value" position="top" fontSize={11} />
                      )}
                    </Bar>
                    
                    {selectedAnalysisType === 'price_volatility' && (
                      <Bar 
                        yAxisId="right" 
                        dataKey="changeRate" 
                        name="Price Change (%)" 
                        fill="#82ca9d"
                        radius={[3, 3, 0, 0]}
                      >
                        <LabelList dataKey={(entry) => `${Number(entry.changeRate).toFixed(1)}%`} position="top" fontSize={11} />
                      </Bar>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="pie" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedAnalysisType === 'price_volatility' && 'Price Distribution'}
                {selectedAnalysisType === 'market_share' && 'Market Share Distribution'}
                {selectedAnalysisType === 'product_launch' && 'Product Launch Distribution'}
              </CardTitle>
              <CardDescription>
                {selectedAnalysisType === 'price_volatility' && 'Relative price positions of competitors'}
                {selectedAnalysisType === 'market_share' && 'Percentage of market share by competitor'}
                {selectedAnalysisType === 'product_launch' && 'Distribution of new product launches'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={formatMarketShareData()}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percentage }) => `${truncateChartLabel(name, 12)} ${percentage.toFixed(1)}%`}
                      outerRadius={112}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {formatMarketShareData().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name, props) => {
                      const percentage = props.payload.percentage;
                      return [`${value} (${percentage.toFixed(1)}%)`, name];
                    }} />
                    <Legend verticalAlign="bottom" height={32} wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="radar" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>
                Competitive Positioning
              </CardTitle>
              <CardDescription>
                Multi-dimensional analysis of competitor metrics (higher values are better)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart outerRadius="70%" data={formatRadarData()}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="name" tick={{ fontSize: 11 }} tickFormatter={(value) => truncateChartLabel(String(value), 14)} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                    
                    {formatRadarData().map((_, index) => (
                      <Radar
                        key={`radar-${index}`}
                        name={`Competitor ${index + 1}`}
                        dataKey={({
                          "Price Ranking": index === 0,
                          "Product Count": index === 1,
                          "Price Point": index === 2,
                          "Price Stability": index === 3
                        })[Object.keys(formatRadarData()[0])[index + 1]] ? Object.keys(formatRadarData()[0])[index + 1] : Object.keys(formatRadarData()[0])[1]}
                        stroke={COLORS[index % COLORS.length]}
                        fill={COLORS[index % COLORS.length]}
                        fillOpacity={0.3}
                      />
                    ))}
                    
                    <Legend verticalAlign="bottom" height={32} wrapperStyle={{ fontSize: 12 }} />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      <div className="mt-8">
        <h3 className="text-lg font-semibold mb-4">Key Insights</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {insights.map((insight, index) => (
            <Card key={index}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  {insight.icon}
                  <CardTitle className="text-base">{insight.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{insight.description}</p>
              </CardContent>
            </Card>
          ))}
          
          {competitorIds.map(id => competitorData[id].insights).filter(Boolean).map((insight, index) => (
            <Card key={`db-insight-${index}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Lightbulb className="text-yellow-500 h-4 w-4" />
                  <CardTitle className="text-base">AI Insight</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{insight}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      
      <div className="bg-muted p-4 rounded-lg mt-4">
        <div className="flex items-start gap-2">
          <BarChart2 className="h-5 w-5 mt-1 text-muted-foreground" />
          <div>
            <h4 className="text-sm font-medium mb-1">Recommendation</h4>
            <p className="text-sm text-muted-foreground">
              {selectedAnalysisType === 'price_volatility' && 
                `Based on competitor pricing analysis, consider optimizing your pricing strategy to ${
                  Math.random() > 0.5 ? 
                  "maintain competitive advantage while preserving margins" : 
                  "match or beat key competitors on high-visibility products"
                }.`}
              {selectedAnalysisType === 'market_share' && 
                "Focus on expanding your product catalog in underrepresented categories to gain market share and improve competitive positioning."}
              {selectedAnalysisType === 'product_launch' && 
                "Accelerate your product launch schedule to remain competitive, focusing on innovations that differentiate from recent competitor releases."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompetitorTrends;
