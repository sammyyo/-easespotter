import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/hooks/use-currency";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend,
  Area,
  AreaChart,
  ReferenceLine
} from "recharts";
import { AlertCircle, ArrowUp, ArrowDown, CalendarIcon, LineChart as LineChartIcon } from "lucide-react";

interface ForecastPoint {
  date: string;
  value: string;
  lowerBound: string;
  upperBound: string;
}

interface ForecastData {
  id: number;
  productId: number;
  vendorId: number;
  forecastType: string;
  method: string;
  parameters: {
    alpha: number;
    beta: number;
  };
  forecastData: ForecastPoint[];
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  accuracy: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
}

interface TimeSeriesForecastProps {
  forecasts: ForecastData[];
  isLoading: boolean;
  productName?: string;
}

const TimeSeriesForecast: React.FC<TimeSeriesForecastProps> = ({ forecasts, isLoading, productName }) => {
  const [selectedType, setSelectedType] = useState<string>("sales");
  const { currency } = useCurrency();
  const formatAxisDate = (date: string) => new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const formatMetricValue = (value: number) =>
    selectedType === 'price'
      ? new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency,
          maximumFractionDigits: 0,
        }).format(value)
      : Number(value).toLocaleString();
  const formatTooltipValue = (value: number) =>
    selectedType === 'price'
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
      : value.toFixed(0);
  
  // Filter forecasts by the selected type
  const filteredForecasts = forecasts.filter(f => f.forecastType === selectedType);
  
  // Format data for charting
  const formatForecastData = (forecast: ForecastData | undefined) => {
    if (!forecast) return [];
    
    return forecast.forecastData.map(point => ({
      date: point.date,
      value: parseFloat(point.value),
      lowerBound: parseFloat(point.lowerBound),
      upperBound: parseFloat(point.upperBound)
    }));
  };
  
  // Get selected forecast
  const selectedForecast = filteredForecasts.length > 0 ? filteredForecasts[0] : undefined;
  const chartData = formatForecastData(selectedForecast);
  
  // Calculate trend
  const calculateTrend = (data: { value: number }[]) => {
    if (data.length < 2) return 0;
    return ((data[data.length - 1].value - data[0].value) / data[0].value) * 100;
  };
  
  const trend = calculateTrend(chartData);
  const trendLabel = trend >= 0 ? 'Increasing' : 'Decreasing';
  const trendIcon = trend >= 0 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
  const trendColor = trend >= 0 ? 'text-green-500' : 'text-red-500';
  
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
  
  if (forecasts.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>No Forecast Data</AlertTitle>
        <AlertDescription>
          No time series forecast data available for this product or time period.
        </AlertDescription>
      </Alert>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold">
            Forecast: {productName ? productName : 'All Products'}
          </h3>
          <p className="text-sm text-muted-foreground">
            Showing {selectedType} projections for the next 30 days
          </p>
        </div>
        
        <Select value={selectedType} onValueChange={setSelectedType}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select forecast type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sales">Sales Forecast</SelectItem>
            <SelectItem value="price">Price Forecast</SelectItem>
            <SelectItem value="inventory">Inventory Forecast</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <Tabs defaultValue="line" className="w-full">
        <TabsList className="grid grid-cols-2 w-52">
          <TabsTrigger value="line">Line Chart</TabsTrigger>
          <TabsTrigger value="area">Area Chart</TabsTrigger>
        </TabsList>
        
        <TabsContent value="line" className="pt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
                <div>
                  <CardTitle>
                    {selectedType === 'sales' && 'Sales Forecast'}
                    {selectedType === 'price' && 'Price Forecast'}
                    {selectedType === 'inventory' && 'Inventory Forecast'}
                  </CardTitle>
                  <CardDescription>
                    {selectedType === 'sales' && 'Projected unit sales over time'}
                    {selectedType === 'price' && 'Expected price changes over time'}
                    {selectedType === 'inventory' && 'Projected inventory levels over time'}
                  </CardDescription>
                </div>
                
                {selectedForecast && (
                  <div className="flex items-center gap-2 mt-2 md:mt-0">
                    <Badge variant="outline" className="flex items-center gap-1">
                      <CalendarIcon className="h-3 w-3" />
                      <span>{new Date(selectedForecast.startDate).toLocaleDateString()} - {new Date(selectedForecast.endDate).toLocaleDateString()}</span>
                    </Badge>
                    {selectedForecast.method && (
                      <Badge variant="secondary">
                        {selectedForecast.method.replace('_', ' ')}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[360px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 12, right: 24, left: 8, bottom: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={formatAxisDate}
                      interval="preserveStartEnd"
                      minTickGap={24}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      tickMargin={10}
                    />
                    <YAxis
                      width={64}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      tickFormatter={formatMetricValue}
                    />
                    <Tooltip
                      labelFormatter={(date) => new Date(date).toLocaleDateString()}
                      formatter={(value: number) => [
                        formatTooltipValue(value),
                        selectedType === 'sales' ? 'Units' : selectedType === 'price' ? 'Price' : 'Inventory'
                      ]}
                    />
                    <Legend verticalAlign="top" align="right" height={32} wrapperStyle={{ fontSize: 12 }} />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      name={
                        selectedType === 'sales' ? 'Forecasted Sales' :
                        selectedType === 'price' ? 'Forecasted Price' : 'Forecasted Inventory'
                      } 
                      stroke="#8884d8" 
                      dot={false}
                      strokeWidth={2}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="upperBound" 
                      name="Upper Bound" 
                      stroke="#82ca9d" 
                      strokeDasharray="3 3" 
                      dot={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="lowerBound" 
                      name="Lower Bound" 
                      stroke="#ff8042" 
                      strokeDasharray="3 3" 
                      dot={false}
                    />
                    <ReferenceLine 
                      x={chartData.length > 0 ? chartData[0].date : undefined} 
                      stroke="#ef4444"
                      strokeDasharray="3 3" 
                      label={{ value: 'Today', position: 'insideTopLeft', fill: '#ef4444', fontSize: 11 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              
              {selectedForecast && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="text-muted-foreground text-sm mb-1">Forecast Accuracy</div>
                    <div className="text-xl font-bold">{(parseFloat(selectedForecast.accuracy) * 100).toFixed(1)}%</div>
                  </div>
                  
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="text-muted-foreground text-sm mb-1">Trend</div>
                    <div className={`text-xl font-bold flex items-center gap-1 ${trendColor}`}>
                      {trendIcon} {trendLabel} {Math.abs(trend).toFixed(1)}%
                    </div>
                  </div>
                  
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="text-muted-foreground text-sm mb-1">
                      {selectedType === 'sales' ? 'Expected Total Sales' : 
                       selectedType === 'price' ? 'Average Future Price' : 'Average Inventory Level'}
                    </div>
                    <div className="text-xl font-bold">
                      {selectedType === 'price'
                        ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
                            chartData.reduce((sum, item) => sum + item.value, 0) / chartData.length
                          )
                        : Math.round(chartData.reduce((sum, item) => sum + item.value, 0) / chartData.length)
                      }
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="area" className="pt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
                <div>
                  <CardTitle>
                    {selectedType === 'sales' && 'Sales Forecast with Confidence Intervals'}
                    {selectedType === 'price' && 'Price Forecast with Confidence Intervals'}
                    {selectedType === 'inventory' && 'Inventory Forecast with Confidence Intervals'}
                  </CardTitle>
                  <CardDescription>
                    {selectedType === 'sales' && 'Projected unit sales over time with uncertainty range'}
                    {selectedType === 'price' && 'Expected price changes over time with uncertainty range'}
                    {selectedType === 'inventory' && 'Projected inventory levels over time with uncertainty range'}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[360px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 12, right: 24, left: 8, bottom: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={formatAxisDate}
                      interval="preserveStartEnd"
                      minTickGap={24}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      tickMargin={10}
                    />
                    <YAxis
                      width={64}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      tickFormatter={formatMetricValue}
                    />
                    <Tooltip
                      labelFormatter={(date) => new Date(date).toLocaleDateString()}
                      formatter={(value: number) => [
                        formatTooltipValue(value),
                        selectedType === 'sales' ? 'Units' : selectedType === 'price' ? 'Price' : 'Inventory'
                      ]}
                    />
                    <Legend verticalAlign="top" align="right" height={32} wrapperStyle={{ fontSize: 12 }} />
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      name={
                        selectedType === 'sales' ? 'Forecasted Sales' :
                        selectedType === 'price' ? 'Forecasted Price' : 'Forecasted Inventory'
                      } 
                      stroke="#8884d8" 
                      fill="#8884d8"
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="upperBound" 
                      name="Upper Bound" 
                      stroke="#82ca9d" 
                      fill="#82ca9d"
                      fillOpacity={0.1}
                      strokeDasharray="3 3" 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="lowerBound" 
                      name="Lower Bound" 
                      stroke="#ff8042" 
                      fill="#ff8042"
                      fillOpacity={0.1}
                      strokeDasharray="3 3" 
                    />
                    <ReferenceLine 
                      x={chartData.length > 0 ? chartData[0].date : undefined} 
                      stroke="#ef4444"
                      strokeDasharray="3 3" 
                      label={{ value: 'Today', position: 'insideTopLeft', fill: '#ef4444', fontSize: 11 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              
              <div className="mt-4 bg-muted p-4 rounded-lg">
                <div className="flex items-start gap-2">
                  <LineChartIcon className="h-5 w-5 mt-1 text-muted-foreground" />
                  <div>
                    <h4 className="text-sm font-medium mb-1">About Confidence Intervals</h4>
                    <p className="text-xs text-muted-foreground">
                      The shaded area represents the range of possible values with {selectedForecast?.confidenceInterval ? 
                      `${((selectedForecast.confidenceInterval.upper - selectedForecast.confidenceInterval.lower) * 100).toFixed(0)}%` : '90%'} 
                      confidence. Wider intervals indicate greater uncertainty in the prediction.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TimeSeriesForecast;
