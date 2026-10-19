import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Package, TrendingUp, ShoppingCart } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";

interface RestockSuggestion {
  id: number;
  name: string;
  currentStock: number;
  lowStockThreshold: number;
  suggestedRestockAmount: number;
  sku: string;
  category: string;
}

export function RestockSuggestions() {
  const queryClient = useQueryClient();

  const { data: suggestions = [], isLoading, error, refetch } = useQuery<RestockSuggestion[]>({
    queryKey: ["/api/products/restock-suggestions"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/products/restock-suggestions");
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.message || data?.error || "Failed to load restock suggestions");
      }

      return Array.isArray(data) ? data : [];
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  });

  const restockMutation = useMutation({
    mutationFn: async ({ productId, amount }: { productId: number; amount: number }) => {
      const response = await apiRequest("POST", `/api/products/${productId}/restock`, { amount });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to restock product");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/restock-suggestions"] });
      toast({
        title: "Success",
        description: "Product restocked successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to restock product",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Loading Restock Suggestions...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Inventory Status</AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          <p>Products can still be managed below. Restock suggestions are temporarily unavailable and will appear after products have stock and low-stock thresholds.</p>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
            className="w-fit"
          >
            Retry Now
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!suggestions.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Inventory Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <p>No restock suggestions yet. Add products with stock levels and low-stock thresholds, or keep managing your current products below.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Restock Suggestions ({suggestions.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {suggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className="flex items-center justify-between border rounded-lg p-4 hover:bg-accent/50 transition-colors"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">{suggestion.name}</h4>
                  <Badge variant="outline">{suggestion.category}</Badge>
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-sm text-muted-foreground">
                        Stock: {suggestion.currentStock} / {suggestion.lowStockThreshold}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Current stock is below the minimum threshold of {suggestion.lowStockThreshold} units</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <p className="text-sm text-muted-foreground">
                  SKU: {suggestion.sku}
                </p>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() =>
                        restockMutation.mutate({
                          productId: suggestion.id,
                          amount: suggestion.suggestedRestockAmount,
                        })
                      }
                      disabled={restockMutation.isPending}
                      className="gap-2"
                    >
                      <ShoppingCart className="h-4 w-4" />
                      Add {suggestion.suggestedRestockAmount} units
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Click to restock with the suggested amount</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
