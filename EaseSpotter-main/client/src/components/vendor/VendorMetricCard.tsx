import { Card, CardContent } from "@/components/ui/card";
import { useCurrency } from "@/hooks/use-currency";

interface VendorMetricCardProps {
  title: string;
  value: number;
  type: "percent" | "currency" | "number";
  color?: string;
  description?: string;
}

export default function VendorMetricCard({
  title,
  value,
  type,
  color,
  description
}: VendorMetricCardProps) {
  const { currency } = useCurrency();

  const formatValue = () => {
    switch (type) {
      case "percent":
        return `${value.toFixed(1)}%`;
      case "currency":
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency,
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(value);
      case "number":
      default:
        return new Intl.NumberFormat('en-US').format(value);
    }
  };

  const getColorClass = () => {
    if (!color) return "text-foreground";
    
    switch (color) {
      case "red":
        return "text-destructive";
      case "green":
        return "text-success";
      case "amber":
        return "text-warning";
      default:
        return "text-foreground";
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">{title}</h3>
        <p className={`text-2xl font-bold ${getColorClass()}`}>
          {formatValue()}
        </p>
        {description && (
          <p className="text-xs text-muted-foreground mt-1.5">
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}