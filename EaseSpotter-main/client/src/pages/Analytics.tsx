import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";
import { useState } from "react";

const COLORS = [
  "#FFC700",
  "#FF2D55",
  "#FF5E9F",
  "#56CCF2",
  "#34C759",
];

const chartColors = {
  bar: "#4472C4",
  comparisonBar: "#ED7D31",
  line: "#70AD47",
  accentLine: "#FFC000",
  area: "#56CCF2",
};

interface PriceChange {
  id: number;
  productId: number;
  oldPrice: string;
  newPrice: string;
  timestamp: string;
}

interface Product {
  id: number;
  name: string;
  category: string;
  currentPrice: string;
}

interface ChartDatum {
  label: string;
  value: number;
  secondary?: number;
  tooltipLabel?: string;
}

interface MetricChartProps {
  data: ChartDatum[];
  type: "combo" | "line" | "area";
  emptyLabel?: string;
  formatY?: (value: number) => string;
  legends: Array<{ label: string; color: string; type: "bar" | "line" | "area" }>;
}

const chartFrame = {
  width: 760,
  height: 300,
  padding: {
    top: 24,
    right: 34,
    bottom: 62,
    left: 72,
  },
};

const formatDateKey = (timestamp: string) => {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toISOString().slice(0, 10);
};

const formatDateLabel = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;

  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
  }).format(date);
};

const formatTooltipDate = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const getNiceMax = (value: number) => {
  if (!value || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const normalized = value / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
};

const getRollingAverage = (items: ChartDatum[], windowSize = 3) =>
  items.map((item, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const sample = items.slice(start, index + 1);
    const average = sample.reduce((sum, current) => sum + current.value, 0) / sample.length;

    return {
      ...item,
      secondary: Number(average.toFixed(2)),
    };
  });

function MetricChart({
  data,
  type,
  emptyLabel = "No data available",
  formatY = (value) => String(Math.round(value)),
  legends,
}: MetricChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!data.length) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  const { width, height, padding } = chartFrame;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const chartBottom = padding.top + innerHeight;
  const chartRight = padding.left + innerWidth;
  const maxValue = getNiceMax(
    Math.max(...data.flatMap((item) => [item.value, item.secondary ?? 0])),
  );
  const yTicks = Array.from({ length: 6 }, (_, index) => {
    const ratio = index / 5;
    const value = maxValue * (1 - ratio);
    return {
      value,
      y: padding.top + ratio * innerHeight,
    };
  });
  const pointX = (index: number) =>
    data.length === 1
      ? padding.left + innerWidth / 2
      : padding.left + (index / (data.length - 1)) * innerWidth;
  const pointY = (value: number) => chartBottom - (value / maxValue) * innerHeight;
  const tickEvery = Math.max(1, Math.ceil(data.length / 8));
  const bandWidth = innerWidth / data.length;
  const barWidth = Math.min(34, bandWidth * 0.34);
  const linePath = data
    .map((item, index) => `${index === 0 ? "M" : "L"} ${pointX(index)} ${pointY(item.value)}`)
    .join(" ");
  const secondaryLinePath = data
    .map((item, index) => {
      const secondary = item.secondary ?? item.value;
      return `${index === 0 ? "M" : "L"} ${pointX(index)} ${pointY(secondary)}`;
    })
    .join(" ");
  const areaPath = `M ${pointX(0)} ${chartBottom} ${data
    .map((item, index) => `L ${pointX(index)} ${pointY(item.value)}`)
    .join(" ")} L ${pointX(data.length - 1)} ${chartBottom} Z`;
  const activeItem = hoveredIndex === null ? null : data[hoveredIndex];
  const activeX = hoveredIndex === null ? null : pointX(hoveredIndex);
  const activeY = activeItem
    ? type === "combo"
      ? pointY(activeItem.secondary ?? activeItem.value)
      : pointY(activeItem.value)
    : null;
  const tooltipLeft = activeX === null
    ? 0
    : Math.min(
        82,
        Math.max(18, (activeX / width) * 100),
      );
  const tooltipTop = activeY === null
    ? 0
    : Math.min(
        72,
        Math.max(18, (activeY / height) * 100),
      );

  return (
    <div className="relative flex h-full flex-col">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="min-h-0 flex-1"
        role="img"
        preserveAspectRatio="xMidYMid meet"
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <defs>
          <linearGradient id={`analytics-area-${type}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={chartColors.area} stopOpacity="0.55" />
            <stop offset="100%" stopColor={chartColors.area} stopOpacity="0.08" />
          </linearGradient>
        </defs>

        <text x={8} y={18} className="fill-muted-foreground text-[12px] font-semibold">
          {type === "combo" ? "count" : "price"}
        </text>

        {yTicks.map((tick) => (
          <g key={tick.y}>
            <line
              x1={padding.left}
              x2={chartRight}
              y1={tick.y}
              y2={tick.y}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={padding.left - 12}
              y={tick.y + 4}
              textAnchor="end"
              className="fill-muted-foreground text-[12px]"
            >
              {formatY(tick.value)}
            </text>
          </g>
        ))}

        <line
          x1={padding.left}
          x2={padding.left}
          y1={padding.top}
          y2={chartBottom}
          className="stroke-foreground"
          strokeWidth={2}
        />
        <line
          x1={padding.left}
          x2={chartRight}
          y1={chartBottom}
          y2={chartBottom}
          className="stroke-foreground"
          strokeWidth={2}
        />

        {activeX !== null && (
          <line
            x1={activeX}
            x2={activeX}
            y1={padding.top}
            y2={chartBottom}
            stroke="currentColor"
            className="stroke-muted-foreground"
            strokeDasharray="5 5"
            strokeWidth={1.5}
            opacity={0.55}
          />
        )}

        {type === "combo" &&
          data.map((item, index) => {
            const center = padding.left + index * bandWidth + bandWidth / 2;
            const primaryHeight = chartBottom - pointY(item.value);
            const comparison = item.secondary ?? item.value;
            const comparisonHeight = chartBottom - pointY(comparison);
            const isActive = hoveredIndex === index;

            return (
              <g key={item.label}>
                <rect
                  x={center - barWidth - 2}
                  y={pointY(item.value)}
                  width={barWidth}
                  height={primaryHeight}
                  fill={chartColors.bar}
                  rx={2}
                  opacity={hoveredIndex === null || isActive ? 1 : 0.38}
                />
                <rect
                  x={center + 2}
                  y={pointY(comparison)}
                  width={barWidth}
                  height={comparisonHeight}
                  fill={chartColors.comparisonBar}
                  rx={2}
                  opacity={hoveredIndex === null || isActive ? 0.86 : 0.3}
                />
              </g>
            );
          })}

        {type === "area" && <path d={areaPath} fill={`url(#analytics-area-${type})`} />}

        {(type === "line" || type === "area") && (
          <path
            d={linePath}
            fill="none"
            stroke={type === "line" ? chartColors.accentLine : chartColors.area}
            strokeWidth={4}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {type === "combo" && (
          <path
            d={secondaryLinePath}
            fill="none"
            stroke={chartColors.line}
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {data.map((item, index) => {
          const y = type === "combo" ? pointY(item.secondary ?? item.value) : pointY(item.value);
          const color = type === "combo"
            ? chartColors.line
            : type === "line"
              ? chartColors.accentLine
              : chartColors.area;

          return (
            <circle
              key={`${item.label}-point`}
              cx={pointX(index)}
              cy={y}
              r={hoveredIndex === index ? 7 : 5}
              fill={color}
              className="stroke-background"
              strokeWidth={hoveredIndex === index ? 4 : 3}
              opacity={hoveredIndex === null || hoveredIndex === index ? 1 : 0.45}
            />
          );
        })}

        {data.map((item, index) => {
          if (index % tickEvery !== 0 && index !== data.length - 1) return null;
          return (
            <text
              key={`${item.label}-label`}
              x={pointX(index)}
              y={chartBottom + 24}
              textAnchor="middle"
              className="fill-muted-foreground text-[12px]"
            >
              {item.label}
            </text>
          );
        })}

        {data.map((item, index) => {
          const hitX = type === "combo"
            ? padding.left + index * bandWidth
            : pointX(index) - Math.max(18, bandWidth / 2);
          const hitWidth = type === "combo"
            ? bandWidth
            : Math.max(36, bandWidth);

          return (
            <rect
              key={`${item.label}-hit-area`}
              x={hitX}
              y={padding.top}
              width={hitWidth}
              height={innerHeight}
              fill="transparent"
              className="cursor-crosshair"
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseMove={() => setHoveredIndex(index)}
            />
          );
        })}
      </svg>

      {activeItem && (
        <div
          className="pointer-events-none absolute z-10 min-w-44 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
          style={{
            left: `${tooltipLeft}%`,
            top: `${tooltipTop}%`,
            transform: tooltipLeft > 55 ? "translate(-100%, -115%)" : "translate(8px, -115%)",
          }}
        >
          <div className="mb-1 font-semibold">{activeItem.tooltipLabel || activeItem.label}</div>
          {type === "combo" ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: chartColors.bar }} />
                  Daily changes
                </span>
                <span className="font-medium">{formatY(activeItem.value)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: chartColors.comparisonBar }} />
                  3-day average
                </span>
                <span className="font-medium">{formatY(activeItem.secondary ?? activeItem.value)}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: type === "line" ? chartColors.accentLine : chartColors.area,
                  }}
                />
                {type === "line" ? "Average price" : "Average trend"}
              </span>
              <span className="font-medium">{formatY(activeItem.value)}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 pt-2 text-sm text-muted-foreground">
        {legends.map((legend) => (
          <div key={legend.label} className="flex items-center gap-2">
            <span
              className={legend.type === "line" ? "h-1 w-8 rounded-full" : "h-3 w-8 rounded-sm"}
              style={{ backgroundColor: legend.color }}
            />
            <span>{legend.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Analytics() {
  const { data: priceChanges = [], isLoading: isLoadingChanges } = useQuery<
    PriceChange[]
  >({
    queryKey: ["/api/analytics/price-changes"],
    queryFn: async () => {
      const response = await fetch("/api/analytics/price-changes");
      if (!response.ok) throw new Error("Failed to fetch price changes");
      return response.json();
    },
  });

  const { data: products = [], isLoading: isLoadingProducts } = useQuery<
    Product[]
  >({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const response = await fetch("/api/products");
      if (!response.ok) throw new Error("Failed to fetch products");
      return response.json();
    },
  });

  const { currency } = useCurrency();
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);

  if (isLoadingChanges || isLoadingProducts) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Analytics</h1>
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-[400px] w-full" />
        ))}
      </div>
    );
  }

  const priceChangesByDay = priceChanges.reduce(
    (acc: Record<string, number>, change: PriceChange) => {
      const date = formatDateKey(change.timestamp);
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const priceChangeTrend = Object.entries(priceChangesByDay)
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, count]) => ({
      label: formatDateLabel(date),
      tooltipLabel: formatTooltipDate(date),
      value: count,
    }));
  const priceChangeComboData = getRollingAverage(priceChangeTrend);

  const averagePriceByDay = priceChanges.reduce(
    (
      acc: Record<string, { sum: number; count: number }>,
      change: PriceChange,
    ) => {
      const date = formatDateKey(change.timestamp);
      if (!acc[date]) {
        acc[date] = { sum: 0, count: 0 };
      }
      acc[date].sum += Number(change.newPrice);
      acc[date].count += 1;
      return acc;
    },
    {} as Record<string, { sum: number; count: number }>,
  );

  const averagePrices = Object.entries(averagePriceByDay)
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, data]) => ({
      label: formatDateLabel(date),
      tooltipLabel: formatTooltipDate(date),
      value: Number((data.sum / data.count).toFixed(2)),
    }));

  const categoryData = Object.entries(
    products.reduce(
      (acc: Record<string, number>, product) => {
        const category = product.category || "Uncategorized";
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  ).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Analytics</h1>
        <div className="text-sm text-muted-foreground">
          Last updated: {new Date().toLocaleString()}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Price Changes Over Time</CardTitle>
            <CardDescription>Number of price adjustments per day</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <MetricChart
              data={priceChangeComboData}
              type="combo"
              legends={[
                { label: "Daily changes", color: chartColors.bar, type: "bar" },
                { label: "3-day average", color: chartColors.comparisonBar, type: "bar" },
                { label: "Trend", color: chartColors.line, type: "line" },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Average Price Trend</CardTitle>
            <CardDescription>Daily average price movement</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <MetricChart
              data={averagePrices}
              type="line"
              formatY={formatCurrency}
              legends={[
                { label: "Average price", color: chartColors.accentLine, type: "line" },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Category Distribution</CardTitle>
            <CardDescription>Products by category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <table className="w-full caption-bottom text-sm">
                <thead className="border-b">
                  <tr className="border-b transition-colors hover:bg-muted/50">
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      Category Name
                    </th>
                    <th className="h-12 px-4 text-right align-middle font-medium">
                      Product Count
                    </th>
                    <th className="h-12 px-4 text-right align-middle font-medium">
                      Percentage
                    </th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {categoryData.map((category, index) => {
                    const totalProducts = categoryData.reduce(
                      (sum, cat) => sum + cat.value,
                      0,
                    );
                    const percentage = totalProducts
                      ? ((category.value / totalProducts) * 100).toFixed(1)
                      : "0.0";

                    return (
                      <tr
                        key={category.name}
                        className="border-b transition-colors hover:bg-muted/50"
                      >
                        <td className="p-4 align-middle flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{
                              backgroundColor: COLORS[index % COLORS.length],
                            }}
                          />
                          {category.name}
                        </td>
                        <td className="p-4 align-middle text-right font-medium">
                          {category.value}
                        </td>
                        <td className="p-4 align-middle text-right text-muted-foreground">
                          {percentage}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t">
                  <tr>
                    <th className="h-12 px-4 text-left align-middle font-medium">
                      Total
                    </th>
                    <th className="h-12 px-4 text-right align-middle font-medium">
                      {categoryData.reduce(
                        (sum, category) => sum + category.value,
                        0,
                      )}
                    </th>
                    <th className="h-12 px-4 text-right align-middle font-medium">
                      100%
                    </th>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Price Trend Analysis</CardTitle>
            <CardDescription>Cumulative price changes over time</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <MetricChart
              data={averagePrices}
              type="area"
              formatY={formatCurrency}
              legends={[
                { label: "Price range", color: chartColors.area, type: "area" },
                { label: "Average trend", color: chartColors.area, type: "line" },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
