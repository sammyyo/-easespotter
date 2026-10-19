import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format as formatDate } from "date-fns";
import { DateRange } from "react-day-picker";
import { AlertTriangle, Barcode, Minus, Plus, Printer, Receipt, RotateCcw, Search, ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/use-currency";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";

interface Product {
  id: number;
  name: string;
  brand?: string | null;
  sku: string;
  barcode?: string | null;
  currentPrice: string;
  basePrice: string;
  originalPrice?: string;
  salePrice?: string;
  posPrice?: string;
  activePromotion?: {
    id: number;
    name: string;
    discountPercent: string;
  } | null;
  currentStock: number;
  category?: string | null;
  image?: string | null;
  imageUrl?: string | null;
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface CashierProductsResponse {
  products: Product[];
  total: number;
  limit: number;
  offset: number;
  search: string;
}

interface PosOrder {
  id: number;
  orderDate: string;
  totalAmount: string;
  status: string;
  paymentMethod?: string | null;
  items?: Array<{
    productId: number;
    name: string;
    sku?: string | null;
    barcode?: string | null;
    quantity: number;
    unitPrice: string;
    totalPrice: string;
    imageUrl?: string | null;
  }>;
}

interface PosSaleResponse {
  orderId: number;
  totalAmount: string;
  paymentMethod?: string | null;
  order?: {
    createdAt?: string;
    orderDate?: string;
  };
  items?: Array<{
    productId: number;
    name?: string;
    sku?: string | null;
    barcode?: string | null;
    quantity?: number;
    unitPrice?: string;
    totalPrice?: string;
    originalPrice?: string;
    discountPercent?: string;
    promotion?: {
      id: number;
      name: string;
      discountPercent: string;
    } | null;
    stockAfter: number;
  }>;
}

const paymentMethods = ["cash", "card", "mobile", "other"];
const PRODUCT_BATCH_SIZE = 8;
const RECENT_SALES_PREVIEW_COUNT = 4;
const LOW_STOCK_THRESHOLD = 5;
const CASHIER_CART_STORAGE_PREFIX = "easespotter:cashier-cart";

const getProductPrice = (product: Product) =>
  Number(product.posPrice || product.salePrice || product.currentPrice || product.basePrice || 0);

const getProductOriginalPrice = (product: Product) =>
  Number(product.originalPrice || product.currentPrice || product.basePrice || 0);

const getStockStatus = (stock: number) => {
  if (stock <= 0) {
    return {
      label: "Out of stock",
      badgeVariant: "destructive" as const,
      warning: "This item cannot be sold until stock is updated.",
    };
  }

  if (stock <= LOW_STOCK_THRESHOLD) {
    return {
      label: `Only ${stock} left`,
      badgeVariant: "destructive" as const,
      warning: `Low stock: only ${stock} left.`,
    };
  }

  return {
    label: `Stock ${stock}`,
    badgeVariant: "secondary" as const,
    warning: null,
  };
};

const formatOrderItemsSummary = (order: PosOrder) => {
  const items = order.items || [];
  if (items.length === 0) return "No item details";

  if (items.length === 1) {
    const [item] = items;
    return `${item.name} x${item.quantity}`;
  }

  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  return `${items[0].name} + ${items.length - 1} more (${totalQuantity} items)`;
};

export default function Cashier() {
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [visibleProductCount, setVisibleProductCount] = useState(PRODUCT_BATCH_SIZE);
  const [failedImageProductIds, setFailedImageProductIds] = useState<Set<number>>(new Set());
  const [isRecentSalesDialogOpen, setIsRecentSalesDialogOpen] = useState(false);
  const [isDailySummaryDialogOpen, setIsDailySummaryDialogOpen] = useState(false);
  const [receiptSale, setReceiptSale] = useState<PosSaleResponse | null>(null);
  const [refundOrder, setRefundOrder] = useState<PosOrder | null>(null);
  const [refundType, setRefundType] = useState<"refund" | "void">("refund");
  const [restoreRefundStock, setRestoreRefundStock] = useState(true);
  const [refundReason, setRefundReason] = useState("");
  const [salesDateRange, setSalesDateRange] = useState<DateRange>({});
  const { toast } = useToast();
  const { currency } = useCurrency();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const scannerInputRef = useRef<HTMLInputElement>(null);
  const hasLoadedSavedCartRef = useRef(false);
  const cartStorageKey = `${CASHIER_CART_STORAGE_PREFIX}:${user?.vendorId || user?.id || "unknown"}`;
  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat("en-US", { style: "currency", currency }),
    [currency],
  );

  const { data: productSearchResult, isLoading: productsLoading } = useQuery<CashierProductsResponse>({
    queryKey: ["/api/pos/products", { search: query.trim(), limit: visibleProductCount }],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(visibleProductCount),
        offset: "0",
      });
      const search = query.trim();
      if (search) params.set("search", search);

      const response = await apiRequest("GET", `/api/pos/products?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load products");
      return response.json();
    },
  });
  const products = productSearchResult?.products || [];
  const totalProducts = productSearchResult?.total || 0;

  const { data: recentOrders = [] } = useQuery<PosOrder[]>({
    queryKey: ["/api/pos/orders"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/pos/orders");
      if (!response.ok) throw new Error("Failed to load recent sales");
      return response.json();
    },
  });

  const todayDate = formatDate(new Date(), "yyyy-MM-dd");
  const { data: todayOrders = [] } = useQuery<PosOrder[]>({
    queryKey: ["/api/pos/orders", { startDate: todayDate, endDate: todayDate, limit: 250, summary: "today" }],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: todayDate,
        endDate: todayDate,
        limit: "250",
      });

      const response = await apiRequest("GET", `/api/pos/orders?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load today's sales");
      return response.json();
    },
  });

  const salesStartDate = salesDateRange.from ? formatDate(salesDateRange.from, "yyyy-MM-dd") : "";
  const salesEndDate = salesDateRange.to ? formatDate(salesDateRange.to, "yyyy-MM-dd") : "";

  const { data: filteredSalesOrders = recentOrders, isLoading: isLoadingFilteredSales } = useQuery<PosOrder[]>({
    queryKey: ["/api/pos/orders", { startDate: salesStartDate, endDate: salesEndDate, limit: 250 }],
    enabled: isRecentSalesDialogOpen,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "250" });
      if (salesStartDate) params.set("startDate", salesStartDate);
      if (salesEndDate) params.set("endDate", salesEndDate);

      const response = await apiRequest("GET", `/api/pos/orders?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load sales");
      return response.json();
    },
  });

  const completedFilteredSalesOrders = useMemo(
    () => filteredSalesOrders.filter((order) => order.status === "completed"),
    [filteredSalesOrders],
  );

  const itemSalesTotals = useMemo(() => {
    const totals = new Map<number, {
      productId: number;
      name: string;
      sku?: string | null;
      barcode?: string | null;
      quantity: number;
      revenue: number;
    }>();

    completedFilteredSalesOrders.forEach((order) => {
      (order.items || []).forEach((item) => {
        const current = totals.get(item.productId) || {
          productId: item.productId,
          name: item.name,
          sku: item.sku,
          barcode: item.barcode,
          quantity: 0,
          revenue: 0,
        };

        current.quantity += Number(item.quantity || 0);
        current.revenue += Number(item.totalPrice || 0);
        totals.set(item.productId, current);
      });
    });

    return Array.from(totals.values()).sort((a, b) => {
      if (b.quantity !== a.quantity) return b.quantity - a.quantity;
      return b.revenue - a.revenue;
    });
  }, [completedFilteredSalesOrders]);

  const filteredSalesItemCount = itemSalesTotals.reduce((sum, item) => sum + item.quantity, 0);
  const filteredSalesRevenue = completedFilteredSalesOrders.reduce(
    (sum, order) => sum + Number(order.totalAmount || 0),
    0,
  );
  const todayCompletedOrders = useMemo(
    () => todayOrders.filter((order) => order.status === "completed"),
    [todayOrders],
  );
  const todaySalesRevenue = todayCompletedOrders.reduce(
    (sum, order) => sum + Number(order.totalAmount || 0),
    0,
  );
  const todayItemsSold = todayCompletedOrders.reduce(
    (sum, order) =>
      sum + (order.items || []).reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0),
    0,
  );
  const todayTopProducts = useMemo(() => {
    const totals = new Map<number, {
      productId: number;
      name: string;
      quantity: number;
      revenue: number;
    }>();

    todayCompletedOrders.forEach((order) => {
      (order.items || []).forEach((item) => {
        const current = totals.get(item.productId) || {
          productId: item.productId,
          name: item.name,
          quantity: 0,
          revenue: 0,
        };

        current.quantity += Number(item.quantity || 0);
        current.revenue += Number(item.totalPrice || 0);
        totals.set(item.productId, current);
      });
    });

    return Array.from(totals.values()).sort((a, b) => {
      if (b.quantity !== a.quantity) return b.quantity - a.quantity;
      return b.revenue - a.revenue;
    });
  }, [todayCompletedOrders]);
  const todayTopProductPreview = todayTopProducts[0];
  const receiptItems = receiptSale?.items || [];
  const receiptDate = receiptSale?.order?.createdAt || receiptSale?.order?.orderDate || new Date().toISOString();
  const isOrderReversed = (order: PosOrder) =>
    ["refunded", "voided", "cancelled", "canceled"].includes(order.status);
  const canRefundOrders = user?.role !== "cashier";

  const visibleProducts = products;
  const hasMoreProducts = visibleProducts.length < totalProducts;

  useEffect(() => {
    setVisibleProductCount(PRODUCT_BATCH_SIZE);
  }, [query]);

  useEffect(() => {
    scannerInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (hasLoadedSavedCartRef.current || !user) return;

    hasLoadedSavedCartRef.current = true;

    try {
      const savedCart = window.localStorage.getItem(cartStorageKey);
      if (!savedCart) return;

      const parsedCart = JSON.parse(savedCart);
      if (!Array.isArray(parsedCart)) return;

      const restoredCart = parsedCart
        .filter((item) => item?.product?.id)
        .map((item) => ({
          product: item.product,
          quantity: Math.max(0, Number(item.quantity || 0)),
        }));

      setCart(restoredCart);
    } catch (error) {
      console.warn("Failed to restore cashier cart:", error);
      window.localStorage.removeItem(cartStorageKey);
    }
  }, [cartStorageKey, user]);

  useEffect(() => {
    if (!hasLoadedSavedCartRef.current || !user) return;

    window.localStorage.setItem(cartStorageKey, JSON.stringify(cart));
  }, [cart, cartStorageKey, user]);

  useEffect(() => {
    if (!products.length || cart.length === 0) return;

    const productById = new Map(products.map((product) => [product.id, product]));
    setCart((current) =>
      current
        .map((item) => {
          const latestProduct = productById.get(item.product.id);
          if (!latestProduct) return item;
          return {
            product: latestProduct,
            quantity: Math.min(item.quantity, Number(latestProduct.currentStock ?? 0)),
          };
        })
        .filter((item) => Number(item.product.currentStock ?? 0) > 0),
    );
  }, [products]);

  const focusScannerInput = () => {
    window.setTimeout(() => scannerInputRef.current?.focus(), 0);
  };

  const activeCartItems = cart.filter((item) => item.quantity > 0);
  const subtotal = activeCartItems.reduce(
    (sum, item) => sum + getProductPrice(item.product) * item.quantity,
    0,
  );
  const cartStockIssues = activeCartItems.filter((item) => {
    const availableStock = Number(item.product.currentStock ?? 0);
    return availableStock <= 0 || item.quantity > availableStock;
  });
  const hasCartStockIssues = cartStockIssues.length > 0;

  const addToCart = (product: Product) => {
    if ((product.currentStock ?? 0) <= 0) {
      toast({
        title: "Out of stock",
        description: `${product.name} cannot be added because stock is 0.`,
        variant: "destructive",
      });
      return;
    }

    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (!existing) return [...current, { product, quantity: 1 }];

      if (existing.quantity >= product.currentStock) {
        toast({
          title: "Not enough stock",
          description: `${product.name} only has ${product.currentStock} in stock.`,
          variant: "destructive",
        });
        return current;
      }

      return current.map((item) =>
        item.product.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item,
      );
    });
    focusScannerInput();
  };

  const removeFromCart = (productId: number) => {
    setCart((current) => current.filter((item) => item.product.id !== productId));
    focusScannerInput();
  };

  const updateQuantity = (productId: number, quantity: number) => {
    setCart((current) =>
      current.map((item) => {
        if (item.product.id !== productId) return item;
        return {
          ...item,
          quantity: Math.min(Math.max(quantity, 0), item.product.currentStock),
        };
      }),
    );
    focusScannerInput();
  };

  const findExactScannedProduct = (value: string) => {
    const normalizedValue = value.trim().toLowerCase();
    if (!normalizedValue) return undefined;

    return products.find((product) =>
      String(product.id) === normalizedValue ||
      product.sku?.toLowerCase() === normalizedValue ||
      product.barcode?.toLowerCase() === normalizedValue ||
      product.name.toLowerCase() === normalizedValue,
    );
  };

  const addScannedProductToCart = (product: Product) => {
    addToCart(product);
    setQuery("");
    focusScannerInput();
  };

  const handlePrintReceipt = () => {
    const receiptElement = document.getElementById("cashier-receipt-print");
    if (!receiptElement || !receiptSale) return;

    const printWindow = window.open("", "_blank", "width=420,height=640");
    if (!printWindow) return;

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Receipt #${receiptSale.orderId}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 16px; color: #111827; }
            .receipt { max-width: 320px; margin: 0 auto; }
            .center { text-align: center; }
            .muted { color: #6b7280; font-size: 12px; }
            .row { display: flex; justify-content: space-between; gap: 12px; margin: 6px 0; }
            .item { border-top: 1px solid #e5e7eb; padding: 8px 0; }
            .total { border-top: 2px solid #111827; margin-top: 10px; padding-top: 10px; font-weight: 700; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>${receiptElement.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const openRefundDialog = (order: PosOrder, type: "refund" | "void" = "refund") => {
    setRefundOrder(order);
    setRefundType(type);
    setRestoreRefundStock(true);
    setRefundReason("");
  };

  const handleScanSubmit = () => {
    const value = query.trim();
    if (!value) return;

    const exactMatch = findExactScannedProduct(value);

    if (exactMatch) {
      addScannedProductToCart(exactMatch);
      return;
    }

    if (visibleProducts.length === 1) {
      addScannedProductToCart(visibleProducts[0]);
      return;
    }

    toast({
      title: "No exact match",
      description: "Select the matching product from the search results.",
    });
    focusScannerInput();
  };

  useEffect(() => {
    const value = query.trim();
    if (!value || productsLoading) return;

    const timeoutId = window.setTimeout(() => {
      const normalizedValue = value.toLowerCase();
      const exactCodeMatch = products.find((product) =>
        String(product.id) === normalizedValue ||
        product.sku?.toLowerCase() === normalizedValue ||
        product.barcode?.toLowerCase() === normalizedValue,
      );

      if (exactCodeMatch) addScannedProductToCart(exactCodeMatch);
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [query, products, productsLoading]);

  const completeSaleMutation = useMutation<PosSaleResponse, Error>({
    mutationFn: async () => {
      if (activeCartItems.length === 0) {
        throw new Error("Add at least one item quantity before completing the sale.");
      }

      if (hasCartStockIssues) {
        throw new Error("Fix cart stock issues before completing the sale.");
      }

      const response = await apiRequest("POST", "/api/pos/sales", {
        paymentMethod,
        items: activeCartItems.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
        })),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Failed to complete sale");
      }

      return response.json();
    },
    onSuccess: (sale) => {
      const stockAfterByProductId = new Map(
        (sale.items || []).map((item) => [item.productId, Number(item.stockAfter ?? 0)]),
      );

      setReceiptSale(sale);
      setCart((current) =>
        current
          .map((item) => {
            const stockAfter = stockAfterByProductId.get(item.product.id);
            if (stockAfter === undefined) return item;
            return {
              ...item,
              product: {
                ...item.product,
                currentStock: stockAfter,
              },
              quantity: 0,
            };
          })
          .filter((item) => item.product.currentStock > 0),
      );
      setQuery("");
      focusScannerInput();
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pos/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pos/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/restock-suggestions"] });
      toast({
        title: "Sale completed",
        description: `Order #${sale.orderId} total: ${currencyFormatter.format(Number(sale.totalAmount || 0))}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Sale failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const refundOrderMutation = useMutation({
    mutationFn: async () => {
      if (!refundOrder) throw new Error("Select an order to refund.");

      const response = await apiRequest("POST", `/api/pos/orders/${refundOrder.id}/refund`, {
        type: refundType,
        restoreStock: restoreRefundStock,
        reason: refundReason.trim() || null,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Failed to refund order");
      }

      return response.json();
    },
    onSuccess: () => {
      setRefundOrder(null);
      setRefundReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pos/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pos/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/restock-suggestions"] });
      toast({
        title: refundType === "void" ? "Order voided" : "Order refunded",
        description: restoreRefundStock
          ? "Stock was restored for the refunded items."
          : "Stock was not changed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Refund failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cashier</h1>
        <p className="text-muted-foreground">
          Scan products, complete sales, and update inventory automatically.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Barcode className="h-5 w-5" />
                Scan or Search
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={scannerInputRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") handleScanSubmit();
                    }}
                    placeholder="Scan SKU/barcode or search product"
                    className="pl-9"
                    autoFocus
                  />
                </div>
                <Button onClick={handleScanSubmit}>Add</Button>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Showing {visibleProducts.length} of {totalProducts} products
                </span>
                {query.trim() && (
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => setQuery("")}
                  >
                    Clear search
                  </button>
                )}
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                {productsLoading ? (
                  <div className="text-sm text-muted-foreground">Loading products...</div>
                ) : totalProducts === 0 ? (
                  <div className="text-sm text-muted-foreground">No products found.</div>
                ) : (
                  visibleProducts.map((product) => {
                    const stockStatus = getStockStatus(Number(product.currentStock ?? 0));
                    const originalPrice = getProductOriginalPrice(product);
                    const salePrice = getProductPrice(product);
                    const hasPromotion = !!product.activePromotion && salePrice < originalPrice;

                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => addToCart(product)}
                        className="flex min-h-[76px] items-center gap-3 rounded-md border bg-card p-2.5 text-left transition-colors hover:bg-muted/50"
                      >
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
                          {(product.image || product.imageUrl) && !failedImageProductIds.has(product.id) ? (
                            <img
                              src={product.image || product.imageUrl || ""}
                              alt={product.name}
                              className="h-full w-full object-contain"
                              onError={() => {
                                setFailedImageProductIds((current) => {
                                  const next = new Set(current);
                                  next.add(product.id);
                                  return next;
                                });
                              }}
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] text-muted-foreground">
                              No image
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{product.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{product.sku}</div>
                          {product.barcode && (
                            <div className="truncate text-xs text-muted-foreground">
                              Barcode: {product.barcode}
                            </div>
                          )}
                          <div className="mt-1 flex items-center gap-2">
                            <span className="font-semibold">
                              {currencyFormatter.format(salePrice)}
                            </span>
                            {hasPromotion && (
                              <span className="text-xs text-muted-foreground line-through">
                                {currencyFormatter.format(originalPrice)}
                              </span>
                            )}
                            <Badge variant={stockStatus.badgeVariant}>
                              {stockStatus.label}
                            </Badge>
                          </div>
                          {hasPromotion && (
                            <Badge variant="outline" className="mt-1">
                              {product.activePromotion?.name} . {Number(product.activePromotion?.discountPercent || 0).toFixed(2)}% off
                            </Badge>
                          )}
                          {stockStatus.warning && (
                            <div className="mt-1 text-xs font-medium text-orange-700">
                              {stockStatus.warning}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {hasMoreProducts && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setVisibleProductCount((count) => count + PRODUCT_BATCH_SIZE)}
                >
                  Show {Math.min(PRODUCT_BATCH_SIZE, totalProducts - visibleProducts.length)} More
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 xl:sticky xl:top-4 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Cart
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cart.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Add a product to start a sale.
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map((item) => {
                    const stockStatus = getStockStatus(Number(item.product.currentStock ?? 0));
                    const isAtStockLimit = item.quantity >= Number(item.product.currentStock ?? 0);
                    const isQuickSellRow = item.quantity === 0;
                    const originalPrice = getProductOriginalPrice(item.product);
                    const salePrice = getProductPrice(item.product);
                    const hasPromotion = !!item.product.activePromotion && salePrice < originalPrice;

                    return (
                      <div key={item.product.id} className="rounded-md border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium">{item.product.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {currencyFormatter.format(salePrice)} each
                              {hasPromotion ? ` . Promo price` : ""}
                            </div>
                            {hasPromotion && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                Regular {currencyFormatter.format(originalPrice)} . {Number(item.product.activePromotion?.discountPercent || 0).toFixed(2)}% off
                              </div>
                            )}
                            {isQuickSellRow && (
                              <div className="mt-1 text-xs font-medium text-muted-foreground">
                                Ready for next scan
                              </div>
                            )}
                            {!isQuickSellRow && (stockStatus.warning || isAtStockLimit) && (
                              <div className="mt-1 text-xs font-medium text-orange-700">
                                {isAtStockLimit
                                  ? `Only ${item.product.currentStock} available.`
                                  : stockStatus.warning}
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeFromCart(item.product.id)}
                            aria-label={`Remove ${item.product.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                              disabled={item.quantity <= 0}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-8 text-center font-medium">{item.quantity}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                              disabled={item.quantity >= item.product.currentStock}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="font-semibold">
                            {currencyFormatter.format(salePrice * item.quantity)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold">{currencyFormatter.format(subtotal)}</span>
                </div>
                <label className="grid gap-2 text-sm font-medium">
                  Payment Method
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((method) => (
                        <SelectItem key={method} value={method}>
                          {method.charAt(0).toUpperCase() + method.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                {hasCartStockIssues && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    <div className="flex items-center gap-2 font-medium">
                      <AlertTriangle className="h-4 w-4" />
                      Stock issue
                    </div>
                    <div className="mt-1">
                      {cartStockIssues.map((item) => (
                        <div key={item.product.id}>
                          {item.product.name}: {item.quantity} in cart, {item.product.currentStock ?? 0} available.
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <Button
                  className="w-full"
                  disabled={activeCartItems.length === 0 || hasCartStockIssues || completeSaleMutation.isPending}
                  onClick={() => completeSaleMutation.mutate()}
                >
                  {completeSaleMutation.isPending ? "Completing..." : "Complete Sale"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Today
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border p-2">
                  <div className="text-[11px] text-muted-foreground">Sales</div>
                  <div className="text-sm font-semibold">
                    {currencyFormatter.format(todaySalesRevenue)}
                  </div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-[11px] text-muted-foreground">Orders</div>
                  <div className="text-sm font-semibold">{todayCompletedOrders.length}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-[11px] text-muted-foreground">Items</div>
                  <div className="text-sm font-semibold">{todayItemsSold}</div>
                </div>
              </div>

              {todayTopProductPreview ? (
                <div className="rounded-md bg-muted/40 p-2">
                  <div className="text-[11px] text-muted-foreground">Top Product</div>
                  <div className="truncate text-sm font-medium">{todayTopProductPreview.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {todayTopProductPreview.quantity} sold . {currencyFormatter.format(todayTopProductPreview.revenue)}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  No completed sales today.
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setIsDailySummaryDialogOpen(true)}
              >
                View Daily Summary
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Recent Sales
              </CardTitle>
              {recentOrders.length > RECENT_SALES_PREVIEW_COUNT && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsRecentSalesDialogOpen(true)}
                >
                  See All
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {recentOrders.length === 0 ? (
                <div className="text-sm text-muted-foreground">No sales recorded yet.</div>
              ) : (
                <div className="divide-y">
                  {recentOrders.slice(0, RECENT_SALES_PREVIEW_COUNT).map((order) => (
                    <div key={order.id} className="flex items-center justify-between py-3">
                      <div>
                        <div className="font-medium">Order #{order.id}</div>
                        <div className="max-w-[230px] truncate text-sm">
                          {formatOrderItemsSummary(order)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(order.orderDate).toLocaleString()}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">
                          {currencyFormatter.format(Number(order.totalAmount || 0))}
                        </div>
                        <div className="text-xs capitalize text-muted-foreground">
                          {order.paymentMethod || "unknown"}
                        </div>
                        {canRefundOrders && !isOrderReversed(order) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mt-1 h-7 px-2"
                            onClick={() => openRefundDialog(order)}
                          >
                            Refund
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {recentOrders.length > RECENT_SALES_PREVIEW_COUNT && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setIsRecentSalesDialogOpen(true)}
                >
                  See All Recent Sales
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isDailySummaryDialogOpen} onOpenChange={setIsDailySummaryDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Daily Sales Summary</DialogTitle>
            <DialogDescription>
              Today’s completed sales, excluding refunded and voided orders.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Sales</div>
              <div className="text-2xl font-semibold">
                {currencyFormatter.format(todaySalesRevenue)}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Orders</div>
              <div className="text-2xl font-semibold">{todayCompletedOrders.length}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Items Sold</div>
              <div className="text-2xl font-semibold">{todayItemsSold}</div>
            </div>
          </div>

          <div className="rounded-md border">
            <div className="border-b p-3">
              <h3 className="font-medium">Top-Selling Products</h3>
              <p className="text-sm text-muted-foreground">
                Sorted by quantity sold, then revenue.
              </p>
            </div>

            {todayTopProducts.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No completed sales today.
              </div>
            ) : (
              <div className="max-h-[52vh] divide-y overflow-y-auto">
                {todayTopProducts.map((item, index) => (
                  <div
                    key={item.productId}
                    className="grid gap-3 p-3 sm:grid-cols-[auto_1fr_auto_auto] sm:items-center"
                  >
                    <Badge variant="secondary" className="w-fit">#{index + 1}</Badge>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Product ID: {item.productId}
                      </div>
                    </div>
                    <Badge variant="outline" className="justify-center">
                      {item.quantity} sold
                    </Badge>
                    <div className="font-medium sm:min-w-[96px] sm:text-right">
                      {currencyFormatter.format(item.revenue)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!receiptSale} onOpenChange={(open) => {
        if (!open) setReceiptSale(null);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Receipt</DialogTitle>
            <DialogDescription>
              Sale completed. Review or print the receipt.
            </DialogDescription>
          </DialogHeader>

          {receiptSale && (
            <div className="space-y-4">
              <div id="cashier-receipt-print">
                <div className="receipt rounded-md border bg-background p-4">
                  <div className="center text-center">
                    <div className="text-lg font-semibold">
                      {user?.vendorName || "EaseSpotter"}
                    </div>
                    <div className="muted text-xs text-muted-foreground">
                      Sales Receipt
                    </div>
                  </div>

                  <div className="mt-4 space-y-1 text-sm">
                    <div className="row flex justify-between gap-4">
                      <span className="text-muted-foreground">Order</span>
                      <span className="font-medium">#{receiptSale.orderId}</span>
                    </div>
                    <div className="row flex justify-between gap-4">
                      <span className="text-muted-foreground">Date</span>
                      <span className="text-right">{new Date(receiptDate).toLocaleString()}</span>
                    </div>
                    <div className="row flex justify-between gap-4">
                      <span className="text-muted-foreground">Payment</span>
                      <span className="capitalize">{receiptSale.paymentMethod || paymentMethod}</span>
                    </div>
                  </div>

                  <div className="mt-4 divide-y rounded-md border">
                    {receiptItems.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground">
                        No item details available.
                      </div>
                    ) : (
                      receiptItems.map((item) => (
                        <div key={`${receiptSale.orderId}-${item.productId}`} className="item p-3">
                          <div className="flex justify-between gap-3 text-sm">
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {item.name || `Product #${item.productId}`}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Qty {item.quantity || 0}
                                {item.unitPrice
                                  ? ` x ${currencyFormatter.format(Number(item.unitPrice || 0))}`
                                  : ""}
                              </div>
                              {item.promotion && (
                                <div className="text-xs text-muted-foreground">
                                  {item.promotion.name} . {Number(item.discountPercent || item.promotion.discountPercent || 0).toFixed(2)}% off
                                </div>
                              )}
                            </div>
                            <div className="font-medium">
                              {currencyFormatter.format(Number(item.totalPrice || 0))}
                            </div>
                          </div>
                          {(item.sku || item.barcode) && (
                            <div className="mt-1 truncate text-xs text-muted-foreground">
                              SKU: {item.sku || "N/A"}
                              {item.barcode ? ` . Barcode: ${item.barcode}` : ""}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  <div className="total mt-4 border-t pt-3">
                    <div className="row flex justify-between gap-4 text-base font-semibold">
                      <span>Total</span>
                      <span>{currencyFormatter.format(Number(receiptSale.totalAmount || 0))}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="button" className="flex-1" onClick={handlePrintReceipt}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print Receipt
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setReceiptSale(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isRecentSalesDialogOpen} onOpenChange={setIsRecentSalesDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Recent Sales</DialogTitle>
            <DialogDescription>
              Review cashier sales by date and see item totals.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <label className="grid gap-2 text-sm font-medium">
              Date Range
              <DateRangePicker
                value={salesDateRange}
                onChange={(range) => setSalesDateRange(range || {})}
              />
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSalesDateRange({})}
            >
              Clear
            </Button>
          </div>

          {isLoadingFilteredSales ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Loading sales...
            </div>
          ) : filteredSalesOrders.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No sales found for this date range.
            </div>
          ) : (
            <div className="max-h-[68vh] space-y-4 overflow-y-auto pr-1">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Orders</div>
                  <div className="text-2xl font-semibold">{filteredSalesOrders.length}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Items Sold</div>
                  <div className="text-2xl font-semibold">{filteredSalesItemCount}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Revenue</div>
                  <div className="text-2xl font-semibold">
                    {currencyFormatter.format(filteredSalesRevenue)}
                  </div>
                </div>
              </div>

              <div className="rounded-md border">
                <div className="border-b p-3">
                  <h3 className="font-medium">Items Sold Summary</h3>
                  <p className="text-sm text-muted-foreground">
                    Sorted by total quantity sold.
                  </p>
                </div>
                <div className="divide-y">
                  {itemSalesTotals.map((item) => (
                    <div key={item.productId} className="grid gap-3 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{item.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          SKU: {item.sku || "N/A"}
                          {item.barcode ? ` . Barcode: ${item.barcode}` : ""}
                        </div>
                      </div>
                      <Badge variant="secondary" className="justify-center">
                        {item.quantity} sold
                      </Badge>
                      <div className="font-medium sm:min-w-[92px] sm:text-right">
                        {currencyFormatter.format(item.revenue)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-md border">
                <div className="border-b p-3">
                  <h3 className="font-medium">Orders</h3>
                </div>
                <div className="divide-y">
                  {filteredSalesOrders.map((order) => (
                    <div key={order.id} className="space-y-3 p-4">
                      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                        <div className="min-w-0">
                          <div className="font-medium">Order #{order.id}</div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(order.orderDate).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-4 sm:justify-end">
                          <Badge variant="outline" className="capitalize">
                            {order.status === "completed"
                              ? order.paymentMethod || "unknown"
                              : order.status}
                          </Badge>
                          <div className="min-w-[92px] text-right font-semibold">
                            {currencyFormatter.format(Number(order.totalAmount || 0))}
                          </div>
                        </div>
                      </div>
                      {(order.items || []).length > 0 ? (
                        <div className="rounded-md bg-muted/40">
                          {(order.items || []).map((item) => (
                            <div
                              key={`${order.id}-${item.productId}`}
                              className="grid gap-2 border-b p-3 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium">
                                  {item.name} x{item.quantity}
                                </div>
                                <div className="truncate text-xs text-muted-foreground">
                                  SKU: {item.sku || "N/A"}
                                  {item.barcode ? ` . Barcode: ${item.barcode}` : ""}
                                </div>
                              </div>
                              <div className="text-sm font-medium sm:text-right">
                                {currencyFormatter.format(Number(item.totalPrice || 0))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                          No item details available for this order.
                        </div>
                      )}
                      {canRefundOrders && !isOrderReversed(order) && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openRefundDialog(order, "refund")}
                          >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Refund
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openRefundDialog(order, "void")}
                          >
                            Void
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!refundOrder} onOpenChange={(open) => {
        if (!open) setRefundOrder(null);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{refundType === "void" ? "Void Sale" : "Refund Sale"}</DialogTitle>
            <DialogDescription>
              Reverse Order #{refundOrder?.id}. Choose whether the sold items should be returned to stock.
            </DialogDescription>
          </DialogHeader>

          {refundOrder && (
            <div className="space-y-4">
              <div className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Order total</span>
                  <span className="font-semibold">
                    {currencyFormatter.format(Number(refundOrder.totalAmount || 0))}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Payment</span>
                  <span className="capitalize">{refundOrder.paymentMethod || "unknown"}</span>
                </div>
              </div>

              <label className="grid gap-2 text-sm font-medium">
                Action
                <Select value={refundType} onValueChange={(value) => setRefundType(value as "refund" | "void")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="refund">Refund</SelectItem>
                    <SelectItem value="void">Void</SelectItem>
                  </SelectContent>
                </Select>
              </label>

              <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
                <Checkbox
                  checked={restoreRefundStock}
                  onCheckedChange={(checked) => setRestoreRefundStock(checked === true)}
                />
                <span>
                  <span className="block font-medium">Restore stock</span>
                  <span className="text-muted-foreground">
                    Add the sold quantities back to product stock.
                  </span>
                </span>
              </label>

              <label className="grid gap-2 text-sm font-medium">
                Reason
                <Textarea
                  value={refundReason}
                  onChange={(event) => setRefundReason(event.target.value)}
                  placeholder="Optional reason for this refund or void"
                />
              </label>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  className="flex-1"
                  disabled={refundOrderMutation.isPending}
                  onClick={() => refundOrderMutation.mutate()}
                >
                  {refundOrderMutation.isPending
                    ? "Processing..."
                    : refundType === "void"
                      ? "Void Sale"
                      : "Refund Sale"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRefundOrder(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
