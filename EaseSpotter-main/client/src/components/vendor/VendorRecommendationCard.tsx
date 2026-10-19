import { CircleArrowRightIcon, LightbulbIcon, PuzzleIcon, Tag, ZapIcon } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Recommendation {
  id: string;
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'high' | 'medium' | 'low';
  category: 'inventory' | 'pricing' | 'customer' | 'operations';
}

interface VendorRecommendationCardProps {
  recommendation: Recommendation;
  onImplement: () => void;
}

export default function VendorRecommendationCard({ 
  recommendation,
  onImplement
}: VendorRecommendationCardProps) {
  const { title, description, impact, effort, category } = recommendation;

  const getCategoryIcon = () => {
    switch (category) {
      case 'inventory':
        return <PuzzleIcon className="h-4 w-4 mr-1" />;
      case 'pricing':
        return <Tag className="h-4 w-4 mr-1" />;
      case 'customer':
        return <CircleArrowRightIcon className="h-4 w-4 mr-1" />;
      case 'operations':
        return <ZapIcon className="h-4 w-4 mr-1" />;
      default:
        return <LightbulbIcon className="h-4 w-4 mr-1" />;
    }
  };

  const getCategoryLabel = () => {
    switch (category) {
      case 'inventory':
        return 'Inventory';
      case 'pricing':
        return 'Pricing';
      case 'customer':
        return 'Customer';
      case 'operations':
        return 'Operations';
      default:
        return 'General';
    }
  };

  const getCategoryVariant = () => {
    switch (category) {
      case 'inventory':
        return 'inventory';
      case 'pricing':
        return 'competitive';
      case 'customer':
        return 'loyalty';
      case 'operations':
        return 'default';
      default:
        return 'outline';
    }
  };

  const getImpactBadgeClass = () => {
    switch (impact) {
      case 'high':
        return 'bg-success/10 text-success';
      case 'medium':
        return 'bg-warning/10 text-warning';
      case 'low':
        return 'bg-muted/50 text-muted-foreground';
      default:
        return 'bg-muted/50 text-muted-foreground';
    }
  };

  const getEffortBadgeClass = () => {
    switch (effort) {
      case 'high':
        return 'bg-destructive/10 text-destructive';
      case 'medium':
        return 'bg-warning/10 text-warning';
      case 'low':
        return 'bg-success/10 text-success';
      default:
        return 'bg-muted/50 text-muted-foreground';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start gap-2">
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
          <Badge variant={getCategoryVariant()} className="flex items-center">
            {getCategoryIcon()}
            {getCategoryLabel()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">{description}</p>
        <div className="flex flex-wrap gap-2">
          <div className={`text-xs rounded-full px-2 py-1 ${getImpactBadgeClass()}`}>
            Impact: {impact.charAt(0).toUpperCase() + impact.slice(1)}
          </div>
          <div className={`text-xs rounded-full px-2 py-1 ${getEffortBadgeClass()}`}>
            Effort: {effort.charAt(0).toUpperCase() + effort.slice(1)}
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button 
          onClick={onImplement} 
          variant="outline" 
          className="w-full"
        >
          Implement Recommendation
        </Button>
      </CardFooter>
    </Card>
  );
}