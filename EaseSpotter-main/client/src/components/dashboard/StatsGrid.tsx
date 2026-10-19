import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Package, Activity, TrendingUp } from "lucide-react";
import { useCurrency } from "@/hooks/use-currency";
import { getRecentPriceChanges } from "@/lib/dashboard-metrics";

interface StatsGridProps {
  products: any[];
  priceChanges: any[];
}

export default function StatsGrid({ products = [], priceChanges = [] }: StatsGridProps) {
  // Ensure we have arrays to work with
  const safeProducts = Array.isArray(products) ? products : [];
  const safePriceChanges = Array.isArray(priceChanges) ? priceChanges : [];

  const { currency } = useCurrency();

  const totalProducts = safeProducts.length;

  const recentPriceChanges = getRecentPriceChanges(safePriceChanges, 30);
  const totalPriceChanges = recentPriceChanges.length;

  const averagePrice = totalProducts > 0 
    ? (safeProducts.reduce((acc, product) => acc + Number(product?.currentPrice || 0), 0) / totalProducts)
    : 0;

  const priceIncreases = recentPriceChanges.filter(
    (change) => Number(change?.newPrice) > Number(change?.oldPrice)
  ).length;

  const stats = [
    {
      title: "Total Products",
      value: totalProducts,
      icon: Package,
      description: "Active products in catalog",
    },
    {
      title: "Average Price",
      value: new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(averagePrice),
      icon: DollarSign,
      description: "Across all products",
    },
    {
      title: "Price Changes",
      value: totalPriceChanges,
      icon: Activity,
      description: "Last 30 days",
    },
    {
      title: "Price Increases",
      value: priceIncreases,
      icon: TrendingUp,
      description: totalPriceChanges > 0 
        ? `${((priceIncreases / totalPriceChanges) * 100).toFixed(1)}% of changes`
        : "No price changes",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {stat.title}
            </CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground">
              {stat.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
