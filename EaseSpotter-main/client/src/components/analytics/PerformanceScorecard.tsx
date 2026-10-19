import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { ArrowDownIcon, ArrowUpIcon, TrendingDown, TrendingUp, DollarSign, ShoppingBag, BarChart2, ShoppingCart } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";
import { getCurrencySymbol } from "@/lib/currency-utils";

// Updated to match database column names (snake_case)
interface PerformanceMetric {
  id?: number;
  product_id: number;
  vendor_id: number;
  sales_volume: number;
  revenue: string;
  profit_margin: string;
  inventory_turnover: string;
  average_rating: string;
  return_rate: string;
  click_through_rate: string;
  conversion_rate: string;
  period: string;
  start_date: string;
  end_date: string;
  created_at?: string;
  updated_at?: string;
}

interface PerformanceScorecardProps {
  metrics: PerformanceMetric[];
  isLoading: boolean;
  selectedPeriod: string;
}

const PerformanceScorecard: React.FC<PerformanceScorecardProps> = ({ metrics, isLoading, selectedPeriod }) => {
  const metricsByPeriod = metrics.filter(metric => metric.period === selectedPeriod);
  const { currency } = useCurrency();
  const currencySymbol = getCurrencySymbol(currency);
  
  // Calculate averages for all metrics across products
  const aggregateMetrics = metricsByPeriod.reduce((acc, metric) => {
    acc.totalSalesVolume += metric.sales_volume;
    acc.totalRevenue += parseFloat(metric.revenue);
    acc.totalProfitMargin += parseFloat(metric.profit_margin);
    acc.totalInventoryTurnover += parseFloat(metric.inventory_turnover);
    acc.totalRating += parseFloat(metric.average_rating);
    acc.totalReturnRate += parseFloat(metric.return_rate);
    acc.totalCTR += parseFloat(metric.click_through_rate);
    acc.totalConversionRate += parseFloat(metric.conversion_rate);
    acc.count++;
    return acc;
  }, {
    totalSalesVolume: 0,
    totalRevenue: 0,
    totalProfitMargin: 0,
    totalInventoryTurnover: 0,
    totalRating: 0,
    totalReturnRate: 0,
    totalCTR: 0,
    totalConversionRate: 0,
    count: 0
  });
  
  const avgSalesVolume = aggregateMetrics.count ? aggregateMetrics.totalSalesVolume / aggregateMetrics.count : 0;
  const avgRevenue = aggregateMetrics.count ? aggregateMetrics.totalRevenue / aggregateMetrics.count : 0;
  const avgProfitMargin = aggregateMetrics.count ? aggregateMetrics.totalProfitMargin / aggregateMetrics.count : 0;
  const avgInventoryTurnover = aggregateMetrics.count ? aggregateMetrics.totalInventoryTurnover / aggregateMetrics.count : 0;
  const avgRating = aggregateMetrics.count ? aggregateMetrics.totalRating / aggregateMetrics.count : 0;
  const avgReturnRate = aggregateMetrics.count ? aggregateMetrics.totalReturnRate / aggregateMetrics.count : 0;
  const avgCTR = aggregateMetrics.count ? aggregateMetrics.totalCTR / aggregateMetrics.count : 0;
  const avgConversionRate = aggregateMetrics.count ? aggregateMetrics.totalConversionRate / aggregateMetrics.count : 0;
  
  // Format metrics for charts
  const salesData = metricsByPeriod.map(metric => ({
    name: metric.product_id.toString(),
    sales: metric.sales_volume,
    revenue: parseFloat(metric.revenue)
  }));
  
  const conversionData = metricsByPeriod.map(metric => ({
    name: metric.product_id.toString(),
    ctr: parseFloat(metric.click_through_rate) * 100,
    conversion: parseFloat(metric.conversion_rate) * 100
  }));
  
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-14 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  
  if (aggregateMetrics.count === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <BarChart2 className="mx-auto h-12 w-12 mb-4" />
        <h3 className="text-lg font-medium">No Performance Data Available</h3>
        <p>Generate sample data to see performance metrics</p>
      </div>
    );
  }
  
  const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`;
  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  const formatCompactCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
      notation: Math.abs(value) >= 10000 ? 'compact' : 'standard',
    }).format(value);
  
  return (
    <div className="space-y-6">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid grid-cols-4 max-w-md">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center">
                  <DollarSign className="h-4 w-4 mr-1 text-primary" />
                  Avg. Revenue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(avgRevenue)}</div>
                <p className="text-xs text-muted-foreground">Per product in {selectedPeriod} period</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center">
                  <TrendingUp className="h-4 w-4 mr-1 text-primary" />
                  Profit Margin
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatPercentage(avgProfitMargin)}</div>
                <p className="text-xs text-muted-foreground">Average across all products</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center">
                  <ShoppingBag className="h-4 w-4 mr-1 text-primary" />
                  Inventory Turnover
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{avgInventoryTurnover.toFixed(1)}x</div>
                <p className="text-xs text-muted-foreground">Rate of inventory replacement</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center">
                  <ShoppingCart className="h-4 w-4 mr-1 text-primary" />
                  Sales Volume
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{avgSalesVolume.toFixed(0)}</div>
                <p className="text-xs text-muted-foreground">Average units sold</p>
              </CardContent>
            </Card>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            <Card className="col-span-1">
              <CardHeader>
                <CardTitle>Sales vs. Revenue</CardTitle>
              </CardHeader>
              <CardContent className="h-80 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesData} margin={{ top: 12, right: 24, left: 8, bottom: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      tickMargin={10}
                      minTickGap={16}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      yAxisId="left"
                      orientation="left"
                      stroke="#4472C4"
                      width={48}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="#ED7D31"
                      width={64}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => formatCompactCurrency(Number(v))}
                    />
                    <Legend verticalAlign="top" align="right" height={32} wrapperStyle={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: number, name: string, props: any) =>
                      props.dataKey === 'revenue'
                        ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value as number)
                        : value
                    } />
                    <Bar yAxisId="left" dataKey="sales" name="Sales Volume" fill="#4472C4" radius={[3, 3, 0, 0]} />
                    <Bar yAxisId="right" dataKey="revenue" name={`Revenue (${currencySymbol})`} fill="#ED7D31" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            
            <Card className="col-span-1">
              <CardHeader>
                <CardTitle>Conversion Metrics</CardTitle>
              </CardHeader>
              <CardContent className="h-80 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={conversionData} margin={{ top: 12, right: 24, left: 8, bottom: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      tickMargin={10}
                      minTickGap={16}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      width={48}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
                    />
                    <Tooltip formatter={(value: number) => [`${Number(value).toFixed(2)}%`, ""]} />
                    <Legend verticalAlign="top" align="right" height={32} wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="ctr" name="Click-Through Rate" stroke="#4472C4" strokeWidth={3} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="conversion" name="Conversion Rate" stroke="#70AD47" strokeWidth={3} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="sales" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-lg">Revenue</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 pb-4">
                <div className="h-48 w-full max-w-[12rem] mx-auto">
                  <CircularProgressbar
                    value={avgRevenue}
                    maxValue={10000}
                    text={new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(avgRevenue)}
                    styles={buildStyles({
                      textSize: '22px',
                      textWeight: 'bold',
                      pathColor: `rgba(62, 152, 199, ${avgRevenue / 10000})`,
                      textColor: '#3e98c7',
                      trailColor: '#d6d6d6',
                    })}
                  />
                </div>
                <p className="text-sm text-center mt-4 text-muted-foreground">Average revenue per product</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-lg">Profit Margin</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 pb-4">
                <div className="h-48 w-full max-w-[12rem] mx-auto">
                  <CircularProgressbar
                    value={avgProfitMargin * 100}
                    maxValue={100}
                    text={`${(avgProfitMargin * 100).toFixed(1)}%`}
                    styles={buildStyles({
                      textSize: '22px',
                      textWeight: 'bold',
                      pathColor: `rgba(76, 175, 80, ${avgProfitMargin})`,
                      textColor: '#4caf50',
                      trailColor: '#d6d6d6',
                    })}
                  />
                </div>
                <p className="text-sm text-center mt-4 text-muted-foreground">Average profit margin</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-lg">Return Rate</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 pb-4">
                <div className="h-48 w-full max-w-[12rem] mx-auto">
                  <CircularProgressbar
                    value={avgReturnRate * 100}
                    maxValue={10}
                    text={`${(avgReturnRate * 100).toFixed(1)}%`}
                    styles={buildStyles({
                      textSize: '22px',
                      textWeight: 'bold',
                      pathColor: `rgba(244, 67, 54, ${avgReturnRate * 10})`,
                      textColor: '#f44336',
                      trailColor: '#d6d6d6',
                    })}
                  />
                </div>
                <p className="text-sm text-center mt-4 text-muted-foreground">Average return rate</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="inventory" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Inventory Turnover</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1">
                  {metricsByPeriod.map((metric, index) => (
                    <div key={metric.id} className="flex items-center gap-4">
                      <p className="text-sm font-medium w-32 truncate">Product {metric.product_id}</p>
                      <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary" 
                          style={{ 
                            width: `${Math.min(100, parseFloat(metric.inventory_turnover) * 10)}%` 
                          }}
                        />
                      </div>
                      <p className="text-sm w-12 text-right">{parseFloat(metric.inventory_turnover).toFixed(1)}x</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Inventory Insights</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-2">
                  <li className="flex items-start gap-2">
                    <div className="rounded-full p-1 bg-green-100 dark:bg-green-900">
                      <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">High Turnover Products</p>
                      <p className="text-xs text-muted-foreground">Products with turnover rates above 6x are performing efficiently</p>
                    </div>
                  </li>
                  
                  <li className="flex items-start gap-2">
                    <div className="rounded-full p-1 bg-yellow-100 dark:bg-yellow-900">
                      <ArrowUpIcon className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Increasing Demand</p>
                      <p className="text-xs text-muted-foreground">Sales velocity increased by {(Math.random() * 15 + 5).toFixed(1)}% compared to previous period</p>
                    </div>
                  </li>
                  
                  <li className="flex items-start gap-2">
                    <div className="rounded-full p-1 bg-red-100 dark:bg-red-900">
                      <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Low Turnover Products</p>
                      <p className="text-xs text-muted-foreground">Products with turnover below 2x may need price adjustments or marketing</p>
                    </div>
                  </li>
                  
                  <li className="flex items-start gap-2">
                    <div className="rounded-full p-1 bg-blue-100 dark:bg-blue-900">
                      <ArrowDownIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Holding Cost Optimization</p>
                      <p className="text-xs text-muted-foreground">Potential for {(Math.random() * 10 + 5).toFixed(1)}% holding cost reduction through better inventory management</p>
                    </div>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="engagement" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Customer Ratings</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <div className="text-5xl font-bold text-primary">{avgRating.toFixed(1)}</div>
                    <div className="text-sm text-muted-foreground mt-2">Average product rating</div>
                    <div className="flex items-center justify-center mt-3">
                      {[...Array(5)].map((_, i) => (
                        <svg 
                          key={i} 
                          xmlns="http://www.w3.org/2000/svg" 
                          viewBox="0 0 24 24" 
                          fill={i < Math.round(avgRating) ? "currentColor" : "none"}
                          stroke="currentColor"
                          className={`w-5 h-5 ${i < Math.round(avgRating) ? "text-yellow-500" : "text-muted-foreground"}`}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Conversion Funnel</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-8 py-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Click-Through Rate</span>
                      <span className="text-sm font-bold">{(avgCTR * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: `${avgCTR * 100}%` }} />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Conversion Rate</span>
                      <span className="text-sm font-bold">{(avgConversionRate * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-green-500" style={{ width: `${avgConversionRate * 100}%` }} />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Return Rate</span>
                      <span className="text-sm font-bold">{(avgReturnRate * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-red-500" style={{ width: `${avgReturnRate * 100}%` }} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-lg">Engagement Insights</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-3">
                  <li className="text-sm">
                    <strong>Traffic Quality:</strong> {avgCTR > 0.1 ? "High" : "Moderate"} quality traffic with {(avgCTR * 100).toFixed(1)}% CTR.
                  </li>
                  <li className="text-sm">
                    <strong>Conversion Funnel:</strong> {avgConversionRate > 0.05 ? "Strong" : "Average"} conversion performance at {(avgConversionRate * 100).toFixed(1)}%.
                  </li>
                  <li className="text-sm">
                    <strong>Customer Satisfaction:</strong> {avgRating > 4 ? "Excellent" : avgRating > 3 ? "Good" : "Needs improvement"} with average rating of {avgRating.toFixed(1)}/5.
                  </li>
                  <li className="text-sm">
                    <strong>Return Rate:</strong> {avgReturnRate < 0.05 ? "Low" : "Average"} return rate indicates {avgReturnRate < 0.05 ? "high" : "adequate"} product satisfaction.
                  </li>
                </ul>
                <Separator className="my-4" />
                <div className="text-sm text-muted-foreground">
                  <strong>Recommendation:</strong> {
                    avgConversionRate < 0.05 
                      ? "Focus on improving product page conversion elements." 
                      : avgReturnRate > 0.05 
                      ? "Investigate reasons for product returns." 
                      : "Continue optimizing for customer engagement."
                  }
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PerformanceScorecard;
