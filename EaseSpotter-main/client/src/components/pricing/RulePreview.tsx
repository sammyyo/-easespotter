import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Product {
  id: number;
  name: string;
  sku: string;
  basePrice: string;
  currentPrice: string;
  currentStock: number;
  lowStockThreshold?: number | null;
  reorderPoint?: number | null;
  lastRestocked?: string | null;
  category: string;
  aisle: string;
  shelf: string;
  updatedAt?: string;
}

interface RulePreviewProps {
  conditions: Record<string, unknown>;
  adjustment: {
    type: string;
    value: number;
  };
}

export function RulePreview({ conditions, adjustment }: RulePreviewProps) {
  const [affectedProducts, setAffectedProducts] = useState<Product[]>([]);
  const [isValidRule, setIsValidRule] = useState(true);
  
  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/products");
      return response.json();
    },
  });

  const normalizeProductField = (field: string) => {
    if (field === "stock") return "currentStock";
    if (field === "product") return "name";
    if (field === "lastUpdated") return "updatedAt";
    return field;
  };

  const getInventoryStatus = (product: Product) => {
    const stock = Number(product.currentStock ?? 0);
    const lowStockThreshold = Number(product.lowStockThreshold ?? product.reorderPoint ?? 0);
    const reorderPoint = Number(product.reorderPoint ?? 0);

    if (stock <= 0) return "out_of_stock";
    if (lowStockThreshold > 0 && stock <= lowStockThreshold) return "low_stock";
    if (reorderPoint > 0 && stock >= reorderPoint * 3) return "overstocked";
    return "in_stock";
  };

  const getDaysSinceRestocked = (product: Product) => {
    if (!product.lastRestocked) return null;

    const restockedAt = new Date(product.lastRestocked).getTime();
    if (!Number.isFinite(restockedAt)) return null;

    return Math.floor((Date.now() - restockedAt) / (1000 * 60 * 60 * 24));
  };

  const getProductConditionValue = (product: Product, field: string) => {
    if (field === "inventoryStatus") return getInventoryStatus(product);
    if (field === "daysSinceRestocked") return getDaysSinceRestocked(product);
    return (product as any)[normalizeProductField(field)];
  };

  const toComparableNumber = (value: unknown) => {
    if (value instanceof Date) return value.getTime();
    if (typeof value === "string" && Number.isNaN(Number(value))) {
      const timestamp = new Date(value).getTime();
      return Number.isFinite(timestamp) ? timestamp : Number.NaN;
    }
    return Number(value);
  };

  const compareConditionValue = (actualValue: unknown, operator: string, expectedValue: unknown) => {
    if (["greaterThan", "lessThan", "greaterThanOrEqual", "lessThanOrEqual", "between"].includes(operator)) {
      const actualNumber = toComparableNumber(actualValue);
      const expectedNumber = toComparableNumber(expectedValue);

      if (!Number.isFinite(actualNumber)) return false;

      if (operator === "greaterThan") return actualNumber > expectedNumber;
      if (operator === "lessThan") return actualNumber < expectedNumber;
      if (operator === "greaterThanOrEqual") return actualNumber >= expectedNumber;
      if (operator === "lessThanOrEqual") return actualNumber <= expectedNumber;
      if (operator === "between" && Array.isArray(expectedValue) && expectedValue.length >= 2) {
        const min = toComparableNumber(expectedValue[0]);
        const max = toComparableNumber(expectedValue[1]);
        return Number.isFinite(min) && Number.isFinite(max) && actualNumber >= min && actualNumber <= max;
      }

      return false;
    }

    if (operator === "contains") {
      return String(actualValue ?? "").toLowerCase().includes(String(expectedValue ?? "").toLowerCase());
    }

    if (operator === "in") {
      const values = Array.isArray(expectedValue)
        ? expectedValue
        : String(expectedValue ?? "").split(",").map((value) => value.trim());
      return values.some((value) => String(value).toLowerCase() === String(actualValue ?? "").toLowerCase());
    }

    if (operator === "notEquals") {
      return String(actualValue ?? "").toLowerCase() !== String(expectedValue ?? "").toLowerCase();
    }

    return String(actualValue ?? "").toLowerCase() === String(expectedValue ?? "").toLowerCase();
  };

  useEffect(() => {
    // Validate conditions first
    if (Object.keys(conditions).length === 0) {
      setIsValidRule(false);
      return;
    }
    
    setIsValidRule(true);
    
    // Filter products based on conditions
    const filtered = products.filter(product => {
      // Check each condition
      for (const [field, conditionValue] of Object.entries(conditions)) {
        if (typeof conditionValue === 'object') {
          // Complex condition
          const condition = conditionValue as Record<string, any>;
          const operator = Object.keys(condition)[0];
          const value = condition[operator];
          
          const productValue = getProductConditionValue(product, field);
          if (!compareConditionValue(productValue, operator, value)) return false;
        } else {
          // Simple equality condition
          if (!compareConditionValue(getProductConditionValue(product, field), "equals", conditionValue)) return false;
        }
      }
      return true;
    });
    
    setAffectedProducts(filtered);
  }, [conditions, products]);

  // Calculate new price based on adjustment
  const calculateNewPrice = (currentPrice: string): string => {
    const basePrice = parseFloat(currentPrice);
    if (adjustment.type === 'percentage') {
      const newPrice = basePrice * (1 + adjustment.value / 100);
      return newPrice.toFixed(2);
    } else {
      const newPrice = basePrice + adjustment.value;
      return Math.max(0, newPrice).toFixed(2);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (!isValidRule) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Add at least one condition to preview affected products
        </AlertDescription>
      </Alert>
    );
  }

  if (affectedProducts.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No products match your rule conditions. Try adjusting your criteria.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          Rule Preview
          <Badge className="ml-2" variant="outline">
            {affectedProducts.length} products affected
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Inventory</TableHead>
                <TableHead>Current Price</TableHead>
                <TableHead>New Price</TableHead>
                <TableHead>Difference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {affectedProducts.slice(0, 5).map((product) => {
                const currentPrice = parseFloat(product.currentPrice);
                const newPrice = parseFloat(calculateNewPrice(product.currentPrice));
                const difference = newPrice - currentPrice;
                const percentChange = ((difference / currentPrice) * 100).toFixed(1);
                
                return (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div className="font-medium">{product.name}</div>
                      <div className="text-xs text-muted-foreground">{product.sku}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{product.currentStock}</div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {getInventoryStatus(product).replace(/_/g, ' ')}
                      </div>
                    </TableCell>
                    <TableCell>${product.currentPrice}</TableCell>
                    <TableCell>${newPrice.toFixed(2)}</TableCell>
                    <TableCell>
                      <span className={difference >= 0 ? "text-green-600" : "text-red-600"}>
                        {difference >= 0 ? '+' : ''}{difference.toFixed(2)} ({percentChange}%)
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
              
              {affectedProducts.length > 5 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Showing 5 of {affectedProducts.length} affected products
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
