import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, Edit, Search, SlidersHorizontal, ImageIcon, View, BarChart, RefreshCw, QrCode } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useDebounce } from '@/hooks/use-debounce';
import { useCurrency } from '@/hooks/use-currency';
import { useLocation } from 'wouter';
import cn from 'classnames';
import { ProductQRCode } from './ProductQRCode';

interface Product {
  id: number;
  name: string;
  brand?: string | null;
  sku: string;
  barcode?: string | null;
  basePrice: string;
  currentPrice: string;
  currentStock: number;
  description?: string;
  category: string;
  aisle: string;
  shelf: string;
  imageUrl?: string;
  updatedAt: string;
}

interface ProductTableProps {
  products: Product[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onViewHistory: (productId: number) => void;
  onEditProduct: (product: Product) => void;
  onViewAnalysis: (productId: number) => void;
  searchInputRef?: React.RefObject<HTMLInputElement>;
  locationLabelPrimary?: string;
  locationLabelSecondary?: string;
}

const NO_SKU_PREFIX = "__NO_SKU__";

const formatSku = (sku?: string | null) => (
  !sku || sku.startsWith(NO_SKU_PREFIX) ? "N/A" : sku
);

export default function ProductTable({
  products = [],
  isLoading,
  isError,
  onRetry,
  onViewHistory,
  onEditProduct,
  onViewAnalysis,
  searchInputRef,
  locationLabelPrimary = "Aisle",
  locationLabelSecondary = "Shelf",
}: ProductTableProps) {
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    category: "all",
  });
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { currency } = useCurrency();

  const debouncedSearch = useDebounce(filters.search, 300);
  const productsArray = useMemo(() => Array.isArray(products) ? products : [], [products]);

  // Ensure products is an array before filtering
  const filteredProducts = useMemo(() => {
    return productsArray.filter((product) => {
      const matchesSearch = Object.values(product).some(
        (value) =>
          value &&
          value.toString().toLowerCase().includes(debouncedSearch.toLowerCase())
      );

      const matchesCategory = filters.category === 'all' || product.category === filters.category;

      return matchesSearch && matchesCategory;
    });
  }, [productsArray, debouncedSearch, filters]);

  const uniqueCategories = useMemo(() => {
    return Array.from(new Set(productsArray.map(p => p.category)));
  }, [productsArray]);

  const toggleProductSelection = (productId: number) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  const toggleAllProducts = () => {
    if (selectedProducts.size === filteredProducts.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(filteredProducts.map(p => p.id)));
    }
  };

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 p-8 text-center">
        <div className="space-y-2">
          <p className="text-lg font-semibold">No products are available yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            If this is a new store, use the Add Product button above to create your first product. If you already added products, retry loading the product list.
          </p>
        </div>
        <Button onClick={onRetry} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  // Only show full loading skeleton on initial load
  if (isLoading && (!products || products.length === 0)) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and filters section */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Search products... (⌘/Ctrl + F)"
            value={filters.search}
            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
            className="pl-9"
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Category</Label>
                <Select
                  value={filters.category}
                  onValueChange={(value) => setFilters(prev => ({ ...prev, category: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {uniqueCategories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Products table */}
      <div className="relative">
        {/* Show a subtle overlay when data is being refreshed but we still have data */}
        {isLoading && products && products.length > 0 && (
          <div className="absolute top-2 right-2 z-10">
            <div className="flex items-center gap-2 bg-background/80 p-2 rounded-md border shadow-sm">
              <RefreshCw className="h-4 w-4 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Refreshing data...</span>
            </div>
          </div>
        )}
        
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">
                <Checkbox
                  checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                  onCheckedChange={toggleAllProducts}
                />
              </TableHead>
              <TableHead className="w-[80px]">Image</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Barcode</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Base Price</TableHead>
              <TableHead className="text-right">Current Price</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProducts.map((product) => (
              <TableRow key={product.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedProducts.has(product.id)}
                    onCheckedChange={() => toggleProductSelection(product.id)}
                  />
                </TableCell>
                <TableCell>
                  {product.imageUrl ? (
                    <div className="w-10 h-10 rounded overflow-hidden">
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell>{product.brand || "N/A"}</TableCell>
                <TableCell>{formatSku(product.sku)}</TableCell>
                <TableCell>{product.barcode || "N/A"}</TableCell>
                <TableCell>{product.category}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm">{locationLabelPrimary}: {product.aisle}</span>
                    <span className="text-sm text-muted-foreground">{locationLabelSecondary}: {product.shelf}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency,
                  }).format(Number(product.basePrice))}
                </TableCell>
                <TableCell className="text-right">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency,
                  }).format(Number(product.currentPrice))}
                </TableCell>
                <TableCell className="text-right">
                  <span className={cn(
                    "font-medium",
                    product.currentStock <= 10 ? "text-destructive" :
                      product.currentStock <= 20 ? "text-warning" :
                        "text-success"
                  )}>
                    {product.currentStock}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onViewHistory(product.id)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEditProduct(product)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onViewAnalysis(product.id)}
                    >
                      <BarChart className="h-4 w-4" />
                    </Button>
                    <ProductQRCode
                      product={product}
                      locationLabelPrimary={locationLabelPrimary}
                      locationLabelSecondary={locationLabelSecondary}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filteredProducts.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="h-24 text-center">
                  <div className="space-y-1">
                    <p className="font-medium">No products found</p>
                    <p className="text-sm text-muted-foreground">
                      Add a product to start building your catalog, or clear your search and filters.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

interface FilterState {
  search: string;
  category: string;
}
