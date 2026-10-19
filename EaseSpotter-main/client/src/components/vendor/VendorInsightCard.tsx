import { ArrowDownIcon, ArrowUpIcon, Info, InfoIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Insight {
  id: string;
  type: 'positive' | 'negative' | 'neutral';
  title: string;
  description: string;
  metric?: string;
  change?: number;
}

interface VendorInsightCardProps {
  insight: Insight;
}

export default function VendorInsightCard({ insight }: VendorInsightCardProps) {
  const { type, title, description, metric, change } = insight;

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'positive':
        return 'bg-success/10 border-success text-success';
      case 'negative':
        return 'bg-destructive/10 border-destructive text-destructive';
      default:
        return 'bg-muted/50 border-muted text-muted-foreground';
    }
  };

  const getChangeIndicator = () => {
    if (change === undefined || change === null) return null;

    const isPositive = type === 'positive';
    const formattedChange = Math.abs(change).toFixed(1);

    return (
      <div className="flex items-center gap-1 mt-1">
        {isPositive ? (
          <ArrowUpIcon className="h-4 w-4 text-success" />
        ) : (
          <ArrowDownIcon className="h-4 w-4 text-destructive" />
        )}
        <span className={isPositive ? "text-success" : "text-destructive"}>
          {formattedChange}%
        </span>
      </div>
    );
  };

  return (
    <Card className={`border-l-4 ${getTypeColor(type)}`}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
          <Badge
            variant={type === 'positive' ? 'default' : type === 'negative' ? 'destructive' : 'outline'}
            className={`mt-0.5 ${type === 'positive' ? 'bg-success/20 hover:bg-success/30 text-success' : ''}`}
          >
            {type === 'positive' ? 'Positive' : type === 'negative' ? 'Needs Attention' : 'Neutral'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-2">{description}</p>
        {metric && (
          <div className="flex items-center justify-between mt-3">
            <span className="text-sm font-medium">{metric}</span>
            {getChangeIndicator()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}