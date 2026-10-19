import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/use-currency";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MultiColorCircularProgress, PROGRESS_COLORS } from "@/components/ui/circular-progress";
import {
  Activity,
  BarChart3,
  Brain,
  Boxes,
  Download,
  LineChart as LineChartIcon,
  RefreshCw,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Product {
  id: number;
  name: string;
  sku: string;
  category: string;
  basePrice: string;
  currentPrice: string;
  currentStock: number;
}

interface CustomerSegment {
  id: string;
  name: string;
  description: string;
  count: number;
  metrics: {
    avgOrderValue?: string;
    conversionRate?: string;
    repeatPurchase?: string;
    lifetimeValue?: string;
    lastPurchase?: string;
    recoveryRate?: string;
  };
}

interface ForecastPoint {
  date: string;
  value: number;
  lowerBound?: number;
  upperBound?: number;
}

interface ForecastConfidenceInterval {
  lower?: number;
  upper?: number;
}

interface ForecastRecord {
  id: string;
  productId: number;
  forecastType: "price" | "sales" | "inventory" | string;
  method: string;
  accuracy: number;
  startDate: string;
  endDate: string;
  createdAt?: string;
  confidenceInterval?: ForecastConfidenceInterval;
  forecastData: ForecastPoint[];
}

function normalizeRows(data: unknown) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && "rows" in data && Array.isArray((data as { rows: unknown[] }).rows)) {
    return (data as { rows: unknown[] }).rows;
  }
  return [];
}

function parseNumericValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const match = value.match(/-?\d+(\.\d+)?/);
    if (!match) return 0;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeAccuracy(value: unknown) {
  const parsed = parseNumericValue(value);
  if (parsed <= 1) return parsed * 100;
  return parsed;
}

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return (value as T) ?? fallback;
}

function parseConfidenceInterval(value: unknown): ForecastConfidenceInterval | undefined {
  const raw = parseJsonValue<Record<string, unknown> | null>(value, null);
  if (!raw || typeof raw !== "object") return undefined;

  const lower = raw.lower !== undefined ? parseNumericValue(raw.lower) : undefined;
  const upper = raw.upper !== undefined ? parseNumericValue(raw.upper) : undefined;
  if (lower === undefined && upper === undefined) return undefined;

  return { lower, upper };
}

function parseForecastData(value: unknown, confidenceInterval?: ForecastConfidenceInterval): ForecastPoint[] {
  const raw = parseJsonValue<unknown[]>(value, []);
  if (!Array.isArray(raw)) return [];
  return raw.map((point) => ({
    date: String(point?.date ?? ""),
    value: parseNumericValue(point?.value),
    lowerBound:
      point?.lowerBound !== undefined
        ? parseNumericValue(point.lowerBound)
        : confidenceInterval?.lower !== undefined
          ? parseNumericValue(point?.value) * confidenceInterval.lower
          : undefined,
    upperBound:
      point?.upperBound !== undefined
        ? parseNumericValue(point.upperBound)
        : confidenceInterval?.upper !== undefined
          ? parseNumericValue(point?.value) * confidenceInterval.upper
          : undefined,
  }));
}

function toForecastRecord(row: Record<string, unknown>): ForecastRecord {
  const confidenceInterval = parseConfidenceInterval(row.confidence_interval ?? row.confidenceInterval);
  return {
    id: String(row.id),
    productId: Number(row.product_id ?? row.productId ?? 0),
    forecastType: String(row.forecast_type ?? row.forecastType ?? "unknown"),
    method: String(row.method ?? "unknown"),
    accuracy: normalizeAccuracy(row.accuracy),
    startDate: String(row.start_date ?? row.startDate ?? ""),
    endDate: String(row.end_date ?? row.endDate ?? ""),
    createdAt: row.created_at ? String(row.created_at) : row.createdAt ? String(row.createdAt) : undefined,
    confidenceInterval,
    forecastData: parseForecastData(row.forecast_data ?? row.forecastData ?? [], confidenceInterval),
  };
}

function formatPercent(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

function formatSignedPercent(value: number, digits = 1) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatRelativeAge(dateString?: string) {
  if (!dateString) return "Unknown";
  const createdAt = new Date(dateString);
  if (Number.isNaN(createdAt.getTime())) return "Unknown";

  const diffDays = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

function getFreshnessInfo(dateString?: string) {
  if (!dateString) {
    return { label: "Unknown freshness", variant: "outline" as const };
  }

  const createdAt = new Date(dateString);
  if (Number.isNaN(createdAt.getTime())) {
    return { label: "Unknown freshness", variant: "outline" as const };
  }

  const diffDays = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 30) return { label: "Stale", variant: "destructive" as const };
  if (diffDays > 7) return { label: "Aging", variant: "secondary" as const };
  return { label: "Fresh", variant: "outline" as const };
}

function ForecastChart({
  points,
  forecastType,
  currency,
}: {
  points: ForecastPoint[];
  forecastType: string;
  currency: string;
}) {
  if (!points.length) {
    return <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">No forecast points available.</div>;
  }

  const chartData = points.map((point) => ({
    date: point.date,
    label: point.date ? new Date(point.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "N/A",
    forecast: point.value,
    lowerBound: point.lowerBound,
    upperBound: point.upperBound,
  }));
  const formatValue = (value: number) => {
    if (forecastType === "price") {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(value);
    }

    return Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
  };
  const formatAxisValue = (value: number) => {
    if (forecastType === "price") {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
        notation: Math.abs(value) >= 10000 ? "compact" : "standard",
      }).format(value);
    }

    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
      notation: Math.abs(value) >= 10000 ? "compact" : "standard",
    }).format(value);
  };

  return (
    <div className="h-72 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 12, right: 24, left: 8, bottom: 12 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            tickMargin={10}
            minTickGap={20}
            interval="preserveStartEnd"
          />
          <YAxis
            width={64}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            tickFormatter={(value) => formatAxisValue(Number(value))}
          />
          <Tooltip
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as { date?: string; label?: string } | undefined;
              return row?.date ? new Date(row.date).toLocaleDateString() : row?.label || "";
            }}
            formatter={(value, name) => [formatValue(Number(value)), name]}
          />
          <Legend verticalAlign="top" align="right" height={32} wrapperStyle={{ fontSize: 12 }} />
          <Area
            type="monotone"
            dataKey="upperBound"
            name="Upper bound"
            stroke={PROGRESS_COLORS.purple}
            fill={PROGRESS_COLORS.purple}
            fillOpacity={0.08}
            strokeDasharray="4 4"
            connectNulls
          />
          <Area
            type="monotone"
            dataKey="lowerBound"
            name="Lower bound"
            stroke={PROGRESS_COLORS.blue}
            fill={PROGRESS_COLORS.blue}
            fillOpacity={0.08}
            strokeDasharray="4 4"
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="forecast"
            name="Forecast"
            stroke={PROGRESS_COLORS.cyan}
            strokeWidth={3}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PredictiveAnalytics() {
  const { toast } = useToast();
  const { currency } = useCurrency();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("forecasts");
  const [selectedForecastId, setSelectedForecastId] = useState("");
  const [forecastTypeFilter, setForecastTypeFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/products");
      if (!response.ok) throw new Error("Failed to fetch products");
      return response.json();
    },
    initialData: [],
  });

  const { data: segments = [] } = useQuery<CustomerSegment[]>({
    queryKey: ["/api/marketing/segments"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/marketing/segments");
      if (!response.ok) throw new Error("Failed to fetch segments");
      return response.json();
    },
    initialData: [],
  });

  const { data: forecasts = [], isLoading: forecastsLoading } = useQuery<ForecastRecord[]>({
    queryKey: ["/api/analytics/forecasts", productFilter, forecastTypeFilter, startDateFilter, endDateFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (productFilter !== "all") params.set("productId", productFilter);
      if (forecastTypeFilter !== "all") params.set("forecastType", forecastTypeFilter);
      if (startDateFilter) params.set("startDate", startDateFilter);
      if (endDateFilter) params.set("endDate", endDateFilter);

      const response = await apiRequest("GET", `/api/analytics/forecasts${params.size ? `?${params.toString()}` : ""}`);
      if (!response.ok) throw new Error("Failed to fetch forecasts");
      const data = await response.json();
      return normalizeRows(data).map((row) => toForecastRecord(row as Record<string, unknown>));
    },
    initialData: [],
  });

  const generateSampleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/analytics/generate-sample-data");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || data.message || "Failed to generate sample analytics data");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/forecasts"] });
      toast({
        title: "Forecast data generated",
        description: "Sample forecast records were generated from your current analytics seed path.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to generate forecasts",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const filteredForecasts = useMemo(() => {
    return forecasts.filter((forecast) => {
      const product = productMap.get(forecast.productId);
      const label = `${product?.name ?? ""} ${product?.sku ?? ""} ${forecast.method} ${forecast.forecastType}`.toLowerCase();
      const matchesSearch = !searchTerm.trim() || label.includes(searchTerm.trim().toLowerCase());
      return matchesSearch;
    });
  }, [forecasts, productMap, searchTerm]);

  useEffect(() => {
    if (!filteredForecasts.length) {
      setSelectedForecastId("");
      return;
    }

    if (!filteredForecasts.some((forecast) => forecast.id === selectedForecastId)) {
      setSelectedForecastId(filteredForecasts[0].id);
    }
  }, [filteredForecasts, selectedForecastId]);

  const selectedForecast = filteredForecasts.find((forecast) => forecast.id === selectedForecastId) || null;
  const selectedProduct = selectedForecast ? productMap.get(selectedForecast.productId) : null;

  const overview = useMemo(() => {
    const avgAccuracy = forecasts.length
      ? forecasts.reduce((sum, forecast) => sum + forecast.accuracy, 0) / forecasts.length
      : 0;
    const productsCovered = new Set(forecasts.map((forecast) => forecast.productId)).size;
    const highestAccuracy = forecasts.slice().sort((a, b) => b.accuracy - a.accuracy)[0] || null;
    const typeCounts = forecasts.reduce<Record<string, number>>((acc, forecast) => {
      acc[forecast.forecastType] = (acc[forecast.forecastType] || 0) + 1;
      return acc;
    }, {});
    return { avgAccuracy, productsCovered, highestAccuracy, typeCounts };
  }, [forecasts]);

  const selectedTrend = useMemo(() => {
    if (!selectedForecast?.forecastData.length) return null;
    const first = selectedForecast.forecastData[0].value;
    const last = selectedForecast.forecastData[selectedForecast.forecastData.length - 1].value;
    const changePct = first ? ((last - first) / first) * 100 : 0;
    return { first, last, changePct };
  }, [selectedForecast]);

  const selectedFreshness = selectedForecast ? getFreshnessInfo(selectedForecast.createdAt) : null;

  const segmentSignals = useMemo(() => {
    return segments
      .map((segment) => {
        const averageOrderValue = parseNumericValue(segment.metrics.avgOrderValue);
        const lifetimeValue = parseNumericValue(segment.metrics.lifetimeValue);
        const conversionRate = parseNumericValue(segment.metrics.conversionRate);
        const repeatPurchase = parseNumericValue(segment.metrics.repeatPurchase);
        const recoveryRate = parseNumericValue(segment.metrics.recoveryRate);
        const valueScore = averageOrderValue * 0.3 + lifetimeValue * 0.5;
        const loyaltyScore = repeatPurchase || conversionRate || recoveryRate;
        const opportunityScore = Math.min(
          100,
          Math.max(
            0,
            segment.count * 0.01 +
              valueScore * 0.05 +
              loyaltyScore * 0.8
          )
        );
        const riskScore = Math.min(
          100,
          Math.max(
            0,
            (segment.description.toLowerCase().includes("risk") || segment.description.toLowerCase().includes("inactive") ? 35 : 0) +
              (100 - loyaltyScore) * 0.6
          )
        );

        return {
          ...segment,
          averageOrderValue,
          lifetimeValue,
          conversionRate,
          repeatPurchase,
          recoveryRate,
          opportunityScore,
          riskScore,
        };
      })
      .sort((a, b) => b.opportunityScore - a.opportunityScore);
  }, [segments]);

  const methodBreakdown = useMemo(() => {
    const counts = forecasts.reduce<Record<string, { count: number; accuracySum: number }>>((acc, forecast) => {
      if (!acc[forecast.method]) {
        acc[forecast.method] = { count: 0, accuracySum: 0 };
      }
      acc[forecast.method].count += 1;
      acc[forecast.method].accuracySum += forecast.accuracy;
      return acc;
    }, {});

    return Object.entries(counts)
      .map(([method, stats]) => ({
        method,
        count: stats.count,
        avgAccuracy: stats.count ? stats.accuracySum / stats.count : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [forecasts]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Predictive Analytics</h2>
          <p className="text-muted-foreground">
            Real forecast-driven projections from your stored analytics and customer segment data
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/analytics/forecasts"] })}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={() => generateSampleMutation.mutate()}
            disabled={generateSampleMutation.isPending}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Generate Forecast Sample Data
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Forecast Records</CardDescription>
            <CardTitle>{forecasts.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Across price, sales, and inventory forecast types
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Products Covered</CardDescription>
            <CardTitle>{overview.productsCovered}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Products with at least one stored forecast
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average Accuracy</CardDescription>
            <CardTitle>{formatPercent(overview.avgAccuracy)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Based on forecast rows currently stored in the database
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Top Forecast</CardDescription>
            <CardTitle className="text-base">
              {overview.highestAccuracy ? `${formatPercent(overview.highestAccuracy.accuracy)} ${overview.highestAccuracy.forecastType}` : "No data"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Highest stored forecast accuracy
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="forecasts" className="flex items-center gap-2">
            <LineChartIcon className="h-4 w-4" />
            <span>Forecasts</span>
          </TabsTrigger>
          <TabsTrigger value="segments" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>Segment Signals</span>
          </TabsTrigger>
          <TabsTrigger value="methods" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            <span>Methods</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="forecasts" className="space-y-6">
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Search product or method"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="max-w-sm"
            />
            <Select value={productFilter} onValueChange={setProductFilter}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Product" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Products</SelectItem>
                {products.map((product) => (
                  <SelectItem key={product.id} value={String(product.id)}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={forecastTypeFilter} onValueChange={setForecastTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Forecast type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Forecasts</SelectItem>
                <SelectItem value="price">Price</SelectItem>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="inventory">Inventory</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={startDateFilter}
              onChange={(event) => setStartDateFilter(event.target.value)}
              className="w-[170px]"
            />
            <Input
              type="date"
              value={endDateFilter}
              onChange={(event) => setEndDateFilter(event.target.value)}
              className="w-[170px]"
            />
          </div>

          {!forecastsLoading && !filteredForecasts.length ? (
            <Card>
              <CardContent className="py-12 text-center">
                <h3 className="text-lg font-medium">No predictive forecast data yet</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Generate forecast sample data or seed the forecast tables to activate this section.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Forecast Library</CardTitle>
                  <CardDescription>Select a stored forecast to inspect its projected trend</CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  <div className="space-y-1">
                    {filteredForecasts.map((forecast) => {
                      const product = productMap.get(forecast.productId);
                      return (
                        <button
                          key={forecast.id}
                          type="button"
                          className={`w-full px-6 py-3 text-left transition-colors ${
                            selectedForecast?.id === forecast.id ? "bg-primary/10" : "hover:bg-muted"
                          }`}
                          onClick={() => setSelectedForecastId(forecast.id)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-medium">{product?.name || `Product ${forecast.productId}`}</div>
                              <div className="text-xs text-muted-foreground">
                                {forecast.forecastType} • {forecast.method.replaceAll("_", " ")}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                Generated {formatRelativeAge(forecast.createdAt)}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <Badge variant="outline">{formatPercent(forecast.accuracy)}</Badge>
                              <Badge variant={getFreshnessInfo(forecast.createdAt).variant}>
                                {getFreshnessInfo(forecast.createdAt).label}
                              </Badge>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <div className="lg:col-span-2 space-y-6">
                {selectedForecast && selectedProduct ? (
                  <>
                    <Card>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <CardTitle>{selectedProduct.name}</CardTitle>
                            <CardDescription>
                              {selectedForecast.forecastType} forecast using {selectedForecast.method.replaceAll("_", " ")}
                            </CardDescription>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Badge variant="outline">
                                Generated {formatRelativeAge(selectedForecast.createdAt)}
                              </Badge>
                              {selectedFreshness ? (
                                <Badge variant={selectedFreshness.variant}>{selectedFreshness.label}</Badge>
                              ) : null}
                              {selectedForecast.confidenceInterval ? (
                                <Badge variant="secondary">
                                  Band {selectedForecast.confidenceInterval.lower ?? "?"}x to {selectedForecast.confidenceInterval.upper ?? "?"}x
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-muted-foreground">Accuracy</div>
                            <div className="text-xl font-bold">{formatPercent(selectedForecast.accuracy)}</div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <Card className="bg-muted/40">
                            <CardContent className="p-4">
                              <div className="text-sm text-muted-foreground">Current Product Price</div>
                              <div className="text-2xl font-bold">{formatCurrency(parseNumericValue(selectedProduct.currentPrice))}</div>
                              <div className="text-xs text-muted-foreground mt-1">Live product record</div>
                            </CardContent>
                          </Card>
                          <Card className="bg-muted/40">
                            <CardContent className="p-4">
                              <div className="text-sm text-muted-foreground">Current Stock</div>
                              <div className="text-2xl font-bold">{selectedProduct.currentStock}</div>
                              <div className="text-xs text-muted-foreground mt-1">Live product inventory</div>
                            </CardContent>
                          </Card>
                          <Card className="bg-muted/40">
                            <CardContent className="p-4">
                              <div className="text-sm text-muted-foreground">Projected Trend</div>
                              <div className="flex items-center gap-2 text-2xl font-bold">
                                {selectedTrend && selectedTrend.changePct >= 0 ? (
                                  <TrendingUp className="h-5 w-5 text-green-500" />
                                ) : (
                                  <TrendingDown className="h-5 w-5 text-red-500" />
                                )}
                                <span>{selectedTrend ? formatSignedPercent(selectedTrend.changePct) : "0.0%"}</span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">First to last forecast point</div>
                            </CardContent>
                          </Card>
                        </div>
                        <ForecastChart
                          points={selectedForecast.forecastData}
                          forecastType={selectedForecast.forecastType}
                          currency={currency}
                        />
                      </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardDescription>Forecast Window</CardDescription>
                          <CardTitle className="text-base">
                            {selectedForecast.startDate ? new Date(selectedForecast.startDate).toLocaleDateString() : "N/A"} to{" "}
                            {selectedForecast.endDate ? new Date(selectedForecast.endDate).toLocaleDateString() : "N/A"}
                          </CardTitle>
                        </CardHeader>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardDescription>Projected End Value</CardDescription>
                          <CardTitle>
                            {selectedTrend
                              ? selectedForecast.forecastType === "price"
                                ? formatCurrency(selectedTrend.last)
                                : selectedTrend.last.toFixed(1)
                              : "N/A"}
                          </CardTitle>
                        </CardHeader>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardDescription>Generated At</CardDescription>
                          <CardTitle className="text-base">
                            {selectedForecast.createdAt ? new Date(selectedForecast.createdAt).toLocaleDateString() : "Unknown"}
                          </CardTitle>
                        </CardHeader>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardDescription>Product Category</CardDescription>
                          <CardTitle className="text-base">{selectedProduct.category}</CardTitle>
                        </CardHeader>
                      </Card>
                    </div>
                  </>
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      Select a forecast to inspect its trend.
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="segments" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Segment Opportunity Signals</CardTitle>
                <CardDescription>
                  Derived from your live customer segments and their stored business metrics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {segmentSignals.length ? (
                  segmentSignals.map((segment) => (
                    <div key={segment.id} className="rounded-lg border p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="font-medium">{segment.name}</div>
                          <div className="text-sm text-muted-foreground">{segment.description || "No segment description"}</div>
                        </div>
                        <Badge variant={segment.riskScore >= 60 ? "destructive" : "outline"}>
                          {segment.count.toLocaleString()} customers
                        </Badge>
                      </div>
                      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div className="rounded-md bg-muted/40 p-3">
                          <div className="text-muted-foreground">Opportunity</div>
                          <div className="font-semibold">{segment.opportunityScore.toFixed(0)}</div>
                        </div>
                        <div className="rounded-md bg-muted/40 p-3">
                          <div className="text-muted-foreground">Risk</div>
                          <div className="font-semibold">{segment.riskScore.toFixed(0)}</div>
                        </div>
                        <div className="rounded-md bg-muted/40 p-3">
                          <div className="text-muted-foreground">AOV</div>
                          <div className="font-semibold">{segment.averageOrderValue ? formatCurrency(segment.averageOrderValue) : "N/A"}</div>
                        </div>
                        <div className="rounded-md bg-muted/40 p-3">
                          <div className="text-muted-foreground">LTV</div>
                          <div className="font-semibold">{segment.lifetimeValue ? formatCurrency(segment.lifetimeValue) : "N/A"}</div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
                    No customer segments are available yet.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Signal Mix</CardTitle>
                <CardDescription>
                  High-level predictive readiness from your current segment and forecast coverage
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-center">
                  <MultiColorCircularProgress
                    segments={[
                      { value: Math.min(100, forecasts.length * 5), color: PROGRESS_COLORS.cyan, label: "Forecast Coverage" },
                      { value: Math.min(100, segments.length * 10), color: PROGRESS_COLORS.purple, label: "Segment Coverage" },
                      { value: Math.min(100, overview.avgAccuracy), color: PROGRESS_COLORS.green, label: "Accuracy" },
                    ]}
                    size={180}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 text-sm">
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <span className="text-muted-foreground">Forecast Coverage</span>
                    <span className="font-medium">{overview.productsCovered} products forecasted</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <span className="text-muted-foreground">Segment Coverage</span>
                    <span className="font-medium">{segments.length} live segments</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <span className="text-muted-foreground">Highest Opportunity Segment</span>
                    <span className="font-medium">{segmentSignals[0]?.name || "N/A"}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <span className="text-muted-foreground">Highest Risk Segment</span>
                    <span className="font-medium">
                      {segmentSignals.slice().sort((a, b) => b.riskScore - a.riskScore)[0]?.name || "N/A"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="methods" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Forecast Methods In Use</CardTitle>
                <CardDescription>
                  Actual method distribution from stored forecast records
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {methodBreakdown.length ? (
                  methodBreakdown.map((method) => (
                    <div key={method.method} className="rounded-lg border p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="font-medium">{method.method.replaceAll("_", " ")}</div>
                          <div className="text-sm text-muted-foreground">{method.count} forecast records</div>
                        </div>
                        <Badge variant="outline">{formatPercent(method.avgAccuracy)}</Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
                    No forecast methods are stored yet.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Working Predictive Scope</CardTitle>
                <CardDescription>
                  This section now uses real backend data instead of fake customer-model demos
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-md border p-3">
                  <span className="text-muted-foreground">Forecast Types</span>
                  <span className="font-medium">{Object.keys(overview.typeCounts).join(", ") || "None"}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <span className="text-muted-foreground">Live Product Feed</span>
                  <span className="font-medium">{products.length} products</span>
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <span className="text-muted-foreground">Live Segment Feed</span>
                  <span className="font-medium">{segments.length} segments</span>
                </div>
                <div className="rounded-md border p-3">
                  <div className="font-medium mb-1">What this section does now</div>
                  <div className="text-muted-foreground">
                    Uses stored time-series forecasts, current products, and customer segment metrics to surface real predictive signals.
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="font-medium mb-1">What it does not pretend to do</div>
                  <div className="text-muted-foreground">
                    It does not fabricate churn models, recommendation engines, or customer-level next-purchase predictions without a real backend for them.
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
