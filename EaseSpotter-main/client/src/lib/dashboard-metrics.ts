type NumericLike = number | string | null | undefined;

export interface DashboardProduct {
  id: number;
  basePrice?: NumericLike;
  currentPrice?: NumericLike;
  currentStock?: NumericLike;
  lowStockThreshold?: NumericLike;
  reorderPoint?: NumericLike;
}

export interface DashboardPriceChange {
  productId?: number;
  oldPrice?: NumericLike;
  newPrice?: NumericLike;
  timestamp?: string;
}

export interface DashboardPerformanceMetric {
  product_id?: number;
  profit_margin?: NumericLike;
  inventory_turnover?: NumericLike;
  average_rating?: NumericLike;
  click_through_rate?: NumericLike;
  conversion_rate?: NumericLike;
}

export interface DashboardMetricDisplay {
  label: string;
  description: string;
  value: number;
}

export interface DashboardSegmentDisplay {
  label: string;
  value: number;
  color: string;
}

const toNumber = (value: NumericLike) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const average = (values: number[]) => {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const isWithinDays = (value: string | undefined, days: number) => {
  if (!value) return false;

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return timestamp >= cutoff;
};

const normalizeRateToPercent = (value: number) => {
  if (value <= 1) return value * 100;
  return value;
};

export function getRecentPriceChanges(priceChanges: DashboardPriceChange[], days = 30) {
  return priceChanges
    .filter((change) => isWithinDays(change.timestamp, days))
    .sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());
}

export function buildDashboardMetrics(
  products: DashboardProduct[] = [],
  priceChanges: DashboardPriceChange[] = [],
  performanceMetrics: DashboardPerformanceMetric[] = []
) {
  const safeProducts = Array.isArray(products) ? products : [];
  const safePriceChanges = Array.isArray(priceChanges) ? priceChanges : [];
  const safePerformanceMetrics = Array.isArray(performanceMetrics) ? performanceMetrics : [];

  const totalProducts = safeProducts.length;
  const recentPriceChanges = getRecentPriceChanges(safePriceChanges, 30);

  const inStockCount = safeProducts.filter((product) => toNumber(product.currentStock) > 0).length;
  const outOfStockCount = safeProducts.filter((product) => toNumber(product.currentStock) <= 0).length;
  const lowStockCount = safeProducts.filter((product) => {
    const stock = toNumber(product.currentStock);
    const threshold = toNumber(product.lowStockThreshold) || toNumber(product.reorderPoint);
    return stock > 0 && threshold > 0 && stock <= threshold;
  }).length;
  const healthyStockCount = safeProducts.filter((product) => {
    const stock = toNumber(product.currentStock);
    const threshold = toNumber(product.lowStockThreshold) || toNumber(product.reorderPoint);
    return threshold > 0 ? stock > threshold : stock > 0;
  }).length;

  const changedProductIds = new Set(
    recentPriceChanges
      .map((change) => change.productId)
      .filter((productId): productId is number => typeof productId === "number")
  );

  const priceIncreaseCount = recentPriceChanges.filter(
    (change) => toNumber(change.newPrice) > toNumber(change.oldPrice)
  ).length;
  const priceDecreaseCount = recentPriceChanges.filter(
    (change) => toNumber(change.newPrice) < toNumber(change.oldPrice)
  ).length;
  const unchangedPriceCount = recentPriceChanges.filter(
    (change) => toNumber(change.newPrice) === toNumber(change.oldPrice)
  ).length;

  const profitMarginValues = safePerformanceMetrics
    .map((metric) => normalizeRateToPercent(toNumber(metric.profit_margin)))
    .filter((value) => value > 0);
  const conversionRateValues = safePerformanceMetrics
    .map((metric) => normalizeRateToPercent(toNumber(metric.conversion_rate)))
    .filter((value) => value > 0);
  const ctrValues = safePerformanceMetrics
    .map((metric) => normalizeRateToPercent(toNumber(metric.click_through_rate)))
    .filter((value) => value > 0);
  const inventoryTurnoverValues = safePerformanceMetrics
    .map((metric) => toNumber(metric.inventory_turnover))
    .filter((value) => value > 0);
  const ratingValues = safePerformanceMetrics
    .map((metric) => toNumber(metric.average_rating))
    .filter((value) => value > 0);

  const averageBaseAlignment = average(
    safeProducts
      .map((product) => {
        const basePrice = toNumber(product.basePrice);
        const currentPrice = toNumber(product.currentPrice);
        if (basePrice <= 0) return 0;
        return clamp((currentPrice / basePrice) * 100);
      })
      .filter((value) => value > 0)
  );

  const inventoryHealth = totalProducts > 0 ? clamp((healthyStockCount / totalProducts) * 100) : 0;
  const outOfStockRate = totalProducts > 0 ? clamp((outOfStockCount / totalProducts) * 100) : 0;
  const repricedCatalog = totalProducts > 0 ? clamp((changedProductIds.size / totalProducts) * 100) : 0;
  const inStockCoverage = totalProducts > 0 ? clamp((inStockCount / totalProducts) * 100) : 0;
  const lowStockExposure = totalProducts > 0 ? clamp((lowStockCount / totalProducts) * 100) : 0;
  const priceIncreaseShare = recentPriceChanges.length > 0
    ? clamp((priceIncreaseCount / recentPriceChanges.length) * 100)
    : 0;
  const priceDecreaseShare = recentPriceChanges.length > 0
    ? clamp((priceDecreaseCount / recentPriceChanges.length) * 100)
    : 0;
  const averageProfitMargin = average(profitMarginValues);
  const averageConversionRate = average(conversionRateValues);
  const averageCtr = average(ctrValues);
  const averageInventoryTurnover = average(inventoryTurnoverValues);
  const averageRatingPct = clamp((average(ratingValues) / 5) * 100);
  const inventoryTurnoverScore = clamp((averageInventoryTurnover / 10) * 100);

  const hasPerformanceMetrics = safePerformanceMetrics.length > 0;

  return {
    kpis: [
      {
        label: "Inventory Health",
        description: "Products above restock threshold",
        value: inventoryHealth,
      },
      {
        label: "Out-of-Stock Rate",
        description: "Catalog currently unavailable",
        value: outOfStockRate,
      },
      {
        label: "Catalog Repriced",
        description: "Products changed in the last 30 days",
        value: repricedCatalog,
      },
      hasPerformanceMetrics
        ? {
            label: "Profit Margin",
            description: "Average from monthly analytics",
            value: averageProfitMargin,
          }
        : {
            label: "Base Price Alignment",
            description: "Current price versus base price",
            value: averageBaseAlignment,
          },
    ] satisfies DashboardMetricDisplay[],
    stockMetrics: [
      {
        label: "In Stock Coverage",
        description: "Products available to sell",
        value: inStockCoverage,
      },
      {
        label: "Healthy Inventory",
        description: "Stock above alert threshold",
        value: inventoryHealth,
      },
      {
        label: "Low Stock Exposure",
        description: "Products nearing stockout",
        value: lowStockExposure,
      },
    ] satisfies DashboardMetricDisplay[],
    performanceMetrics: hasPerformanceMetrics
      ? [
          {
            label: "Conversion Rate",
            description: "Average monthly conversion",
            value: averageConversionRate,
          },
          {
            label: "Click-Through Rate",
            description: "Average product engagement",
            value: averageCtr,
          },
          {
            label: "Customer Rating",
            description: "Average rating normalized to percent",
            value: averageRatingPct,
          },
        ]
      : [
          {
            label: "Price Increase Share",
            description: "Changes that moved prices up",
            value: priceIncreaseShare,
          },
          {
            label: "Price Decrease Share",
            description: "Changes that moved prices down",
            value: priceDecreaseShare,
          },
          {
            label: "Inventory Turnover Proxy",
            description: "Recent repricing as an activity signal",
            value: repricedCatalog,
          },
        ],
    inventorySegments: [
      { label: "Healthy", value: healthyStockCount, color: "#34C759" },
      { label: "Low", value: lowStockCount, color: "#FF9500" },
      { label: "Out", value: outOfStockCount, color: "#FF2D55" },
    ].filter((segment) => segment.value > 0) satisfies DashboardSegmentDisplay[],
    priceChangeSegments: [
      { label: "Increases", value: priceIncreaseCount, color: "#00E4FF" },
      { label: "Decreases", value: priceDecreaseCount, color: "#AF52DE" },
      { label: "No Change", value: unchangedPriceCount, color: "#FF9500" },
    ].filter((segment) => segment.value > 0) satisfies DashboardSegmentDisplay[],
    recentPriceChanges,
    summary: {
      totalProducts,
      recentPriceChangeCount: recentPriceChanges.length,
      priceIncreaseCount,
      averageInventoryTurnover,
      inventoryTurnoverScore,
    },
  };
}
