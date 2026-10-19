import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart } from "@tremor/react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { addDays } from "date-fns";
import { Download, TrendingUp, TrendingDown, Package, Activity } from "lucide-react";

interface PriceChange {
  id: number;
  productId: number;
  oldPrice: string;
  newPrice: string;
  reason: string;
  timestamp: string;
}

interface Product {
  id: number;
  name: string;
  currentPrice: string;
  basePrice: string;
  category: string;
}

// Simple linear regression for price prediction
function calculatePriceForecast(data: { x: number, y: number }[]): { slope: number, intercept: number } {
  const n = data.length;
  if (n < 2) return { slope: 0, intercept: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  data.forEach(point => {
    sumX += point.x;
    sumY += point.y;
    sumXY += point.x * point.y;
    sumXX += point.x * point.x;
  });

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

export function AnalyticsOverview() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: addDays(new Date(), -7),
    to: new Date(),
  });
  
  const handleDateRangeChange = (range: DateRange) => {
    setDateRange(range);
  };
  const [selectedCategory, setSelectedCategory] = useState('all');

  const { data: priceChanges = [], isLoading: priceChangesLoading } = useQuery<PriceChange[]>({
    queryKey: ['/api/analytics/price-changes'],
  });

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ['/api/products'],
  });

  // Calculate analytics metrics
  const metrics = useMemo(() => {
    const filteredProducts = selectedCategory === 'all'
      ? products
      : products.filter(p => p.category === selectedCategory);

    const totalProducts = filteredProducts.length;

    const filteredChanges = priceChanges.filter(change => {
      const changeDate = new Date(change.timestamp);
      return (!dateRange.from || changeDate >= dateRange.from) && (!dateRange.to || changeDate <= dateRange.to);
    });

    const totalPriceChanges = filteredChanges.length;

    // Calculate average price change
    const priceChangePercentages = filteredChanges.map(change =>
      ((Number(change.newPrice) - Number(change.oldPrice)) / Number(change.oldPrice)) * 100
    );
    const averagePriceChange = priceChangePercentages.length > 0
      ? (priceChangePercentages.reduce((a, b) => a + b, 0) / priceChangePercentages.length).toFixed(2)
      : '0';

    // Calculate price trend data and forecast
    const sortedChanges = [...filteredChanges].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const trendData = sortedChanges.map((change, index) => ({
      timestamp: new Date(change.timestamp).toLocaleDateString(),
      price: Number(change.newPrice),
      x: index,
      y: Number(change.newPrice),
    }));

    // Calculate forecast
    const regression = calculatePriceForecast(trendData.map(d => ({ x: d.x, y: d.y })));
    const forecastPoints = 7; // Number of days to forecast

    const lastIndex = trendData.length - 1;
    const forecasted = Array.from({ length: forecastPoints }, (_, i) => {
      const x = lastIndex + i + 1;
      return {
        timestamp: addDays(new Date(sortedChanges[sortedChanges.length - 1].timestamp), i + 1).toLocaleDateString(),
        price: null,
        forecast: regression.slope * x + regression.intercept,
      };
    });

    return {
      totalProducts,
      totalPriceChanges,
      averagePriceChange,
      trendData: [...trendData.map(d => ({ ...d, forecast: null })), ...forecasted],
    };
  }, [products, priceChanges, selectedCategory, dateRange]);

  const categories = useMemo(() =>
    Array.from(new Set(products.map(p => p.category))),
    [products]
  );

  const handleExport = () => {
    const csvContent = [
      ['Date', 'Price', 'Forecast'],
      ...metrics.trendData.map(row => [
        row.timestamp,
        row.price?.toFixed(2) || '',
        row.forecast?.toFixed(2) || ''
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `price-analytics-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (priceChangesLoading || productsLoading) {
    return (
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-[300px]" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Analytics Overview</h2>
        <div className="flex items-center gap-4">
          <DateRangePicker
            value={dateRange}
            onChange={handleDateRangeChange}
          />
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map(category => (
                <SelectItem key={category} value={category}>{category}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export Data
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalProducts}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Price Changes</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalPriceChanges}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Price Change</CardTitle>
            {Number(metrics.averagePriceChange) >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.averagePriceChange}%</div>
          </CardContent>
        </Card>

        {/* Price Trend Chart with Forecast */}
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Price Trends & Forecast</CardTitle>
            <CardDescription>Historical price changes with 7-day forecast</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <LineChart
                data={metrics.trendData}
                index="timestamp"
                categories={["price", "forecast"]}
                colors={["#00E4FF", "#AF52DE"]} // Bright Cyan, Bright Purple
                valueFormatter={(value) => `$${value?.toFixed(2)}`}
                showLegend={true}
                curveType="monotone"
                connectNulls={true}
                className="h-full mt-4"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}