import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface LineChartProps {
  data: {
    date: string;
    price: number;
    competitors?: number;
    recommended?: number;
  }[];
  className?: string;
}

interface BarChartProps {
  data: {
    metric: string;
    current: number;
    projected: number;
  }[];
  className?: string;
}

const formatCurrency = (value: number, compact = false) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: compact ? 0 : 2,
    notation: compact && Math.abs(value) >= 10000 ? "compact" : "standard",
  }).format(value);

const truncateLabel = (label: string, maxLength = 14) =>
  label.length > maxLength ? `${label.slice(0, maxLength - 1)}...` : label;

export function CustomLineChart({ data, className = "h-72" }: LineChartProps) {
  if (!data.length) {
    return (
      <div className={`${className} flex items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground`}>
        No chart data available.
      </div>
    );
  }

  return (
    <div className={`${className} min-w-0`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 24, left: 8, bottom: 12 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            dataKey="date"
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
            tickFormatter={(value) => formatCurrency(Number(value), true)}
          />
          <Tooltip formatter={(value, name) => [formatCurrency(Number(value)), name]} />
          <Legend verticalAlign="top" align="right" height={32} wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="price"
            name="Your Price"
            stroke="#ED7D31"
            strokeWidth={3}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="competitors"
            name="Competitors"
            stroke="#4472C4"
            strokeWidth={3}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="recommended"
            name="Recommended"
            stroke="#70AD47"
            strokeWidth={3}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CustomBarChart({ data, className = "h-80" }: BarChartProps) {
  if (!data.length) {
    return (
      <div className={`${className} flex items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground`}>
        No chart data available.
      </div>
    );
  }

  return (
    <div className={`${className} min-w-0`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 24, left: 8, bottom: 12 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            dataKey="metric"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            tickMargin={10}
            minTickGap={18}
            interval="preserveStartEnd"
            tickFormatter={(value) => truncateLabel(String(value))}
          />
          <YAxis
            width={48}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
          />
          <Tooltip formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]} />
          <Legend verticalAlign="top" align="right" height={32} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="current" name="Current" fill="#4472C4" radius={[3, 3, 0, 0]} />
          <Bar dataKey="projected" name="Projected" fill="#ED7D31" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
