import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";

interface PriceHistoryChartProps {
  productId: number;
}

export default function PriceHistoryChart({ productId }: PriceHistoryChartProps) {
  const { data: history, isLoading } = useQuery({
    queryKey: [`/api/price-history/${productId}`],
  });

  const { currency } = useCurrency();

  if (isLoading) {
    return <Skeleton className="h-[300px] w-full" />;
  }

  const chartData = history?.map((record: any) => ({
    date: new Date(record.timestamp).toLocaleDateString(),
    price: Number(record.newPrice),
  }));

  const formatPrice = (value: number | string) => {
    const numericValue = typeof value === "number" ? value : Number(value);
    if (Number.isNaN(numericValue)) {
      return value;
    }

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(numericValue);
  };

  return (
    <div className="h-[300px] min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 12, right: 24, left: 8, bottom: 12 }}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            dataKey="date"
            interval="preserveStartEnd"
            minTickGap={18}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "currentColor", fontSize: 11 }}
            tickMargin={10}
          />
          <YAxis
            width={72}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "currentColor", fontSize: 11 }}
            tickFormatter={formatPrice}
          />
          <Tooltip
            cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "6px",
            }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
            formatter={(value: number | string) => [formatPrice(value), "Price"]}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#4472C4"
            strokeWidth={3}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
