import { db } from "@db";
import * as schema from "@db/schema";
import { 
  vendors, products, priceRules, priceHistory, catalogPriceSnapshots, competitors, competitorProducts,
  competitorPrices, promotions, systemStatus, users, invitations,
  userSettings, userActivityLogs, permissionProfiles, userPermissions, userBookmarks,
  marketingCampaigns, insertMarketingCampaignSchema,
  marketingAbTests, marketingAbTestVariants, marketingAbTestEvents,
  insertMarketingAbTestSchema,
  marketingCustomerJourneys, marketingJourneyStages, marketingJourneyTouchpoints,
  insertMarketingCustomerJourneySchema, insertMarketingJourneyStageSchema, insertMarketingJourneyTouchpointSchema,
  marketingPersonalizationTemplates, marketingPersonalizationRules, marketingPersonalizationVariations, marketingPersonalizationEvents,
  insertMarketingPersonalizationTemplateSchema, insertMarketingPersonalizationRuleSchema, insertMarketingPersonalizationVariationSchema, insertMarketingPersonalizationEventSchema,
  productPerformanceMetrics, timeSeriesForecasts, competitorTrendAnalysis,
  customerSegments, customerSegmentMemberships, customers, orders, orderItems, insertCustomerSegmentSchema,
  // Supplier management tables
  suppliers, supplierPerformance, supplierCosts, supplierInvoices, supplierInvoiceLineItems,
  priceChangeApprovals, repricingSchedules, negotiationRecommendations,
  // Channel management tables
  salesChannels, productChannelPricing, priceRuleChannels, channelPerformanceMetrics,
  // Store integration tables
  storeProfiles, storeFollowers, enhancedPromotions, storeIntegrationLogs, storeNotifications, storeProducts
} from "@db/schema";
import { eq, and, desc, lte, lt, gte, sql, inArray, ne, or, ilike } from "drizzle-orm";
import { WebSocketServer, WebSocket } from "ws";
import { createServer, type Server } from "http";
import type { Express, Request, Response, NextFunction } from "express";
import os from "os";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { setupAuth } from "./auth";
import { hashPassword } from "./auth";
import {
  getBrevoInvitationConfigStatus,
  sendInvitationEmail as sendBrevoInvitationEmail,
} from "./services/brevo-service";
import storeRoutes from "./store-integration-routes";
import qrCodeRoutes from "./qr-code-routes";
import qrScanRoutes from "./qr-scan-routes";
import storeDataRoutes from "./store-data-routes";
import userSessionRoutes from "./user-session-routes";
import { getPublicBaseUrl } from "./config";
import { getUploadRoot, persistImageDataUrl, removePersistedUpload } from "./image-storage";

const DEFAULT_VENDOR_LOGO_PATH = "/logos/default-vendor.png";
const PUBLIC_STOCK_COUNT_THRESHOLD = 50;

const getInvitationBaseUrl = () =>
  (process.env.INVITATION_BASE_URL || process.env.BASE_URL || process.env.FRONTEND_URL || 'https://www.easespotter.com').replace(/\/+$/, '');

const createPublicStockPayload = (stockValue: unknown) => {
  const stock = Number(stockValue ?? 0);
  const showStockCount = stock <= PUBLIC_STOCK_COUNT_THRESHOLD;

  return {
    stock: showStockCount ? stock : null,
    currentStock: showStockCount ? stock : null,
    inStock: stock > 0,
    showStockCount,
    stockDisplayThreshold: PUBLIC_STOCK_COUNT_THRESHOLD,
  };
};

const resolveStoreLogoUrl = (logoUrl: string | null | undefined, baseUrl: string) => {
  const value = logoUrl?.trim();

  if (!value || value.includes("/src/assets/") || value.includes("client/src/assets/")) {
    return `${baseUrl}${DEFAULT_VENDOR_LOGO_PATH}`;
  }

  if (value.startsWith("/")) {
    return `${baseUrl}${value}`;
  }

  return value;
};

const resolvePublicAssetUrl = (assetUrl: string | null | undefined, baseUrl: string) => {
  const value = assetUrl?.trim();

  if (!value) return null;
  if (value.startsWith("data:image/")) return value;
  if (value.startsWith("/")) return `${baseUrl}${value}`;

  return value;
};

// Helper function to generate sample products based on store category
function generateSampleProducts(category: string, vendorId: number) {
  const products = [];
  const categories = {
    electronics: [
      { name: "4K Smart TV", basePrice: "599.99", description: "55-inch 4K Smart TV with HDR", currentStock: 15, aisle: "A", shelf: "1" },
      { name: "Wireless Earbuds", basePrice: "129.99", description: "True wireless earbuds with active noise cancellation", currentStock: 30, aisle: "B", shelf: "2" },
      { name: "Smartphone", basePrice: "799.99", description: "Latest model smartphone with high-resolution camera", currentStock: 25, aisle: "C", shelf: "1" },
      { name: "Laptop", basePrice: "999.99", description: "Lightweight laptop with 16GB RAM and 512GB SSD", currentStock: 10, aisle: "A", shelf: "3" },
      { name: "Bluetooth Speaker", basePrice: "79.99", description: "Portable Bluetooth speaker with 20-hour battery life", currentStock: 20, aisle: "B", shelf: "4" }
    ],
    clothing: [
      { name: "Men's T-Shirt", basePrice: "24.99", description: "100% cotton t-shirt in various colors", currentStock: 50, aisle: "A", shelf: "1" },
      { name: "Women's Jeans", basePrice: "49.99", description: "High-waisted skinny jeans", currentStock: 35, aisle: "B", shelf: "2" },
      { name: "Casual Sneakers", basePrice: "59.99", description: "Unisex casual sneakers for everyday wear", currentStock: 25, aisle: "C", shelf: "1" },
      { name: "Winter Jacket", basePrice: "129.99", description: "Insulated winter jacket with hood", currentStock: 15, aisle: "A", shelf: "3" },
      { name: "Athletic Shorts", basePrice: "34.99", description: "Quick-dry athletic shorts", currentStock: 40, aisle: "B", shelf: "4" }
    ],
    food: [
      { name: "Organic Apples", basePrice: "3.99", description: "1lb bag of organic apples", currentStock: 100, aisle: "A", shelf: "1" },
      { name: "Whole Grain Bread", basePrice: "4.49", description: "24oz loaf of whole grain bread", currentStock: 30, aisle: "B", shelf: "2" },
      { name: "Milk", basePrice: "3.29", description: "1 gallon of whole milk", currentStock: 45, aisle: "C", shelf: "1" },
      { name: "Ground Coffee", basePrice: "11.99", description: "12oz bag of premium ground coffee", currentStock: 25, aisle: "A", shelf: "3" },
      { name: "Free-Range Eggs", basePrice: "5.99", description: "Dozen free-range eggs", currentStock: 50, aisle: "B", shelf: "4" }
    ],
    home: [
      { name: "Decorative Pillow", basePrice: "24.99", description: "18x18 inch decorative throw pillow", currentStock: 20, aisle: "A", shelf: "1" },
      { name: "Stainless Steel Pot", basePrice: "49.99", description: "5-quart stainless steel cooking pot", currentStock: 15, aisle: "B", shelf: "2" },
      { name: "Bath Towel Set", basePrice: "39.99", description: "Set of 4 cotton bath towels", currentStock: 25, aisle: "C", shelf: "1" },
      { name: "Table Lamp", basePrice: "59.99", description: "Contemporary table lamp with LED bulb", currentStock: 12, aisle: "A", shelf: "3" },
      { name: "Area Rug", basePrice: "129.99", description: "5x7 foot area rug", currentStock: 8, aisle: "B", shelf: "4" }
    ],
    beauty: [
      { name: "Facial Moisturizer", basePrice: "24.99", description: "Daily facial moisturizer with SPF 30", currentStock: 30, aisle: "A", shelf: "1" },
      { name: "Shampoo", basePrice: "12.99", description: "16oz bottle of hydrating shampoo", currentStock: 40, aisle: "B", shelf: "2" },
      { name: "Mascara", basePrice: "15.99", description: "Volumizing mascara", currentStock: 25, aisle: "C", shelf: "1" },
      { name: "Face Serum", basePrice: "39.99", description: "Anti-aging face serum with vitamin C", currentStock: 20, aisle: "A", shelf: "3" },
      { name: "Shaving Cream", basePrice: "8.99", description: "6oz can of premium shaving cream", currentStock: 35, aisle: "B", shelf: "4" }
    ],
    other: [
      { name: "Basic Product 1", basePrice: "19.99", description: "Sample product description", currentStock: 20, aisle: "A", shelf: "1" },
      { name: "Basic Product 2", basePrice: "29.99", description: "Sample product description", currentStock: 15, aisle: "B", shelf: "2" },
      { name: "Basic Product 3", basePrice: "39.99", description: "Sample product description", currentStock: 25, aisle: "C", shelf: "1" },
      { name: "Basic Product 4", basePrice: "49.99", description: "Sample product description", currentStock: 10, aisle: "A", shelf: "3" },
      { name: "Basic Product 5", basePrice: "59.99", description: "Sample product description", currentStock: 30, aisle: "B", shelf: "4" }
    ]
  };

  // Default to 'other' category if not found
  const categoryItems = categories[category] || categories.other;
  
  // Generate unique SKUs for products
  categoryItems.forEach((item, index) => {
    const sku = `${category.substring(0, 3).toUpperCase()}-${Date.now().toString().substring(9)}-${index + 1}`;
    
    products.push({
      vendorId,
      name: item.name,
      sku,
      basePrice: item.basePrice,
      currentPrice: item.basePrice,
      description: item.description,
      category,
      aisle: item.aisle,
      shelf: item.shelf,
      currentStock: item.currentStock,
      lowStockThreshold: Math.floor(item.currentStock * 0.2),
      createdAt: new Date(),
      updatedAt: new Date()
    });
  });
  
  return products;
}

// Authentication middleware to protect routes
const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    if (req.user?.role === "cashier") {
      const allowedCashierRequest =
        (req.method === "GET" && req.path === "/api/pos/products") ||
        (req.method === "POST" && req.path === "/api/pos/sales") ||
        (req.method === "GET" && req.path === "/api/pos/orders") ||
        (req.method === "GET" && req.path === "/api/stores/profile") ||
        (req.method === "GET" && /^\/api\/vendors\/\d+$/.test(req.path));

      if (!allowedCashierRequest) {
        return res.status(403).json({ message: "Cashier accounts can only access the Cashier workspace." });
      }
    }

    return next();
  }
  return res.status(401).json({ error: "Authentication required" });
};

// Role-based middleware for admin-only routes
const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated() && req.user?.role === 'admin') {
    return next();
  }
  return res.status(403).json({ error: "Admin access required" });
};

// Role-based middleware that accepts an array of allowed roles
const hasRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.isAuthenticated() && req.user?.role && roles.includes(req.user.role)) {
      return next();
    }
    return res.status(403).json({ error: `Required role not found` });
  };
};

let pricingAutomationTablesReady: Promise<void> | null = null;

function getNextRepricingRun(frequency: string) {
  const next = new Date();
  switch (frequency) {
    case "hourly":
      next.setHours(next.getHours() + 1);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "daily":
    default:
      next.setDate(next.getDate() + 1);
      break;
  }
  return next;
}

async function ensurePricingAutomationTables() {
  if (!pricingAutomationTablesReady) {
    pricingAutomationTablesReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS supplier_invoices (
          id SERIAL PRIMARY KEY,
          vendor_id INTEGER NOT NULL REFERENCES vendors(id),
          supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
          invoice_number VARCHAR(120),
          invoice_date TIMESTAMP NOT NULL DEFAULT NOW(),
          status VARCHAR(30) NOT NULL DEFAULT 'imported',
          source_type VARCHAR(30) NOT NULL DEFAULT 'manual',
          subtotal NUMERIC(12, 2),
          currency_code VARCHAR(3) DEFAULT 'USD',
          notes TEXT,
          imported_by_user_id INTEGER REFERENCES users(id),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS supplier_invoice_line_items (
          id SERIAL PRIMARY KEY,
          invoice_id INTEGER NOT NULL REFERENCES supplier_invoices(id),
          vendor_id INTEGER NOT NULL REFERENCES vendors(id),
          supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
          product_id INTEGER REFERENCES products(id),
          source_sku VARCHAR(120),
          description TEXT NOT NULL,
          quantity INTEGER,
          unit_cost NUMERIC(10, 2) NOT NULL,
          total_cost NUMERIC(12, 2),
          match_status VARCHAR(30) NOT NULL DEFAULT 'unmatched',
          match_confidence NUMERIC(5, 2),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS price_change_approvals (
          id SERIAL PRIMARY KEY,
          vendor_id INTEGER NOT NULL REFERENCES vendors(id),
          product_id INTEGER NOT NULL REFERENCES products(id),
          supplier_cost_id INTEGER REFERENCES supplier_costs(id),
          invoice_line_item_id INTEGER REFERENCES supplier_invoice_line_items(id),
          old_price NUMERIC(10, 2) NOT NULL,
          recommended_price NUMERIC(10, 2) NOT NULL,
          target_margin NUMERIC(5, 2) NOT NULL,
          latest_unit_cost NUMERIC(10, 2) NOT NULL,
          status VARCHAR(30) NOT NULL DEFAULT 'pending',
          requested_by_user_id INTEGER REFERENCES users(id),
          reviewed_by_user_id INTEGER REFERENCES users(id),
          reviewed_at TIMESTAMP,
          applied_at TIMESTAMP,
          notes TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS repricing_schedules (
          id SERIAL PRIMARY KEY,
          vendor_id INTEGER NOT NULL UNIQUE REFERENCES vendors(id),
          is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          target_margin NUMERIC(5, 2) NOT NULL DEFAULT 35,
          mode VARCHAR(30) NOT NULL DEFAULT 'approval_required',
          frequency VARCHAR(30) NOT NULL DEFAULT 'daily',
          last_run_at TIMESTAMP,
          next_run_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
    })();
  }

  return pricingAutomationTablesReady;
}

function parseInvoiceCsv(csvText: string) {
  return csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [sourceSku, description, quantity, unitCost, totalCost] = line.split(",").map((value) => value?.trim());
      return {
        sourceSku: sourceSku || undefined,
        description: description || `Invoice line ${index + 1}`,
        quantity: quantity ? Number(quantity) : undefined,
        unitCost: Number(unitCost),
        totalCost: totalCost ? Number(totalCost) : undefined,
      };
    });
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
const safeDivide = (numerator: number, denominator: number) => (denominator > 0 ? numerator / denominator : 0);
const toAmount = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

function getVendorHealthVendorId(req: Request, res: Response): number | null {
  const queryVendorId = req.query.vendorId ? parseInt(req.query.vendorId as string, 10) : null;

  if (queryVendorId) {
    if (req.user?.role !== "admin" && req.user?.role !== "vendor" && req.user?.vendorId !== queryVendorId) {
      res.status(403).json({ message: "You don't have access to this vendor's health data" });
      return null;
    }
    return queryVendorId;
  }

  if (!req.user?.vendorId) {
    res.status(403).json({ message: "You must be associated with a vendor to access vendor health data" });
    return null;
  }

  return req.user.vendorId;
}

async function buildVendorHealthPayload(vendorId: number) {
  const now = new Date();
  const currentPeriodStart = new Date(now);
  currentPeriodStart.setDate(currentPeriodStart.getDate() - 30);

  const previousPeriodStart = new Date(currentPeriodStart);
  previousPeriodStart.setDate(previousPeriodStart.getDate() - 30);

  const [vendorProducts, vendorCustomers, vendorOrders, vendorOrderItems] = await Promise.all([
    db.select().from(products).where(eq(products.vendorId, vendorId)),
    db.select().from(customers).where(eq(customers.vendorId, vendorId)),
    db.select().from(orders).where(eq(orders.vendorId, vendorId)),
    db
      .select({
        orderDate: orders.orderDate,
        orderStatus: orders.status,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        totalPrice: orderItems.totalPrice,
        productBasePrice: products.basePrice,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orders.vendorId, vendorId)),
  ]);

  const normalizeStatus = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
  const excludedSalesStatuses = new Set(["cancelled", "canceled", "returned", "refunded"]);
  const returnStatuses = new Set(["returned", "refunded"]);

  const isInCurrentPeriod = (date: Date | null | undefined) => !!date && date >= currentPeriodStart && date <= now;
  const isInPreviousPeriod = (date: Date | null | undefined) => !!date && date >= previousPeriodStart && date < currentPeriodStart;
  const isCountedSale = (status: string) => !excludedSalesStatuses.has(status);

  const currentOrders = vendorOrders.filter((order) => isInCurrentPeriod(order.orderDate));
  const previousOrders = vendorOrders.filter((order) => isInPreviousPeriod(order.orderDate));

  const currentSalesOrders = currentOrders.filter((order) => isCountedSale(normalizeStatus(order.status)));
  const previousSalesOrders = previousOrders.filter((order) => isCountedSale(normalizeStatus(order.status)));
  const currentReturnedOrders = currentOrders.filter((order) => returnStatuses.has(normalizeStatus(order.status)));

  const totalSales = currentSalesOrders.reduce((sum, order) => sum + toAmount(order.totalAmount), 0);
  const previousSales = previousSalesOrders.reduce((sum, order) => sum + toAmount(order.totalAmount), 0);
  const orderCount = currentSalesOrders.length;
  const previousOrderCount = previousSalesOrders.length;
  const avgOrderValue = safeDivide(totalSales, orderCount);

  const salesGrowth = previousSales > 0 ? ((totalSales - previousSales) / previousSales) * 100 : (totalSales > 0 ? 100 : 0);
  const orderGrowth = previousOrderCount > 0 ? ((orderCount - previousOrderCount) / previousOrderCount) * 100 : (orderCount > 0 ? 100 : 0);

  const customerCount = vendorCustomers.length;
  const newCustomersCurrent = vendorCustomers.filter((customer) => isInCurrentPeriod(customer.accountCreated)).length;
  const newCustomersPrevious = vendorCustomers.filter((customer) => isInPreviousPeriod(customer.accountCreated)).length;
  const customerGrowth = newCustomersPrevious > 0
    ? ((newCustomersCurrent - newCustomersPrevious) / newCustomersPrevious) * 100
    : (newCustomersCurrent > 0 ? 100 : 0);

  const activeCustomersCurrent = vendorCustomers.filter((customer) => isInCurrentPeriod(customer.lastActive ?? null)).length;
  const activeCustomerRate = safeDivide(activeCustomersCurrent, customerCount) * 100;

  const itemsOutOfStock = vendorProducts.filter((product) => (product.currentStock ?? 0) <= 0).length;
  const lowStockItems = vendorProducts.filter((product) => {
    const stock = product.currentStock ?? 0;
    const threshold = product.lowStockThreshold ?? product.reorderPoint ?? 0;
    return stock > 0 && threshold > 0 && stock <= threshold;
  }).length;

  const productCount = vendorProducts.length;
  const outOfStockRate = safeDivide(itemsOutOfStock, productCount) * 100;
  const lowStockRate = safeDivide(lowStockItems, productCount) * 100;

  const currentPeriodOrderItems = vendorOrderItems.filter((item) => {
    const status = normalizeStatus(item.orderStatus);
    return isInCurrentPeriod(item.orderDate) && isCountedSale(status);
  });

  const realizedRevenue = currentPeriodOrderItems.reduce((sum, item) => sum + toAmount(item.totalPrice), 0);
  const realizedCost = currentPeriodOrderItems.reduce(
    (sum, item) => sum + toAmount(item.productBasePrice) * (item.quantity ?? 0),
    0,
  );

  const fallbackMarginSource = vendorProducts
    .filter((product) => toAmount(product.currentPrice) > 0)
    .map((product) => {
      const currentPrice = toAmount(product.currentPrice);
      const basePrice = toAmount(product.basePrice);
      return safeDivide(currentPrice - basePrice, currentPrice) * 100;
    });

  const profitMargin = realizedRevenue > 0
    ? clampPercent(safeDivide(realizedRevenue - realizedCost, realizedRevenue) * 100)
    : clampPercent(
        fallbackMarginSource.length
          ? fallbackMarginSource.reduce((sum, value) => sum + value, 0) / fallbackMarginSource.length
          : 0,
      );

  const salesPerformance = clampPercent(55 + salesGrowth * 2.5 + orderGrowth * 1.5);
  const inventoryHealth = clampPercent(100 - outOfStockRate * 4 - lowStockRate * 1.5);
  const customerSatisfaction = clampPercent(55 + activeCustomerRate * 0.35 - safeDivide(currentReturnedOrders.length, currentOrders.length) * 100 * 4);
  const normalizedProfitMargin = clampPercent(profitMargin * 2.2);
  const healthScore = clampPercent(
    salesPerformance * 0.3 +
      inventoryHealth * 0.3 +
      customerSatisfaction * 0.25 +
      normalizedProfitMargin * 0.15,
  );

  const returnRate = currentOrders.length > 0 ? (currentReturnedOrders.length / currentOrders.length) * 100 : 0;

  const insights: Array<{
    id: string;
    type: "positive" | "negative" | "neutral";
    title: string;
    description: string;
    metric?: string;
    change?: number;
  }> = [];

  if (orderCount > 0 || previousOrderCount > 0) {
    insights.push({
      id: "sales-trend",
      type: salesGrowth >= 0 ? "positive" : "negative",
      title: salesGrowth >= 0 ? "Sales momentum is improving" : "Sales momentum is declining",
      description:
        salesGrowth >= 0
          ? `Revenue over the last 30 days is ahead of the previous 30-day window, supported by ${orderCount} completed orders.`
          : `Revenue over the last 30 days is behind the previous 30-day window, and the store closed only ${orderCount} completed orders in the period.`,
      metric: "Sales Growth",
      change: salesGrowth,
    });
  }

  if (productCount > 0) {
    insights.push({
      id: "inventory-position",
      type: itemsOutOfStock === 0 && lowStockItems <= Math.max(1, productCount * 0.1) ? "positive" : "negative",
      title: itemsOutOfStock === 0 ? "Inventory availability is stable" : "Inventory pressure is affecting availability",
      description:
        itemsOutOfStock === 0
          ? `${lowStockItems} products are near threshold, but nothing is currently out of stock.`
          : `${itemsOutOfStock} products are out of stock and ${lowStockItems} more are near their reorder threshold.`,
      metric: "Out-of-Stock Rate",
      change: outOfStockRate,
    });
  }

  insights.push({
    id: "customer-quality",
    type: returnRate <= 3 ? "positive" : "negative",
    title: returnRate <= 3 ? "Customer quality signals are healthy" : "Return activity needs attention",
    description:
      returnRate <= 3
        ? `${activeCustomersCurrent} customers were active in the last 30 days and the return rate stayed controlled.`
        : `${currentReturnedOrders.length} orders were returned or refunded in the last 30 days, pushing the return rate above the preferred range.`,
    metric: "Return Rate",
    change: returnRate,
  });

  insights.push({
    id: "customer-growth",
    type: customerGrowth > 0 ? "positive" : customerGrowth < 0 ? "negative" : "neutral",
    title: customerGrowth > 0 ? "Customer acquisition is improving" : customerGrowth < 0 ? "Customer acquisition slowed" : "Customer acquisition is flat",
    description:
      customerGrowth > 0
        ? `${newCustomersCurrent} customers joined in the last 30 days, ahead of the previous period.`
        : customerGrowth < 0
          ? `${newCustomersCurrent} customers joined in the last 30 days, below the previous period's pace.`
          : `${newCustomersCurrent} customers joined in the last 30 days, matching the previous period's pace.`,
    metric: "Customer Growth",
    change: customerGrowth,
  });

  const recommendations: Array<{
    id: string;
    title: string;
    description: string;
    impact: "high" | "medium" | "low";
    effort: "high" | "medium" | "low";
    category: "inventory" | "pricing" | "customer" | "operations";
  }> = [];

  if (itemsOutOfStock > 0 || lowStockItems > Math.max(2, productCount * 0.15)) {
    recommendations.push({
      id: "inventory-alerts",
      title: "Tighten replenishment for at-risk products",
      description: `Prioritize reorder planning for ${itemsOutOfStock} out-of-stock products and ${lowStockItems} low-stock products to recover lost demand.`,
      impact: "high",
      effort: "medium",
      category: "inventory",
    });
  }

  if (profitMargin < 20) {
    recommendations.push({
      id: "pricing-margin",
      title: "Review price-to-cost spread on top sellers",
      description: "Current realized margin is below target. Audit discounting and reprice low-margin products with healthy demand.",
      impact: "high",
      effort: "medium",
      category: "pricing",
    });
  }

  if (customerGrowth <= 0 || activeCustomerRate < 35) {
    recommendations.push({
      id: "customer-retention",
      title: "Improve retention and reactivation",
      description: "Run a targeted repeat-purchase or win-back campaign for inactive customers to lift customer growth and order frequency.",
      impact: "medium",
      effort: "medium",
      category: "customer",
    });
  }

  if (returnRate > 3) {
    recommendations.push({
      id: "operations-returns",
      title: "Investigate return and refund drivers",
      description: "Review returned orders for packaging, fulfillment, product-quality, or description issues and resolve the main failure pattern.",
      impact: "medium",
      effort: "medium",
      category: "operations",
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: "operations-monitoring",
      title: "Maintain current operating discipline",
      description: "Health metrics are stable. Keep monitoring pricing, inventory thresholds, and customer activity for early signs of deterioration.",
      impact: "low",
      effort: "low",
      category: "operations",
    });
  }

  return {
    overview: {
      healthScore: Number(healthScore.toFixed(1)),
      salesPerformance: Number(salesPerformance.toFixed(1)),
      inventoryHealth: Number(inventoryHealth.toFixed(1)),
      customerSatisfaction: Number(customerSatisfaction.toFixed(1)),
      profitMargin: Number(profitMargin.toFixed(1)),
    },
    metrics: {
      totalSales: Number(totalSales.toFixed(2)),
      salesGrowth: Number(salesGrowth.toFixed(1)),
      orderCount,
      orderGrowth: Number(orderGrowth.toFixed(1)),
      avgOrderValue: Number(avgOrderValue.toFixed(2)),
      itemsOutOfStock,
      customerCount,
      customerGrowth: Number(customerGrowth.toFixed(1)),
      returnRate: Number(returnRate.toFixed(1)),
    },
    insights,
    recommendations,
  };
}

// Store connected clients with user/tenant information
interface ConnectedClient {
  socket: WebSocket;
  userId?: number;
  vendorId?: number;
  role?: string;
  username?: string;
}

const clients: ConnectedClient[] = [];

// Helper function to broadcast a message to specific clients
function broadcastMessage(message: any, filter?: (client: ConnectedClient) => boolean) {
  const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
  
  clients.forEach(client => {
    // Only send to clients that pass the filter or to all if no filter provided
    if ((!filter || filter(client)) && client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(messageStr);
    }
  });
}

let dbInitialized = false;

function erf(x: number) {
  const sign = x < 0 ? -1 : 1;
  const absoluteX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * absoluteX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absoluteX * absoluteX);
  return sign * y;
}

function normalCdf(x: number) {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

function calculateConfidence(controlVisitors: number, controlConversions: number, variantVisitors: number, variantConversions: number) {
  if (controlVisitors <= 0 || variantVisitors <= 0) return { confidenceLevel: 0, pValue: 1 };

  const p1 = controlConversions / controlVisitors;
  const p2 = variantConversions / variantVisitors;
  const pooled = (controlConversions + variantConversions) / (controlVisitors + variantVisitors);
  const standardError = Math.sqrt(pooled * (1 - pooled) * ((1 / controlVisitors) + (1 / variantVisitors)));

  if (standardError === 0) return { confidenceLevel: 0, pValue: 1 };

  const zScore = (p2 - p1) / standardError;
  const pValue = 2 * (1 - normalCdf(Math.abs(zScore)));
  return {
    confidenceLevel: Math.max(0, Math.min(99.9, (1 - pValue) * 100)),
    pValue: Math.max(0.0001, pValue),
  };
}

function parseDecimalValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getMarketingAbTestsForVendor(vendorId: number) {
  const tests = await db
    .select()
    .from(marketingAbTests)
    .where(eq(marketingAbTests.vendorId, vendorId));

  if (tests.length === 0) {
    return [];
  }

  const testIds = tests.map((test) => test.id);
  const variants = await db
    .select()
    .from(marketingAbTestVariants)
    .where(inArray(marketingAbTestVariants.testId, testIds));
  const events = await db
    .select()
    .from(marketingAbTestEvents)
    .where(inArray(marketingAbTestEvents.testId, testIds));

  return tests.map((test) => {
    const testVariants = variants
      .filter((variant) => variant.testId === test.id)
      .map((variant) => {
        const variantEvents = events.filter((event) => event.variantId === variant.id);
        const visitorKeys = new Set(
          variantEvents
            .map((event) => event.visitorKey)
            .filter((visitorKey): visitorKey is string => Boolean(visitorKey))
        );
        const visitors = visitorKeys.size || variantEvents.filter((event) => event.eventType === "visit").length;
        const conversions = variantEvents.filter((event) => event.eventType === "conversion").length;
        const clicks = variantEvents.filter((event) => event.eventType === "click").length;
        const revenue = variantEvents
          .filter((event) => event.eventType === "revenue")
          .reduce((sum, event) => sum + parseDecimalValue(event.eventValue), 0);

        return {
          id: String(variant.id),
          name: variant.name,
          isControl: variant.isControl,
          description: variant.description,
          screenshot: variant.screenshot || undefined,
          traffic: variant.traffic,
          visitors,
          conversions,
          clicks,
          revenue,
          conversionRate: visitors > 0 ? (conversions / visitors) * 100 : 0,
          confidence: 0,
        };
      });

    const controlVariant = testVariants.find((variant) => variant.isControl) || testVariants[0];
    let winningVariant: string | undefined;
    let highestRate = -1;
    let highestConfidence = 0;

    const enrichedVariants = testVariants.map((variant) => {
      if (!controlVariant || variant.id === controlVariant.id) {
        return variant;
      }

      const stats = calculateConfidence(
        controlVariant.visitors || 0,
        controlVariant.conversions || 0,
        variant.visitors || 0,
        variant.conversions || 0
      );

      if ((variant.conversionRate || 0) > highestRate) {
        highestRate = variant.conversionRate || 0;
        highestConfidence = stats.confidenceLevel;
        winningVariant = variant.id;
      }

      return {
        ...variant,
        confidence: Number(stats.confidenceLevel.toFixed(1)),
      };
    });

    const totalVisitors = enrichedVariants.reduce((sum, variant) => sum + (variant.visitors || 0), 0);
    const totalConversions = enrichedVariants.reduce((sum, variant) => sum + (variant.conversions || 0), 0);
    const totalRevenue = enrichedVariants.reduce((sum, variant) => sum + (variant.revenue || 0), 0);
    const controlRate = controlVariant?.conversionRate || 0;
    const winner = enrichedVariants.find((variant) => variant.id === winningVariant);
    const uplift = winner && controlRate > 0
      ? ((winner.conversionRate || 0) / controlRate - 1) * 100
      : undefined;
    const durationDays = test.startDate
      ? Math.max(1, Math.ceil((Date.now() - new Date(test.startDate).getTime()) / (1000 * 60 * 60 * 24)))
      : 30;
    const controlRevenuePerVisitor = controlVariant && (controlVariant.visitors || 0) > 0
      ? (controlVariant.revenue || 0) / (controlVariant.visitors || 1)
      : 0;
    const winnerRevenuePerVisitor = winner && (winner.visitors || 0) > 0
      ? (winner.revenue || 0) / (winner.visitors || 1)
      : 0;
    const revenueImpact = winner && controlRevenuePerVisitor > 0
      ? (winnerRevenuePerVisitor - controlRevenuePerVisitor) * totalVisitors * (365 / durationDays)
      : totalRevenue > 0 && uplift
        ? totalRevenue * (uplift / 100)
        : undefined;

    return {
      id: String(test.id),
      vendorId: test.vendorId,
      name: test.name,
      status: test.status,
      type: test.type,
      dateCreated: test.createdAt.toISOString(),
      dateModified: test.updatedAt.toISOString(),
      startDate: test.startDate?.toISOString(),
      endDate: test.endDate?.toISOString(),
      description: test.description,
      hypothesis: test.hypothesis,
      goal: test.goal,
      goalMetric: test.goalMetric,
      trafficAllocation: test.trafficAllocation,
      variants: enrichedVariants,
      results: enrichedVariants.length > 0 ? {
        startDate: test.startDate?.toISOString() || test.createdAt.toISOString(),
        endDate: test.endDate?.toISOString(),
        totalVisitors,
        totalConversions,
        winningVariant,
        uplift,
        confidenceLevel: winningVariant ? Number(highestConfidence.toFixed(1)) : undefined,
        pValue: winner && controlVariant && winner.id !== controlVariant.id
          ? Number(calculateConfidence(controlVariant.visitors || 0, controlVariant.conversions || 0, winner.visitors || 0, winner.conversions || 0).pValue.toFixed(4))
          : undefined,
        revenueImpact: revenueImpact ? Number(revenueImpact.toFixed(2)) : undefined,
      } : undefined,
      tags: Array.isArray(test.tags) ? test.tags : [],
    };
  });
}

function getDefaultJourneyStages(journeyName: string) {
  const lowerName = journeyName.toLowerCase();

  if (lowerName.includes("abandon")) {
    return [
      {
        name: "Abandonment",
        description: "Customer leaves the flow before completing the intended action.",
        duration: "Immediate",
        conversionRate: 100,
        painPoints: ["Customer exits before checkout is complete"],
        opportunities: ["Capture friction signals at the point of abandonment"],
      },
      {
        name: "First Reminder",
        description: "Initial follow-up to recover the customer after abandonment.",
        duration: "1 day average",
        conversionRate: 18,
        painPoints: ["Reminder relevance is often too generic"],
        opportunities: ["Personalize reminder content with abandoned items"],
      },
      {
        name: "Incentive Offer",
        description: "Recovery step with an offer or reassurance to win the customer back.",
        duration: "2-3 days average",
        conversionRate: 12,
        painPoints: ["Discounting too early can erode margin"],
        opportunities: ["Test non-discount incentives before coupons"],
      },
      {
        name: "Final Reminder",
        description: "Last re-engagement step before the customer falls out of the recovery flow.",
        duration: "5-7 days average",
        conversionRate: 6,
        painPoints: ["Low urgency and low intent at the final stage"],
        opportunities: ["Use scarcity or social proof to improve response"],
      },
    ];
  }

  return [
    {
      name: "Discovery",
      description: "Customer first becomes aware of the brand or offer.",
      duration: "2-4 days average",
      conversionRate: 18,
      painPoints: ["Low relevance in first-touch messaging"],
      opportunities: ["Improve channel-message fit for the target segment"],
    },
    {
      name: "Consideration",
      description: "Customer evaluates options and compares value before committing.",
      duration: "3-6 days average",
      conversionRate: 32,
      painPoints: ["Insufficient detail to overcome hesitation"],
      opportunities: ["Clarify value proposition and reduce friction"],
    },
    {
      name: "Purchase",
      description: "Customer completes the key conversion or purchase step.",
      duration: "Same day to 2 days",
      conversionRate: 58,
      painPoints: ["Checkout or form complexity slows completion"],
      opportunities: ["Simplify completion steps and payment options"],
    },
    {
      name: "Retention",
      description: "Post-conversion experience designed to drive repeat engagement.",
      duration: "7-30 days average",
      conversionRate: 24,
      painPoints: ["Weak follow-up after the first conversion"],
      opportunities: ["Personalize post-purchase or post-signup messaging"],
    },
  ];
}

async function getMarketingJourneysForVendor(vendorId: number) {
  const journeys = await db
    .select({
      id: marketingCustomerJourneys.id,
      vendorId: marketingCustomerJourneys.vendorId,
      segmentId: marketingCustomerJourneys.segmentId,
      name: marketingCustomerJourneys.name,
      description: marketingCustomerJourneys.description,
      createdAt: marketingCustomerJourneys.createdAt,
      updatedAt: marketingCustomerJourneys.updatedAt,
      segmentName: customerSegments.name,
    })
    .from(marketingCustomerJourneys)
    .leftJoin(customerSegments, eq(marketingCustomerJourneys.segmentId, customerSegments.id))
    .where(eq(marketingCustomerJourneys.vendorId, vendorId))
    .orderBy(desc(marketingCustomerJourneys.updatedAt));

  if (!journeys.length) {
    return [];
  }

  const journeyIds = journeys.map((journey) => journey.id);
  const stages = await db
    .select()
    .from(marketingJourneyStages)
    .where(inArray(marketingJourneyStages.journeyId, journeyIds))
    .orderBy(marketingJourneyStages.position);

  const stageIds = stages.map((stage) => stage.id);
  const touchpoints = stageIds.length
    ? await db
        .select()
        .from(marketingJourneyTouchpoints)
        .where(inArray(marketingJourneyTouchpoints.stageId, stageIds))
        .orderBy(marketingJourneyTouchpoints.position)
    : [];

  return journeys.map((journey) => ({
    id: String(journey.id),
    vendorId: journey.vendorId,
    name: journey.name,
    description: journey.description,
    segment: String(journey.segmentId),
    segmentName: journey.segmentName || "Unassigned Segment",
    createdAt: journey.createdAt,
    updatedAt: journey.updatedAt,
    stages: stages
      .filter((stage) => stage.journeyId === journey.id)
      .map((stage) => ({
        id: String(stage.id),
        journeyId: String(stage.journeyId),
        name: stage.name,
        description: stage.description,
        duration: stage.duration,
        conversionRate: parseDecimalValue(stage.conversionRate),
        painPoints: Array.isArray(stage.painPoints) ? stage.painPoints : [],
        opportunities: Array.isArray(stage.opportunities) ? stage.opportunities : [],
        touchpoints: touchpoints
          .filter((touchpoint) => touchpoint.stageId === stage.id)
          .map((touchpoint) => ({
            id: String(touchpoint.id),
            stageId: String(touchpoint.stageId),
            name: touchpoint.name,
            channel: touchpoint.channel,
            description: touchpoint.description,
            dropoff: touchpoint.dropoff,
            sentiment: touchpoint.sentiment,
            metrics: touchpoint.metrics || {},
          })),
      })),
  }));
}

async function getMarketingPersonalizationDataForVendor(vendorId: number) {
  const templates = await db
    .select()
    .from(marketingPersonalizationTemplates)
    .where(eq(marketingPersonalizationTemplates.vendorId, vendorId))
    .orderBy(desc(marketingPersonalizationTemplates.updatedAt));

  const rules = await db
    .select({
      id: marketingPersonalizationRules.id,
      vendorId: marketingPersonalizationRules.vendorId,
      templateId: marketingPersonalizationRules.templateId,
      segmentId: marketingPersonalizationRules.segmentId,
      name: marketingPersonalizationRules.name,
      description: marketingPersonalizationRules.description,
      audience: marketingPersonalizationRules.audience,
      target: marketingPersonalizationRules.target,
      status: marketingPersonalizationRules.status,
      priority: marketingPersonalizationRules.priority,
      startDate: marketingPersonalizationRules.startDate,
      endDate: marketingPersonalizationRules.endDate,
      conditions: marketingPersonalizationRules.conditions,
      createdByUserId: marketingPersonalizationRules.createdByUserId,
      createdAt: marketingPersonalizationRules.createdAt,
      updatedAt: marketingPersonalizationRules.updatedAt,
      templateName: marketingPersonalizationTemplates.name,
      segmentName: customerSegments.name,
      createdBy: users.username,
    })
    .from(marketingPersonalizationRules)
    .leftJoin(marketingPersonalizationTemplates, eq(marketingPersonalizationRules.templateId, marketingPersonalizationTemplates.id))
    .leftJoin(customerSegments, eq(marketingPersonalizationRules.segmentId, customerSegments.id))
    .leftJoin(users, eq(marketingPersonalizationRules.createdByUserId, users.id))
    .where(eq(marketingPersonalizationRules.vendorId, vendorId))
    .orderBy(desc(marketingPersonalizationRules.updatedAt));

  if (!rules.length) {
    return { templates, rules: [] };
  }

  const ruleIds = rules.map((rule) => rule.id);
  const variations = await db
    .select()
    .from(marketingPersonalizationVariations)
    .where(inArray(marketingPersonalizationVariations.ruleId, ruleIds))
    .orderBy(marketingPersonalizationVariations.createdAt);

  return {
    templates: templates.map((template) => ({
      ...template,
      id: String(template.id),
      tags: Array.isArray(template.tags) ? template.tags : [],
    })),
    rules: rules.map((rule) => ({
      id: String(rule.id),
      vendorId: rule.vendorId,
      templateId: rule.templateId ? String(rule.templateId) : null,
      segmentId: rule.segmentId ? String(rule.segmentId) : null,
      name: rule.name,
      description: rule.description,
      audience: rule.audience,
      target: rule.target,
      status: rule.status,
      priority: rule.priority,
      startDate: rule.startDate,
      endDate: rule.endDate,
      conditions: rule.conditions || {},
      templateName: rule.templateName || "No template",
      segmentName: rule.segmentName || "No segment",
      createdBy: rule.createdBy || "System",
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
      variations: variations
        .filter((variation) => variation.ruleId === rule.id)
        .map((variation) => ({
          id: String(variation.id),
          ruleId: String(variation.ruleId),
          name: variation.name,
          content: variation.content,
          impressions: variation.impressions,
          conversions: variation.conversions,
          createdAt: variation.createdAt,
          updatedAt: variation.updatedAt,
        })),
    })),
  };
}

type PersonalizationEvaluationContext = {
  target: string;
  segmentId?: number | null;
  segment?: string;
  behavior?: string;
  device?: string;
  location?: string;
  time?: string;
};

function normalizeTextValue(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function ruleIsScheduled(rule: {
  startDate?: Date | string | null;
  endDate?: Date | string | null;
}) {
  const now = Date.now();
  const start = rule.startDate ? new Date(rule.startDate).getTime() : null;
  const end = rule.endDate ? new Date(rule.endDate).getTime() : null;
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}

function calculateRuleMatchScore(
  rule: {
    target: string;
    status: string;
    conditions?: {
      segment?: string;
      behavior?: string;
      device?: string;
      location?: string;
      time?: string;
    } | null;
    segmentId?: number | null;
    priority?: number | null;
    startDate?: Date | string | null;
    endDate?: Date | string | null;
  },
  context: PersonalizationEvaluationContext
) {
  if (rule.status !== "active") return null;
  if (rule.target !== context.target) return null;
  if (!ruleIsScheduled(rule)) return null;

  const conditions = rule.conditions || {};
  let specificity = 0;
  let score = 0;

  if (rule.segmentId && context.segmentId && rule.segmentId !== context.segmentId) {
    return null;
  }

  if (conditions.segment) {
    specificity += 1;
    if (normalizeTextValue(conditions.segment) !== normalizeTextValue(context.segment)) {
      return null;
    }
    score += 2;
  }

  if (conditions.behavior) {
    specificity += 1;
    if (normalizeTextValue(conditions.behavior) !== normalizeTextValue(context.behavior)) {
      return null;
    }
    score += 1;
  }

  if (conditions.device) {
    specificity += 1;
    if (normalizeTextValue(conditions.device) !== normalizeTextValue(context.device)) {
      return null;
    }
    score += 1;
  }

  if (conditions.location) {
    specificity += 1;
    if (normalizeTextValue(conditions.location) !== normalizeTextValue(context.location)) {
      return null;
    }
    score += 1;
  }

  if (conditions.time) {
    specificity += 1;
    if (normalizeTextValue(conditions.time) !== normalizeTextValue(context.time)) {
      return null;
    }
    score += 1;
  }

  return {
    priority: rule.priority ?? 100,
    specificity,
    score,
  };
}

// Test database connection
async function testDbConnection() {
  try {
    console.log('Testing database connection...');
    await db.execute(sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT`);
    await db.execute(sql`
      DO $$
      BEGIN
        IF to_regclass('public.invitations') IS NOT NULL THEN
          ALTER TABLE invitations ADD COLUMN IF NOT EXISTS permission_profile_id INTEGER;
        END IF;
      END $$;
    `);
    // Try a simple query to verify connection
    const result = await db.query.products.findFirst();
    console.log('Database connection test successful');
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

// Add test data generator for development
async function generateTestData() {
  try {
    // Create a test vendor first if it doesn't exist
    let testVendorId = 1;
    const existingVendors = await db.query.vendors.findMany();
    
    if (existingVendors.length === 0) {
      console.log('Creating test vendor...');
      const vendorInsertResult = await db.insert(vendors).values({
        name: 'Test Vendor',
        email: 'test@example.com',
        businessName: 'Test Store Inc.',
        address: '123 Test St, Test City',
        phone: '555-1234',
        status: 'active'
      }).returning();
      
      if (vendorInsertResult.length > 0) {
        testVendorId = vendorInsertResult[0].id;
        console.log(`Created test vendor with ID: ${testVendorId}`);
      }
    } else {
      testVendorId = existingVendors[0].id;
      console.log(`Using existing vendor with ID: ${testVendorId}`);
    }
    
    // Generate some test products if none exist
    const existingProducts = await db.query.products.findMany();
    if (existingProducts.length === 0) {
      console.log('Creating test products...');
      const testProducts = [
        { 
          name: 'Laptop', 
          vendorId: testVendorId,
          sku: 'TECH-001',
          category: 'Electronics', 
          basePrice: '999.99', 
          currentPrice: '999.99', 
          currentStock: 50,
          aisle: 'A1',
          shelf: 'S1',
          description: 'High-performance laptop with 16GB RAM and 512GB SSD'
        },
        { 
          name: 'Smartphone', 
          vendorId: testVendorId,
          sku: 'TECH-002',
          category: 'Electronics', 
          basePrice: '599.99', 
          currentPrice: '549.99', 
          currentStock: 100,
          aisle: 'A1',
          shelf: 'S2',
          description: 'Latest smartphone with 128GB storage and triple camera'
        },
        { 
          name: 'Headphones', 
          vendorId: testVendorId,
          sku: 'ACC-001',
          category: 'Accessories', 
          basePrice: '99.99', 
          currentPrice: '79.99', 
          currentStock: 200,
          aisle: 'A2',
          shelf: 'S1',
          description: 'Noise-cancelling wireless headphones with 20hr battery life'
        },
        { 
          name: 'Backpack', 
          vendorId: testVendorId,
          sku: 'ACC-002',
          category: 'Accessories', 
          basePrice: '49.99', 
          currentPrice: '49.99', 
          currentStock: 150,
          aisle: 'A2',
          shelf: 'S2',
          description: 'Durable backpack with laptop compartment and water bottle holder'
        },
        { 
          name: 'Monitor', 
          vendorId: testVendorId,
          sku: 'TECH-003',
          category: 'Electronics', 
          basePrice: '299.99', 
          currentPrice: '279.99', 
          currentStock: 30,
          aisle: 'A1',
          shelf: 'S3',
          description: '27-inch 4K monitor with HDR support'
        }
      ];

      for (const product of testProducts) {
        await db.insert(products).values(product);
      }
      console.log(`Created ${testProducts.length} test products`);
    }

    // Create a public store profile for the test vendor if missing
    const existingStoreProfiles = await db
      .select()
      .from(storeProfiles)
      .where(eq(storeProfiles.vendorId, testVendorId))
      .limit(1);

    let testStoreProfile = existingStoreProfiles[0];

    if (!testStoreProfile) {
      const [createdStoreProfile] = await db
        .insert(storeProfiles)
        .values({
          vendorId: testVendorId,
          name: 'Northline Market',
          slug: 'northline-market',
          description: 'A demo neighborhood retailer using EaseSpotter for product discovery, pricing, and inventory visibility.',
          storeType: 'electronics',
          logoUrl: DEFAULT_VENDOR_LOGO_PATH,
          isVerified: true,
          verificationDate: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      testStoreProfile = createdStoreProfile;
      console.log(`Created test store profile with ID: ${testStoreProfile.id}`);
    }

    // Populate storefront products if missing
    const existingStoreProducts = await db
      .select({ id: storeProducts.id })
      .from(storeProducts)
      .where(eq(storeProducts.storeId, testStoreProfile.id))
      .limit(1);

    if (existingStoreProducts.length === 0) {
      const sourceProducts = await db
        .select()
        .from(products)
        .where(eq(products.vendorId, testVendorId));

      if (sourceProducts.length > 0) {
        await db.insert(storeProducts).values(
          sourceProducts.map((product) => ({
            storeId: testStoreProfile.id,
            name: product.name,
            sku: product.sku,
            basePrice: product.basePrice,
            currentPrice: product.currentPrice,
            description: product.description,
            category: product.category,
            imageUrl: product.imageUrl,
            createdAt: new Date(),
            updatedAt: new Date(),
          }))
        );

        console.log(`Created ${sourceProducts.length} storefront products`);
      }
    }

    // Generate some test price changes if none exist
    const existingPriceChanges = await db.query.priceHistory.findMany();
    if (existingPriceChanges.length === 0) {
      const productIds = await db.select({ id: products.id }).from(products);

      for (const { id } of productIds) {
        // Generate price changes for the last 7 days
        for (let i = 0; i < 7; i++) {
          const date = new Date();
          date.setDate(date.getDate() - i);

          await db.insert(priceHistory).values({
            productId: id,
            oldPrice: String(90 + Math.random() * 20),
            newPrice: String(90 + Math.random() * 20),
            reason: 'Market adjustment',
            timestamp: date
          });
        }
      }
    }
  } catch (error) {
    console.error('Error generating test data:', error);
  }
}

// Call test data generator when initializing routes

export function registerRoutes(app: Express): Server {
  const httpServer = createServer(app);

  // Add CORS headers middleware
  app.use((req, res, next) => {
    const origin = req.headers.origin || 'http://localhost:5000';
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS, POST, PATCH, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });
  
  // Setup authentication
  setupAuth(app);

  // API endpoints for store setup and onboarding
  // Utility endpoint to force populate sample data for a user
  app.get("/api/populate-user/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      
      // Get the user
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));
        
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      let vendorId = user.vendorId;
      
      // If user doesn't have a vendor, create one
      if (!vendorId) {
        const uniqueEmail = `${Date.now()}_${user.email || "store@example.com"}`;
        const [vendor] = await db
          .insert(vendors)
          .values({
            name: user.username || "Store",
            businessName: user.username || "Store",
            category: "food", // Default category
            email: uniqueEmail,
            address: "",
            phone: "",
            status: "active",
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();
          
        if (!vendor) {
          return res.status(500).json({ error: "Failed to create vendor" });
        }
        
        vendorId = vendor.id;
        
        // Update user with vendorId
        await db
          .update(users)
          .set({ vendorId: vendor.id })
          .where(eq(users.id, userId));
          
        // Create store profile
        await db
          .insert(storeProfiles)
          .values({
            vendorId: vendor.id,
            name: vendor.name,
            description: `${vendor.name} is a ${vendor.category} store.`,
            slug: vendor.name.toLowerCase().replace(/\s+/g, '-'),
            storeType: vendor.category,
            logoUrl: DEFAULT_VENDOR_LOGO_PATH,
            isVerified: true,
            socialLinks: {},
            businessHours: {},
            createdAt: new Date(),
            updatedAt: new Date(),
          });
      }
      
      // Get the vendor to get its category
      const [vendor] = await db
        .select()
        .from(vendors)
        .where(eq(vendors.id, vendorId));
        
      if (!vendor) {
        return res.status(404).json({ error: "Vendor not found" });
      }
      
      // Generate and insert sample products
      const sampleProducts = generateSampleProducts(vendor.category, vendorId);
      const insertedProducts = await db.insert(products).values(sampleProducts).returning();
      
      // Create price history for products
      const priceHistoryRecords = insertedProducts.flatMap(product => {
        return Array(5).fill(null).map((_, i) => {
          const daysAgo = 5 - i;
          const oldPrice = parseFloat(product.basePrice) * (0.9 + Math.random() * 0.2);
          
          return {
            productId: product.id,
            oldPrice: oldPrice.toFixed(2),
            newPrice: product.basePrice,
            reason: "Initial pricing",
            timestamp: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
          };
        });
      });
      
      await db.insert(priceHistory).values(priceHistoryRecords);
      
      // Add sample price rules
      const sampleRules = [
        {
          vendorId,
          name: "Holiday Sale",
          description: "Discount prices during holiday season",
          category: "seasonal",
          conditions: { type: "date_range", startDate: "2023-12-01", endDate: "2023-12-31" },
          adjustment: { type: "percentage", value: 10 },
          isActive: true,
          priority: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          vendorId,
          name: "Low Stock Adjustment",
          description: "Increase prices when stock is low",
          category: "inventory",
          conditions: { type: "stock_level", threshold: 10, operator: "less_than" },
          adjustment: { type: "percentage", value: 5 },
          isActive: true,
          priority: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      ];
      
      await db.insert(priceRules).values(sampleRules);
      
      res.status(200).json({
        success: true,
        message: "Successfully populated user data",
        userId,
        vendorId,
        productCount: insertedProducts.length
      });
    } catch (error: any) {
      console.error("Error in populate-user:", error);
      res.status(500).json({ error: error.message || "Failed to populate user data" });
    }
  });
  
  app.post("/api/vendors", isAuthenticated, async (req, res) => {
    try {
      const { name, category, email, currencyCode, userId } = req.body;

      if (!name || !category) {
        return res.status(400).json({ error: "Store name and category are required" });
      }
      
      // Determine which user ID to use
      let userIdToUpdate;
      
      if (userId) {
        // If userId is provided in the request (from StoreSetup.tsx)
        userIdToUpdate = userId;
      } else if (req.user?.id) {
        // Otherwise use the logged-in user
        userIdToUpdate = req.user.id;
      } else {
        return res.status(400).json({ error: "User ID is required" });
      }
      
      console.log(`Creating vendor for user ID: ${userIdToUpdate}`);

      // Find the user first to get their email if not provided
      const [userToUpdate] = await db
        .select()
        .from(users)
        .where(eq(users.id, userIdToUpdate))
        .limit(1);
        
      if (!userToUpdate) {
        return res.status(404).json({ error: "User not found" });
      }

      // Generate a unique email for the vendor by adding a timestamp
      // This avoids collision with existing emails in the vendors table
      const uniqueEmail = `${Date.now()}_${email || userToUpdate.email || "store@example.com"}`;
      
      // Create vendor
      const [vendor] = await db
        .insert(vendors)
        .values({
          name,
          businessName: name,
          category,
          email: uniqueEmail,
          address: "",
          phone: "",
          currencyCode: currencyCode || "USD",
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      if (!vendor) {
        throw new Error("Failed to create store");
      }

      // Update user with vendorId
      await db
        .update(users)
        .set({ vendorId: vendor.id })
        .where(eq(users.id, userIdToUpdate));
        
      // Create store profile
      const [storeProfile] = await db
        .insert(storeProfiles)
        .values({
          vendorId: vendor.id,
          name: name,
          description: `${name} is a ${category} store.`,
          slug: name.toLowerCase().replace(/\s+/g, '-'),
          storeType: category,
          logoUrl: DEFAULT_VENDOR_LOGO_PATH,
          isVerified: true,
          socialLinks: {},
          businessHours: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Add user activity log
      await db.insert(userActivityLogs).values({
        userId: userIdToUpdate,
        action: "create",
        resourceType: "vendor",
        resourceId: vendor.id,
        details: { vendor: vendor.name },
        timestamp: new Date(),
      });

      // Generate sample products for new vendor
      const sampleProducts = generateSampleProducts(category, vendor.id);
      // Insert the products
      const insertedProducts = await db.insert(products).values(sampleProducts).returning();
      
      // Create price history for products
      const priceHistoryRecords = insertedProducts.flatMap(product => {
        return Array(5).fill(null).map((_, i) => {
          const daysAgo = 5 - i;
          const oldPrice = parseFloat(product.basePrice) * (0.9 + Math.random() * 0.2);
          
          return {
            productId: product.id,
            oldPrice: oldPrice.toFixed(2),
            newPrice: product.basePrice,
            reason: "Initial pricing",
            timestamp: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
          };
        });
      });
      
      await db.insert(priceHistory).values(priceHistoryRecords);
      
      // Add sample price rules
      const sampleRules = [
        {
          vendorId: vendor.id,
          name: "Holiday Sale",
          description: "Discount prices during holiday season",
          category: "seasonal",
          conditions: { type: "date_range", startDate: "2023-12-01", endDate: "2023-12-31" },
          adjustment: { type: "percentage", value: 10 },
          isActive: true,
          priority: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          vendorId: vendor.id,
          name: "Low Stock Adjustment",
          description: "Increase prices when stock is low",
          category: "inventory",
          conditions: { type: "stock_level", threshold: 10, operator: "less_than" },
          adjustment: { type: "percentage", value: 5 },
          isActive: true,
          priority: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      ];
      
      await db.insert(priceRules).values(sampleRules);
      
      // Return with added info
      res.status(201).json({
        ...vendor,
        productCount: insertedProducts.length,
        sampleDataAdded: true
      });
    } catch (error: any) {
      console.error("Error creating store:", error);
      res.status(500).json({ error: error.message || "Failed to create store" });
    }
  });

  // Add sample products for onboarding
  app.post("/api/sample-products", async (req, res) => {
    try {
      const { vendorId } = req.body;
      
      if (!vendorId) {
        return res.status(400).json({ error: "Vendor ID is required" });
      }

      // Verify the user has access to this vendor
      // For newly created stores, the req.user might not have been refreshed yet, so skip this check in that case
      if (req.user && req.user.vendorId !== vendorId && req.user.role !== 'admin') {
        return res.status(403).json({ error: "You don't have permission to add products to this store" });
      }

      // Define sample products based on vendor category
      const [vendor] = await db.select().from(vendors).where(eq(vendors.id, vendorId));
      
      if (!vendor) {
        return res.status(404).json({ error: "Store not found" });
      }

      const sampleProducts = generateSampleProducts(vendor.category, vendorId);
      
      // Insert sample products
      const insertedProducts = await db.insert(products).values(sampleProducts).returning();
      
      // Create price history for each product
      const priceHistoryRecords = insertedProducts.flatMap(product => {
        return Array(5).fill(null).map((_, i) => {
          const daysAgo = 5 - i;
          const oldPrice = parseFloat(product.basePrice) * (0.9 + Math.random() * 0.2);
          
          return {
            productId: product.id,
            oldPrice: oldPrice.toFixed(2),
            newPrice: product.basePrice,
            reason: "Initial pricing",
            timestamp: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
          };
        });
      });
      
      await db.insert(priceHistory).values(priceHistoryRecords);

      // Add sample price rules
      const sampleRules = [
        {
          vendorId,
          name: "Holiday Sale",
          description: "Discount prices during holiday season",
          category: "seasonal",
          conditions: { type: "date_range", startDate: "2023-12-01", endDate: "2023-12-31" },
          adjustment: { type: "percentage", value: 10 },
          isActive: true,
          priority: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          vendorId,
          name: "Low Stock Adjustment",
          description: "Increase prices when stock is low",
          category: "inventory",
          conditions: { type: "stock_level", threshold: 10, operator: "less_than" },
          adjustment: { type: "percentage", value: 5 },
          isActive: true,
          priority: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      ];
      
      await db.insert(priceRules).values(sampleRules);

      // Add activity log
      await db.insert(userActivityLogs).values({
        userId: req.user?.id || 0, // Fallback to 0 if for some reason we don't have a user ID
        action: "create",
        resourceType: "product",
        resourceId: null,
        details: { count: insertedProducts.length, vendor: vendor.name },
        timestamp: new Date(),
      });

      res.status(201).json({ 
        success: true, 
        productCount: insertedProducts.length,
        message: "Sample products added successfully"
      });
    } catch (error: any) {
      console.error("Error adding sample products:", error);
      res.status(500).json({ error: error.message || "Failed to add sample products" });
    }
  });
  
  // Mount store integration routes
  app.use("/api/stores", storeRoutes);

  
  // Mount QR code routes
  app.use(qrCodeRoutes);
  app.use(qrScanRoutes);
  app.use(storeDataRoutes);
  app.use(userSessionRoutes);
  
  // Public endpoint to get all stores for storefront
  app.get('/api/public/stores', async (req, res) => {
    try {
      // First update any stores that still have null slugs
      await db.execute(sql`
        UPDATE store_profiles 
        SET slug = LOWER(REPLACE(name, ' ', '-')) 
        WHERE slug IS NULL
      `);

      const stores = await db.select({
        id: storeProfiles.id,
        name: storeProfiles.name,
        description: storeProfiles.description,
        logoUrl: storeProfiles.logoUrl,
        bannerUrl: storeProfiles.bannerUrl,
        themeColor: storeProfiles.themeColor,
        storeType: storeProfiles.storeType,
        slug: storeProfiles.slug // Use actual slug from database
      })
      .from(storeProfiles)
      .where(
        and(
          eq(storeProfiles.isVerified, true),
          ne(storeProfiles.name, 'Test Store'),
          sql`coalesce(${storeProfiles.description}, '') NOT ILIKE '%migration testing%'`
        )
      );
      
      res.json(stores);
    } catch (error) {
      console.error('Error fetching stores:', error);
      res.status(500).json({ message: 'Failed to fetch stores' });
    }
  });
  
  // Public endpoint to get a specific store by slug
  app.get('/api/public/stores/:slug', async (req, res) => {
    try {
      const { slug } = req.params;
      
      // First update any stores that still have null slugs
      await db.execute(sql`
        UPDATE store_profiles 
        SET slug = LOWER(REPLACE(name, ' ', '-')) 
        WHERE slug IS NULL
      `);
      
      const store = await db.select({
        id: storeProfiles.id,
        name: storeProfiles.name,
        description: storeProfiles.description,
        logoUrl: storeProfiles.logoUrl,
        bannerUrl: storeProfiles.bannerUrl,
        themeColor: storeProfiles.themeColor,
        storeType: storeProfiles.storeType,
        slug: storeProfiles.slug // Use actual slug from database
      })
      .from(storeProfiles)
      .where(
        and(
          sql`${storeProfiles.isVerified} = true`,
          eq(storeProfiles.slug, slug)
        )
      )
      .limit(1);
      
      if (!store || store.length === 0) {
        return res.status(404).json({ message: 'Store not found' });
      }
      
      res.json(store[0]);
    } catch (error) {
      console.error('Error fetching store:', error);
      res.status(500).json({ message: 'Failed to fetch store' });
    }
  });
  
  // Public endpoint to get products for a specific store by slug
  app.get('/api/public/stores/:slug/products', async (req, res) => {
    try {
      const { slug } = req.params;
      
      // First get the store profile by slug
      const [storeProfile] = await db.select()
        .from(storeProfiles)
        .where(
          and(
            sql`${storeProfiles.isVerified} = true`,
            eq(storeProfiles.slug, slug)
          )
        )
        .limit(1);
      
      if (!storeProfile) {
        return res.status(404).json({ message: 'Store not found' });
      }
      
      // Then get products for this store
      const products = await db.select()
        .from(storeProducts)
        .where(eq(storeProducts.storeId, storeProfile.id))
        .orderBy(desc(storeProducts.createdAt));
      
      res.json(products);
    } catch (error) {
      console.error('Error fetching store products:', error);
      res.status(500).json({ message: 'Failed to fetch store products' });
    }
  });
  
  // Public endpoint to get a specific product by ID for a store
  app.get('/api/public/stores/:storeSlug/products/:productId', async (req, res) => {
    try {
      const { storeSlug, productId } = req.params;
      
      // Extract the actual ID from the slug format if it's using SEO-friendly format (name-slug-{id})
      // Otherwise use the productId directly
      const actualProductId = productId.includes('-') 
        ? productId.split('-').pop() 
        : productId;
      
      // First get the store profile by slug
      const [storeProfile] = await db.select()
        .from(storeProfiles)
        .where(
          and(
            sql`${storeProfiles.isVerified} = true`,
            eq(storeProfiles.slug, storeSlug)
          )
        )
        .limit(1);
      
      if (!storeProfile) {
        return res.status(404).json({ message: 'Store not found' });
      }
      
      // Then get the specific product
      const [product] = await db.select()
        .from(storeProducts)
        .where(
          and(
            eq(storeProducts.storeId, storeProfile.id),
            eq(storeProducts.id, parseInt(actualProductId))
          )
        )
        .limit(1);
      
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }
      
      res.json(product);
    } catch (error) {
      console.error('Error fetching product details:', error);
      res.status(500).json({ message: 'Failed to fetch product details' });
    }
  });
  
  // Get product reviews for a specific product
  app.get('/api/public/stores/:storeSlug/products/:productId/reviews', async (req, res) => {
    try {
      const { storeSlug, productId } = req.params;
      
      // Extract the actual ID from the slug format if it's using SEO-friendly format (name-slug-{id})
      // Otherwise use the productId directly
      const actualProductId = productId.includes('-') 
        ? productId.split('-').pop() 
        : productId;
        
      // First get the store profile by slug
      const [storeProfile] = await db.select()
        .from(storeProfiles)
        .where(
          and(
            sql`${storeProfiles.isVerified} = true`,
            eq(storeProfiles.slug, storeSlug)
          )
        )
        .limit(1);
      
      if (!storeProfile) {
        return res.status(404).json({ message: 'Store not found' });
      }
      
      // Verify the product exists for this store
      const [product] = await db.select()
        .from(storeProducts)
        .where(
          and(
            eq(storeProducts.storeId, storeProfile.id),
            eq(storeProducts.id, parseInt(actualProductId))
          )
        )
        .limit(1);
      
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }
      
      // Get reviews for this product - use schema object to access the table
      const reviews = await db.select({
        id: schema.productReviews.id,
        authorName: schema.productReviews.authorName,
        rating: schema.productReviews.rating,
        title: schema.productReviews.title,
        content: schema.productReviews.content,
        helpful: schema.productReviews.helpful,
        verified: schema.productReviews.verified,
        createdAt: schema.productReviews.createdAt
      })
      .from(schema.productReviews)
      .where(eq(schema.productReviews.productId, product.id))
      .orderBy(desc(schema.productReviews.createdAt));
      
      // Format reviews for the frontend
      const formattedReviews = reviews.map(review => ({
        ...review,
        date: review.createdAt.toISOString().split('T')[0] // Format as YYYY-MM-DD
      }));
      
      res.json(formattedReviews);
    } catch (error) {
      console.error('Error fetching product reviews:', error);
      res.status(500).json({ message: 'Failed to fetch product reviews' });
    }
  });
  
  // Add a new review for a product
  app.post('/api/public/stores/:storeSlug/products/:productId/reviews', async (req, res) => {
    try {
      const { storeSlug, productId } = req.params;
      const { name, email, title, rating, content } = req.body;
      
      if (!name || !email || !title || !rating || !content) {
        return res.status(400).json({ message: 'Missing required fields' });
      }
      
      // Extract the actual ID from the slug format if it's using SEO-friendly format (name-slug-{id})
      // Otherwise use the productId directly
      const actualProductId = productId.includes('-') 
        ? productId.split('-').pop() 
        : productId;
        
      // First get the store profile by slug
      const [storeProfile] = await db.select()
        .from(storeProfiles)
        .where(
          and(
            sql`${storeProfiles.isVerified} = true`,
            eq(storeProfiles.slug, storeSlug)
          )
        )
        .limit(1);
      
      if (!storeProfile) {
        return res.status(404).json({ message: 'Store not found' });
      }
      
      // Verify the product exists for this store
      const [product] = await db.select()
        .from(storeProducts)
        .where(
          and(
            eq(storeProducts.storeId, storeProfile.id),
            eq(storeProducts.id, parseInt(actualProductId))
          )
        )
        .limit(1);
      
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }
      
      // Insert the new review - use schema object to access the table
      const [newReview] = await db.insert(schema.productReviews)
        .values({
          productId: product.id,
          authorName: name,
          authorEmail: email,
          rating: parseInt(rating.toString()),
          title,
          content,
          helpful: 0,
          verified: true
        })
        .returning();
      
      // Format the new review for response
      const formattedReview = {
        ...newReview,
        date: newReview.createdAt.toISOString().split('T')[0]
      };
      
      res.status(201).json(formattedReview);
    } catch (error) {
      console.error('Error adding product review:', error);
      res.status(500).json({ message: 'Failed to add product review' });
    }
  });
  
  // Setup WebSocket server
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws'
  });

  // Test database connection and generate test data
  testDbConnection().then(success => {
    dbInitialized = success;
    if (success) {
      console.log('Database initialization successful');
      generateTestData(); // Generate test data after successful connection
    } else {
      console.log('Database initialization failed - will retry on requests');
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    // Add client to our clients array with a connected client structure
    const client: ConnectedClient = {
      socket: ws
    };
    clients.push(client);
    
    // Tracking subscriptions for this client
    const productSubscriptions = new Set<number>();

    // Set a timeout to close the connection if no authentication is received
    // This variable will store the timeout ID for cleanup
    let authTimeout: NodeJS.Timeout;
    
    // Function to schedule authentication check
    const scheduleAuthCheck = () => {
      // Clear any existing timeout first to prevent multiple timeouts
      if (authTimeout) {
        clearTimeout(authTimeout);
      }
      
      authTimeout = setTimeout(() => {
        if (!client.userId && ws.readyState === WebSocket.OPEN) {
          console.log('WebSocket: Client failed to authenticate within timeout period');
          // Send a warning message first instead of immediately closing
          try {
            ws.send(JSON.stringify({
              type: 'auth_warning',
              message: 'Authentication timeout approaching - please authenticate soon'
            }));
            
            // Give a much longer grace period before disconnecting to help with slower connections
            setTimeout(() => {
              if (!client.userId && ws.readyState === WebSocket.OPEN) {
                console.log('WebSocket: Closing connection due to authentication timeout');
                // Only actually close if we're really sure it's an unauthorized connection
                ws.close(1008, 'Authentication timeout');
              } else if (client.userId) {
                console.log('WebSocket: User authenticated successfully before timeout');
              }
            }, 30000); // Increased grace period to 30 seconds
          } catch (error) {
            console.error('WebSocket: Error sending auth warning:', error);
            // We'll be more lenient with errors - don't close immediately
            try {
              setTimeout(() => {
                // Double-check if they authenticated in the meantime
                if (!client.userId && ws.readyState === WebSocket.OPEN) {
                  ws.close(1011, 'Server error');
                }
              }, 5000);
            } catch (closeError) {
              console.error('WebSocket: Error closing broken connection:', closeError);
            }
          }
        }
      }, 120000); // Extended timeout to 2 minutes for initial authentication
    };
    
    // Send initial connection success message
    ws.send(JSON.stringify({ type: 'connection_established' }));
    console.log('WebSocket connection established with client');
    
    // Start the authentication timeout process
    scheduleAuthCheck();
    
    // Send real price updates from the price history table when available
    const priceUpdateInterval = setInterval(async () => {
      try {
        // Query the most recent price history changes
        const recentPriceChanges = await db
          .select({
            id: priceHistory.id,
            productId: priceHistory.productId,
            oldPrice: priceHistory.oldPrice,
            newPrice: priceHistory.newPrice,
            timestamp: priceHistory.timestamp,
            productName: products.name
          })
          .from(priceHistory)
          .innerJoin(products, eq(priceHistory.productId, products.id))
          .orderBy(desc(priceHistory.timestamp))
          .limit(10);
          
        if (recentPriceChanges.length > 0) {
          // Get a recent price change
          const priceChange = recentPriceChanges[Math.floor(Math.random() * recentPriceChanges.length)];
          
          const priceUpdate = {
            id: priceChange.id,
            productName: priceChange.productName,
            oldPrice: parseFloat(priceChange.oldPrice),
            newPrice: parseFloat(priceChange.newPrice),
            timestamp: priceChange.timestamp.toISOString()
          };
          
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ 
              type: 'price_update', 
              data: priceUpdate 
            }));
            console.log('Sent real price update for product:', priceChange.productName);
          }
        } else {
          // Fall back to creating a real price change if no history exists
          const allProducts = await db.select().from(products).limit(10);
          if (allProducts.length > 0) {
            const product = allProducts[Math.floor(Math.random() * allProducts.length)];
            
            // Create a real price change record
            const oldPrice = parseFloat(product.currentPrice);
            // Use a more realistic price change based on actual market conditions
            const newPrice = oldPrice * 1.02; // 2% increase - typical for inflation or supply adjustments
            
            // Update the product's current price in the database
            await db
              .update(products)
              .set({ 
                currentPrice: newPrice.toFixed(2),
                updatedAt: new Date()
              })
              .where(eq(products.id, product.id));
              
            // Record the price change in the price history table
            const [priceChangeRecord] = await db
              .insert(priceHistory)
              .values({
                productId: product.id,
                oldPrice: oldPrice.toFixed(2),
                newPrice: newPrice.toFixed(2),
                reason: "Market adjustment",
                timestamp: new Date()
              })
              .returning();
            
            const priceUpdate = {
              id: priceChangeRecord.id,
              productName: product.name,
              oldPrice: oldPrice,
              newPrice: newPrice,
              timestamp: priceChangeRecord.timestamp.toISOString()
            };
            
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ 
                type: 'price_update', 
                data: priceUpdate 
              }));
              console.log('Created and sent real price update for product:', product.name);
            }
          }
        }
      } catch (error) {
        console.error('Error generating price update:', error);
      }
    }, 20000); // Reduced frequency to 20 seconds to minimize database writes

    ws.on('message', async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('WebSocket message received:', data.type);
        
        switch (data.type) {
          case 'heartbeat':
            // Client is sending a heartbeat to keep the connection alive
            // Respond with an acknowledgment
            try {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
              }
            } catch (error) {
              console.error('Error sending heartbeat acknowledgment:', error);
            }
            break;
          case 'authenticate':
            // Handle client authentication
            if (data.userId) {
              const userId = Number(data.userId);
              // Verify the user exists
              try {
                console.log(`WebSocket: Attempting to authenticate user ID: ${userId}`);
                
                // Check if this client is already authenticated with this user ID 
                if (client.userId === userId) {
                  console.log(`WebSocket: Client already authenticated as user ${userId}, skipping re-authentication`);
                  
                  // Clear the authentication timeout since we're already authenticated
                  clearTimeout(authTimeout);
                  
                  // Send authentication success message
                  try {
                    ws.send(JSON.stringify({ 
                      type: 'authentication_success',
                      data: {
                        userId: userId,
                        username: client.username,
                        role: client.role
                      }
                    }));
                    console.log(`WebSocket: Sent reconfirmation of authentication to user ${userId}`);
                  } catch (sendError) {
                    console.error('WebSocket: Error sending authentication confirmation:', sendError);
                  }
                  
                  // Exit early, we're already authenticated
                  break;
                }
                
                const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
                if (user.length > 0) {
                  // Update the client object with user information
                  client.userId = userId;
                  client.vendorId = user[0].vendorId;
                  client.role = user[0].role;
                  client.username = user[0].username;
                  
                  console.log(`WebSocket client authenticated as user ${userId} (${user[0].username})`);
                  
                  // Clear the authentication timeout since we're now authenticated
                  clearTimeout(authTimeout);
                  
                  // Send authentication success message
                  try {
                    ws.send(JSON.stringify({ 
                      type: 'authentication_success',
                      data: {
                        userId: userId,
                        username: user[0].username,
                        role: user[0].role
                      }
                    }));
                    console.log(`WebSocket: Authentication success message sent to user ${userId}`);
                  } catch (sendError) {
                    console.error('WebSocket: Error sending authentication success:', sendError);
                  }
                } else {
                  // User not found
                  console.log(`Authentication failed: User ${userId} not found`);
                  try {
                    ws.send(JSON.stringify({ 
                      type: 'authentication_error',
                      message: 'User not found'
                    }));
                    // We'll wait a bit before closing to give the client a chance to see the error
                    setTimeout(() => {
                      if (ws.readyState === WebSocket.OPEN) {
                        ws.close(1008, 'Authentication failed');
                      }
                    }, 2000);
                  } catch (sendError) {
                    console.error('WebSocket: Error sending auth error message:', sendError);
                  }
                }
              } catch (error) {
                console.error('Error during WebSocket authentication:', error);
                try {
                  ws.send(JSON.stringify({ 
                    type: 'authentication_error',
                    message: 'Authentication error'
                  }));
                  // We'll wait a bit before closing to give the client a chance to see the error
                  setTimeout(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                      ws.close(1008, 'Authentication error');
                    }
                  }, 2000);
                } catch (sendError) {
                  console.error('WebSocket: Error sending auth error message:', sendError);
                }
              }
            } else {
              // Missing user ID
              console.log('Authentication failed: Missing user ID');
              try {
                ws.send(JSON.stringify({ 
                  type: 'authentication_error',
                  message: 'Missing user ID'
                }));
                // We'll wait a bit before closing to give the client a chance to see the error
                setTimeout(() => {
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.close(1008, 'Authentication failed');
                  }
                }, 2000);
              } catch (sendError) {
                console.error('WebSocket: Error sending auth error message:', sendError);
              }
            }
            break;
            
          case 'subscribe_price_updates':
            // Handle price update subscription
            break;
            
          case 'subscribe_inventory':
            // Send initial inventory data
            const productInventory = await db.select({
              id: products.id,
              name: products.name,
              currentStock: products.currentStock,
              lowStockThreshold: products.lowStockThreshold
            })
              .from(products)
              .where(
                and(
                  sql`${products.currentStock} IS NOT NULL`,
                  sql`${products.lowStockThreshold} IS NOT NULL`,
                  sql`${products.currentStock} <= ${products.lowStockThreshold}`
                )
              );

            ws.send(JSON.stringify({
              type: 'inventory_status',
              data: productInventory
            }));
            break;
            
          case 'subscribe_product_updates':
            // Subscribe to a specific product's updates
            if (data.productId) {
              const productId = Number(data.productId);
              productSubscriptions.add(productId);
              console.log(`Client subscribed to product ${productId} updates`);
              
              // Send the current product data
              try {
                const product = await db.select()
                  .from(products)
                  .where(eq(products.id, productId))
                  .limit(1);
                  
                if (product.length > 0) {
                  ws.send(JSON.stringify({
                    type: 'product_data',
                    data: product[0]
                  }));
                }
              } catch (error) {
                console.error('Error fetching product data:', error);
              }
            }
            break;
            
          case 'unsubscribe_product_updates':
            // Unsubscribe from a specific product's updates
            if (data.productId) {
              const productId = Number(data.productId);
              productSubscriptions.delete(productId);
              console.log(`Client unsubscribed from product ${productId} updates`);
            }
            break;
            
          case 'ar_model_request':
            // Handle requests for AR models
            if (data.productId) {
              const productId = Number(data.productId);
              try {
                const product = await db.select()
                  .from(products)
                  .where(eq(products.id, productId))
                  .limit(1);
                  
                if (product.length > 0) {
                  ws.send(JSON.stringify({
                    type: 'ar_model_data',
                    data: {
                      productId: product[0].id,
                      name: product[0].name,
                      modelUrl: product[0].modelUrl || '/models/fallback.glb'
                    }
                  }));
                }
              } catch (error) {
                console.error('Error fetching AR model data:', error);
              }
            }
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    // Initialize an "is alive" flag and interval for ping/pong
    let isAlive = true;
    let pingInterval: NodeJS.Timeout;
    
    // Setup ping/pong to detect dead connections
    pingInterval = setInterval(() => {
      if (!isAlive) {
        console.log('WebSocket: Client failed ping, closing connection');
        clearInterval(pingInterval);
        return ws.terminate();
      }
      
      isAlive = false;
      try {
        ws.ping();
      } catch (error) {
        console.error('WebSocket: Error sending ping', error);
      }
    }, 30000); // Check every 30 seconds
    
    // Handle pong messages to keep connection alive
    ws.on('pong', () => {
      isAlive = true;
    });
    
    ws.on('close', () => {
      console.log('WebSocket connection closed');
      // Clear timeouts and intervals
      clearTimeout(authTimeout);
      clearInterval(priceUpdateInterval);
      clearInterval(pingInterval);
      
      // Remove client from array
      const index = clients.findIndex(c => c.socket === ws);
      if (index !== -1) {
        clients.splice(index, 1);
      }
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      // Clear timeouts and intervals
      clearTimeout(authTimeout);
      clearInterval(priceUpdateInterval);
      clearInterval(pingInterval);
      
      // Remove client from array
      const index = clients.findIndex(c => c.socket === ws);
      if (index !== -1) {
        clients.splice(index, 1);
      }
    });
    
    // Note: WebSocket error handler is already defined above
  });

  // Helper function to broadcast updates to all connected clients
  const broadcastUpdate = (type: string, data: any) => {
    broadcastMessage({ type, data });
  };

  // Channel Management API Endpoints
  
  // API endpoint for channels
  app.get("/api/channels", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // For admin, we don't filter by vendorId
      let query = user.role === "admin" 
        ? db.select().from(salesChannels)
        : db.select().from(salesChannels).where(eq(salesChannels.vendorId, user.vendorId));

      const channels = await query;
      res.json(channels);
    } catch (error) {
      console.error("Error fetching channels:", error);
      res.status(500).json({ message: "Failed to fetch channels" });
    }
  });

  // API endpoint for creating a channel
  app.post("/api/channels", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { name, type, url, description, isActive } = req.body;

      const [channel] = await db.insert(salesChannels).values({
        vendorId: user.vendorId,
        name,
        type,
        url,
        description,
        isActive: isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      res.status(201).json(channel);
    } catch (error) {
      console.error("Error creating channel:", error);
      res.status(500).json({ message: "Failed to create channel" });
    }
  });

  // API endpoint for updating a channel
  app.patch("/api/channels/:id", isAuthenticated, async (req, res) => {
    try {
      const channelId = parseInt(req.params.id);
      const userId = req.user?.id;
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if channel exists and belongs to the vendor
      const existingChannel = await db.query.salesChannels.findFirst({
        where: and(
          eq(salesChannels.id, channelId),
          user.role === "admin" ? undefined : eq(salesChannels.vendorId, user.vendorId)
        ),
      });

      if (!existingChannel) {
        return res.status(404).json({ message: "Channel not found" });
      }

      const [updatedChannel] = await db.update(salesChannels)
        .set({
          ...req.body,
          updatedAt: new Date(),
        })
        .where(eq(salesChannels.id, channelId))
        .returning();

      res.json(updatedChannel);
    } catch (error) {
      console.error("Error updating channel:", error);
      res.status(500).json({ message: "Failed to update channel" });
    }
  });

  // API endpoint for deleting a channel
  app.delete("/api/channels/:id", isAuthenticated, async (req, res) => {
    try {
      const channelId = parseInt(req.params.id);
      const userId = req.user?.id;
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if channel exists and belongs to the vendor
      const existingChannel = await db.query.salesChannels.findFirst({
        where: and(
          eq(salesChannels.id, channelId),
          user.role === "admin" ? undefined : eq(salesChannels.vendorId, user.vendorId)
        ),
      });

      if (!existingChannel) {
        return res.status(404).json({ message: "Channel not found" });
      }

      // Delete the channel
      await db.delete(salesChannels).where(eq(salesChannels.id, channelId));

      res.json({ message: "Channel deleted successfully" });
    } catch (error) {
      console.error("Error deleting channel:", error);
      res.status(500).json({ message: "Failed to delete channel" });
    }
  });

  // API endpoint for channel prices
  app.get("/api/channel-prices", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // For admin, we don't filter by vendorId
      const query = db.select({
        id: productChannelPricing.id,
        productId: productChannelPricing.productId,
        channelId: productChannelPricing.channelId,
        productName: products.name,
        channelName: salesChannels.name,
        basePrice: productChannelPricing.basePrice,
        discountedPrice: productChannelPricing.discountedPrice,
        minimumPrice: productChannelPricing.minimumPrice,
        maximumPrice: productChannelPricing.maximumPrice,
        lastUpdated: productChannelPricing.updatedAt,
      })
      .from(productChannelPricing)
      .innerJoin(products, eq(productChannelPricing.productId, products.id))
      .innerJoin(salesChannels, eq(productChannelPricing.channelId, salesChannels.id))
      .where(
        user.role === "admin" 
          ? undefined 
          : eq(products.vendorId, user.vendorId)
      );

      const prices = await query;
      res.json(prices);
    } catch (error) {
      console.error("Error fetching channel prices:", error);
      res.status(500).json({ message: "Failed to fetch channel prices" });
    }
  });

  // API endpoint for creating a channel price
  app.post("/api/channel-prices", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { productId, channelId, basePrice, minimumPrice, maximumPrice } = req.body;

      // Check if product and channel exist and belong to the vendor
      const product = await db.query.products.findFirst({
        where: and(
          eq(products.id, productId),
          user.role === "admin" ? undefined : eq(products.vendorId, user.vendorId)
        ),
      });

      const channel = await db.query.salesChannels.findFirst({
        where: and(
          eq(salesChannels.id, channelId),
          user.role === "admin" ? undefined : eq(salesChannels.vendorId, user.vendorId)
        ),
      });

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (!channel) {
        return res.status(404).json({ message: "Channel not found" });
      }

      // Check if price already exists
      const existingPrice = await db.query.productChannelPricing.findFirst({
        where: and(
          eq(productChannelPricing.productId, productId),
          eq(productChannelPricing.channelId, channelId)
        ),
      });

      if (existingPrice) {
        return res.status(400).json({ message: "Price for this product and channel already exists" });
      }

      const [channelPrice] = await db.insert(productChannelPricing).values({
        productId,
        channelId,
        basePrice: basePrice.toString(),
        minimumPrice: minimumPrice.toString(),
        maximumPrice: maximumPrice.toString(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      res.status(201).json(channelPrice);
    } catch (error) {
      console.error("Error creating channel price:", error);
      res.status(500).json({ message: "Failed to create channel price" });
    }
  });

  app.patch("/api/channel-prices/:id", isAuthenticated, async (req, res) => {
    try {
      const channelPriceId = parseInt(req.params.id);
      const userId = req.user?.id;
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const existingPrice = await db.query.productChannelPricing.findFirst({
        where: eq(productChannelPricing.id, channelPriceId),
      });

      if (!existingPrice) {
        return res.status(404).json({ message: "Channel price not found" });
      }

      const relatedProduct = await db.query.products.findFirst({
        where: and(
          eq(products.id, existingPrice.productId),
          user.role === "admin" ? undefined : eq(products.vendorId, user.vendorId)
        ),
      });

      if (!relatedProduct) {
        return res.status(403).json({ message: "You don't have access to this channel pricing data" });
      }

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (req.body.basePrice !== undefined) updateData.basePrice = String(req.body.basePrice);
      if (req.body.discountedPrice !== undefined) updateData.discountedPrice = req.body.discountedPrice === null || req.body.discountedPrice === "" ? null : String(req.body.discountedPrice);
      if (req.body.minimumPrice !== undefined) updateData.minimumPrice = String(req.body.minimumPrice);
      if (req.body.maximumPrice !== undefined) updateData.maximumPrice = String(req.body.maximumPrice);

      const [updatedPrice] = await db.update(productChannelPricing)
        .set(updateData)
        .where(eq(productChannelPricing.id, channelPriceId))
        .returning();

      res.json(updatedPrice);
    } catch (error) {
      console.error("Error updating channel price:", error);
      res.status(500).json({ message: "Failed to update channel price" });
    }
  });

  app.delete("/api/channel-prices/:id", isAuthenticated, async (req, res) => {
    try {
      const channelPriceId = parseInt(req.params.id);
      const userId = req.user?.id;
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const existingPrice = await db.query.productChannelPricing.findFirst({
        where: eq(productChannelPricing.id, channelPriceId),
      });

      if (!existingPrice) {
        return res.status(404).json({ message: "Channel price not found" });
      }

      const relatedProduct = await db.query.products.findFirst({
        where: and(
          eq(products.id, existingPrice.productId),
          user.role === "admin" ? undefined : eq(products.vendorId, user.vendorId)
        ),
      });

      if (!relatedProduct) {
        return res.status(403).json({ message: "You don't have access to this channel pricing data" });
      }

      await db.delete(productChannelPricing).where(eq(productChannelPricing.id, channelPriceId));
      res.json({ message: "Channel price deleted successfully" });
    } catch (error) {
      console.error("Error deleting channel price:", error);
      res.status(500).json({ message: "Failed to delete channel price" });
    }
  });

  // API endpoint for channel price rules
  app.get("/api/channel-rules", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const query = db.select({
        id: priceRuleChannels.id,
        channelId: priceRuleChannels.channelId,
        ruleId: priceRuleChannels.ruleId,
        ruleName: priceRules.name,
        channelName: salesChannels.name,
        isActive: priceRuleChannels.isActive,
      })
      .from(priceRuleChannels)
      .innerJoin(priceRules, eq(priceRuleChannels.ruleId, priceRules.id))
      .innerJoin(salesChannels, eq(priceRuleChannels.channelId, salesChannels.id))
      .where(
        user.role === "admin" 
          ? undefined 
          : eq(priceRules.vendorId, user.vendorId)
      );

      const rules = await query;
      res.json(rules);
    } catch (error) {
      console.error("Error fetching channel rules:", error);
      res.status(500).json({ message: "Failed to fetch channel rules" });
    }
  });

  // API endpoint for creating a channel rule assignment
  app.post("/api/channel-rules", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { ruleId, channelId, isActive } = req.body;

      // Check if rule and channel exist and belong to the vendor
      const rule = await db.query.priceRules.findFirst({
        where: and(
          eq(priceRules.id, ruleId),
          user.role === "admin" ? undefined : eq(priceRules.vendorId, user.vendorId)
        ),
      });

      const channel = await db.query.salesChannels.findFirst({
        where: and(
          eq(salesChannels.id, channelId),
          user.role === "admin" ? undefined : eq(salesChannels.vendorId, user.vendorId)
        ),
      });

      if (!rule) {
        return res.status(404).json({ message: "Price rule not found" });
      }

      if (!channel) {
        return res.status(404).json({ message: "Channel not found" });
      }

      // Check if assignment already exists
      const existingAssignment = await db.query.priceRuleChannels.findFirst({
        where: and(
          eq(priceRuleChannels.ruleId, ruleId),
          eq(priceRuleChannels.channelId, channelId)
        ),
      });

      if (existingAssignment) {
        return res.status(400).json({ message: "Rule is already assigned to this channel" });
      }

      const [channelRule] = await db.insert(priceRuleChannels).values({
        ruleId,
        channelId,
        isActive: isActive ?? true,
      }).returning();

      res.status(201).json(channelRule);
    } catch (error) {
      console.error("Error creating channel rule assignment:", error);
      res.status(500).json({ message: "Failed to create channel rule assignment" });
    }
  });

  app.patch("/api/channel-rules/:id", isAuthenticated, async (req, res) => {
    try {
      const assignmentId = parseInt(req.params.id);
      const userId = req.user?.id;
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const existingAssignment = await db.query.priceRuleChannels.findFirst({
        where: eq(priceRuleChannels.id, assignmentId),
      });

      if (!existingAssignment) {
        return res.status(404).json({ message: "Channel rule assignment not found" });
      }

      const rule = await db.query.priceRules.findFirst({
        where: and(
          eq(priceRules.id, existingAssignment.ruleId),
          user.role === "admin" ? undefined : eq(priceRules.vendorId, user.vendorId)
        ),
      });

      if (!rule) {
        return res.status(403).json({ message: "You don't have access to this channel rule assignment" });
      }

      const [updatedAssignment] = await db.update(priceRuleChannels)
        .set({
          isActive: req.body.isActive ?? existingAssignment.isActive,
        })
        .where(eq(priceRuleChannels.id, assignmentId))
        .returning();

      res.json(updatedAssignment);
    } catch (error) {
      console.error("Error updating channel rule assignment:", error);
      res.status(500).json({ message: "Failed to update channel rule assignment" });
    }
  });

  app.delete("/api/channel-rules/:id", isAuthenticated, async (req, res) => {
    try {
      const assignmentId = parseInt(req.params.id);
      const userId = req.user?.id;
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const existingAssignment = await db.query.priceRuleChannels.findFirst({
        where: eq(priceRuleChannels.id, assignmentId),
      });

      if (!existingAssignment) {
        return res.status(404).json({ message: "Channel rule assignment not found" });
      }

      const rule = await db.query.priceRules.findFirst({
        where: and(
          eq(priceRules.id, existingAssignment.ruleId),
          user.role === "admin" ? undefined : eq(priceRules.vendorId, user.vendorId)
        ),
      });

      if (!rule) {
        return res.status(403).json({ message: "You don't have access to this channel rule assignment" });
      }

      await db.delete(priceRuleChannels).where(eq(priceRuleChannels.id, assignmentId));
      res.json({ message: "Channel rule assignment deleted successfully" });
    } catch (error) {
      console.error("Error deleting channel rule assignment:", error);
      res.status(500).json({ message: "Failed to delete channel rule assignment" });
    }
  });

  // API endpoint for channel performance metrics
  app.get("/api/channel-performance", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // For admin, we don't filter by vendorId
      let query = db.select()
        .from(channelPerformanceMetrics)
        .where(
          user.role === "admin" 
            ? undefined 
            : eq(channelPerformanceMetrics.vendorId, user.vendorId)
        );

      const metrics = await query;
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching channel performance:", error);
      res.status(500).json({ message: "Failed to fetch channel performance metrics" });
    }
  });

  // External API endpoint for product information (public)
  app.get("/api/external/products", async (req, res) => {
    try {
      const allProducts = await db.select().from(products);
      const activePromotions = await db
        .select()
        .from(promotions)
        .where(
          and(
            lte(promotions.startDate, new Date()),
            gte(promotions.endDate, new Date())
          )
        );

      // Map promotions to product IDs for quick lookup
      const promotionMap = new Map();
      activePromotions.forEach(promo => {
        if (promo.appliedProducts) {
          try {
            const productIds = Array.isArray(promo.appliedProducts)
              ? promo.appliedProducts
              : JSON.parse(promo.appliedProducts);

            if (Array.isArray(productIds)) {
              productIds.forEach((productId: number) => {
                promotionMap.set(productId, {
                  name: promo.name,
                  discountPercent: promo.discountPercent
                });
              });
            }
          } catch (error) {
            console.error("Error parsing promotion products:", error);
          }
        }
      });

      // Combine product and promotion information
      const enrichedProducts = allProducts.map(product => ({
        id: product.id,
        name: product.name,
        category: product.category,
        location: {
          aisle: product.aisle || null,
          shelf: product.shelf || null
        },
        basePrice: product.basePrice,
        currentPrice: product.currentPrice,
        currentStock: product.currentStock,
        imageUrl: product.imageUrl || null,
        promotion: promotionMap.get(product.id) || null
      }));

      res.json({
        success: true,
        data: enrichedProducts,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Failed to fetch product information:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch product information"
      });
    }
  });
  
  // QR Code API endpoint - Get single product by ID with vendor information
  app.get("/api/qr/products/:id", async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      
      if (isNaN(productId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid product ID"
        });
      }
      
      // Get product info with vendor join
      const product = await db
        .select({
          id: products.id,
          productVendorId: products.vendorId,
          name: products.name,
          brand: products.brand,
          sku: products.sku,
          basePrice: products.basePrice,
          currentPrice: products.currentPrice,
          category: products.category,
          aisle: products.aisle,
          shelf: products.shelf,
          imageUrl: products.imageUrl,
          description: products.description,
          vendorId: vendors.id,
          vendorName: vendors.name,
          vendorBusinessName: vendors.businessName
        })
        .from(products)
        .leftJoin(vendors, eq(products.vendorId, vendors.id))
        .where(eq(products.id, productId))
        .limit(1);
        
      if (!product || product.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Product not found"
        });
      }
      
      // Check for active promotions
      const activePromotion = await db
        .select()
        .from(promotions)
        .where(
          and(
            lte(promotions.startDate, new Date()),
            gte(promotions.endDate, new Date())
          )
        )
        .limit(100);
        
      // Find promotion that applies to this product
      let productPromotion = null;
      for (const promo of activePromotion) {
        if (promo.appliedProducts) {
          try {
            const productIds = Array.isArray(promo.appliedProducts)
              ? promo.appliedProducts
              : JSON.parse(promo.appliedProducts);
              
            if (Array.isArray(productIds) && productIds.includes(productId)) {
              productPromotion = {
                name: promo.name,
                discountPercent: promo.discountPercent,
                startDate: promo.startDate,
                endDate: promo.endDate
              };
              break;
            }
          } catch (error) {
            console.error("Error parsing promotion products:", error);
          }
        }
      }
      
      // Format the response
      const productInfo = {
        id: product[0].id,
        name: product[0].name,
        brand: product[0].brand || null,
        sku: product[0].sku,
        basePrice: product[0].basePrice,
        currentPrice: product[0].currentPrice,
        category: product[0].category,
        location: {
          aisle: product[0].aisle || null,
          shelf: product[0].shelf || null
        },
        description: product[0].description,
        imageUrl: product[0].imageUrl || null,
        vendor: {
          id: product[0].vendorId || product[0].productVendorId,
          name: product[0].vendorName || "Store",
          businessName: product[0].vendorBusinessName || product[0].vendorName || "Store"
        },
        promotion: productPromotion,
        timestamp: new Date().toISOString()
      };
      
      res.json({
        success: true,
        data: productInfo
      });
    } catch (error) {
      console.error("Failed to fetch product QR code data:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch product information"
      });
    }
  });
  
  // QR Code API endpoint - Get all products with locations for store directory
  app.get("/api/qr/store-directory", async (req, res) => {
    try {
      // Get vendor ID from query parameters or user session
      // If we're authenticated, prioritize the current user's vendor ID
      let vendorId = null;
      
      // If user is authenticated, use their vendor ID
      if (req.isAuthenticated() && req.user) {
        vendorId = req.user.vendorId || null;
      }
      
      // Or use the storeId query parameter if provided
      if (!vendorId && req.query.storeId) {
        vendorId = parseInt(req.query.storeId as string, 10);
      }
      
      // Return an error if no vendor ID is available - this is required
      if (!vendorId) {
        return res.status(400).json({
          success: false,
          error: "Store ID or vendor ID is required for store directory QR code"
        });
      }

      // First, get the store profile and vendor info to ensure we have the logo URL
      const storeInfo = await db
        .select({
          vendorId: vendors.id,
          vendorName: vendors.name,
          logoUrl: storeProfiles.logoUrl,
          integrationSettings: storeProfiles.integrationSettings,
        })
        .from(vendors)
        .leftJoin(storeProfiles, eq(vendors.id, storeProfiles.vendorId))
        .where(eq(vendors.id, vendorId))
        .limit(1);
        
      console.log('Store info raw query result:', storeInfo);

      console.log('Store info query result:', JSON.stringify(storeInfo, null, 2));
      
      // Let's also query the store profiles directly to confirm they exist
      const storeProfiles1 = await db
        .select()
        .from(storeProfiles)
        .where(eq(storeProfiles.vendorId, vendorId));
      
      console.log('Direct store profiles query:', JSON.stringify(storeProfiles1, null, 2));
      
      
      if (!storeInfo || storeInfo.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Vendor not found"
        });
      }

      const vendorInfo = storeInfo[0];
      const integrationSettings = vendorInfo.integrationSettings && typeof vendorInfo.integrationSettings === "object"
        ? vendorInfo.integrationSettings as Record<string, any>
        : {};
      const locationLabels = integrationSettings.locationLabels && typeof integrationSettings.locationLabels === "object"
        ? integrationSettings.locationLabels as Record<string, any>
        : {};
      const locationLabelPrimary = typeof locationLabels.primary === "string" ? locationLabels.primary : "Aisle";
      const locationLabelSecondary = typeof locationLabels.secondary === "string" ? locationLabels.secondary : "Shelf";
      console.log('Vendor info with logo URL:', JSON.stringify(vendorInfo, null, 2));
      
      // Now get all products for this vendor
      const rawProducts = await db
        .select({
          id: products.id,
          name: products.name,
          brand: products.brand,
          description: products.description,
          category: products.category,
          aisle: products.aisle,
          shelf: products.shelf,
          currentStock: products.currentStock,
          currentPrice: products.currentPrice,
          barcode: products.barcode,
          imageUrl: products.imageUrl,
        })
        .from(products)
        .where(eq(products.vendorId, vendorId))
        .orderBy(products.aisle, products.shelf, products.name);

      const allProducts = await Promise.all(rawProducts.map(async (product) => {
        if (typeof product.imageUrl !== "string" || !product.imageUrl.startsWith("data:image/")) {
          return product;
        }

        const imageUrl = await persistImageDataUrl(product.imageUrl, "products", `vendor-${vendorId}-product-${product.id}`);
        await db
          .update(products)
          .set({ imageUrl, updatedAt: new Date() })
          .where(eq(products.id, product.id));

        return { ...product, imageUrl };
      }));
      
      console.log(`Fetched ${allProducts.length} products for vendor ID: ${vendorId}`);
      
      if (!allProducts || allProducts.length === 0) {
        // Even if there are no products, we can still return the vendor info
        return res.status(200).json({
          success: true,
          data: {
            totalProducts: 0,
            timestamp: new Date().toISOString(),
            vendorId: vendorInfo.vendorId,
            vendorName: vendorInfo.vendorName,
            logoUrl: resolveStoreLogoUrl(vendorInfo.logoUrl, getPublicBaseUrl(req)),
            locationLabels: {
              primary: locationLabelPrimary,
              secondary: locationLabelSecondary,
            },
            productsByCategory: {},
            productsByAisle: {}
          }
        });
      }
      
      // Group products by category
      const productsByCategory = {};
      allProducts.forEach(product => {
        const productImageUrl = resolvePublicAssetUrl(product.imageUrl, getPublicBaseUrl(req));
        const stockPayload = createPublicStockPayload(product.currentStock);

        if (!productsByCategory[product.category]) {
          productsByCategory[product.category] = [];
        }
        
        productsByCategory[product.category].push({
          id: product.id,
          name: product.name,
          brand: product.brand || null,
          barcode: product.barcode || null,
          description: product.description || null,
          price: product.currentPrice,
          ...stockPayload,
          imageUrl: productImageUrl,
          image: productImageUrl,
          productImageUrl,
          location: {
            aisle: product.aisle || "N/A",
            shelf: product.shelf || "N/A"
          },
          vendor: vendorInfo.vendorName
        });
      });
      
      // Group products by aisle for easy store navigation
      const productsByAisle = {};
      allProducts.forEach(product => {
        const aisle = product.aisle || "Unassigned";
        const productImageUrl = resolvePublicAssetUrl(product.imageUrl, getPublicBaseUrl(req));
        const stockPayload = createPublicStockPayload(product.currentStock);

        if (!productsByAisle[aisle]) {
          productsByAisle[aisle] = [];
        }
        
        productsByAisle[aisle].push({
          id: product.id,
          name: product.name,
          brand: product.brand || null,
          barcode: product.barcode || null,
          description: product.description || null,
          price: product.currentPrice,
          ...stockPayload,
          imageUrl: productImageUrl,
          image: productImageUrl,
          productImageUrl,
          shelf: product.shelf || "N/A",
          category: product.category
        });
      });
      
      // Format the response with better organization and formatting
      const storeDirectory = {
        totalProducts: allProducts.length,
        timestamp: new Date().toISOString(),
        vendorId: vendorInfo.vendorId,
        vendorName: vendorInfo.vendorName,
        // Use the stored logo URL when it is public-safe, otherwise use the bundled default logo.
        logoUrl: resolveStoreLogoUrl(vendorInfo.logoUrl, getPublicBaseUrl(req)),
        locationLabels: {
          primary: locationLabelPrimary,
          secondary: locationLabelSecondary,
        },
        productsByCategory,
        productsByAisle
      };
      
      // Properly format the JSON response with 2-space indentation
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        success: true,
        data: storeDirectory
      }, null, 2));
    } catch (error) {
      console.error("Failed to fetch store directory:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch store directory information"
      });
    }
  });

  // Products API endpoints with multi-tenant support
  app.get("/api/uploads/debug", isAuthenticated, async (req, res) => {
    const uploadRoot = getUploadRoot();
    const requestedPath = typeof req.query.path === "string" ? req.query.path : "";
    const relativePath = requestedPath
      .replace(/^https?:\/\/[^/]+/i, "")
      .replace(/^\/?uploads\/?/, "")
      .replace(/^\/+/, "");
    const filePath = relativePath ? path.join(uploadRoot, relativePath) : null;

    res.json({
      uploadRoot,
      uploadRootExists: fs.existsSync(uploadRoot),
      productsDirectory: path.join(uploadRoot, "products"),
      productsDirectoryExists: fs.existsSync(path.join(uploadRoot, "products")),
      requestedPath: requestedPath || null,
      resolvedPath: filePath,
      fileExists: filePath ? fs.existsSync(filePath) : null,
    });
  });

  app.get("/api/products", isAuthenticated, async (req, res) => {
    try {
      console.log("Fetching products from database...");
      if (!dbInitialized) {
        return res.status(503).json({
          message: "Database connection not available",
          retryAfter: 5
        });
      }
      
      // Use the authenticated user's vendorId from their session
      // Allow override with query param for admin users
      let vendorId = req.user?.vendorId;
      
      // If user doesn't have a vendorId or is admin and specified a vendorId, use the query param
      if ((!vendorId || req.user?.role === 'admin') && req.query.vendorId) {
        vendorId = parseInt(req.query.vendorId as string);
      }
      
      // If still no vendorId, return an empty array - the user has no store yet
      if (!vendorId) {
        console.log("No vendor ID available for user, returning empty products array");
        res.setHeader("X-EaseSpotter-Vendor-Id", "none");
        return res.json([]);
      }

      res.setHeader("X-EaseSpotter-Vendor-Id", String(vendorId));
      
      const allProducts = await db
        .select()
        .from(products)
        .where(eq(products.vendorId, vendorId));
        
      // Transform product data to normalize field names (imageUrl -> image)
      const normalizedProducts = allProducts.map(product => ({
        ...product,
        image: product.imageUrl || null // Add image field that the frontend expects
      }));
        
      console.log(`Found ${normalizedProducts.length} products for vendor ${vendorId}`);
      res.json(normalizedProducts);
    } catch (error) {
      console.error("Failed to fetch products:", error);
      res.status(503).json({
        message: "Database service temporarily unavailable",
        retryAfter: 5
      });
    }
  });

  app.post("/api/products", isAuthenticated, async (req, res) => {
    try {
      const { image, imageUrl: submittedImageUrl, vendorId: requestedVendorId, ...productData } = req.body;
      const submittedImage = image || submittedImageUrl || null;

      let vendorId = req.user?.vendorId;

      if (req.user?.role === 'admin' && requestedVendorId) {
        vendorId = parseInt(String(requestedVendorId), 10);
      }

      if (!vendorId || Number.isNaN(vendorId)) {
        return res.status(400).json({ message: "Your account is not linked to a vendor store yet." });
      }

      // Verify the vendor exists
      const vendor = await db
        .select()
        .from(vendors)
        .where(eq(vendors.id, vendorId))
        .limit(1);

      if (!vendor.length) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      const trimmedSku = typeof productData.sku === "string" ? productData.sku.trim() : productData.sku;
      const sku = trimmedSku || `__NO_SKU__${vendorId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const brand = typeof productData.brand === "string" && productData.brand.trim() ? productData.brand.trim() : null;
      const barcode = typeof productData.barcode === "string" && productData.barcode.trim() ? productData.barcode.trim() : null;
      const aisle = typeof productData.aisle === "string" && productData.aisle.trim() ? productData.aisle.trim() : "Online";
      const shelf = typeof productData.shelf === "string" && productData.shelf.trim() ? productData.shelf.trim() : "Default";
      const imageUrl = await persistImageDataUrl(submittedImage, "products", `vendor-${vendorId}-${sku}`);

      const product = await db.insert(products).values({
        ...productData,
        brand,
        barcode,
        sku,
        vendorId,
        aisle,
        shelf,
        imageUrl,
        currentPrice: productData.basePrice,
      }).returning();

      // Return a normalized response with the 'image' field the frontend expects
      const normalizedProduct = {
        ...product[0],
        image: product[0].imageUrl || null
      };

      res.json(normalizedProduct);
    } catch (error: any) {
      console.error("Failed to create product:", error);
      if (error.status === 413) {
        return res.status(413).json({ message: error.message });
      }
      // Check if this is a unique constraint violation (duplicate SKU)
      if (error.code === '23505' && error.constraint_name === 'products_sku_unique') {
        return res.status(400).json({ 
          message: "A product with this SKU already exists. Please use a unique SKU.",
          field: "sku",
          error: "duplicate"
        });
      }
      res.status(500).json({ message: "Failed to create product" });
    }
  });

  app.patch("/api/products/:id", isAuthenticated, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const { id: _ignoredId, image, imageUrl: submittedImageUrl, currentStock, ...updateData } = req.body;
      
      console.log(`PATCH /api/products/${productId} requested`);
      console.log("Request body:", req.body);
      
      // Create a complete update object
      const updateObject = { ...updateData };
      
      // First, fetch the existing product to get its current data
      const existingProduct = await db
        .select()
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);
          
      if (!existingProduct.length) {
        return res.status(404).json({ message: "Product not found" });
      }

      if ("sku" in updateObject && typeof updateObject.sku === "string") {
        const trimmedSku = updateObject.sku.trim();
        updateObject.sku = trimmedSku || `__NO_SKU__${existingProduct[0].vendorId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      }

      if ("brand" in updateObject && typeof updateObject.brand === "string") {
        updateObject.brand = updateObject.brand.trim() || null;
      }

      if ("barcode" in updateObject && typeof updateObject.barcode === "string") {
        updateObject.barcode = updateObject.barcode.trim() || null;
      }

      let shouldRemoveExistingImage = false;
      
      // Handle image update
      if (image === undefined && submittedImageUrl === undefined) {
        // Keep the existing image if none is provided
        if (existingProduct[0].imageUrl) {
          updateObject.imageUrl = existingProduct[0].imageUrl;
        }
      } else if (image !== null) {
        // Update image if a new one is provided
        updateObject.imageUrl = await persistImageDataUrl(
          image || submittedImageUrl,
          "products",
          `vendor-${existingProduct[0].vendorId}-product-${productId}`,
        );
        shouldRemoveExistingImage = Boolean(
          existingProduct[0].imageUrl
          && updateObject.imageUrl
          && existingProduct[0].imageUrl !== updateObject.imageUrl
        );
      } else {
        // Image explicitly set to null, remove it
        updateObject.imageUrl = null;
        shouldRemoveExistingImage = Boolean(existingProduct[0].imageUrl);
      }
      
      // Handle stock update
      if (currentStock !== undefined) {
        updateObject.currentStock = currentStock;
      }
      
      console.log("Final update object:", updateObject);

      const updatedProduct = await db
        .update(products)
        .set({
          ...updateObject,
          updatedAt: new Date()
        })
        .where(eq(products.id, productId))
        .returning();

      if (!updatedProduct.length) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (shouldRemoveExistingImage) {
        await removePersistedUpload(existingProduct[0].imageUrl);
      }

      // Broadcast inventory update if stock was changed
      if (currentStock !== undefined) {
        broadcastUpdate('inventory_updated', {
          id: updatedProduct[0].id,
          name: updatedProduct[0].name,
          currentStock,
          lowStockThreshold: updatedProduct[0].lowStockThreshold
        });
      }

      // Return a normalized response with 'image' field that the frontend expects
      const normalizedProduct = {
        ...updatedProduct[0],
        image: updatedProduct[0].imageUrl || null
      };
      
      console.log("Updated product:", normalizedProduct);
      res.json(normalizedProduct);
    } catch (error: any) {
      console.error("Failed to update product:", error);
      if (error.status === 413) {
        return res.status(413).json({ message: error.message });
      }
      // Check if this is a unique constraint violation (duplicate SKU)
      if (error.code === '23505' && error.constraint_name === 'products_sku_unique') {
        return res.status(400).json({ 
          message: "A product with this SKU already exists. Please use a unique SKU.",
          field: "sku",
          error: "duplicate"
        });
      }
      res.status(500).json({ message: "Failed to update product: " + (error.message || "Unknown error") });
    }
  });

  app.delete("/api/products/:id", isAuthenticated, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);

      if (Number.isNaN(productId)) {
        return res.status(400).json({ message: "Invalid product ID" });
      }

      const deletedProduct = await db.transaction(async (tx) => {
        const [product] = await tx
          .select()
          .from(products)
          .where(eq(products.id, productId))
          .limit(1);

        if (!product) {
          return null;
        }

        if (req.user?.role !== "admin" && product.vendorId !== req.user?.vendorId) {
          throw Object.assign(new Error("You do not have permission to delete this product."), { status: 403 });
        }

        const linkedCompetitorProducts = await tx
          .select({ id: competitorProducts.id })
          .from(competitorProducts)
          .where(eq(competitorProducts.productId, productId));
        const linkedCompetitorProductIds = linkedCompetitorProducts.map((item) => item.id);

        if (linkedCompetitorProductIds.length > 0) {
          await tx.delete(competitorPrices)
            .where(inArray(competitorPrices.competitorProductId, linkedCompetitorProductIds));
        }

        await tx.delete(competitorProducts).where(eq(competitorProducts.productId, productId));
        await tx.delete(priceHistory).where(eq(priceHistory.productId, productId));
        await tx.delete(userBookmarks).where(eq(userBookmarks.productId, productId));
        await tx.delete(productPerformanceMetrics).where(eq(productPerformanceMetrics.productId, productId));
        await tx.delete(timeSeriesForecasts).where(eq(timeSeriesForecasts.productId, productId));
        await tx.delete(productChannelPricing).where(eq(productChannelPricing.productId, productId));
        await tx.delete(priceChangeApprovals).where(eq(priceChangeApprovals.productId, productId));
        await tx.update(supplierInvoiceLineItems)
          .set({ productId: null, matchStatus: "unmatched", updatedAt: new Date() })
          .where(eq(supplierInvoiceLineItems.productId, productId));
        await tx.delete(supplierCosts).where(eq(supplierCosts.productId, productId));
        await tx.delete(orderItems).where(eq(orderItems.productId, productId));

        const [deleted] = await tx
          .delete(products)
          .where(eq(products.id, productId))
          .returning();

        return deleted;
      });

      if (!deletedProduct) {
        return res.status(404).json({ message: "Product not found" });
      }

      await removePersistedUpload(deletedProduct.imageUrl);

      res.json(deletedProduct);
    } catch (error: any) {
      console.error("Failed to delete product:", error);
      res.status(error.status || 500).json({ message: "Failed to delete product: " + (error.message || "Unknown error") });
    }
  });


  app.post("/api/products/:id/restock", isAuthenticated, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const { amount } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Invalid restock amount" });
      }

      const updatedProduct = await db
        .update(products)
        .set({
          currentStock: sql`${products.currentStock} + ${amount}`,
          updatedAt: new Date()
        })
        .where(eq(products.id, productId))
        .returning();

      if (!updatedProduct.length) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Broadcast inventory update
      broadcastUpdate('inventory_updated', {
        id: updatedProduct[0].id,
        name: updatedProduct[0].name,
        currentStock: updatedProduct[0].currentStock + amount,
        lowStockThreshold: updatedProduct[0].lowStockThreshold
      });

      // Return a normalized response with 'image' field that the frontend expects
      const normalizedProduct = {
        ...updatedProduct[0],
        image: updatedProduct[0].imageUrl || null
      };

      res.json(normalizedProduct);
    } catch (error) {
      console.error("Failed to restock product:", error);
      res.status(500).json({ message: "Failed to restock product: " + (error.message || "Unknown error") });
    }
  });

  const getOrCreateWalkInCustomer = async (tx: any, vendorId: number) => {
    const walkInEmail = `walk-in-${vendorId}@easespotter.local`;
    const [existingCustomer] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.vendorId, vendorId), eq(customers.email, walkInEmail)))
      .limit(1);

    if (existingCustomer) return existingCustomer;

    const [createdCustomer] = await tx
      .insert(customers)
      .values({
        vendorId,
        email: walkInEmail,
        firstName: "Walk-in",
        lastName: "Customer",
        status: "active",
        source: "pos",
        marketingConsent: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return createdCustomer;
  };

  const parsePosPromotionProductIds = (appliedProducts: unknown): number[] => {
    if (Array.isArray(appliedProducts)) {
      return appliedProducts.map(Number).filter((id) => Number.isInteger(id) && id > 0);
    }

    if (typeof appliedProducts === "string") {
      try {
        const parsed = JSON.parse(appliedProducts);
        return parsePosPromotionProductIds(parsed);
      } catch {
        return [];
      }
    }

    return [];
  };

  const getActivePosPromotionsByProductId = async (queryDb: any, vendorId: number, productIds: number[]) => {
    const now = new Date();
    const activePromotions = await queryDb
      .select()
      .from(promotions)
      .where(and(
        eq(promotions.vendorId, vendorId),
        eq(promotions.status, "active"),
        lte(promotions.startDate, now),
        gte(promotions.endDate, now),
      ));

    const promotionByProductId = new Map<number, typeof activePromotions[number]>();
    const productIdSet = new Set(productIds);

    activePromotions.forEach((promotion) => {
      const appliedProductIds = parsePosPromotionProductIds(promotion.appliedProducts);
      appliedProductIds.forEach((productId) => {
        if (!productIdSet.has(productId)) return;

        const currentPromotion = promotionByProductId.get(productId);
        const currentDiscount = Number(currentPromotion?.discountPercent || 0);
        const nextDiscount = Number(promotion.discountPercent || 0);

        if (!currentPromotion || nextDiscount > currentDiscount) {
          promotionByProductId.set(productId, promotion);
        }
      });
    });

    return promotionByProductId;
  };

  const getPosPriceDetails = (
    product: { id: number; currentPrice: unknown; basePrice: unknown },
    promotionByProductId: Map<number, any>,
  ) => {
    const originalPrice = Number(product.currentPrice ?? product.basePrice ?? 0);
    const promotion = promotionByProductId.get(product.id);
    const discountPercent = Number(promotion?.discountPercent || 0);
    const salePrice = promotion && discountPercent > 0
      ? Math.max(originalPrice * (1 - discountPercent / 100), 0)
      : originalPrice;

    return {
      originalPrice,
      salePrice,
      discountPercent: promotion ? discountPercent : 0,
      promotion: promotion
        ? {
            id: promotion.id,
            name: promotion.name,
            discountPercent: promotion.discountPercent,
          }
        : null,
    };
  };

  app.get("/api/pos/products", isAuthenticated, async (req, res) => {
    try {
      const vendorId = req.user?.vendorId;

      if (!vendorId) {
        return res.status(403).json({ message: "Your account is not linked to a vendor store yet." });
      }

      const requestedLimit = Number(req.query.limit || 8);
      const requestedOffset = Number(req.query.offset || 0);
      const limit = Number.isInteger(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 1), 100)
        : 8;
      const offset = Number.isInteger(requestedOffset)
        ? Math.max(requestedOffset, 0)
        : 0;
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const conditions: any[] = [eq(products.vendorId, vendorId)];

      if (search) {
        const searchPattern = `%${search}%`;
        conditions.push(or(
          ilike(products.name, searchPattern),
          ilike(products.brand, searchPattern),
          ilike(products.sku, searchPattern),
          ilike(products.barcode, searchPattern),
          sql`cast(${products.id} as text) ILIKE ${searchPattern}`,
        ));
      }

      const whereClause = and(...conditions);
      const [{ total }] = await db
        .select({ total: sql<number>`count(*)` })
        .from(products)
        .where(whereClause);

      const cashierProducts = await db
        .select()
        .from(products)
        .where(whereClause)
        .orderBy(desc(products.updatedAt), desc(products.id))
        .limit(limit)
        .offset(offset);
      const promotionByProductId = await getActivePosPromotionsByProductId(
        db,
        vendorId,
        cashierProducts.map((product) => product.id),
      );

      res.json({
        products: cashierProducts.map((product) => {
          const priceDetails = getPosPriceDetails(product, promotionByProductId);

          return {
            ...product,
            image: product.imageUrl || null,
            originalPrice: priceDetails.originalPrice.toFixed(2),
            salePrice: priceDetails.salePrice.toFixed(2),
            posPrice: priceDetails.salePrice.toFixed(2),
            activePromotion: priceDetails.promotion,
          };
        }),
        total: Number(total || 0),
        limit,
        offset,
        search,
      });
    } catch (error) {
      console.error("Failed to fetch POS products:", error);
      res.status(500).json({ message: "Failed to fetch cashier products" });
    }
  });

  const completePosSale = async (
    vendorId: number,
    quantityByProductId: Map<number, number>,
    options: {
      paymentMethod: string;
      notes?: string | null;
      source: string;
      cashierUserId?: number | null;
      externalSaleId?: string | null;
    },
  ) => db.transaction(async (tx) => {
    const productIds = Array.from(quantityByProductId.keys());
    const saleProducts = await tx
      .select()
      .from(products)
      .where(and(eq(products.vendorId, vendorId), inArray(products.id, productIds)));

    if (saleProducts.length !== productIds.length) {
      throw new Error("One or more products were not found for this store.");
    }

    for (const product of saleProducts) {
      const requestedQuantity = quantityByProductId.get(product.id) || 0;
      const currentStock = Number(product.currentStock ?? 0);

      if (currentStock < requestedQuantity) {
        throw new Error(`${product.name} only has ${currentStock} in stock.`);
      }
    }

    const customer = await getOrCreateWalkInCustomer(tx, vendorId);
    const promotionByProductId = await getActivePosPromotionsByProductId(tx, vendorId, productIds);
    const totalAmount = saleProducts.reduce((sum, product) => {
      const quantity = quantityByProductId.get(product.id) || 0;
      const priceDetails = getPosPriceDetails(product, promotionByProductId);
      return sum + priceDetails.salePrice * quantity;
    }, 0);

    const [order] = await tx
      .insert(orders)
      .values({
        vendorId,
        customerId: customer.id,
        totalAmount: totalAmount.toFixed(2),
        status: "completed",
        paymentMethod: options.paymentMethod,
        notes: options.notes || null,
        metadata: {
          source: options.source,
          cashierUserId: options.cashierUserId || null,
          externalSaleId: options.externalSaleId || null,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    const lineItems = [];
    for (const product of saleProducts) {
      const quantity = quantityByProductId.get(product.id) || 0;
      const priceDetails = getPosPriceDetails(product, promotionByProductId);
      const unitPrice = priceDetails.salePrice;
      const totalPrice = unitPrice * quantity;
      const stockBefore = Number(product.currentStock ?? 0);

      const [lineItem] = await tx
        .insert(orderItems)
        .values({
          orderId: order.id,
          productId: product.id,
          quantity,
          unitPrice: unitPrice.toFixed(2),
          discount: (priceDetails.originalPrice - priceDetails.salePrice).toFixed(2),
          totalPrice: totalPrice.toFixed(2),
          notes: priceDetails.promotion
            ? `Promotion: ${priceDetails.promotion.name} (${priceDetails.discountPercent.toFixed(2)}% off)`
            : null,
        })
        .returning();

      const [updatedStockProduct] = await tx
        .update(products)
        .set({
          currentStock: sql`${products.currentStock} - ${quantity}`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(products.id, product.id),
          eq(products.vendorId, vendorId),
          sql`${products.currentStock} >= ${quantity}`,
        ))
        .returning({ currentStock: products.currentStock });

      if (!updatedStockProduct) {
        throw new Error(`${product.name} no longer has enough stock to complete this sale.`);
      }

      lineItems.push({
        ...lineItem,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        originalPrice: priceDetails.originalPrice.toFixed(2),
        discountPercent: priceDetails.discountPercent.toFixed(2),
        promotion: priceDetails.promotion,
        stockBefore,
        stockAfter: updatedStockProduct.currentStock,
      });
    }

    await tx
      .update(customers)
      .set({
        totalSpent: sql`coalesce(${customers.totalSpent}, 0) + ${totalAmount.toFixed(2)}`,
        totalOrders: sql`coalesce(${customers.totalOrders}, 0) + 1`,
        lastActive: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(customers.id, customer.id));

    return {
      success: true,
      orderId: order.id,
      order,
      totalAmount: totalAmount.toFixed(2),
      paymentMethod: options.paymentMethod,
      items: lineItems,
    };
  });

  app.post("/api/pos/sales", isAuthenticated, async (req, res) => {
    try {
      const vendorId = req.user?.vendorId;
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const paymentMethod = typeof req.body?.paymentMethod === "string"
        ? req.body.paymentMethod
        : "cash";

      if (!vendorId) {
        return res.status(403).json({ message: "Your account is not linked to a vendor store yet." });
      }

      if (items.length === 0) {
        return res.status(400).json({ message: "Add at least one item before completing a sale." });
      }

      const normalizedItems = items.map((item: any) => ({
        productId: Number(item.productId),
        quantity: Number(item.quantity),
      }));

      if (normalizedItems.some((item) => !Number.isInteger(item.productId) || item.productId <= 0 || !Number.isInteger(item.quantity) || item.quantity <= 0)) {
        return res.status(400).json({ message: "Each sale item must include a valid product and quantity." });
      }

      const quantityByProductId = new Map<number, number>();
      normalizedItems.forEach((item) => {
        quantityByProductId.set(item.productId, (quantityByProductId.get(item.productId) || 0) + item.quantity);
      });

      const sale = await completePosSale(vendorId, quantityByProductId, {
        paymentMethod,
        notes: req.body?.notes || null,
        source: "pos",
        cashierUserId: req.user?.id || null,
      });

      broadcastUpdate("pos_sale_completed", {
        vendorId,
        orderId: sale.orderId,
        items: sale.items,
      });

      res.status(201).json(sale);
    } catch (error: any) {
      console.error("Failed to complete POS sale:", error);
      res.status(400).json({ message: error.message || "Failed to complete sale" });
    }
  });

  app.post("/api/pos/sales/by-barcode", isAuthenticated, async (req, res) => {
    try {
      const vendorId = req.user?.vendorId;
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const paymentMethod = typeof req.body?.paymentMethod === "string"
        ? req.body.paymentMethod
        : "external";

      if (!vendorId) {
        return res.status(403).json({ message: "Your account is not linked to a vendor store yet." });
      }

      if (items.length === 0) {
        return res.status(400).json({ message: "At least one barcode item is required." });
      }

      const normalizedItems = items.map((item: any) => ({
        code: String(item.barcode || item.sku || item.code || "").trim(),
        quantity: Number(item.quantity ?? 1),
      }));

      if (normalizedItems.some((item) => !item.code || !Number.isInteger(item.quantity) || item.quantity <= 0)) {
        return res.status(400).json({ message: "Each item must include a barcode/code and positive quantity." });
      }

      const requestedCodes = Array.from(new Set(normalizedItems.map((item) => item.code)));
      const matchingProducts = await db
        .select()
        .from(products)
        .where(and(
          eq(products.vendorId, vendorId),
          or(
            inArray(products.barcode, requestedCodes),
            inArray(products.sku, requestedCodes),
          ),
        ));

      const productByCode = new Map<string, typeof matchingProducts[number]>();
      const duplicateCodes = new Set<string>();
      matchingProducts.forEach((product) => {
        [product.barcode, product.sku].filter(Boolean).forEach((code) => {
          if (!requestedCodes.includes(code as string)) return;
          if (productByCode.has(code as string)) {
            duplicateCodes.add(code as string);
            return;
          }
          productByCode.set(code as string, product);
        });
      });

      if (duplicateCodes.size > 0) {
        return res.status(409).json({
          message: "One or more scanned codes match multiple products. Make barcode values unique for this store.",
          duplicateCodes: Array.from(duplicateCodes),
        });
      }

      const missingCodes = requestedCodes.filter((code) => !productByCode.has(code));
      if (missingCodes.length > 0) {
        return res.status(404).json({
          message: "One or more scanned codes were not found for this store.",
          missingCodes,
        });
      }

      const quantityByProductId = new Map<number, number>();
      normalizedItems.forEach((item) => {
        const product = productByCode.get(item.code);
        if (!product) return;
        quantityByProductId.set(product.id, (quantityByProductId.get(product.id) || 0) + item.quantity);
      });

      const externalSaleId = typeof req.body?.externalSaleId === "string"
        ? req.body.externalSaleId.trim()
        : null;
      const sale = await completePosSale(vendorId, quantityByProductId, {
        paymentMethod,
        notes: req.body?.notes || null,
        source: "external_pos_barcode",
        cashierUserId: req.user?.id || null,
        externalSaleId,
      });

      broadcastUpdate("pos_sale_completed", {
        vendorId,
        orderId: sale.orderId,
        items: sale.items,
        source: "external_pos_barcode",
      });

      res.status(201).json(sale);
    } catch (error: any) {
      console.error("Failed to complete barcode POS sale:", error);
      res.status(400).json({ message: error.message || "Failed to complete barcode sale" });
    }
  });

  app.get("/api/pos/orders", isAuthenticated, async (req, res) => {
    try {
      const vendorId = req.user?.vendorId;

      if (!vendorId) {
        return res.status(403).json({ message: "Your account is not linked to a vendor store yet." });
      }

      const startDateParam = typeof req.query.startDate === "string" ? req.query.startDate : "";
      const endDateParam = typeof req.query.endDate === "string" ? req.query.endDate : "";
      const requestedLimit = Number(req.query.limit || 25);
      const limit = Number.isInteger(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 1), 250)
        : 25;
      const conditions = [eq(orders.vendorId, vendorId)];

      if (startDateParam) {
        const startDate = new Date(`${startDateParam}T00:00:00.000Z`);
        if (Number.isNaN(startDate.getTime())) {
          return res.status(400).json({ message: "Invalid startDate. Use YYYY-MM-DD." });
        }
        conditions.push(gte(orders.orderDate, startDate));
      }

      if (endDateParam) {
        const endDate = new Date(`${endDateParam}T23:59:59.999Z`);
        if (Number.isNaN(endDate.getTime())) {
          return res.status(400).json({ message: "Invalid endDate. Use YYYY-MM-DD." });
        }
        conditions.push(lte(orders.orderDate, endDate));
      }

      const recentOrders = await db
        .select({
          id: orders.id,
          orderDate: orders.orderDate,
          totalAmount: orders.totalAmount,
          status: orders.status,
          paymentMethod: orders.paymentMethod,
          metadata: orders.metadata,
        })
        .from(orders)
        .where(and(...conditions))
        .orderBy(desc(orders.orderDate))
        .limit(limit);

      const orderIds = recentOrders.map((order) => order.id);

      if (orderIds.length === 0) {
        return res.json([]);
      }

      const recentOrderItems = await db
        .select({
          orderId: orderItems.orderId,
          productId: orderItems.productId,
          quantity: orderItems.quantity,
          unitPrice: orderItems.unitPrice,
          totalPrice: orderItems.totalPrice,
          name: products.name,
          sku: products.sku,
          barcode: products.barcode,
          imageUrl: products.imageUrl,
        })
        .from(orderItems)
        .innerJoin(products, eq(orderItems.productId, products.id))
        .where(and(
          inArray(orderItems.orderId, orderIds),
          eq(products.vendorId, vendorId),
        ));

      const itemsByOrderId = new Map<number, typeof recentOrderItems>();
      recentOrderItems.forEach((item) => {
        const currentItems = itemsByOrderId.get(item.orderId) || [];
        currentItems.push(item);
        itemsByOrderId.set(item.orderId, currentItems);
      });

      res.json(recentOrders.map((order) => ({
        ...order,
        items: itemsByOrderId.get(order.id) || [],
      })));
    } catch (error) {
      console.error("Failed to fetch POS orders:", error);
      res.status(500).json({ message: "Failed to fetch POS orders" });
    }
  });

  app.post("/api/pos/orders/:orderId/refund", isAuthenticated, async (req, res) => {
    try {
      const vendorId = req.user?.vendorId;
      const orderId = Number(req.params.orderId);
      const restoreStock = req.body?.restoreStock !== false;
      const refundType = req.body?.type === "void" ? "voided" : "refunded";
      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

      if (!vendorId) {
        return res.status(403).json({ message: "Your account is not linked to a vendor store yet." });
      }

      if (!Number.isInteger(orderId) || orderId <= 0) {
        return res.status(400).json({ message: "A valid order ID is required." });
      }

      const result = await db.transaction(async (tx) => {
        const [order] = await tx
          .select()
          .from(orders)
          .where(and(eq(orders.id, orderId), eq(orders.vendorId, vendorId)))
          .limit(1);

        if (!order) {
          throw new Error("Order was not found for this store.");
        }

        if (["refunded", "voided", "cancelled", "canceled"].includes(order.status)) {
          throw new Error(`Order #${order.id} is already ${order.status}.`);
        }

        const items = await tx
          .select({
            productId: orderItems.productId,
            quantity: orderItems.quantity,
            name: products.name,
            sku: products.sku,
            barcode: products.barcode,
          })
          .from(orderItems)
          .innerJoin(products, eq(orderItems.productId, products.id))
          .where(and(
            eq(orderItems.orderId, order.id),
            eq(products.vendorId, vendorId),
          ));

        if (restoreStock) {
          for (const item of items) {
            await tx
              .update(products)
              .set({
                currentStock: sql`${products.currentStock} + ${item.quantity}`,
                updatedAt: new Date(),
              })
              .where(and(eq(products.id, item.productId), eq(products.vendorId, vendorId)));
          }
        }

        await tx
          .update(customers)
          .set({
            totalSpent: sql`greatest(coalesce(${customers.totalSpent}, 0) - ${order.totalAmount}, 0)`,
            totalOrders: sql`greatest(coalesce(${customers.totalOrders}, 0) - 1, 0)`,
            updatedAt: new Date(),
          })
          .where(and(eq(customers.id, order.customerId), eq(customers.vendorId, vendorId)));

        const existingMetadata = order.metadata && typeof order.metadata === "object"
          ? order.metadata as Record<string, unknown>
          : {};

        const [updatedOrder] = await tx
          .update(orders)
          .set({
            status: refundType,
            notes: reason || order.notes,
            metadata: {
              ...existingMetadata,
              refund: {
                type: refundType,
                restoreStock,
                reason: reason || null,
                refundedByUserId: req.user?.id || null,
                refundedAt: new Date().toISOString(),
              },
            },
            updatedAt: new Date(),
          })
          .where(and(eq(orders.id, order.id), eq(orders.vendorId, vendorId)))
          .returning();

        return {
          order: updatedOrder,
          restoredItems: restoreStock ? items : [],
        };
      });

      broadcastUpdate("pos_order_refunded", {
        vendorId,
        orderId,
        status: result.order.status,
        restoreStock,
      });

      res.json({
        success: true,
        order: result.order,
        restoredItems: result.restoredItems,
      });
    } catch (error: any) {
      console.error("Failed to refund POS order:", error);
      res.status(400).json({ message: error.message || "Failed to refund order" });
    }
  });

  app.get("/api/products/restock-suggestions", isAuthenticated, async (req, res) => {
    try {
      console.log("Generating restock suggestions...");
      if (!dbInitialized) {
        return res.status(503).json({
          message: "Database connection not available",
          retryAfter: 5
        });
      }
      
      // Use the authenticated user's vendorId
      let vendorId = req.user?.vendorId;
      
      // If user doesn't have a vendorId or is admin and specified a vendorId, use the query param
      if ((!vendorId || req.user?.role === 'admin') && req.query.vendorId) {
        vendorId = parseInt(req.query.vendorId as string);
      }
      
      // If still no vendorId, return empty array
      if (!vendorId) {
        console.log("No vendor ID available for user, returning empty restock suggestions array");
        return res.json([]);
      }
      
      const lowStockProducts = await db
        .select({
          id: products.id,
          name: products.name,
          currentStock: products.currentStock,
          lowStockThreshold: products.lowStockThreshold,
          sku: products.sku,
          category: products.category
        })
        .from(products)
        .where(
          and(
            eq(products.vendorId, vendorId),
            sql`${products.currentStock} IS NOT NULL`,
            sql`${products.lowStockThreshold} IS NOT NULL`,
            sql`${products.currentStock} <= ${products.lowStockThreshold}`
          )
        );

      // Calculate suggested restock amounts
      const suggestions = lowStockProducts.map(product => ({
        ...product,
        suggestedRestockAmount: Math.max(
          ((product.lowStockThreshold || 20) - (product.currentStock || 0)) * 2,
          10
        )
      }));

      console.log(`Generated ${suggestions.length} restock suggestions for vendor ${vendorId}`);
      res.json(suggestions);
    } catch (error) {
      console.error("Failed to generate restock suggestions:", error);
      res.status(503).json({
        message: "Database service temporarily unavailable",
        retryAfter: 5
      });
    }
  });

  const parsePromotionProductIds = (appliedProducts: unknown): number[] => {
    if (Array.isArray(appliedProducts)) {
      return appliedProducts.map(Number).filter(Number.isFinite);
    }

    if (typeof appliedProducts === "string") {
      try {
        const parsed = JSON.parse(appliedProducts);
        return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
      } catch {
        return [];
      }
    }

    return [];
  };

  const toMoneyNumber = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const roundMoney = (value: number) => Math.round(value * 100) / 100;

  const enrichPromotionsWithProducts = async (
    promotionRows: any[],
    vendorId: number,
    req: Request,
  ) => {
    const vendorProducts = await db
      .select({
        id: products.id,
        name: products.name,
        basePrice: products.basePrice,
        currentPrice: products.currentPrice,
        currentStock: products.currentStock,
        imageUrl: products.imageUrl,
        barcode: products.barcode,
      })
      .from(products)
      .where(eq(products.vendorId, vendorId));
    const productById = new Map(vendorProducts.map((product) => [product.id, product]));
    const baseUrl = getPublicBaseUrl(req);

    return promotionRows.map((promotion) => ({
      ...promotion,
      products: parsePromotionProductIds(promotion.appliedProducts)
        .map((productId) => {
          const product = productById.get(productId);
          if (!product) return null;

          const originalPrice = toMoneyNumber(product.currentPrice) ?? toMoneyNumber(product.basePrice) ?? 0;
          const discount = toMoneyNumber(promotion.discountPercent) ?? 0;
          const salePrice = roundMoney(originalPrice * (1 - discount / 100));
          const productImageUrl = resolvePublicAssetUrl(product.imageUrl, baseUrl);
          const stockPayload = createPublicStockPayload(product.currentStock);

          return {
            id: product.id,
            name: product.name,
            barcode: product.barcode || null,
            imageUrl: productImageUrl,
            image: productImageUrl,
            productImageUrl,
            originalPrice: roundMoney(originalPrice),
            salePrice,
            ...stockPayload,
          };
        })
        .filter(Boolean),
    }));
  };

  const getPromotionVendorId = (req: Request) => {
    const requestedVendorId = req.body?.vendorId ?? req.query?.vendorId;
    if (req.user?.role === "admin" && requestedVendorId) {
      const parsedVendorId = parseInt(String(requestedVendorId), 10);
      return Number.isNaN(parsedVendorId) ? null : parsedVendorId;
    }

    return req.user?.vendorId || null;
  };

  // Promotions API endpoints with multi-tenant support
  app.get("/api/promotions", isAuthenticated, async (req, res) => {
    try {
      // Use the authenticated user's vendorId
      let vendorId = req.user?.vendorId;
      
      // If user doesn't have a vendorId or is admin and specified a vendorId, use the query param
      if ((!vendorId || req.user?.role === 'admin') && req.query.vendorId) {
        vendorId = parseInt(req.query.vendorId as string);
      }
      
      // If still no vendorId, return empty array
      if (!vendorId) {
        console.log("No vendor ID available for user, returning empty promotions array");
        return res.json([]);
      }
      
      const allPromotions = await db
        .select()
        .from(promotions)
        .where(eq(promotions.vendorId, vendorId));
        
      res.json(await enrichPromotionsWithProducts(allPromotions, vendorId, req));
    } catch (error) {
      console.error("Failed to fetch promotions:", error);
      res.status(500).json({ message: "Failed to fetch promotions" });
    }
  });

  app.post("/api/promotions", isAuthenticated, async (req, res) => {
    try {
      console.log("Received promotion creation request:", JSON.stringify(req.body, null, 2));
      
      const { vendorId: _requestedVendorId, ...promotionData } = req.body;
      const vendorId = getPromotionVendorId(req);

      if (!vendorId) {
        return res.status(403).json({ message: "Your account is not linked to a vendor store yet." });
      }
      
      // Validate required fields
      if (!promotionData.name) {
        return res.status(400).json({ message: "Promotion name is required" });
      }
      
      if (!promotionData.discountPercent) {
        return res.status(400).json({ message: "Discount percentage is required" });
      }
      
      if (!promotionData.startDate) {
        return res.status(400).json({ message: "Start date is required" });
      }
      
      if (!promotionData.endDate) {
        return res.status(400).json({ message: "End date is required" });
      }
      
      if (!promotionData.appliedProducts || !Array.isArray(promotionData.appliedProducts) || promotionData.appliedProducts.length === 0) {
        return res.status(400).json({ message: "At least one product must be selected" });
      }
      
      // Verify the vendor exists
      const vendor = await db
        .select()
        .from(vendors)
        .where(eq(vendors.id, vendorId))
        .limit(1);

      if (!vendor.length) {
        return res.status(404).json({ message: "Vendor not found" });
      }
      
      // Ensure dates are proper Date objects
      const startDate = new Date(promotionData.startDate);
      const endDate = new Date(promotionData.endDate);
      
      // Validate date range
      if (startDate >= endDate) {
        return res.status(400).json({ message: "End date must be after start date" });
      }
      
      // Ensure discount is a valid number
      const discountPercent = parseFloat(promotionData.discountPercent.toString());
      if (isNaN(discountPercent) || discountPercent <= 0 || discountPercent > 100) {
        return res.status(400).json({ message: "Discount must be between 1 and 100" });
      }
      
      console.log("Creating promotion with processed data:", {
        ...promotionData,
        startDate,
        endDate,
        discountPercent,
        vendorId
      });
      
      try {
        const promotion = await db.insert(promotions).values({
          name: promotionData.name,
          discountPercent,
          startDate,
          endDate,
          appliedProducts: promotionData.appliedProducts,
          imageUrl: promotionData.imageUrl || null,
          status: promotionData.status || (startDate > new Date() ? 'scheduled' : 'active'),
          vendorId,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning();

        console.log("Successfully created promotion:", promotion[0]);
        const [promotionWithProducts] = await enrichPromotionsWithProducts(promotion, vendorId, req);
        
        // Broadcast the new promotion to all connected clients
        broadcastUpdate('promotion_created', promotionWithProducts);

        res.json(promotionWithProducts);
      } catch (dbError: any) {
        console.error("Database error during promotion creation:", dbError);
        res.status(500).json({ 
          message: "Failed to store promotion in database", 
          error: dbError.message
        });
      }
    } catch (error) {
      console.error("Failed to create promotion:", error);
      res.status(500).json({ message: "Failed to create promotion" });
    }
  });

  app.patch("/api/promotions/:id", isAuthenticated, async (req, res) => {
    try {
      const promotionId = parseInt(req.params.id);
      const vendorId = getPromotionVendorId(req);

      if (!vendorId) {
        return res.status(403).json({ message: "Your account is not linked to a vendor store yet." });
      }

      const { vendorId: _ignoredVendorId, ...promotionData } = req.body;
      const updatedPromotion = await db
        .update(promotions)
        .set({
          ...promotionData,
          updatedAt: new Date(),
        })
        .where(and(eq(promotions.id, promotionId), eq(promotions.vendorId, vendorId)))
        .returning();

      if (!updatedPromotion.length) {
        return res.status(404).json({ message: "Promotion not found" });
      }

      const [promotionWithProducts] = await enrichPromotionsWithProducts(
        updatedPromotion,
        vendorId,
        req,
      );

      // Broadcast the promotion update
      broadcastUpdate('promotion_updated', promotionWithProducts);

      res.json(promotionWithProducts);
    } catch (error) {
      console.error("Failed to update promotion:", error);
      res.status(500).json({ message: "Failed to update promotion" });
    }
  });
  
  // Add DELETE endpoint for promotions
  app.delete("/api/promotions/:id", isAuthenticated, async (req, res) => {
    try {
      const promotionId = parseInt(req.params.id);
      const vendorId = getPromotionVendorId(req);

      if (!vendorId) {
        return res.status(403).json({ message: "Your account is not linked to a vendor store yet." });
      }
      
      // First check if the promotion exists
      const existingPromotion = await db
        .select()
        .from(promotions)
        .where(and(eq(promotions.id, promotionId), eq(promotions.vendorId, vendorId)))
        .limit(1);
        
      if (existingPromotion.length === 0) {
        return res.status(404).json({ message: "Promotion not found" });
      }
      
      // Delete the promotion
      const deletedPromotion = await db
        .delete(promotions)
        .where(and(eq(promotions.id, promotionId), eq(promotions.vendorId, vendorId)))
        .returning();
        
      // Broadcast the promotion deletion
      broadcastUpdate('promotion_deleted', { id: promotionId });
      
      res.json(deletedPromotion[0]);
    } catch (error) {
      console.error("Failed to delete promotion:", error);
      res.status(500).json({ message: "Failed to delete promotion" });
    }
  });

  // Price rules API with multi-tenant support
  app.get("/api/price-rules", isAuthenticated, async (req, res) => {
    try {
      console.log("Fetching price rules...");
      const requestedVendorId = req.query.vendorId ? parseInt(req.query.vendorId as string) : undefined;
      const vendorId = req.user?.role === "admin" && requestedVendorId
        ? requestedVendorId
        : req.user?.vendorId;

      if (!vendorId && req.user?.role !== "admin") {
        return res.status(403).json({ message: "No vendor scope available for pricing rules" });
      }
      
      // First check if the vendor_id column exists in the table
      const columnExists = await db.execute(sql`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'price_rules' AND column_name = 'vendor_id'
        );
      `);
      
      let rules;
      
      if (columnExists.rows && columnExists.rows[0] && columnExists.rows[0].exists) {
        // If the column exists, use it in the where clause
        rules = await db
          .select()
          .from(priceRules)
          .where(eq(priceRules.vendorId, vendorId || requestedVendorId || 1));
      } else {
        // If the column doesn't exist, just fetch all rules
        console.log("vendor_id column not found in price_rules table, fetching all rules");
        rules = await db
          .select()
          .from(priceRules);
      }
        
      console.log(`Found ${rules.length} price rules for vendor ${vendorId || requestedVendorId || "all"}`);
      res.json(rules);
    } catch (error) {
      console.error("Failed to fetch price rules:", error);
      res.status(500).json({ message: "Failed to fetch price rules" });
    }
  });
  
  app.post("/api/price-rules", isAuthenticated, async (req, res) => {
    try {
      const { vendorId: requestedVendorId, ...ruleData } = req.body;
      const vendorId = req.user?.role === "admin" && requestedVendorId
        ? requestedVendorId
        : req.user?.vendorId;

      if (!vendorId) {
        return res.status(400).json({ message: "vendorId is required" });
      }
      
      // Verify the vendor exists
      const vendor = await db
        .select()
        .from(vendors)
        .where(eq(vendors.id, vendorId))
        .limit(1);

      if (!vendor.length) {
        return res.status(404).json({ message: "Vendor not found" });
      }
      
      // First check if the vendor_id column exists in the table
      const columnExists = await db.execute(sql`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'price_rules' AND column_name = 'vendor_id'
        );
      `);
      
      let insertValues;
      
      if (columnExists.rows && columnExists.rows[0] && columnExists.rows[0].exists) {
        // If the column exists, include vendorId in the insert
        insertValues = {
          ...ruleData,
          vendorId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      } else {
        // If the column doesn't exist, omit vendorId
        console.log("vendor_id column not found in price_rules table, omitting from insert");
        insertValues = {
          ...ruleData,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      
      const rule = await db.insert(priceRules).values(insertValues).returning();

      res.status(201).json(rule[0]);
    } catch (error) {
      console.error("Failed to create price rule:", error);
      res.status(500).json({ message: "Failed to create price rule" });
    }
  });
  
  app.patch("/api/price-rules/:id", isAuthenticated, async (req, res) => {
    try {
      const ruleId = parseInt(req.params.id);
      
      // First make sure rule exists
      const existingRule = await db
        .select()
        .from(priceRules)
        .where(eq(priceRules.id, ruleId))
        .limit(1);
        
      if (!existingRule.length) {
        return res.status(404).json({ message: "Price rule not found" });
      }
      
      // Check if the vendor_id column exists in the table
      const columnExists = await db.execute(sql`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'price_rules' AND column_name = 'vendor_id'
        );
      `);
      
      // If we have vendor_id from the request and vendor_id column exists in DB, validate ownership
      const requestVendorId = req.body.vendorId || req.user?.vendorId;
      if (columnExists.rows && columnExists.rows[0] && columnExists.rows[0].exists && requestVendorId) {
        // Check if the rule belongs to the specified vendor
        const existingVendorId = existingRule[0].vendorId;
        if (existingVendorId && existingVendorId !== requestVendorId && req.user?.role !== 'admin') {
          return res.status(403).json({ message: "You don't have permission to update this price rule" });
        }
      }
      
      // Remove vendorId from update if the column doesn't exist
      let updateData = { ...req.body };
      if (!(columnExists.rows && columnExists.rows[0] && columnExists.rows[0].exists) && 'vendorId' in updateData) {
        delete updateData.vendorId;
      }
      updateData.updatedAt = new Date();
      
      const updatedRule = await db
        .update(priceRules)
        .set(updateData)
        .where(eq(priceRules.id, ruleId))
        .returning();

      res.json(updatedRule[0]);
    } catch (error) {
      console.error("Failed to update price rule:", error);
      res.status(500).json({ message: "Failed to update price rule" });
    }
  });

  app.delete("/api/price-rules/:id", isAuthenticated, async (req, res) => {
    try {
      const ruleId = parseInt(req.params.id);

      const existingRule = await db
        .select()
        .from(priceRules)
        .where(eq(priceRules.id, ruleId))
        .limit(1);

      if (!existingRule.length) {
        return res.status(404).json({ message: "Price rule not found" });
      }

      if (req.user?.role !== "admin" && existingRule[0].vendorId !== req.user?.vendorId) {
        return res.status(403).json({ message: "You don't have permission to delete this price rule" });
      }

      const [deletedRule] = await db
        .delete(priceRules)
        .where(eq(priceRules.id, ruleId))
        .returning();

      res.json(deletedRule);
    } catch (error) {
      console.error("Failed to delete price rule:", error);
      res.status(500).json({ message: "Failed to delete price rule" });
    }
  });

  const asPlainRecord = (value: unknown): Record<string, any> =>
    value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

  const normalizeProductField = (field: string) => {
    if (field === "stock") return "currentStock";
    if (field === "product") return "name";
    if (field === "lastUpdated") return "updatedAt";
    return field;
  };

  const getInventoryStatus = (product: Record<string, any>) => {
    const stock = Number(product.currentStock ?? 0);
    const lowStockThreshold = Number(product.lowStockThreshold ?? product.reorderPoint ?? 0);
    const reorderPoint = Number(product.reorderPoint ?? 0);

    if (stock <= 0) return "out_of_stock";
    if (lowStockThreshold > 0 && stock <= lowStockThreshold) return "low_stock";
    if (reorderPoint > 0 && stock >= reorderPoint * 3) return "overstocked";
    return "in_stock";
  };

  const getDaysSinceRestocked = (product: Record<string, any>) => {
    if (!product.lastRestocked) return null;

    const restockedAt = new Date(product.lastRestocked).getTime();
    if (!Number.isFinite(restockedAt)) return null;

    return Math.floor((Date.now() - restockedAt) / (1000 * 60 * 60 * 24));
  };

  const getProductConditionValue = (product: Record<string, any>, field: string) => {
    if (field === "inventoryStatus") return getInventoryStatus(product);
    if (field === "daysSinceRestocked") return getDaysSinceRestocked(product);
    return product[normalizeProductField(field)];
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

  const productMatchesPriceRuleConditions = (product: Record<string, any>, conditionsValue: unknown) => {
    const conditions = asPlainRecord(conditionsValue);
    const entries = Object.entries(conditions);

    if (entries.length === 0) return true;

    return entries.every(([field, conditionValue]) => {
      const actualValue = getProductConditionValue(product, field);
      const condition = asPlainRecord(conditionValue);

      if (Object.keys(condition).length === 0) {
        return compareConditionValue(actualValue, "equals", conditionValue);
      }

      return Object.entries(condition).every(([operator, expectedValue]) =>
        compareConditionValue(actualValue, operator, expectedValue)
      );
    });
  };

  const getApplicableMinimumMarginGuardrail = async (vendorId: number, product: Record<string, any>) => {
    const activeRules = await db
      .select()
      .from(priceRules)
      .where(and(eq(priceRules.vendorId, vendorId), eq(priceRules.isActive, true)));

    const applicableMargins = activeRules
      .map((rule) => {
        const metadata = asPlainRecord(rule.metadata);
        const guardrail = asPlainRecord(metadata.minimumMarginGuardrail);

        if (!guardrail.enabled || !productMatchesPriceRuleConditions(product, rule.conditions)) {
          return null;
        }

        const minimumMarginPercent = Number(guardrail.minimumMarginPercent);
        return Number.isFinite(minimumMarginPercent) && minimumMarginPercent > 0 && minimumMarginPercent < 95
          ? minimumMarginPercent
          : null;
      })
      .filter((margin): margin is number => margin !== null);

    if (applicableMargins.length === 0) return null;

    return Math.max(...applicableMargins);
  };

  const getMinimumPriceForMargin = (unitCost: number, minimumMarginPercent: number) =>
    unitCost / (1 - minimumMarginPercent / 100);

  app.get("/api/pricing/margin-optimization", isAuthenticated, async (req, res) => {
    try {
      const requestedVendorId = req.query.vendorId ? parseInt(req.query.vendorId as string) : undefined;
      const vendorId = req.user?.role === "admin" && requestedVendorId
        ? requestedVendorId
        : req.user?.vendorId;
      const targetMargin = Number(req.query.targetMargin ?? 35);

      if (!vendorId) {
        return res.status(403).json({ message: "No vendor scope available for margin optimization" });
      }

      if (!Number.isFinite(targetMargin) || targetMargin <= 0 || targetMargin >= 95) {
        return res.status(400).json({ message: "targetMargin must be between 0 and 95" });
      }

      const vendorProducts = await db
        .select()
        .from(products)
        .where(eq(products.vendorId, vendorId));

      const recommendations = await Promise.all(vendorProducts.map(async (product) => {
        const costs = await db
          .select({
            id: supplierCosts.id,
            supplierId: supplierCosts.supplierId,
            unitCost: supplierCosts.unitCost,
            costDate: supplierCosts.costDate,
            priceFluctuation: supplierCosts.priceFluctuation,
            supplierName: suppliers.name,
          })
          .from(supplierCosts)
          .leftJoin(suppliers, eq(supplierCosts.supplierId, suppliers.id))
          .where(and(
            eq(supplierCosts.productId, product.id),
            eq(supplierCosts.vendorId, vendorId),
          ))
          .orderBy(desc(supplierCosts.costDate))
          .limit(2);

        const latestCost = costs[0];
        const previousCost = costs[1];
        const currentPrice = Number(product.currentPrice);
        const unitCost = latestCost ? Number(latestCost.unitCost) : null;
        const previousUnitCost = previousCost ? Number(previousCost.unitCost) : null;

        if (!latestCost || !unitCost || !Number.isFinite(unitCost) || unitCost <= 0 || !Number.isFinite(currentPrice) || currentPrice <= 0) {
          return {
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            category: product.category,
            currentPrice,
            hasSupplierCost: false,
            status: "missing_cost",
            message: "No usable supplier cost is available for this product.",
          };
        }

        const targetMarginRate = targetMargin / 100;
        const currentMargin = ((currentPrice - unitCost) / currentPrice) * 100;
        const targetMarginPrice = unitCost / (1 - targetMarginRate);
        const minimumMarginPercent = await getApplicableMinimumMarginGuardrail(vendorId, product);
        const minimumAllowedPrice = minimumMarginPercent !== null
          ? getMinimumPriceForMargin(unitCost, minimumMarginPercent)
          : null;
        const guardrailAdjusted = minimumAllowedPrice !== null && targetMarginPrice < minimumAllowedPrice;
        const recommendedPrice = guardrailAdjusted ? minimumAllowedPrice : targetMarginPrice;
        const priceDelta = recommendedPrice - currentPrice;
        const priceDeltaPercent = currentPrice > 0 ? (priceDelta / currentPrice) * 100 : 0;
        const costChangePercent = previousUnitCost && previousUnitCost > 0
          ? ((unitCost - previousUnitCost) / previousUnitCost) * 100
          : null;
        const shouldIncrease = currentMargin < targetMargin;
        const shouldReview = Math.abs(priceDeltaPercent) >= 1;

        return {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          category: product.category,
          supplierId: latestCost.supplierId,
          supplierName: latestCost.supplierName,
          currentPrice,
          latestUnitCost: unitCost,
          previousUnitCost,
          costDate: latestCost.costDate,
          costChangePercent,
          currentMargin,
          targetMargin,
          minimumMarginPercent,
          minimumAllowedPrice: minimumAllowedPrice !== null ? Number(minimumAllowedPrice.toFixed(2)) : null,
          recommendedPrice,
          priceDelta,
          priceDeltaPercent,
          hasSupplierCost: true,
          status: shouldReview ? (shouldIncrease ? "increase_recommended" : "review_recommended") : "on_target",
          message: guardrailAdjusted
            ? `Margin guardrail raised this recommendation to preserve ${minimumMarginPercent}% margin.`
            : shouldReview
              ? `Recommended price ${shouldIncrease ? "protects" : "aligns"} margin after supplier cost movement.`
              : "Current price is within 1% of the target margin price.",
        };
      }));

      res.json({
        targetMargin,
        generatedAt: new Date().toISOString(),
        recommendations,
      });
    } catch (error) {
      console.error("Failed to calculate margin optimization:", error);
      res.status(500).json({ message: "Failed to calculate margin optimization" });
    }
  });

  app.post("/api/pricing/margin-optimization/apply", isAuthenticated, async (req, res) => {
    try {
      const { productId, targetMargin = 35, recommendedPrice } = req.body;
      const parsedProductId = Number(productId);
      const parsedTargetMargin = Number(targetMargin);

      if (!Number.isInteger(parsedProductId)) {
        return res.status(400).json({ message: "productId is required" });
      }

      if (!Number.isFinite(parsedTargetMargin) || parsedTargetMargin <= 0 || parsedTargetMargin >= 95) {
        return res.status(400).json({ message: "targetMargin must be between 0 and 95" });
      }

      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, parsedProductId))
        .limit(1);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (req.user?.role !== "admin" && product.vendorId !== req.user?.vendorId) {
        return res.status(403).json({ message: "You don't have permission to update this product" });
      }

      const [latestCost] = await db
        .select()
        .from(supplierCosts)
        .where(and(
          eq(supplierCosts.productId, parsedProductId),
          eq(supplierCosts.vendorId, product.vendorId),
        ))
        .orderBy(desc(supplierCosts.costDate))
        .limit(1);

      if (!latestCost) {
        return res.status(400).json({ message: "No supplier cost is available for this product" });
      }

      const unitCost = Number(latestCost.unitCost);
      const currentPrice = Number(product.currentPrice);
      const calculatedPrice = unitCost / (1 - parsedTargetMargin / 100);
      const nextPrice = recommendedPrice !== undefined ? Number(recommendedPrice) : calculatedPrice;

      if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
        return res.status(400).json({ message: "recommendedPrice must be a positive number" });
      }

      if (nextPrice < unitCost) {
        return res.status(400).json({ message: "recommendedPrice cannot be below the latest supplier cost" });
      }

      const minimumMarginPercent = await getApplicableMinimumMarginGuardrail(product.vendorId, product);
      if (minimumMarginPercent !== null) {
        const minimumAllowedPrice = getMinimumPriceForMargin(unitCost, minimumMarginPercent);

        if (nextPrice < minimumAllowedPrice) {
          return res.status(400).json({
            message: `Blocked by margin guardrail. Price must be at least $${minimumAllowedPrice.toFixed(2)} to keep ${minimumMarginPercent}% margin.`,
            minimumMarginPercent,
            minimumAllowedPrice: Number(minimumAllowedPrice.toFixed(2)),
          });
        }
      }

      const [updatedProduct] = await db
        .update(products)
        .set({
          currentPrice: nextPrice.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(products.id, parsedProductId))
        .returning();

      await db.insert(priceHistory).values({
        productId: parsedProductId,
        oldPrice: currentPrice.toFixed(2),
        newPrice: nextPrice.toFixed(2),
        reason: `Margin optimization: supplier cost ${unitCost.toFixed(2)}, target margin ${parsedTargetMargin}%`,
        timestamp: new Date(),
      });

      res.json({
        product: updatedProduct,
        appliedPrice: nextPrice,
        latestUnitCost: unitCost,
        targetMargin: parsedTargetMargin,
      });
    } catch (error) {
      console.error("Failed to apply margin optimization:", error);
      res.status(500).json({ message: "Failed to apply margin optimization" });
    }
  });

  app.get("/api/analytics/price-changes", isAuthenticated, async (req, res) => {
    try {
      console.log("Fetching price changes for analytics...");
      
      // Use the authenticated user's vendorId
      let vendorId = req.user?.vendorId;
      
      // If user doesn't have a vendorId or is admin and specified a vendorId, use the query param
      if ((!vendorId || req.user?.role === 'admin') && req.query.vendorId) {
        vendorId = parseInt(req.query.vendorId as string);
      }
      
      // If still no vendorId, return empty array
      if (!vendorId) {
        console.log("No vendor ID available for user, returning empty price changes array");
        return res.json([]);
      }
      
      // First get the product ids for this vendor
      const vendorProducts = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.vendorId, vendorId));
        
      const productIds = vendorProducts.map(p => p.id);
      
      // If there are no products, return an empty array
      if (productIds.length === 0) {
        return res.json([]);
      }
      
      // Get price history for these products
      // Use inArray for proper SQL parameterization instead of string concatenation
      const changes = await db
        .select()
        .from(priceHistory)
        .where(inArray(priceHistory.productId, productIds))
        .orderBy(desc(priceHistory.timestamp))
        .limit(100);
        
      console.log(`Found ${changes.length} price changes for vendor ${vendorId}`);
      res.json(changes);
    } catch (error) {
      console.error("Failed to fetch price changes:", error);
      res.status(500).json({ message: "Failed to fetch price changes" });
    }
  });

  const resolveAnalyticsVendorId = (req: Request) => {
    let vendorId = req.user?.vendorId;

    if ((!vendorId || req.user?.role === "admin") && req.query.vendorId) {
      vendorId = parseInt(req.query.vendorId as string, 10);
    }

    return vendorId && !Number.isNaN(vendorId) ? vendorId : null;
  };

  const getDayRange = (date = new Date()) => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    return { start, end };
  };

  const createCatalogSnapshot = async (vendorId: number) => {
    const vendorProducts = await db
      .select({
        id: products.id,
        category: products.category,
        currentPrice: products.currentPrice,
        currentStock: products.currentStock,
      })
      .from(products)
      .where(eq(products.vendorId, vendorId));

    const prices = vendorProducts
      .map((product) => Number(product.currentPrice))
      .filter((price) => Number.isFinite(price));
    const productCount = prices.length;
    const totalCatalogValue = prices.reduce((sum, price) => sum + price, 0);
    const totalInventoryValue = vendorProducts.reduce((sum, product) => {
      const price = Number(product.currentPrice);
      const stock = Number(product.currentStock ?? 0);
      return Number.isFinite(price) && Number.isFinite(stock) ? sum + price * stock : sum;
    }, 0);
    const categoryTotals = vendorProducts.reduce((acc, product) => {
      const category = product.category || "Uncategorized";
      const price = Number(product.currentPrice);
      const stock = Number(product.currentStock ?? 0);

      if (!Number.isFinite(price)) return acc;

      if (!acc[category]) {
        acc[category] = {
          productCount: 0,
          totalPrice: 0,
          totalInventoryValue: 0,
          minPrice: price,
          maxPrice: price,
        };
      }

      acc[category].productCount += 1;
      acc[category].totalPrice += price;
      acc[category].totalInventoryValue += Number.isFinite(stock) ? price * stock : 0;
      acc[category].minPrice = Math.min(acc[category].minPrice, price);
      acc[category].maxPrice = Math.max(acc[category].maxPrice, price);

      return acc;
    }, {} as Record<string, {
      productCount: number;
      totalPrice: number;
      totalInventoryValue: number;
      minPrice: number;
      maxPrice: number;
    }>);
    const categoryBreakdown = Object.fromEntries(
      Object.entries(categoryTotals).map(([category, data]) => [
        category,
        {
          productCount: data.productCount,
          averagePrice: data.productCount ? Number((data.totalPrice / data.productCount).toFixed(2)) : 0,
          minPrice: Number(data.minPrice.toFixed(2)),
          maxPrice: Number(data.maxPrice.toFixed(2)),
          totalInventoryValue: Number(data.totalInventoryValue.toFixed(2)),
        },
      ]),
    );
    const { start, end } = getDayRange();

    await db
      .delete(catalogPriceSnapshots)
      .where(and(
        eq(catalogPriceSnapshots.vendorId, vendorId),
        gte(catalogPriceSnapshots.snapshotDate, start),
        lt(catalogPriceSnapshots.snapshotDate, end),
      ));

    const [snapshot] = await db
      .insert(catalogPriceSnapshots)
      .values({
        vendorId,
        snapshotDate: start,
        productCount,
        averagePrice: productCount ? String((totalCatalogValue / productCount).toFixed(2)) : "0",
        minPrice: productCount ? String(Math.min(...prices).toFixed(2)) : "0",
        maxPrice: productCount ? String(Math.max(...prices).toFixed(2)) : "0",
        totalCatalogValue: String(totalCatalogValue.toFixed(2)),
        totalInventoryValue: String(totalInventoryValue.toFixed(2)),
        categoryBreakdown,
      })
      .returning();

    return snapshot;
  };

  app.post("/api/analytics/catalog-price-snapshots", isAuthenticated, async (req, res) => {
    try {
      const vendorId = resolveAnalyticsVendorId(req);

      if (!vendorId) {
        return res.status(400).json({ message: "Vendor ID is required" });
      }

      const snapshot = await createCatalogSnapshot(vendorId);
      res.json({ snapshot });
    } catch (error) {
      console.error("Failed to create catalog price snapshot:", error);
      res.status(500).json({ message: "Failed to create catalog price snapshot" });
    }
  });

  app.get("/api/analytics/pricing", isAuthenticated, async (req, res) => {
    try {
      const vendorId = resolveAnalyticsVendorId(req);

      if (!vendorId) {
        return res.json({
          snapshots: [],
          dailyMovements: [],
          categoryMovements: [],
          largestMoves: { increase: null, decrease: null },
          summary: {
            totalChanges: 0,
            averageChangeAmount: 0,
            averageChangePercent: 0,
            priceVolatility: 0,
          },
        });
      }

      const requestedProductId = req.query.productId
        ? parseInt(String(req.query.productId), 10)
        : null;
      const vendorProducts = await db
        .select({
          id: products.id,
          name: products.name,
          category: products.category,
        })
        .from(products)
        .where(eq(products.vendorId, vendorId));
      const productMap = new Map(vendorProducts.map((product) => [product.id, product]));
      const productIds = requestedProductId && productMap.has(requestedProductId)
        ? [requestedProductId]
        : vendorProducts.map((product) => product.id);
      const snapshots = await db
        .select()
        .from(catalogPriceSnapshots)
        .where(eq(catalogPriceSnapshots.vendorId, vendorId))
        .orderBy(catalogPriceSnapshots.snapshotDate);

      if (productIds.length === 0) {
        return res.json({
          snapshots,
          dailyMovements: [],
          categoryMovements: [],
          largestMoves: { increase: null, decrease: null },
          summary: {
            totalChanges: 0,
            averageChangeAmount: 0,
            averageChangePercent: 0,
            priceVolatility: 0,
          },
        });
      }

      const historyRows = await db
        .select({
          id: priceHistory.id,
          productId: priceHistory.productId,
          oldPrice: priceHistory.oldPrice,
          newPrice: priceHistory.newPrice,
          timestamp: priceHistory.timestamp,
        })
        .from(priceHistory)
        .where(inArray(priceHistory.productId, productIds))
        .orderBy(priceHistory.timestamp);
      const movements = historyRows
        .map((row) => {
          const oldPrice = Number(row.oldPrice);
          const newPrice = Number(row.newPrice);
          const changeAmount = newPrice - oldPrice;
          const changePercent = oldPrice ? (changeAmount / oldPrice) * 100 : 0;
          const product = productMap.get(row.productId);

          return {
            id: row.id,
            productId: row.productId,
            productName: product?.name || `Product ${row.productId}`,
            category: product?.category || "Uncategorized",
            dateKey: row.timestamp.toISOString().slice(0, 10),
            oldPrice,
            newPrice,
            changeAmount,
            changePercent,
          };
        })
        .filter((movement) => Number.isFinite(movement.oldPrice) && Number.isFinite(movement.newPrice));
      const dailyMovements = Object.values(
        movements.reduce((acc, movement) => {
          if (!acc[movement.dateKey]) {
            acc[movement.dateKey] = {
              dateKey: movement.dateKey,
              count: 0,
              oldPriceTotal: 0,
              newPriceTotal: 0,
              changeAmountTotal: 0,
              changePercentTotal: 0,
            };
          }

          acc[movement.dateKey].count += 1;
          acc[movement.dateKey].oldPriceTotal += movement.oldPrice;
          acc[movement.dateKey].newPriceTotal += movement.newPrice;
          acc[movement.dateKey].changeAmountTotal += movement.changeAmount;
          acc[movement.dateKey].changePercentTotal += movement.changePercent;
          return acc;
        }, {} as Record<string, {
          dateKey: string;
          count: number;
          oldPriceTotal: number;
          newPriceTotal: number;
          changeAmountTotal: number;
          changePercentTotal: number;
        }>),
      )
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
        .map((day) => ({
          dateKey: day.dateKey,
          changedProducts: day.count,
          avgOldPrice: Number((day.oldPriceTotal / day.count).toFixed(2)),
          avgNewPrice: Number((day.newPriceTotal / day.count).toFixed(2)),
          avgChangeAmount: Number((day.changeAmountTotal / day.count).toFixed(2)),
          avgChangePercent: Number((day.changePercentTotal / day.count).toFixed(2)),
        }));
      const categoryMovements = Object.values(
        movements.reduce((acc, movement) => {
          if (!acc[movement.category]) {
            acc[movement.category] = {
              category: movement.category,
              count: 0,
              amountTotal: 0,
              percentTotal: 0,
            };
          }

          acc[movement.category].count += 1;
          acc[movement.category].amountTotal += movement.changeAmount;
          acc[movement.category].percentTotal += movement.changePercent;
          return acc;
        }, {} as Record<string, { category: string; count: number; amountTotal: number; percentTotal: number }>),
      )
        .map((category) => ({
          category: category.category,
          changes: category.count,
          avgChangeAmount: Number((category.amountTotal / category.count).toFixed(2)),
          avgChangePercent: Number((category.percentTotal / category.count).toFixed(2)),
        }))
        .sort((a, b) => Math.abs(b.avgChangePercent) - Math.abs(a.avgChangePercent));
      const totalChanges = movements.length;
      const averageChangeAmount = totalChanges
        ? movements.reduce((sum, movement) => sum + movement.changeAmount, 0) / totalChanges
        : 0;
      const averageChangePercent = totalChanges
        ? movements.reduce((sum, movement) => sum + movement.changePercent, 0) / totalChanges
        : 0;
      const priceVolatility = totalChanges
        ? movements.reduce((sum, movement) => sum + Math.abs(movement.changePercent), 0) / totalChanges
        : 0;
      const increase = movements.reduce<typeof movements[number] | null>(
        (current, movement) => !current || movement.changePercent > current.changePercent ? movement : current,
        null,
      );
      const decrease = movements.reduce<typeof movements[number] | null>(
        (current, movement) => !current || movement.changePercent < current.changePercent ? movement : current,
        null,
      );

      res.json({
        snapshots,
        dailyMovements,
        categoryMovements,
        largestMoves: { increase, decrease },
        summary: {
          totalChanges,
          averageChangeAmount: Number(averageChangeAmount.toFixed(2)),
          averageChangePercent: Number(averageChangePercent.toFixed(2)),
          priceVolatility: Number(priceVolatility.toFixed(2)),
        },
      });
    } catch (error) {
      console.error("Failed to fetch advanced pricing analytics:", error);
      res.status(500).json({ message: "Failed to fetch advanced pricing analytics" });
    }
  });

  // Competitor API endpoints with multi-tenant support
  app.get("/api/competitors", isAuthenticated, async (req, res) => {
    try {
      // Use the authenticated user's vendorId
      let vendorId = req.user?.vendorId;
      
      // If user doesn't have a vendorId or is admin and specified a vendorId, use the query param
      if ((!vendorId || req.user?.role === 'admin') && req.query.vendorId) {
        vendorId = parseInt(req.query.vendorId as string);
      }
      
      // If still no vendorId, return empty array
      if (!vendorId) {
        console.log("No vendor ID available for user, returning empty competitors array");
        return res.json([]);
      }
      
      const allCompetitors = await db
        .select()
        .from(competitors)
        .where(eq(competitors.vendorId, vendorId));
        
      res.json(allCompetitors);
    } catch (error) {
      console.error("Failed to fetch competitors:", error);
      res.status(500).json({ message: "Failed to fetch competitors" });
    }
  });

  app.post("/api/competitors", isAuthenticated, async (req, res) => {
    try {
      // Use the authenticated user's vendorId or the one from the request body if admin
      let vendorId = req.user?.vendorId;
      
      if (req.user?.role === 'admin' && req.body.vendorId) {
        vendorId = req.body.vendorId;
      } else if (!vendorId) {
        return res.status(403).json({ message: "You must be associated with a vendor to create competitors" });
      }
      
      const { ...competitorData } = req.body;
      
      // Verify the vendor exists
      const vendor = await db
        .select()
        .from(vendors)
        .where(eq(vendors.id, vendorId))
        .limit(1);

      if (!vendor.length) {
        return res.status(404).json({ message: "Vendor not found" });
      }
      
      const competitor = await db.insert(competitors).values({
        ...competitorData,
        vendorId,
      }).returning();
      
      res.json(competitor[0]);
    } catch (error) {
      console.error("Failed to create competitor:", error);
      res.status(500).json({ message: "Failed to create competitor" });
    }
  });

  // PUT endpoint to update a competitor
  app.put("/api/competitors/:id", isAuthenticated, async (req, res) => {
    try {
      const competitorId = parseInt(req.params.id);
      const { name, website, isActive, marketShare, priceIndex } = req.body;
      
      // Find the competitor to verify the vendorId
      const competitor = await db
        .select()
        .from(competitors)
        .where(eq(competitors.id, competitorId))
        .limit(1);
        
      if (!competitor.length) {
        return res.status(404).json({ message: "Competitor not found" });
      }
      
      // Verify the user has access to this vendor's data
      const vendorId = competitor[0].vendorId;
      if (req.user?.vendorId !== vendorId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "You don't have access to this competitor's data" });
      }
      
      // Update the competitor
      const updatedCompetitor = await db
        .update(competitors)
        .set({
          name,
          website,
          isActive,
          marketShare,
          priceIndex,
          updatedAt: new Date()
        })
        .where(eq(competitors.id, competitorId))
        .returning();
      
      res.json(updatedCompetitor[0]);
    } catch (error) {
      console.error("Failed to update competitor:", error);
      res.status(500).json({ message: "Failed to update competitor" });
    }
  });

  // DELETE endpoint to remove a competitor
  app.delete("/api/competitors/:id", isAuthenticated, async (req, res) => {
    try {
      const competitorId = parseInt(req.params.id);
      
      // Find the competitor to verify the vendorId
      const competitor = await db
        .select()
        .from(competitors)
        .where(eq(competitors.id, competitorId))
        .limit(1);
        
      if (!competitor.length) {
        return res.status(404).json({ message: "Competitor not found" });
      }
      
      // Verify the user has access to this vendor's data
      const vendorId = competitor[0].vendorId;
      if (req.user?.vendorId !== vendorId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "You don't have access to this competitor's data" });
      }
      
      // First delete related competitor products
      await db
        .delete(competitorProducts)
        .where(eq(competitorProducts.competitorId, competitorId));
      
      // Then delete the competitor
      const result = await db
        .delete(competitors)
        .where(eq(competitors.id, competitorId))
        .returning();
      
      res.json({ success: true, deleted: result[0] });
    } catch (error) {
      console.error("Failed to delete competitor:", error);
      res.status(500).json({ message: "Failed to delete competitor" });
    }
  });

  app.get("/api/competitors/:id/products", isAuthenticated, async (req, res) => {
    try {
      const competitorId = parseInt(req.params.id);
      
      // Find the competitor to verify the vendorId
      const competitor = await db
        .select()
        .from(competitors)
        .where(eq(competitors.id, competitorId))
        .limit(1);
        
      if (!competitor.length) {
        return res.status(404).json({ message: "Competitor not found" });
      }
      
      // Verify the user has access to this vendor's data
      const vendorId = competitor[0].vendorId;
      if (req.user?.vendorId !== vendorId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "You don't have access to this competitor's data" });
      }
      
      // Join with products to get product details
      const prodList = await db
        .select({
          id: competitorProducts.id,
          competitorId: competitorProducts.competitorId,
          productId: competitorProducts.productId,
          competitorSku: competitorProducts.competitorSku,
          competitorUrl: competitorProducts.competitorUrl,
          isMatched: competitorProducts.isMatched,
          matchConfidence: competitorProducts.matchConfidence,
          createdAt: competitorProducts.createdAt,
          product: {
            name: products.name,
            sku: products.sku,
            currentPrice: products.currentPrice
          }
        })
        .from(competitorProducts)
        .leftJoin(products, eq(competitorProducts.productId, products.id))
        .where(eq(competitorProducts.competitorId, competitorId));
      
      res.json(prodList);
    } catch (error) {
      console.error("Failed to fetch competitor products:", error);
      res.status(500).json({ message: "Failed to fetch competitor products" });
    }
  });
  
  // POST endpoint to link a product to a competitor
  app.post("/api/competitors/:id/products", isAuthenticated, async (req, res) => {
    try {
      const competitorId = parseInt(req.params.id);
      const { productId, competitorSku, competitorUrl, isMatched = true, matchConfidence } = req.body;
      
      // Find the competitor to verify the vendorId
      const competitor = await db
        .select()
        .from(competitors)
        .where(eq(competitors.id, competitorId))
        .limit(1);
        
      if (!competitor.length) {
        return res.status(404).json({ message: "Competitor not found" });
      }
      
      // Verify the user has access to this vendor's data
      const vendorId = competitor[0].vendorId;
      if (req.user?.vendorId !== vendorId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "You don't have access to this competitor's data" });
      }
      
      // Check if product exists
      const product = await db
        .select()
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);
        
      if (!product.length) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      // Check if product already linked to this competitor
      const existingLink = await db
        .select()
        .from(competitorProducts)
        .where(and(
          eq(competitorProducts.competitorId, competitorId),
          eq(competitorProducts.productId, productId)
        ))
        .limit(1);
        
      if (existingLink.length) {
        return res.status(400).json({ message: "Product already linked to this competitor" });
      }
      
      // Link the product to the competitor
      const link = await db
        .insert(competitorProducts)
        .values({
          competitorId,
          productId,
          competitorSku,
          competitorUrl,
          isMatched,
          matchConfidence,
          createdAt: new Date()
        })
        .returning();
      
      res.json(link[0]);
    } catch (error) {
      console.error("Failed to link product to competitor:", error);
      res.status(500).json({ message: "Failed to link product to competitor" });
    }
  });
  
  // DELETE endpoint to unlink a product from a competitor
  app.delete("/api/competitors/:competitorId/products/:productLinkId", isAuthenticated, async (req, res) => {
    try {
      const competitorId = parseInt(req.params.competitorId);
      const productLinkId = parseInt(req.params.productLinkId);
      
      // Find the competitor to verify the vendorId
      const competitor = await db
        .select()
        .from(competitors)
        .where(eq(competitors.id, competitorId))
        .limit(1);
        
      if (!competitor.length) {
        return res.status(404).json({ message: "Competitor not found" });
      }
      
      // Verify the user has access to this vendor's data
      const vendorId = competitor[0].vendorId;
      if (req.user?.vendorId !== vendorId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "You don't have access to this competitor's data" });
      }
      
      // Find the product link to verify it belongs to this competitor
      const productLink = await db
        .select()
        .from(competitorProducts)
        .where(and(
          eq(competitorProducts.id, productLinkId),
          eq(competitorProducts.competitorId, competitorId)
        ))
        .limit(1);
        
      if (!productLink.length) {
        return res.status(404).json({ message: "Product link not found" });
      }

      await db
        .delete(competitorPrices)
        .where(eq(competitorPrices.competitorProductId, productLinkId));
      
      // Delete the product link
      const result = await db
        .delete(competitorProducts)
        .where(eq(competitorProducts.id, productLinkId))
        .returning();
      
      res.json({ success: true, deleted: result[0] });
    } catch (error) {
      console.error("Failed to unlink product from competitor:", error);
      res.status(500).json({ message: "Failed to unlink product from competitor" });
    }
  });

  app.get("/api/competitors/:competitorId/products/:productLinkId/prices", isAuthenticated, async (req, res) => {
    try {
      const competitorId = parseInt(req.params.competitorId);
      const productLinkId = parseInt(req.params.productLinkId);

      const competitor = await db
        .select()
        .from(competitors)
        .where(eq(competitors.id, competitorId))
        .limit(1);

      if (!competitor.length) {
        return res.status(404).json({ message: "Competitor not found" });
      }

      const vendorId = competitor[0].vendorId;
      if (req.user?.vendorId !== vendorId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "You don't have access to this competitor's data" });
      }

      const productLink = await db
        .select()
        .from(competitorProducts)
        .where(and(
          eq(competitorProducts.id, productLinkId),
          eq(competitorProducts.competitorId, competitorId)
        ))
        .limit(1);

      if (!productLink.length) {
        return res.status(404).json({ message: "Product link not found" });
      }

      const prices = await db
        .select()
        .from(competitorPrices)
        .where(eq(competitorPrices.competitorProductId, productLinkId))
        .orderBy(desc(competitorPrices.timestamp));

      res.json(prices);
    } catch (error) {
      console.error("Failed to fetch competitor prices:", error);
      res.status(500).json({ message: "Failed to fetch competitor prices" });
    }
  });

  app.post("/api/competitors/:competitorId/products/:productLinkId/prices", isAuthenticated, async (req, res) => {
    try {
      const competitorId = parseInt(req.params.competitorId);
      const productLinkId = parseInt(req.params.productLinkId);
      const {
        price,
        currency = "USD",
        isPromotion = false,
        promotionType,
        availability = "in_stock",
        timestamp,
      } = req.body;

      const numericPrice = Number(price);
      if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
        return res.status(400).json({ message: "Price must be a positive number" });
      }

      const competitor = await db
        .select()
        .from(competitors)
        .where(eq(competitors.id, competitorId))
        .limit(1);

      if (!competitor.length) {
        return res.status(404).json({ message: "Competitor not found" });
      }

      const vendorId = competitor[0].vendorId;
      if (req.user?.vendorId !== vendorId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "You don't have access to this competitor's data" });
      }

      const productLink = await db
        .select()
        .from(competitorProducts)
        .where(and(
          eq(competitorProducts.id, productLinkId),
          eq(competitorProducts.competitorId, competitorId)
        ))
        .limit(1);

      if (!productLink.length) {
        return res.status(404).json({ message: "Product link not found" });
      }

      const priceTimestamp = timestamp ? new Date(timestamp) : new Date();
      if (Number.isNaN(priceTimestamp.getTime())) {
        return res.status(400).json({ message: "Invalid timestamp" });
      }

      const [createdPrice] = await db
        .insert(competitorPrices)
        .values({
          competitorProductId: productLinkId,
          price: numericPrice.toFixed(2),
          currency,
          isPromotion: Boolean(isPromotion),
          promotionType: promotionType || null,
          timestamp: priceTimestamp,
          availability: availability || "in_stock",
        })
        .returning();

      await db
        .update(competitors)
        .set({ lastScanned: new Date() })
        .where(eq(competitors.id, competitorId));

      res.status(201).json(createdPrice);
    } catch (error) {
      console.error("Failed to create competitor price:", error);
      res.status(500).json({ message: "Failed to create competitor price" });
    }
  });

  app.patch("/api/competitors/:competitorId/products/:productLinkId/prices/:priceId", isAuthenticated, async (req, res) => {
    try {
      const competitorId = parseInt(req.params.competitorId);
      const productLinkId = parseInt(req.params.productLinkId);
      const priceId = parseInt(req.params.priceId);
      const {
        price,
        currency,
        isPromotion,
        promotionType,
        availability,
        timestamp,
      } = req.body;

      const competitor = await db
        .select()
        .from(competitors)
        .where(eq(competitors.id, competitorId))
        .limit(1);

      if (!competitor.length) {
        return res.status(404).json({ message: "Competitor not found" });
      }

      const vendorId = competitor[0].vendorId;
      if (req.user?.vendorId !== vendorId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "You don't have access to this competitor's data" });
      }

      const productLink = await db
        .select()
        .from(competitorProducts)
        .where(and(
          eq(competitorProducts.id, productLinkId),
          eq(competitorProducts.competitorId, competitorId)
        ))
        .limit(1);

      if (!productLink.length) {
        return res.status(404).json({ message: "Product link not found" });
      }

      const existingPrice = await db
        .select()
        .from(competitorPrices)
        .where(and(
          eq(competitorPrices.id, priceId),
          eq(competitorPrices.competitorProductId, productLinkId)
        ))
        .limit(1);

      if (!existingPrice.length) {
        return res.status(404).json({ message: "Competitor price not found" });
      }

      const updateData: Record<string, unknown> = {};

      if (price !== undefined) {
        const numericPrice = Number(price);
        if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
          return res.status(400).json({ message: "Price must be a positive number" });
        }
        updateData.price = numericPrice.toFixed(2);
      }

      if (currency !== undefined) {
        updateData.currency = String(currency).slice(0, 3).toUpperCase();
      }

      if (isPromotion !== undefined) {
        updateData.isPromotion = Boolean(isPromotion);
        updateData.promotionType = Boolean(isPromotion) ? promotionType || null : null;
      } else if (promotionType !== undefined) {
        updateData.promotionType = promotionType || null;
      }

      if (availability !== undefined) {
        updateData.availability = availability || "in_stock";
      }

      if (timestamp !== undefined) {
        const parsedTimestamp = new Date(timestamp);
        if (Number.isNaN(parsedTimestamp.getTime())) {
          return res.status(400).json({ message: "Invalid timestamp" });
        }
        updateData.timestamp = parsedTimestamp;
      }

      const [updatedPrice] = await db
        .update(competitorPrices)
        .set(updateData)
        .where(and(
          eq(competitorPrices.id, priceId),
          eq(competitorPrices.competitorProductId, productLinkId)
        ))
        .returning();

      res.json(updatedPrice);
    } catch (error) {
      console.error("Failed to update competitor price:", error);
      res.status(500).json({ message: "Failed to update competitor price" });
    }
  });

  app.delete("/api/competitors/:competitorId/products/:productLinkId/prices/:priceId", isAuthenticated, async (req, res) => {
    try {
      const competitorId = parseInt(req.params.competitorId);
      const productLinkId = parseInt(req.params.productLinkId);
      const priceId = parseInt(req.params.priceId);

      const competitor = await db
        .select()
        .from(competitors)
        .where(eq(competitors.id, competitorId))
        .limit(1);

      if (!competitor.length) {
        return res.status(404).json({ message: "Competitor not found" });
      }

      const vendorId = competitor[0].vendorId;
      if (req.user?.vendorId !== vendorId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "You don't have access to this competitor's data" });
      }

      const productLink = await db
        .select()
        .from(competitorProducts)
        .where(and(
          eq(competitorProducts.id, productLinkId),
          eq(competitorProducts.competitorId, competitorId)
        ))
        .limit(1);

      if (!productLink.length) {
        return res.status(404).json({ message: "Product link not found" });
      }

      const deleted = await db
        .delete(competitorPrices)
        .where(and(
          eq(competitorPrices.id, priceId),
          eq(competitorPrices.competitorProductId, productLinkId)
        ))
        .returning();

      if (!deleted.length) {
        return res.status(404).json({ message: "Competitor price not found" });
      }

      res.json({ success: true, deleted: deleted[0] });
    } catch (error) {
      console.error("Failed to delete competitor price:", error);
      res.status(500).json({ message: "Failed to delete competitor price" });
    }
  });

  app.get("/api/products/:id/competitor-analysis", isAuthenticated, async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      
      // Get the product info to base analytics on
      const product = await db
        .select()
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);
      
      if (!product.length) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      // Verify the user has access to this product's vendor data
      const vendorId = product[0].vendorId;
      if (req.user?.vendorId !== vendorId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "You don't have access to this product's data" });
      }
      
      // Get recent competitor prices (if available)
      let prices = [];
      try {
        prices = await db.select({
          competitorName: competitors.name,
          price: competitorPrices.price,
          timestamp: competitorPrices.timestamp,
          isPromotion: competitorPrices.isPromotion,
        })
          .from(competitorPrices)
          .innerJoin(competitorProducts, eq(competitorPrices.competitorProductId, competitorProducts.id))
          .innerJoin(competitors, eq(competitorProducts.competitorId, competitors.id))
          .where(eq(competitorProducts.productId, productId))
          .orderBy(desc(competitorPrices.timestamp))
          .limit(50);
      } catch (error) {
        console.error("Error fetching competitor prices:", error);
        // Continue with empty prices array
      }

      const productPrice = Number(product[0].currentPrice);

      const competitorPrices = prices
        .map(p => Number(p.price))
        .filter((value) => Number.isFinite(value));
      const marketAverage = competitorPrices.length > 0 
        ? competitorPrices.reduce((sum, price) => sum + price, 0) / competitorPrices.length 
        : productPrice;

      const uniqueCompetitorCount = new Set(prices.map((entry: any) => entry.competitorName)).size;
      const priceVolatility = competitorPrices.length > 1 && marketAverage > 0
        ? ((Math.max(...competitorPrices) - Math.min(...competitorPrices)) / marketAverage) * 100
        : 0;

      const insights: Record<string, string> = {};
      if (prices.length > 0) {
        insights.trend =
          "Your price is currently " +
          (productPrice > marketAverage ? "above" : "below") +
          " the market average.";
        insights.recommendation =
          "Consider " +
          (productPrice > marketAverage * 1.1 ? "lowering" : "maintaining") +
          " your current price point based on recorded competitor pricing.";

        const lowestEntry = prices.reduce((lowest: any, current: any) =>
          Number(current.price) < Number(lowest.price) ? current : lowest
        );
        insights.coverage = `Tracking ${uniqueCompetitorCount} competitor${uniqueCompetitorCount === 1 ? "" : "s"} with ${prices.length} recorded price snapshots.`;
        insights.lowestPrice = `${lowestEntry.competitorName} currently has the lowest tracked price at $${Number(lowestEntry.price).toFixed(2)}.`;
      } else {
        insights.coverage = "No recorded competitor price history is available for this product yet.";
      }
      
      const analytics = {
        marketAverage: String(marketAverage.toFixed(2)),
        currentPrice: String(productPrice),
        minPrice: String(Math.min(...competitorPrices, productPrice).toFixed(2)),
        maxPrice: String(Math.max(...competitorPrices, productPrice).toFixed(2)),
        priceVolatility: String(priceVolatility.toFixed(1)),
        priceChanges: Math.max(0, prices.length - uniqueCompetitorCount),
        insights,
      };

      res.json({
        analytics,
        competitorPrices: prices,
      });
    } catch (error) {
      console.error("Failed to fetch competitor analysis:", error);
      res.status(500).json({ message: "Failed to fetch competitor analysis" });
    }
  });

  // System Status API endpoint
  app.get("/api/system/status", isAuthenticated, async (req, res) => {
    try {
      // Check database connection
      const dbHealthy = await db.query.products.findMany().then(() => true).catch(() => false);
      // Check WebSocket connections
      const wsHealthy = clients.size > 0;
      // Basic system metrics
      const uptime = process.uptime();
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const uptimeString = `${hours}h ${minutes}m`;
      // Get system metrics
      const loadAvg = os.loadavg();
      const memoryUsage = process.memoryUsage();

      const status = dbHealthy && wsHealthy ? 'healthy' : 'degraded';
      const services = {
        database: dbHealthy,
        websocket: wsHealthy,
        api: true,
      };
      const metrics = {
        uptime: uptimeString,
        errorRate: 0.1,
        responseTime: 150,
      };
      const systemMetrics = {
        loadAverage: loadAvg,
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        }
      };

      // Store the status in the database
      try {
        const existingStatus = await db.query.systemStatus.findFirst();
        if (existingStatus) {
          await db.update(systemStatus)
            .set({
              status,
              services,
              metrics,
              systemMetrics,
              updatedAt: new Date()
            })
            .where(eq(systemStatus.id, existingStatus.id));
        } else {
          await db.insert(systemStatus).values({
            status,
            services,
            metrics,
            systemMetrics,
          });
        }
      } catch (dbError) {
        console.error("Error storing system status:", dbError);
        // Continue and return status even if saving to DB fails
      }

      res.json({
        status,
        services,
        metrics,
        systemMetrics
      });
    } catch (error) {
      console.error("Failed to fetch system status:", error);
      res.status(500).json({ message: "Failed to fetch system status" });
    }
  });

  // Vendor API endpoints for multi-tenant architecture
  app.get("/api/vendors", isAuthenticated, async (req, res) => {
    try {
      const allVendors = await db.select().from(vendors);
      res.json(allVendors);
    } catch (error) {
      console.error("Failed to fetch vendors:", error);
      res.status(500).json({ message: "Failed to fetch vendors" });
    }
  });

  // Vendor Health Dashboard data
  app.get("/api/vendors/health", isAuthenticated, async (req, res) => {
    try {
      const vendorId = getVendorHealthVendorId(req, res);
      if (!vendorId) return;

      res.json(await buildVendorHealthPayload(vendorId));
    } catch (error) {
      console.error("Failed to fetch vendor health data:", error);
      res.status(500).json({ message: "Failed to fetch vendor health data" });
    }
  });

  app.get("/api/vendors/:id", isAuthenticated, async (req, res) => {
    try {
      const requestedVendorId = parseInt(req.params.id);
      
      // Check if the user has access to this vendor's data
      if (req.user?.vendorId !== requestedVendorId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "You don't have access to this vendor's data" });
      }
      
      const vendorId = requestedVendorId;
      const vendor = await db
        .select()
        .from(vendors)
        .where(eq(vendors.id, vendorId))
        .limit(1);

      if (!vendor.length) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      res.json(vendor[0]);
    } catch (error) {
      console.error("Failed to fetch vendor:", error);
      res.status(500).json({ message: "Failed to fetch vendor" });
    }
  });
  
  app.post("/api/vendors", isAdmin, async (req, res) => {
    try {
      const vendor = await db.insert(vendors).values({
        ...req.body,
        currencyCode: req.body.currencyCode || "USD",
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      res.status(201).json(vendor[0]);
    } catch (error) {
      console.error("Failed to create vendor:", error);
      res.status(500).json({ message: "Failed to create vendor" });
    }
  });
  
  // Delete vendor and all related data
  app.delete("/api/vendors/:id", isAuthenticated, async (req, res) => {
    try {
      const vendorId = parseInt(req.params.id);
      
      // Only allow admin users or users who are the owner of this vendor
      if (req.user?.role !== 'admin' && req.user?.vendorId !== vendorId) {
        return res.status(403).json({ message: "You don't have permission to delete this store" });
      }
      
      const [vendor] = await db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
      
      if (!vendor) {
        return res.status(404).json({ message: "Store not found" });
      }

      // Start a transaction to ensure all related data is deleted
      await db.transaction(async (tx) => {
        // Delete related data first (foreign key constraints)
        
        // Delete price history
        await tx.delete(priceHistory).where(eq(priceHistory.vendorId, vendorId));
        
        // Delete price rules and rule channels
        const vendorRules = await tx.select({ id: priceRules.id })
          .from(priceRules)
          .where(eq(priceRules.vendorId, vendorId));
          
        const ruleIds = vendorRules.map(rule => rule.id);
        
        if (ruleIds.length > 0) {
          await tx.delete(priceRuleChannels)
            .where(inArray(priceRuleChannels.ruleId, ruleIds));
        }
        
        await tx.delete(priceRules).where(eq(priceRules.vendorId, vendorId));
        
        // Delete competitor products and prices
        const vendorCompetitors = await tx.select({ id: competitors.id })
          .from(competitors)
          .where(eq(competitors.vendorId, vendorId));
          
        const competitorIds = vendorCompetitors.map(comp => comp.id);
        
        if (competitorIds.length > 0) {
          const competitorProducts = await tx.select({ id: competitorProducts.id })
            .from(competitorProducts)
            .where(inArray(competitorProducts.competitorId, competitorIds));
            
          const compProductIds = competitorProducts.map(prod => prod.id);
          
          if (compProductIds.length > 0) {
            await tx.delete(competitorPrices)
              .where(inArray(competitorPrices.competitorProductId, compProductIds));
          }
          
          await tx.delete(competitorProducts)
            .where(inArray(competitorProducts.competitorId, competitorIds));
        }
        
        await tx.delete(competitors).where(eq(competitors.vendorId, vendorId));
        
        // Delete supplier related data
        const vendorSuppliers = await tx.select({ id: suppliers.id })
          .from(suppliers)
          .where(eq(suppliers.vendorId, vendorId));
          
        const supplierIds = vendorSuppliers.map(supplier => supplier.id);
        
        if (supplierIds.length > 0) {
          await tx.delete(supplierCosts)
            .where(inArray(supplierCosts.supplierId, supplierIds));
            
          await tx.delete(supplierPerformance)
            .where(inArray(supplierPerformance.supplierId, supplierIds));
            
          await tx.delete(negotiationRecommendations)
            .where(inArray(negotiationRecommendations.supplierId, supplierIds));
        }
        
        await tx.delete(suppliers).where(eq(suppliers.vendorId, vendorId));
        
        // Delete products
        await tx.delete(products).where(eq(products.vendorId, vendorId));
        
        // Delete promotions
        await tx.delete(promotions).where(eq(promotions.vendorId, vendorId));
        
        // Delete channel related data
        const vendorChannels = await tx.select({ id: salesChannels.id })
          .from(salesChannels)
          .where(eq(salesChannels.vendorId, vendorId));
          
        const channelIds = vendorChannels.map(channel => channel.id);
        
        if (channelIds.length > 0) {
          await tx.delete(productChannelPricing)
            .where(inArray(productChannelPricing.channelId, channelIds));
            
          await tx.delete(channelPerformanceMetrics)
            .where(inArray(channelPerformanceMetrics.channelId, channelIds));
        }
        
        await tx.delete(salesChannels).where(eq(salesChannels.vendorId, vendorId));
        
        // Delete invitations
        await tx.delete(invitations).where(eq(invitations.vendorId, vendorId));
        
        // Delete analytics data
        await tx.delete(productPerformanceMetrics).where(eq(productPerformanceMetrics.vendorId, vendorId));
        await tx.delete(competitorTrendAnalysis).where(eq(competitorTrendAnalysis.vendorId, vendorId));
        await tx.delete(timeSeriesForecasts).where(eq(timeSeriesForecasts.vendorId, vendorId));
        
        // Delete marketing data
        await tx.delete(marketingCampaigns).where(eq(marketingCampaigns.vendorId, vendorId));
        
        // Delete user activity logs
        await tx.delete(userActivityLogs).where(eq(userActivityLogs.vendorId, vendorId));
        
        // Delete vendor itself
        await tx.delete(vendors).where(eq(vendors.id, vendorId));
        
        // Update any users who were associated with this vendor
        await tx.update(users)
          .set({ 
            vendorId: null,
            // Clear vendor name reference
            vendorName: null 
          })
          .where(eq(users.vendorId, vendorId));
      });
      
      // Add activity log for the deletion (outside transaction since the user will still exist)
      if (req.user?.id) {
        await db.insert(userActivityLogs).values({
          userId: req.user.id,
          vendorId: null, // Vendor is now deleted
          action: 'delete',
          resourceType: 'vendor',
          resourceId: vendorId.toString(),
          details: `Store "${vendor.businessName}" (ID: ${vendorId}) deleted`,
          ipAddress: req.ip || '0.0.0.0',
          userAgent: req.headers['user-agent'] || ''
        });
      }
      
      res.status(200).json({ message: "Store and all related data successfully deleted" });
    } catch (error) {
      console.error("Error deleting vendor:", error);
      res.status(500).json({ error: "Failed to delete store. Please try again." });
    }
  });

  app.patch("/api/vendors/:id", isAuthenticated, async (req, res) => {
    try {
      const requestedVendorId = parseInt(req.params.id);
      
      // Check if the user has access to modify this vendor
      if (req.user?.vendorId !== requestedVendorId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "You don't have permission to modify this vendor" });
      }
      
      // Only admin users or vendor owners can modify vendor details
      if (req.user?.role !== 'admin' && req.user?.vendorId !== requestedVendorId) {
        return res.status(403).json({ message: "Only admin users or vendor owners can modify vendor details" });
      }
      
      const vendorId = requestedVendorId;
      const updatedVendor = await db
        .update(vendors)
        .set({
          ...req.body,
          updatedAt: new Date(),
        })
        .where(eq(vendors.id, vendorId))
        .returning();

      if (!updatedVendor.length) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      if (typeof req.body.name === "string" && req.body.name.trim()) {
        const storeName = req.body.name.trim();
        const storeSlug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

        await db
          .update(storeProfiles)
          .set({
            name: storeName,
            slug: storeSlug,
            updatedAt: new Date(),
          })
          .where(eq(storeProfiles.vendorId, vendorId));
      }

      res.json(updatedVendor[0]);
    } catch (error) {
      console.error("Failed to update vendor:", error);
      res.status(500).json({ message: "Failed to update vendor" });
    }
  });
  
  // Delete vendor and all related data
  app.delete("/api/vendors/:id", isAuthenticated, async (req, res) => {
    try {
      const vendorId = parseInt(req.params.id);
      
      // Only allow admin users or users who are the owner of this vendor
      if (req.user?.role !== 'admin' && req.user?.vendorId !== vendorId) {
        return res.status(403).json({ message: "You don't have permission to delete this store" });
      }
      
      const [vendor] = await db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
      
      if (!vendor) {
        return res.status(404).json({ message: "Store not found" });
      }

      // Start a transaction to ensure all related data is deleted
      await db.transaction(async (tx) => {
        // Delete related data first (foreign key constraints)
        
        // Delete price history
        await tx.delete(priceHistory).where(eq(priceHistory.vendorId, vendorId));
        
        // Delete price rules and rule channels
        const vendorRules = await tx.select({ id: priceRules.id })
          .from(priceRules)
          .where(eq(priceRules.vendorId, vendorId));
          
        const ruleIds = vendorRules.map(rule => rule.id);
        
        if (ruleIds.length > 0) {
          await tx.delete(priceRuleChannels)
            .where(inArray(priceRuleChannels.ruleId, ruleIds));
        }
        
        await tx.delete(priceRules).where(eq(priceRules.vendorId, vendorId));
        
        // Delete competitor products and prices
        const vendorCompetitors = await tx.select({ id: competitors.id })
          .from(competitors)
          .where(eq(competitors.vendorId, vendorId));
          
        const competitorIds = vendorCompetitors.map(comp => comp.id);
        
        if (competitorIds.length > 0) {
          const competitorProducts = await tx.select({ id: competitorProducts.id })
            .from(competitorProducts)
            .where(inArray(competitorProducts.competitorId, competitorIds));
            
          const compProductIds = competitorProducts.map(prod => prod.id);
          
          if (compProductIds.length > 0) {
            await tx.delete(competitorPrices)
              .where(inArray(competitorPrices.competitorProductId, compProductIds));
          }
          
          await tx.delete(competitorProducts)
            .where(inArray(competitorProducts.competitorId, competitorIds));
        }
        
        await tx.delete(competitors).where(eq(competitors.vendorId, vendorId));
        
        // Delete supplier related data
        const vendorSuppliers = await tx.select({ id: suppliers.id })
          .from(suppliers)
          .where(eq(suppliers.vendorId, vendorId));
          
        const supplierIds = vendorSuppliers.map(supplier => supplier.id);
        
        if (supplierIds.length > 0) {
          await tx.delete(supplierCosts)
            .where(inArray(supplierCosts.supplierId, supplierIds));
            
          await tx.delete(supplierPerformance)
            .where(inArray(supplierPerformance.supplierId, supplierIds));
            
          await tx.delete(negotiationRecommendations)
            .where(inArray(negotiationRecommendations.supplierId, supplierIds));
        }
        
        await tx.delete(suppliers).where(eq(suppliers.vendorId, vendorId));
        
        // Delete products
        await tx.delete(products).where(eq(products.vendorId, vendorId));
        
        // Delete promotions
        await tx.delete(promotions).where(eq(promotions.vendorId, vendorId));
        
        // Delete channel related data
        const vendorChannels = await tx.select({ id: salesChannels.id })
          .from(salesChannels)
          .where(eq(salesChannels.vendorId, vendorId));
          
        const channelIds = vendorChannels.map(channel => channel.id);
        
        if (channelIds.length > 0) {
          await tx.delete(productChannelPricing)
            .where(inArray(productChannelPricing.channelId, channelIds));
            
          await tx.delete(channelPerformanceMetrics)
            .where(inArray(channelPerformanceMetrics.channelId, channelIds));
        }
        
        await tx.delete(salesChannels).where(eq(salesChannels.vendorId, vendorId));
        
        // Delete invitations
        await tx.delete(invitations).where(eq(invitations.vendorId, vendorId));
        
        // Delete analytics data
        await tx.delete(productPerformanceMetrics).where(eq(productPerformanceMetrics.vendorId, vendorId));
        await tx.delete(competitorTrendAnalysis).where(eq(competitorTrendAnalysis.vendorId, vendorId));
        await tx.delete(timeSeriesForecasts).where(eq(timeSeriesForecasts.vendorId, vendorId));
        
        // Delete marketing data
        await tx.delete(marketingCampaigns).where(eq(marketingCampaigns.vendorId, vendorId));
        
        // Delete user activity logs
        await tx.delete(userActivityLogs).where(eq(userActivityLogs.vendorId, vendorId));
        
        // Delete vendor itself
        await tx.delete(vendors).where(eq(vendors.id, vendorId));
        
        // Update any users who were associated with this vendor
        await tx.update(users)
          .set({ 
            vendorId: null,
            // Clear vendor name reference
            vendorName: null 
          })
          .where(eq(users.vendorId, vendorId));
      });
      
      // Add activity log for the deletion (outside transaction since the user will still exist)
      if (req.user?.id) {
        await db.insert(userActivityLogs).values({
          userId: req.user.id,
          vendorId: null, // Vendor is now deleted
          action: 'delete',
          resourceType: 'vendor',
          resourceId: vendorId.toString(),
          details: `Store "${vendor.businessName}" (ID: ${vendorId}) deleted`,
          ipAddress: req.ip || '0.0.0.0',
          userAgent: req.headers['user-agent'] || ''
        });
      }
      
      res.status(200).json({ message: "Store and all related data successfully deleted" });
    } catch (error) {
      console.error("Error deleting vendor:", error);
      res.status(500).json({ error: "Failed to delete store. Please try again." });
    }
  });

  // Get vendor analytics overview
  app.get("/api/vendors/:id/analytics", isAuthenticated, async (req, res) => {
    try {
      const requestedVendorId = parseInt(req.params.id);
      
      // Check if the user has access to this vendor's data
      if (req.user?.vendorId !== requestedVendorId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "You don't have access to this vendor's analytics data" });
      }
      
      const vendorId = requestedVendorId;
      
      // Check if vendor exists
      const vendor = await db
        .select()
        .from(vendors)
        .where(eq(vendors.id, vendorId))
        .limit(1);

      if (!vendor.length) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      // Get vendor's products
      const vendorProducts = await db
        .select()
        .from(products)
        .where(eq(products.vendorId, vendorId));

      // Get price changes for vendor's products
      const productIds = vendorProducts.map(p => p.id);
      const priceChanges = productIds.length > 0 
        ? await db
            .select()
            .from(priceHistory)
            .where(inArray(priceHistory.productId, productIds))
            .orderBy(desc(priceHistory.timestamp))
            .limit(100)
        : [];

      // Get active promotions
      const activePromotions = await db
        .select()
        .from(promotions)
        .where(
          and(
            eq(promotions.vendorId, vendorId),
            lte(promotions.startDate, new Date()),
            gte(promotions.endDate, new Date())
          )
        );

      // Calculate analytics
      const totalProducts = vendorProducts.length;
      const lowStockCount = vendorProducts.filter(p => 
        p.currentStock !== null && 
        p.lowStockThreshold !== null && 
        p.currentStock <= p.lowStockThreshold
      ).length;
      
      const totalStock = vendorProducts.reduce((sum, p) => sum + (p.currentStock || 0), 0);
      const totalPriceChanges = priceChanges.length;
      const activePriceRuleCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(priceRules)
        .where(
          and(
            eq(priceRules.vendorId, vendorId),
            eq(priceRules.isActive, true)
          )
        )
        .then(result => result[0]?.count || 0);

      res.json({
        vendor: vendor[0],
        analytics: {
          totalProducts,
          lowStockCount,
          totalStock,
          totalPriceChanges,
          activePriceRuleCount,
          activePromotionCount: activePromotions.length,
        },
        recentPriceChanges: priceChanges.slice(0, 10),
        activePromotions
      });
    } catch (error) {
      console.error("Failed to fetch vendor analytics:", error);
      res.status(500).json({ message: "Failed to fetch vendor analytics" });
    }
  });

  // Team Management Endpoints
  
  // Get all team members for a vendor
  app.get("/api/team-members", isAuthenticated, async (req, res) => {
    try {
      if (!req.user?.vendorId) {
        return res.status(400).json({ message: "User is not associated with a vendor" });
      }

      const vendorId = req.user.vendorId;

      // Get all users belonging to this vendor
      const teamMembers = await db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          role: users.role,
          status: users.status,
          lastLogin: users.lastLogin,
          createdAt: users.createdAt,
          permissionProfileId: userPermissions.profileId,
          permissionProfileName: permissionProfiles.name,
        })
        .from(users)
        .leftJoin(userPermissions, eq(userPermissions.userId, users.id))
        .leftJoin(permissionProfiles, eq(permissionProfiles.id, userPermissions.profileId))
        .where(eq(users.vendorId, vendorId));

      res.json(teamMembers);
    } catch (error) {
      console.error("Failed to fetch team members:", error);
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  // Remove a team member (only for admins)
  app.delete("/api/team-members/:id", hasRole(['admin', 'vendor']), async (req, res) => {
    try {
      if (!req.user?.vendorId) {
        return res.status(400).json({ message: "User is not associated with a vendor" });
      }

      const userId = parseInt(req.params.id);
      const vendorId = req.user.vendorId;

      // Prevent removing self
      if (userId === req.user.id) {
        return res.status(400).json({ message: "Cannot remove yourself from the team" });
      }

      // Get the user to ensure they belong to the same vendor
      const [userToRemove] = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.id, userId),
            eq(users.vendorId, vendorId)
          )
        )
        .limit(1);

      if (!userToRemove) {
        return res.status(404).json({ message: "User not found or not part of your team" });
      }

      // Update the user to clear email and remove vendorId association
      // This completely removes their team association and allows the email to be reused
      const updatedUser = await db
        .update(users)
        .set({
          vendorId: null,
          email: "", // Clear the email when removed from team
          updatedAt: new Date()
        })
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          username: users.username
        });

      res.json({ 
        message: "Team member removed successfully", 
        user: updatedUser[0]
      });
    } catch (error) {
      console.error("Failed to remove team member:", error);
      res.status(500).json({ message: "Failed to remove team member" });
    }
  });
  
  // Delete a user completely (only for admins or self-deletion) with cascade delete
  app.delete("/api/users/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      
      // Only allow admins to delete other users, or users to delete themselves
      if (req.user?.id !== userId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "You do not have permission to delete this user" });
      }
      
      // Get the user to ensure they exist
      const [userToDelete] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!userToDelete) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // If the user is an admin trying to delete the only admin for a vendor, prevent it
      if (userToDelete.role === 'admin' && req.user?.id !== userId && userToDelete.vendorId) {
        // Count admins for this vendor
        const adminCount = await db
          .select({ count: sql`count(*)` })
          .from(users)
          .where(
            and(
              eq(users.vendorId, userToDelete.vendorId),
              eq(users.role, 'admin')
            )
          );
          
        if (adminCount[0].count <= 1) {
          return res.status(400).json({ 
            message: "Cannot delete the only admin for this vendor. Promote another user to admin first." 
          });
        }
      }
      
      // Start a transaction to ensure all related records are deleted or the operation rolls back
      await db.transaction(async (tx) => {
        console.log(`Cascade deleting user ${userId} with username: ${userToDelete.username}`);
        
        // 1. Delete store notifications where this user is the recipient
        try {
          await tx
            .delete(storeNotifications)
            .where(eq(storeNotifications.userId, userId));
          console.log(`Deleted store notifications for user ${userId}`);
        } catch (err) {
          console.error(`Error deleting store notifications for user ${userId}:`, err);
          // Continue with other deletions
        }
      
        // 2. Delete user settings
        try {
          await tx
            .delete(userSettings)
            .where(eq(userSettings.userId, userId));
          console.log(`Deleted user settings for user ${userId}`);
        } catch (err) {
          console.error(`Error deleting user settings for user ${userId}:`, err);
          // Continue with other deletions
        }
      
        // 3. Delete user permissions
        try {
          await tx
            .delete(userPermissions)
            .where(eq(userPermissions.userId, userId));
          console.log(`Deleted user permissions for user ${userId}`);
        } catch (err) {
          console.error(`Error deleting user permissions for user ${userId}:`, err);
          // Continue with other deletions
        }
        
        // 4. Delete user permissions where this user assigned permissions
        try {
          await tx
            .delete(userPermissions)
            .where(eq(userPermissions.assignedBy, userId));
          console.log(`Deleted permissions assigned by user ${userId}`);
        } catch (err) {
          console.error(`Error deleting permissions assigned by user ${userId}:`, err);
          // Continue with other deletions
        }
      
        // 5. Delete user activity logs
        try {
          await tx
            .delete(userActivityLogs)
            .where(eq(userActivityLogs.userId, userId));
          console.log(`Deleted user activity logs for user ${userId}`);
        } catch (err) {
          console.error(`Error deleting user activity logs for user ${userId}:`, err);
          // Continue with other deletions
        }
        
        // 6. Update invitations created by this user to an admin user if possible
        try {
          // First check if there are any invitations created by this user
          const invitationsCount = await tx
            .select({ count: sql`count(*)` })
            .from(invitations)
            .where(eq(invitations.createdBy, userId));
            
          if (invitationsCount[0].count > 0) {
            // Find another admin to reassign
            let adminId = userId; // Default to keep the same if no other admin found
            
            if (userToDelete.vendorId) {
              const [otherAdmin] = await tx
                .select()
                .from(users)
                .where(
                  and(
                    eq(users.vendorId, userToDelete.vendorId),
                    eq(users.role, 'admin'),
                    ne(users.id, userId)
                  )
                )
                .limit(1);
                
              if (otherAdmin) {
                adminId = otherAdmin.id;
              }
            }
            
            if (adminId !== userId) {
              // Reassign to other admin
              await tx
                .update(invitations)
                .set({ createdBy: adminId })
                .where(eq(invitations.createdBy, userId));
              console.log(`Reassigned invitations created by user ${userId} to user ${adminId}`);
            } else {
              // If no other admin, just delete these invitations
              await tx
                .delete(invitations)
                .where(eq(invitations.createdBy, userId));
              console.log(`Deleted invitations created by user ${userId}`);
            }
          }
        } catch (err) {
          console.error(`Error handling invitations created by user ${userId}:`, err);
          // Continue with other deletions
        }
        
        // 7. Update or delete store_followers records
        try {
          // Check if the table exists first
          const tableExists = await tx.execute(sql`SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'store_followers'
          )`);
          
          if (tableExists.rows[0].exists) {
            // Delete store follower records
            await tx.execute(sql`DELETE FROM store_followers WHERE user_id = ${userId}`);
            console.log(`Deleted store follower records for user ${userId}`);
          }
        } catch (err) {
          console.error(`Error deleting store follower records for user ${userId}:`, err);
          // Continue with other deletions
        }
        
        // 8. Finally, delete the user
        await tx
          .delete(users)
          .where(eq(users.id, userId));
        console.log(`Deleted user ${userId} successfully`);
      });
      
      // Log out the user if they deleted themselves
      if (req.user?.id === userId) {
        req.logout((err) => {
          if (err) {
            console.error("Error logging out user after deletion:", err);
          }
        });
      }
      
      res.json({ 
        message: "User and all related data deleted successfully",
        userId,
        username: userToDelete.username
      });
    } catch (error) {
      console.error("Failed to delete user:", error);
      res.status(500).json({ message: "Failed to delete user", error: error.message });
    }
  });

  // Get all invitations for a vendor
  app.get("/api/invitations", isAuthenticated, async (req, res) => {
    try {
      if (!req.user?.vendorId) {
        return res.status(400).json({ message: "User is not associated with a vendor" });
      }

      const vendorId = req.user.vendorId;

      const pendingInvitations = await db
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.vendorId, vendorId),
            eq(invitations.status, 'pending')
          )
        )
        .orderBy(desc(invitations.createdAt));

      res.json(pendingInvitations);
    } catch (error) {
      console.error("Failed to fetch invitations:", error);
      res.status(500).json({ message: "Failed to fetch invitations" });
    }
  });

  app.get("/api/invitations/email-config", hasRole(['admin', 'vendor']), async (_req, res) => {
    res.json(getBrevoInvitationConfigStatus());
  });

  // Create a new invitation
  app.post("/api/invitations", hasRole(['admin', 'vendor']), async (req, res) => {
    try {
      if (!req.user?.vendorId) {
        return res.status(400).json({ message: "User is not associated with a vendor" });
      }

      console.log("Received invitation request:", req.body);
      
      const vendorId = req.user.vendorId;
      const { contactMethod, email, phone, role, permissionProfileId } = req.body;
      const allowedInvitationRoles = new Set(["admin", "user", "cashier"]);
      const invitationRole = allowedInvitationRoles.has(role) ? role : "user";
      const parsedPermissionProfileId = permissionProfileId && permissionProfileId !== "none"
        ? parseInt(String(permissionProfileId), 10)
        : null;
      const selectedPermissionProfileId = typeof parsedPermissionProfileId === "number" && Number.isFinite(parsedPermissionProfileId)
        ? parsedPermissionProfileId
        : null;
      
      // Validate required fields
      if (contactMethod === 'email' && !email) {
        return res.status(400).json({ message: "Email is required when using email contact method" });
      }
      
      if (contactMethod === 'phone' && !phone) {
        return res.status(400).json({ message: "Phone number is required when using phone contact method" });
      }

      if (selectedPermissionProfileId) {
        const [profile] = await db
          .select()
          .from(permissionProfiles)
          .where(
            and(
              eq(permissionProfiles.id, selectedPermissionProfileId),
              eq(permissionProfiles.vendorId, vendorId)
            )
          )
          .limit(1);

        if (!profile) {
          return res.status(400).json({ message: "Selected permission profile was not found for this vendor" });
        }
      }

      // Generate a random token (use the full UUID format)
      const token = crypto.randomUUID();
      console.log("Generated token:", token);
      
      // Set expiration date to 7 days from now
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      console.log("Expiration date:", expiresAt);
      
      const invitationData = {
        vendorId,
        token,
        email: contactMethod === 'email' ? email : null,
        phone: contactMethod === 'phone' ? phone : null,
        role: invitationRole,
        permissionProfileId: selectedPermissionProfileId,
        status: 'pending',
        expiresAt,
        createdBy: req.user.id,
      };
      
      console.log("Attempting to create invitation with data:", invitationData);

      // Create invitation
      try {
        console.log("SQL query about to execute with values:", JSON.stringify(invitationData));
        console.log("Token type:", typeof token, "Token value:", token);
        
        const newInvitation = await db.insert(invitations).values(invitationData).returning();
        console.log("Invitation created successfully:", newInvitation);
        let emailSent = false;
        let emailDeliveryProvider = "manual-link";
        
        // Send email invitation if we have an email address
        if (newInvitation[0].email) {
          try {
            // Get vendor name and user name for the email
            const vendorResult = await db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
            const vendorName = vendorResult[0]?.name || "EaseSpotter Platform";
            
            // Get user information for the sender
            const userData = await db.select().from(users).where(eq(users.id, req.user.id)).limit(1);
            const senderName = userData[0]?.username ? `${userData[0].username} (${req.user.role})` : "EaseSpotter Admin";
            
            // Create the invitation link
            const baseUrl = getInvitationBaseUrl();
            const invitationLink = `${baseUrl}/accept-invitation/${newInvitation[0].token}`;
            const senderEmail = process.env.EMAIL_FROM || 'noreply@easespotter.com';

            emailSent = await sendBrevoInvitationEmail(
              senderEmail,
              senderName,
              newInvitation[0].email,
              newInvitation[0].email.split('@')[0],
              invitationLink,
              newInvitation[0].role,
              vendorName
            );

            if (emailSent) {
              emailDeliveryProvider = "brevo";
              console.log(`Invitation email sent successfully via Brevo to ${newInvitation[0].email}`);
            } else {
              console.warn(`Brevo invitation email was not sent to ${newInvitation[0].email}; invitation link remains available.`);
            }
          } catch (emailError) {
            console.error("Error sending invitation email:", emailError);
          }
        } else if (newInvitation[0].phone) {
          // Phone invitations would be handled by an SMS service in production
          console.log(`DEVELOPMENT MODE: Would send SMS invitation to ${newInvitation[0].phone} with token: ${newInvitation[0].token}`);
        }
  
        res.status(201).json({
          ...newInvitation[0],
          emailSent,
          emailDeliveryProvider,
        });
      } catch (dbError) {
        console.error("Database error when creating invitation:", dbError);
        return res.status(500).json({ 
          message: "Database error creating invitation", 
          details: dbError instanceof Error ? dbError.message : String(dbError) 
        });
      }
    } catch (error) {
      console.error("Failed to create invitation:", error);
      res.status(500).json({ 
        message: "Failed to create invitation",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Resend an invitation
  app.post("/api/invitations/:id/resend", hasRole(['admin', 'vendor']), async (req, res) => {
    try {
      if (!req.user?.vendorId) {
        return res.status(400).json({ message: "User is not associated with a vendor" });
      }

      const invitationId = parseInt(req.params.id);
      const vendorId = req.user.vendorId;

      // Find the invitation
      const [invitation] = await db
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.id, invitationId),
            eq(invitations.vendorId, vendorId)
          )
        )
        .limit(1);

      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      // Update expiration date to 7 days from now
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // Update the invitation
      const updatedInvitation = await db
        .update(invitations)
        .set({
          status: 'pending',
          expiresAt,
        })
        .where(eq(invitations.id, invitationId))
        .returning();
      let emailSent = false;
      let emailDeliveryProvider = "manual-link";

      // Send email invitation if we have an email address
      if (updatedInvitation[0].email) {
        try {
          // Get vendor name and user name for the email
          const vendorResult = await db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
          const vendorName = vendorResult[0]?.name || "EaseSpotter Platform";
          
          // Get user information for the sender
          const userData = await db.select().from(users).where(eq(users.id, req.user.id)).limit(1);
          const senderName = userData[0]?.username ? `${userData[0].username} (${req.user.role})` : "EaseSpotter Admin";
          
          // Create the invitation link
          const baseUrl = getInvitationBaseUrl();
          const invitationLink = `${baseUrl}/accept-invitation/${updatedInvitation[0].token}`;
          const senderEmail = process.env.EMAIL_FROM || 'noreply@easespotter.com';

          emailSent = await sendBrevoInvitationEmail(
            senderEmail,
            senderName,
            updatedInvitation[0].email,
            updatedInvitation[0].email.split('@')[0],
            invitationLink,
            updatedInvitation[0].role,
            vendorName
          );

          if (emailSent) {
            emailDeliveryProvider = "brevo";
            console.log(`Invitation email RESENT successfully via Brevo to ${updatedInvitation[0].email}`);
          } else {
            console.warn(`Brevo invitation email was not resent to ${updatedInvitation[0].email}; invitation link remains available.`);
          }
        } catch (emailError) {
          console.error("Error resending invitation email:", emailError);
        }
      } else if (updatedInvitation[0].phone) {
        // Phone invitations would be handled by an SMS service in production
        console.log(`DEVELOPMENT MODE: Would resend SMS invitation to ${updatedInvitation[0].phone} with token: ${updatedInvitation[0].token}`);
      }

      res.json({
        ...updatedInvitation[0],
        emailSent,
        emailDeliveryProvider,
      });
    } catch (error) {
      console.error("Failed to resend invitation:", error);
      res.status(500).json({ message: "Failed to resend invitation" });
    }
  });

  // Cancel an invitation
  app.delete("/api/invitations/:id", hasRole(['admin', 'vendor']), async (req, res) => {
    try {
      if (!req.user?.vendorId) {
        return res.status(400).json({ message: "User is not associated with a vendor" });
      }

      const invitationId = parseInt(req.params.id);
      const vendorId = req.user.vendorId;

      // Find the invitation
      const [invitation] = await db
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.id, invitationId),
            eq(invitations.vendorId, vendorId)
          )
        )
        .limit(1);

      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      // Update the invitation status to cancelled
      const cancelledInvitation = await db
        .update(invitations)
        .set({
          status: 'cancelled',
        })
        .where(eq(invitations.id, invitationId))
        .returning();

      res.json(cancelledInvitation[0]);
    } catch (error) {
      console.error("Failed to cancel invitation:", error);
      res.status(500).json({ message: "Failed to cancel invitation" });
    }
  });

  // Validate an invitation (public endpoint for checking token validity)
  app.get("/api/invitations/validate/:token", async (req, res) => {
    try {
      const { token } = req.params;

      // Find the invitation by token
      const [invitation] = await db
        .select()
        .from(invitations)
        .where(eq(invitations.token, token))
        .limit(1);

      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      // Check if the invitation is still valid
      if (invitation.status !== 'pending') {
        return res.status(400).json({ 
          message: `Invitation is ${invitation.status}`,
          status: invitation.status
        });
      }

      const currentDate = new Date();
      if (new Date(invitation.expiresAt) < currentDate) {
        // Update invitation status to expired
        await db
          .update(invitations)
          .set({
            status: 'expired',
          })
          .where(eq(invitations.id, invitation.id));
          
        return res.status(400).json({ 
          message: "Invitation has expired",
          status: 'expired',
          expiresAt: invitation.expiresAt
        });
      }

      // Return invitation data (excluding sensitive fields)
      const { token: _, ...cleanInvitation } = invitation;
      res.json({
        email: cleanInvitation.email,
        phone: cleanInvitation.phone,
        role: cleanInvitation.role,
        status: cleanInvitation.status,
        expiresAt: cleanInvitation.expiresAt
      });
    } catch (error) {
      console.error("Error validating invitation:", error);
      res.status(500).json({ message: "Failed to validate invitation" });
    }
  });

  // Accept an invitation (public endpoint with token validation)
  app.post("/api/invitations/accept/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const { username, password, email } = req.body;

      // Find the invitation
      const [invitation] = await db
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.token, token),
            eq(invitations.status, 'pending')
          )
        )
        .limit(1);

      if (!invitation) {
        return res.status(404).json({ message: "Invalid or expired invitation" });
      }

      // Check if invitation has expired
      if (new Date(invitation.expiresAt) < new Date()) {
        await db
          .update(invitations)
          .set({ status: 'expired' })
          .where(eq(invitations.id, invitation.id));
          
        return res.status(400).json({ message: "This invitation has expired" });
      }

      // Create a new user account
      const hashedPassword = await hashPassword(password); // This function should be imported from auth.ts
      
      const newUser = await db.insert(users).values({
        username,
        password: hashedPassword,
        email: invitation.email || email, // Use invitation email if available
        vendorId: invitation.vendorId,
        role: invitation.role,
      }).returning();

      if (invitation.permissionProfileId) {
        const [profile] = await db
          .select()
          .from(permissionProfiles)
          .where(
            and(
              eq(permissionProfiles.id, invitation.permissionProfileId),
              eq(permissionProfiles.vendorId, invitation.vendorId)
            )
          )
          .limit(1);

        if (profile) {
          await db.insert(userPermissions).values({
            userId: newUser[0].id,
            profileId: invitation.permissionProfileId,
            assignedBy: invitation.createdBy,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }

      // Update invitation status
      await db
        .update(invitations)
        .set({
          status: 'accepted',
          acceptedAt: new Date(),
        })
        .where(eq(invitations.id, invitation.id));

      res.status(201).json({
        message: "Invitation accepted and account created successfully",
        user: {
          id: newUser[0].id,
          username: newUser[0].username,
          email: newUser[0].email,
          role: newUser[0].role,
        }
      });
    } catch (error: any) {
      console.error("Failed to accept invitation:", error);
      
      if (error && error.code === '23505') { // PostgreSQL unique violation error code
        return res.status(400).json({ message: "Username or email already exists" });
      }
      
      res.status(500).json({ message: "Failed to accept invitation" });
    }
  });

  // Theme management endpoint
  app.post("/api/theme", async (req, res) => {
    try {
      const { appearance } = req.body;
      
      if (!appearance || !['light', 'dark', 'system'].includes(appearance)) {
        return res.status(400).json({ message: "Invalid theme value" });
      }
      
      // Read current theme
      const themePath = path.join(process.cwd(), 'theme.json');
      const currentTheme = JSON.parse(fs.readFileSync(themePath, 'utf8'));
      
      // Update only the appearance
      const updatedTheme = { ...currentTheme, appearance };
      
      // Write updated theme
      fs.writeFileSync(themePath, JSON.stringify(updatedTheme, null, 2));
      
      // Also update user's theme preference in database if authenticated
      if (req.isAuthenticated() && req.user) {
        try {
          const existingSettings = await db
            .select()
            .from(userSettings)
            .where(eq(userSettings.userId, req.user.id))
            .limit(1);
            
          if (existingSettings.length) {
            await db.update(userSettings)
              .set({ theme: appearance, updatedAt: new Date() })
              .where(eq(userSettings.userId, req.user.id));
          } else {
            await db.insert(userSettings)
              .values({
                userId: req.user.id,
                theme: appearance,
                notificationEmail: true,
                notificationSms: false,
                notificationInApp: true,
                language: 'en',
                mfaEnabled: false
              });
          }
        } catch (settingsError) {
          console.error("Failed to update user theme setting:", settingsError);
          // Continue even if this fails, as the global theme was updated
        }
      }
      
      return res.status(200).json({ message: "Theme updated successfully" });
    } catch (error) {
      console.error("Error updating theme:", error);
      return res.status(500).json({ message: "Failed to update theme" });
    }
  });

  // User settings endpoints
  app.get("/api/user-settings", isAuthenticated, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Get user settings or create defaults if they don't exist
      const existingSettings = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, req.user.id))
        .limit(1);
        
      if (existingSettings.length) {
        return res.json(existingSettings[0]);
      }
      
      // Create default settings if they don't exist
      const [newSettings] = await db.insert(userSettings)
        .values({
          userId: req.user.id,
          notificationEmail: true,
          notificationSms: false,
          notificationInApp: true,
          theme: "system",
          language: "en",
          mfaEnabled: false,
        })
        .returning();
        
      res.json(newSettings);
    } catch (error) {
      console.error("Failed to get user settings:", error);
      res.status(500).json({ message: "Failed to get user settings" });
    }
  });
  
  // Update user settings
  app.patch("/api/user-settings", isAuthenticated, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Check if settings exist
      const existingSettings = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, req.user.id))
        .limit(1);
        
      if (!existingSettings.length) {
        // Create settings if they don't exist
        const [newSettings] = await db.insert(userSettings)
          .values({
            userId: req.user.id,
            ...req.body,
            updatedAt: new Date(),
          })
          .returning();
          
        return res.json(newSettings);
      }
      
      // Update existing settings
      const [updatedSettings] = await db
        .update(userSettings)
        .set({
          ...req.body,
          updatedAt: new Date(),
        })
        .where(eq(userSettings.userId, req.user.id))
        .returning();
        
      res.json(updatedSettings);
    } catch (error) {
      console.error("Failed to update user settings:", error);
      res.status(500).json({ message: "Failed to update user settings" });
    }
  });
  
  // Get permission profiles endpoint
  app.get("/api/permission-profiles", isAuthenticated, async (req, res) => {
    try {
      // Get vendorId from query param or default to user's vendorId
      const vendorId = parseInt(req.query.vendorId as string) || req.user?.vendorId || 1;
      
      // Only admins can see profiles from other vendors
      if (req.user?.role !== 'admin' && req.user?.vendorId !== vendorId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const profiles = await db
        .select()
        .from(permissionProfiles)
        .where(eq(permissionProfiles.vendorId, vendorId));
        
      res.json(profiles);
    } catch (error) {
      console.error("Failed to get permission profiles:", error);
      res.status(500).json({ message: "Failed to get permission profiles" });
    }
  });
  
  // Create permission profile
  app.post("/api/permission-profiles", hasRole(['admin', 'vendor']), async (req, res) => {
    try {
      const { name, description, permissions, isDefault } = req.body;
      const vendorId = req.user?.vendorId || 1;
      
      if (!name || !permissions) {
        return res.status(400).json({ message: "Name and permissions are required" });
      }
      
      // If this is set as default, unset any existing defaults
      if (isDefault) {
        await db.update(permissionProfiles)
          .set({ isDefault: false })
          .where(
            and(
              eq(permissionProfiles.vendorId, vendorId),
              eq(permissionProfiles.isDefault, true)
            )
          );
      }
      
      const [profile] = await db.insert(permissionProfiles)
        .values({
          vendorId,
          name,
          description,
          permissions,
          isDefault: isDefault || false,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
        
      res.status(201).json(profile);
    } catch (error) {
      console.error("Failed to create permission profile:", error);
      res.status(500).json({ message: "Failed to create permission profile" });
    }
  });
  
  // Update permission profile
  app.patch("/api/permission-profiles/:id", hasRole(['admin', 'vendor']), async (req, res) => {
    try {
      const profileId = parseInt(req.params.id);
      const { name, description, permissions, isDefault } = req.body;
      const vendorId = req.user?.vendorId || 1;
      
      // Check if profile exists and belongs to the vendor
      const existingProfile = await db
        .select()
        .from(permissionProfiles)
        .where(
          and(
            eq(permissionProfiles.id, profileId),
            eq(permissionProfiles.vendorId, vendorId)
          )
        )
        .limit(1);
        
      if (!existingProfile.length) {
        return res.status(404).json({ message: "Permission profile not found" });
      }
      
      // If this is set as default, unset any existing defaults
      if (isDefault) {
        await db.update(permissionProfiles)
          .set({ isDefault: false })
          .where(
            and(
              eq(permissionProfiles.vendorId, vendorId),
              eq(permissionProfiles.isDefault, true),
              sql`${permissionProfiles.id} != ${profileId}`
            )
          );
      }
      
      const [updatedProfile] = await db.update(permissionProfiles)
        .set({
          name: name || existingProfile[0].name,
          description,
          permissions: permissions || existingProfile[0].permissions,
          isDefault: isDefault !== undefined ? isDefault : existingProfile[0].isDefault,
          updatedAt: new Date()
        })
        .where(eq(permissionProfiles.id, profileId))
        .returning();
        
      res.json(updatedProfile);
    } catch (error) {
      console.error("Failed to update permission profile:", error);
      res.status(500).json({ message: "Failed to update permission profile" });
    }
  });
  
  // Delete a permission profile
  app.delete("/api/permission-profiles/:id", hasRole(['admin', 'vendor']), async (req, res) => {
    try {
      const profileId = parseInt(req.params.id);
      const vendorId = req.user?.vendorId || 1;
      
      // Validate profile exists and belongs to vendor
      const existingProfile = await db
        .select()
        .from(permissionProfiles)
        .where(
          and(
            eq(permissionProfiles.id, profileId),
            eq(permissionProfiles.vendorId, vendorId)
          )
        )
        .limit(1);
        
      if (!existingProfile.length) {
        return res.status(404).json({ message: "Permission profile not found" });
      }
      
      // Don't allow deleting default profiles
      if (existingProfile[0].isDefault) {
        return res.status(400).json({ message: "Cannot delete default permission profile" });
      }
      
      // Check if any users are currently assigned this profile
      const usersWithProfile = await db
        .select()
        .from(userPermissions)
        .where(eq(userPermissions.profileId, profileId))
        .limit(1);
        
      if (usersWithProfile.length > 0) {
        return res.status(409).json({ 
          message: "Cannot delete profile as it is currently assigned to users. Reassign users before deleting." 
        });
      }
      
      // Delete the profile
      await db.delete(permissionProfiles)
        .where(eq(permissionProfiles.id, profileId));
        
      // Record the activity
      if (req.user) {
        await db.insert(userActivityLogs).values({
          userId: req.user.id,
          action: 'delete',
          resourceType: 'team',
          details: { profileId, profileName: existingProfile[0].name },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          vendorId,
          createdAt: new Date()
        });
      }
      
      res.json({ message: "Permission profile deleted successfully" });
    } catch (error) {
      console.error("Failed to delete permission profile:", error);
      res.status(500).json({ message: "Failed to delete permission profile" });
    }
  });
  
  // Assign permission profile to user
  app.post("/api/user-permissions", hasRole(['admin', 'vendor']), async (req, res) => {
    try {
      const { userId, profileId, customPermissions } = req.body;
      const vendorId = req.user?.vendorId;
      
      if (!userId || !profileId) {
        return res.status(400).json({ message: "User ID and profile ID are required" });
      }

      if (!vendorId) {
        return res.status(400).json({ message: "User is not associated with a vendor" });
      }
      
      // Check if user exists
      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
        
      if (!user.length) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user[0].vendorId !== vendorId) {
        return res.status(403).json({ message: "You can only assign permissions to users in your vendor team" });
      }
      
      // Check if profile exists
      const profile = await db
        .select()
        .from(permissionProfiles)
        .where(eq(permissionProfiles.id, profileId))
        .limit(1);
        
      if (!profile.length) {
        return res.status(404).json({ message: "Permission profile not found" });
      }

      if (profile[0].vendorId !== vendorId) {
        return res.status(403).json({ message: "You can only assign permission profiles from your vendor" });
      }
      
      // Check if user already has permissions assigned
      const existingPermissions = await db
        .select()
        .from(userPermissions)
        .where(eq(userPermissions.userId, userId))
        .limit(1);
        
      if (existingPermissions.length) {
        // Update existing permissions
        const [updatedPermissions] = await db.update(userPermissions)
          .set({
            profileId,
            customPermissions,
            assignedBy: req.user?.id || 1,
            updatedAt: new Date()
          })
          .where(eq(userPermissions.userId, userId))
          .returning();
          
        return res.json(updatedPermissions);
      }
      
      // Create new permissions
      const [newPermissions] = await db.insert(userPermissions)
        .values({
          userId,
          profileId,
          customPermissions,
          assignedBy: req.user?.id || 1,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
        
      res.status(201).json(newPermissions);
    } catch (error) {
      console.error("Failed to assign permission profile:", error);
      res.status(500).json({ message: "Failed to assign permission profile" });
    }
  });
  
  // Get user activity logs
  app.get("/api/user-activity", hasRole(['admin', 'vendor']), async (req, res) => {
    try {
      const { userId, startDate, endDate, action, resourceType, limit = 50 } = req.query;
      const vendorId = parseInt(req.query.vendorId as string) || req.user?.vendorId || 1;
      
      // Build query conditions
      let conditions = [eq(userActivityLogs.vendorId, vendorId)];
      
      if (userId) {
        conditions.push(eq(userActivityLogs.userId, parseInt(userId as string)));
      }
      
      if (startDate) {
        conditions.push(gte(userActivityLogs.createdAt, new Date(startDate as string)));
      }
      
      if (endDate) {
        conditions.push(lte(userActivityLogs.createdAt, new Date(endDate as string)));
      }
      
      if (action) {
        conditions.push(eq(userActivityLogs.action, action as string));
      }
      
      if (resourceType) {
        conditions.push(eq(userActivityLogs.resourceType, resourceType as string));
      }
      
      const logs = await db
        .select({
          id: userActivityLogs.id,
          userId: userActivityLogs.userId,
          username: users.username,
          action: userActivityLogs.action,
          resourceType: userActivityLogs.resourceType,
          resourceId: userActivityLogs.resourceId,
          details: userActivityLogs.details,
          ipAddress: userActivityLogs.ipAddress,
          userAgent: userActivityLogs.userAgent,
          createdAt: userActivityLogs.createdAt
        })
        .from(userActivityLogs)
        .leftJoin(users, eq(userActivityLogs.userId, users.id))
        .where(and(...conditions))
        .orderBy(desc(userActivityLogs.createdAt))
        .limit(parseInt(limit as string));
        
      res.json(logs);
    } catch (error) {
      console.error("Failed to get user activity logs:", error);
      res.status(500).json({ message: "Failed to get user activity logs" });
    }
  });
  
  // Log user activity
  app.post("/api/user-activity", isAuthenticated, async (req, res) => {
    try {
      const { action, resourceType, resourceId, details } = req.body;
      const vendorId = req.user?.vendorId || 1;
      
      if (!action || !resourceType) {
        return res.status(400).json({ message: "Action and resource type are required" });
      }
      
      const [log] = await db.insert(userActivityLogs)
        .values({
          userId: req.user?.id || 0,
          vendorId,
          action,
          resourceType,
          resourceId,
          details,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          createdAt: new Date()
        })
        .returning();
        
      res.status(201).json(log);
    } catch (error) {
      console.error("Failed to log user activity:", error);
      res.status(500).json({ message: "Failed to log user activity" });
    }
  });
  
  // Update user status (activate/suspend/deactivate)
  app.patch("/api/users/:id/status", hasRole(['admin', 'vendor']), async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { status } = req.body;
      
      if (!status || !['active', 'suspended', 'inactive'].includes(status)) {
        return res.status(400).json({ message: "Valid status is required" });
      }
      
      // Don't allow changing own status
      if (userId === req.user?.id) {
        return res.status(400).json({ message: "Cannot change your own status" });
      }
      
      const [updatedUser] = await db.update(users)
        .set({
          status,
          updatedAt: new Date()
        })
        .where(eq(users.id, userId))
        .returning();
        
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Log this action
      await db.insert(userActivityLogs).values({
        userId: req.user?.id || 0,
        vendorId: req.user?.vendorId || 1,
        action: 'update',
        resourceType: 'team',
        resourceId: userId,
        details: { changed: 'status', from: updatedUser.status, to: status },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        createdAt: new Date()
      });
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Failed to update user status:", error);
      res.status(500).json({ message: "Failed to update user status" });
    }
  });

  // Marketing Campaign API endpoints
  app.get("/api/marketing/campaigns", isAuthenticated, async (req, res) => {
    try {
      // Get vendorId from query param or default to user's vendorId
      const vendorId = req.query.vendorId ? parseInt(req.query.vendorId as string) : req.user?.vendorId || 1;
      
      const campaigns = await db
        .select()
        .from(marketingCampaigns)
        .where(eq(marketingCampaigns.vendorId, vendorId));
      
      res.json(campaigns);
    } catch (error) {
      console.error("Failed to fetch marketing campaigns:", error);
      res.status(500).json({ message: "Failed to fetch marketing campaigns" });
    }
  });

  app.get("/api/marketing/ab-tests", isAuthenticated, async (req, res) => {
    try {
      const vendorId = req.query.vendorId ? parseInt(req.query.vendorId as string) : req.user?.vendorId || 1;
      const tests = await getMarketingAbTestsForVendor(vendorId);
      res.json(tests);
    } catch (error) {
      console.error("Failed to fetch A/B tests:", error);
      res.status(500).json({ message: "Failed to fetch A/B tests" });
    }
  });

  app.post("/api/marketing/ab-tests", isAuthenticated, async (req, res) => {
    try {
      const vendorId = req.user?.vendorId || 1;
      const { variants = [], ...testInput } = req.body;
      const parsedTest = insertMarketingAbTestSchema.safeParse({
        ...testInput,
        vendorId,
      });

      if (!parsedTest.success) {
        return res.status(400).json({
          message: "Invalid A/B test payload",
          errors: parsedTest.error.format(),
        });
      }

      if (!Array.isArray(variants) || variants.length < 2) {
        return res.status(400).json({ message: "At least two variants are required" });
      }

      const invalidVariant = variants.find((variant: any) =>
        !variant?.name || !variant?.description || typeof variant?.traffic !== "number"
      );

      if (invalidVariant) {
        return res.status(400).json({ message: "Each variant requires a name, description, and traffic split" });
      }

      const controlCount = variants.filter((variant: any) => Boolean(variant.isControl)).length;
      if (controlCount !== 1) {
        return res.status(400).json({ message: "Exactly one control variant is required" });
      }

      const trafficTotal = variants.reduce((sum: number, variant: any) => sum + Number(variant.traffic || 0), 0);
      if (trafficTotal !== 100) {
        return res.status(400).json({ message: "Variant traffic split must total 100%" });
      }

      const inserted = await db.transaction(async (tx) => {
        const startDate = parsedTest.data.status === "active"
          ? (parsedTest.data.startDate || new Date())
          : parsedTest.data.startDate;

        const [test] = await tx
          .insert(marketingAbTests)
          .values({
            ...parsedTest.data,
            vendorId,
            startDate,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        await tx
          .insert(marketingAbTestVariants)
          .values(variants.map((variant: any) => ({
            testId: test.id,
            name: variant.name,
            description: variant.description,
            isControl: Boolean(variant.isControl),
            traffic: Number(variant.traffic),
            screenshot: variant.screenshot || null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })));

        return test;
      });

      const [createdTest] = await getMarketingAbTestsForVendor(vendorId).then((tests) =>
        tests.filter((test) => Number(test.id) === inserted.id)
      );

      res.status(201).json(createdTest);
    } catch (error) {
      console.error("Failed to create A/B test:", error);
      res.status(500).json({ message: "Failed to create A/B test" });
    }
  });

  app.patch("/api/marketing/ab-tests/:id", isAuthenticated, async (req, res) => {
    try {
      const testId = parseInt(req.params.id);
      const vendorId = req.user?.vendorId || 1;
      const [existingTest] = await db
        .select()
        .from(marketingAbTests)
        .where(and(eq(marketingAbTests.id, testId), eq(marketingAbTests.vendorId, vendorId)));

      if (!existingTest) {
        return res.status(404).json({ message: "A/B test not found" });
      }

      const nextStatus = req.body.status || existingTest.status;
      const updatePayload: any = {
        updatedAt: new Date(),
      };

      if (req.body.name) updatePayload.name = req.body.name;
      if (req.body.description) updatePayload.description = req.body.description;
      if (req.body.hypothesis) updatePayload.hypothesis = req.body.hypothesis;
      if (req.body.goalMetric) updatePayload.goalMetric = req.body.goalMetric;
      if (req.body.goal) updatePayload.goal = req.body.goal;
      if (req.body.type) updatePayload.type = req.body.type;
      if (req.body.tags) updatePayload.tags = req.body.tags;
      if (typeof req.body.trafficAllocation === "number") updatePayload.trafficAllocation = req.body.trafficAllocation;
      if (req.body.status) updatePayload.status = req.body.status;

      if (nextStatus === "active" && !existingTest.startDate) {
        updatePayload.startDate = new Date();
      }
      if (nextStatus === "completed" && !existingTest.endDate) {
        updatePayload.endDate = new Date();
      }

      await db
        .update(marketingAbTests)
        .set(updatePayload)
        .where(and(eq(marketingAbTests.id, testId), eq(marketingAbTests.vendorId, vendorId)));

      const [updatedTest] = await getMarketingAbTestsForVendor(vendorId).then((tests) =>
        tests.filter((test) => Number(test.id) === testId)
      );

      res.json(updatedTest);
    } catch (error) {
      console.error("Failed to update A/B test:", error);
      res.status(500).json({ message: "Failed to update A/B test" });
    }
  });

  app.delete("/api/marketing/ab-tests/:id", isAuthenticated, async (req, res) => {
    try {
      const testId = parseInt(req.params.id);
      const vendorId = req.user?.vendorId || 1;
      const [existingTest] = await db
        .select()
        .from(marketingAbTests)
        .where(and(eq(marketingAbTests.id, testId), eq(marketingAbTests.vendorId, vendorId)));

      if (!existingTest) {
        return res.status(404).json({ message: "A/B test not found" });
      }

      await db.transaction(async (tx) => {
        await tx.delete(marketingAbTestEvents).where(eq(marketingAbTestEvents.testId, testId));
        await tx.delete(marketingAbTestVariants).where(eq(marketingAbTestVariants.testId, testId));
        await tx.delete(marketingAbTests).where(eq(marketingAbTests.id, testId));
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete A/B test:", error);
      res.status(500).json({ message: "Failed to delete A/B test" });
    }
  });

  app.get("/api/marketing/journeys", isAuthenticated, async (req, res) => {
    try {
      const vendorId = req.query.vendorId ? parseInt(req.query.vendorId as string) : req.user?.vendorId || 1;
      const journeys = await getMarketingJourneysForVendor(vendorId);
      res.json(journeys);
    } catch (error) {
      console.error("Failed to fetch customer journeys:", error);
      res.status(500).json({ message: "Failed to fetch customer journeys" });
    }
  });

  app.post("/api/marketing/journeys", isAuthenticated, async (req, res) => {
    try {
      const vendorId = req.user?.vendorId || 1;
      const parsedJourney = insertMarketingCustomerJourneySchema.safeParse(req.body);

      if (!parsedJourney.success) {
        return res.status(400).json({
          message: "Invalid journey payload",
          errors: parsedJourney.error.format(),
        });
      }

      const [segment] = await db
        .select()
        .from(customerSegments)
        .where(and(eq(customerSegments.id, parsedJourney.data.segmentId), eq(customerSegments.vendorId, vendorId)));

      if (!segment) {
        return res.status(404).json({ message: "Customer segment not found" });
      }

      const insertedJourney = await db.transaction(async (tx) => {
        const [journey] = await tx
          .insert(marketingCustomerJourneys)
          .values({
            vendorId,
            segmentId: parsedJourney.data.segmentId,
            name: parsedJourney.data.name,
            description: parsedJourney.data.description,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        const defaultStages = getDefaultJourneyStages(parsedJourney.data.name);
        await tx.insert(marketingJourneyStages).values(
          defaultStages.map((stage, index) => ({
            journeyId: journey.id,
            name: stage.name,
            description: stage.description,
            duration: stage.duration,
            position: index,
            conversionRate: String(stage.conversionRate),
            painPoints: stage.painPoints,
            opportunities: stage.opportunities,
            createdAt: new Date(),
            updatedAt: new Date(),
          }))
        );

        return journey;
      });

      const [createdJourney] = await getMarketingJourneysForVendor(vendorId).then((journeys) =>
        journeys.filter((journey) => Number(journey.id) === insertedJourney.id)
      );

      res.status(201).json(createdJourney);
    } catch (error) {
      console.error("Failed to create customer journey:", error);
      res.status(500).json({ message: "Failed to create customer journey" });
    }
  });

  app.post("/api/marketing/journeys/:id/touchpoints", isAuthenticated, async (req, res) => {
    try {
      const journeyId = parseInt(req.params.id);
      const vendorId = req.user?.vendorId || 1;
      const { stageId, ...touchpointInput } = req.body;

      const parsedTouchpoint = insertMarketingJourneyTouchpointSchema.safeParse({
        ...touchpointInput,
        stageId: Number(stageId),
      });

      if (!parsedTouchpoint.success) {
        return res.status(400).json({
          message: "Invalid touchpoint payload",
          errors: parsedTouchpoint.error.format(),
        });
      }

      const [journey] = await db
        .select()
        .from(marketingCustomerJourneys)
        .where(and(eq(marketingCustomerJourneys.id, journeyId), eq(marketingCustomerJourneys.vendorId, vendorId)));

      if (!journey) {
        return res.status(404).json({ message: "Journey not found" });
      }

      const [stage] = await db
        .select()
        .from(marketingJourneyStages)
        .where(and(eq(marketingJourneyStages.id, Number(stageId)), eq(marketingJourneyStages.journeyId, journeyId)));

      if (!stage) {
        return res.status(404).json({ message: "Journey stage not found" });
      }

      const existingTouchpoints = await db
        .select()
        .from(marketingJourneyTouchpoints)
        .where(eq(marketingJourneyTouchpoints.stageId, stage.id));

      await db.insert(marketingJourneyTouchpoints).values({
        stageId: stage.id,
        name: parsedTouchpoint.data.name,
        channel: parsedTouchpoint.data.channel,
        description: parsedTouchpoint.data.description,
        dropoff: parsedTouchpoint.data.dropoff ?? 0,
        sentiment: parsedTouchpoint.data.sentiment,
        metrics: parsedTouchpoint.data.metrics || {},
        position: existingTouchpoints.length,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db
        .update(marketingCustomerJourneys)
        .set({ updatedAt: new Date() })
        .where(eq(marketingCustomerJourneys.id, journeyId));

      const [updatedJourney] = await getMarketingJourneysForVendor(vendorId).then((journeys) =>
        journeys.filter((item) => Number(item.id) === journeyId)
      );

      res.status(201).json(updatedJourney);
    } catch (error) {
      console.error("Failed to add journey touchpoint:", error);
      res.status(500).json({ message: "Failed to add journey touchpoint" });
    }
  });

  app.patch("/api/marketing/journeys/:id", isAuthenticated, async (req, res) => {
    try {
      const journeyId = parseInt(req.params.id);
      const vendorId = req.user?.vendorId || 1;
      const { name, description, segmentId } = req.body;

      const [journey] = await db
        .select()
        .from(marketingCustomerJourneys)
        .where(and(eq(marketingCustomerJourneys.id, journeyId), eq(marketingCustomerJourneys.vendorId, vendorId)));

      if (!journey) {
        return res.status(404).json({ message: "Journey not found" });
      }

      if (segmentId !== undefined) {
        const [segment] = await db
          .select()
          .from(customerSegments)
          .where(and(eq(customerSegments.id, Number(segmentId)), eq(customerSegments.vendorId, vendorId)));

        if (!segment) {
          return res.status(404).json({ message: "Customer segment not found" });
        }
      }

      await db
        .update(marketingCustomerJourneys)
        .set({
          name: name ?? journey.name,
          description: description ?? journey.description,
          segmentId: segmentId !== undefined ? Number(segmentId) : journey.segmentId,
          updatedAt: new Date(),
        })
        .where(eq(marketingCustomerJourneys.id, journeyId));

      const [updatedJourney] = await getMarketingJourneysForVendor(vendorId).then((journeys) =>
        journeys.filter((item) => Number(item.id) === journeyId)
      );

      res.json(updatedJourney);
    } catch (error) {
      console.error("Failed to update customer journey:", error);
      res.status(500).json({ message: "Failed to update customer journey" });
    }
  });

  app.post("/api/marketing/journeys/:id/stages", isAuthenticated, async (req, res) => {
    try {
      const journeyId = parseInt(req.params.id);
      const vendorId = req.user?.vendorId || 1;
      const parsedStage = insertMarketingJourneyStageSchema.safeParse({
        ...req.body,
        journeyId,
      });

      if (!parsedStage.success) {
        return res.status(400).json({
          message: "Invalid stage payload",
          errors: parsedStage.error.format(),
        });
      }

      const [journey] = await db
        .select()
        .from(marketingCustomerJourneys)
        .where(and(eq(marketingCustomerJourneys.id, journeyId), eq(marketingCustomerJourneys.vendorId, vendorId)));

      if (!journey) {
        return res.status(404).json({ message: "Journey not found" });
      }

      const existingStages = await db
        .select()
        .from(marketingJourneyStages)
        .where(eq(marketingJourneyStages.journeyId, journeyId));

      await db.insert(marketingJourneyStages).values({
        journeyId,
        name: parsedStage.data.name,
        description: parsedStage.data.description,
        duration: parsedStage.data.duration,
        conversionRate: String(parsedStage.data.conversionRate),
        painPoints: parsedStage.data.painPoints || [],
        opportunities: parsedStage.data.opportunities || [],
        position: existingStages.length,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db
        .update(marketingCustomerJourneys)
        .set({ updatedAt: new Date() })
        .where(eq(marketingCustomerJourneys.id, journeyId));

      const [updatedJourney] = await getMarketingJourneysForVendor(vendorId).then((journeys) =>
        journeys.filter((item) => Number(item.id) === journeyId)
      );

      res.status(201).json(updatedJourney);
    } catch (error) {
      console.error("Failed to add journey stage:", error);
      res.status(500).json({ message: "Failed to add journey stage" });
    }
  });

  app.patch("/api/marketing/journeys/stages/:stageId", isAuthenticated, async (req, res) => {
    try {
      const stageId = parseInt(req.params.stageId);
      const vendorId = req.user?.vendorId || 1;
      const { name, description, duration, conversionRate, painPoints, opportunities } = req.body;

      const [stageRecord] = await db
        .select({
          stageId: marketingJourneyStages.id,
          journeyId: marketingCustomerJourneys.id,
        })
        .from(marketingJourneyStages)
        .innerJoin(marketingCustomerJourneys, eq(marketingJourneyStages.journeyId, marketingCustomerJourneys.id))
        .where(and(eq(marketingJourneyStages.id, stageId), eq(marketingCustomerJourneys.vendorId, vendorId)));

      if (!stageRecord) {
        return res.status(404).json({ message: "Journey stage not found" });
      }

      await db
        .update(marketingJourneyStages)
        .set({
          name,
          description,
          duration,
          conversionRate: conversionRate !== undefined ? String(conversionRate) : undefined,
          painPoints,
          opportunities,
          updatedAt: new Date(),
        })
        .where(eq(marketingJourneyStages.id, stageId));

      await db
        .update(marketingCustomerJourneys)
        .set({ updatedAt: new Date() })
        .where(eq(marketingCustomerJourneys.id, stageRecord.journeyId));

      const [updatedJourney] = await getMarketingJourneysForVendor(vendorId).then((journeys) =>
        journeys.filter((item) => Number(item.id) === stageRecord.journeyId)
      );

      res.json(updatedJourney);
    } catch (error) {
      console.error("Failed to update journey stage:", error);
      res.status(500).json({ message: "Failed to update journey stage" });
    }
  });

  app.patch("/api/marketing/journeys/:id/stages/reorder", isAuthenticated, async (req, res) => {
    try {
      const journeyId = parseInt(req.params.id);
      const vendorId = req.user?.vendorId || 1;
      const orderedStageIds = Array.isArray(req.body.orderedStageIds) ? req.body.orderedStageIds.map(Number) : [];

      const [journey] = await db
        .select()
        .from(marketingCustomerJourneys)
        .where(and(eq(marketingCustomerJourneys.id, journeyId), eq(marketingCustomerJourneys.vendorId, vendorId)));

      if (!journey) {
        return res.status(404).json({ message: "Journey not found" });
      }

      const stages = await db
        .select()
        .from(marketingJourneyStages)
        .where(eq(marketingJourneyStages.journeyId, journeyId));

      if (orderedStageIds.length !== stages.length) {
        return res.status(400).json({ message: "Ordered stage list must include all stages" });
      }

      await db.transaction(async (tx) => {
        for (const [index, stageId] of orderedStageIds.entries()) {
          await tx
            .update(marketingJourneyStages)
            .set({ position: index, updatedAt: new Date() })
            .where(and(eq(marketingJourneyStages.id, stageId), eq(marketingJourneyStages.journeyId, journeyId)));
        }
        await tx
          .update(marketingCustomerJourneys)
          .set({ updatedAt: new Date() })
          .where(eq(marketingCustomerJourneys.id, journeyId));
      });

      const [updatedJourney] = await getMarketingJourneysForVendor(vendorId).then((journeys) =>
        journeys.filter((item) => Number(item.id) === journeyId)
      );

      res.json(updatedJourney);
    } catch (error) {
      console.error("Failed to reorder journey stages:", error);
      res.status(500).json({ message: "Failed to reorder journey stages" });
    }
  });

  app.delete("/api/marketing/journeys/stages/:stageId", isAuthenticated, async (req, res) => {
    try {
      const stageId = parseInt(req.params.stageId);
      const vendorId = req.user?.vendorId || 1;

      const [stageRecord] = await db
        .select({
          stageId: marketingJourneyStages.id,
          journeyId: marketingCustomerJourneys.id,
        })
        .from(marketingJourneyStages)
        .innerJoin(marketingCustomerJourneys, eq(marketingJourneyStages.journeyId, marketingCustomerJourneys.id))
        .where(and(eq(marketingJourneyStages.id, stageId), eq(marketingCustomerJourneys.vendorId, vendorId)));

      if (!stageRecord) {
        return res.status(404).json({ message: "Journey stage not found" });
      }

      const journeyStages = await db
        .select()
        .from(marketingJourneyStages)
        .where(eq(marketingJourneyStages.journeyId, stageRecord.journeyId));

      if (journeyStages.length <= 1) {
        return res.status(400).json({ message: "A journey must keep at least one stage" });
      }

      await db.transaction(async (tx) => {
        await tx.delete(marketingJourneyTouchpoints).where(eq(marketingJourneyTouchpoints.stageId, stageId));
        await tx.delete(marketingJourneyStages).where(eq(marketingJourneyStages.id, stageId));

        const remainingStages = await tx
          .select()
          .from(marketingJourneyStages)
          .where(eq(marketingJourneyStages.journeyId, stageRecord.journeyId))
          .orderBy(marketingJourneyStages.position);

        for (const [index, stage] of remainingStages.entries()) {
          await tx
            .update(marketingJourneyStages)
            .set({ position: index, updatedAt: new Date() })
            .where(eq(marketingJourneyStages.id, stage.id));
        }

        await tx
          .update(marketingCustomerJourneys)
          .set({ updatedAt: new Date() })
          .where(eq(marketingCustomerJourneys.id, stageRecord.journeyId));
      });

      const [updatedJourney] = await getMarketingJourneysForVendor(vendorId).then((journeys) =>
        journeys.filter((item) => Number(item.id) === stageRecord.journeyId)
      );

      res.json(updatedJourney);
    } catch (error) {
      console.error("Failed to delete journey stage:", error);
      res.status(500).json({ message: "Failed to delete journey stage" });
    }
  });

  app.patch("/api/marketing/journeys/touchpoints/:touchpointId", isAuthenticated, async (req, res) => {
    try {
      const touchpointId = parseInt(req.params.touchpointId);
      const vendorId = req.user?.vendorId || 1;
      const { name, channel, description, dropoff, sentiment, metrics } = req.body;

      const [touchpointRecord] = await db
        .select({
          touchpointId: marketingJourneyTouchpoints.id,
          journeyId: marketingCustomerJourneys.id,
        })
        .from(marketingJourneyTouchpoints)
        .innerJoin(marketingJourneyStages, eq(marketingJourneyTouchpoints.stageId, marketingJourneyStages.id))
        .innerJoin(marketingCustomerJourneys, eq(marketingJourneyStages.journeyId, marketingCustomerJourneys.id))
        .where(and(eq(marketingJourneyTouchpoints.id, touchpointId), eq(marketingCustomerJourneys.vendorId, vendorId)));

      if (!touchpointRecord) {
        return res.status(404).json({ message: "Touchpoint not found" });
      }

      await db
        .update(marketingJourneyTouchpoints)
        .set({
          name,
          channel,
          description,
          dropoff,
          sentiment,
          metrics,
          updatedAt: new Date(),
        })
        .where(eq(marketingJourneyTouchpoints.id, touchpointId));

      await db
        .update(marketingCustomerJourneys)
        .set({ updatedAt: new Date() })
        .where(eq(marketingCustomerJourneys.id, touchpointRecord.journeyId));

      const [updatedJourney] = await getMarketingJourneysForVendor(vendorId).then((journeys) =>
        journeys.filter((item) => Number(item.id) === touchpointRecord.journeyId)
      );

      res.json(updatedJourney);
    } catch (error) {
      console.error("Failed to update journey touchpoint:", error);
      res.status(500).json({ message: "Failed to update journey touchpoint" });
    }
  });

  app.delete("/api/marketing/journeys/:id", isAuthenticated, async (req, res) => {
    try {
      const journeyId = parseInt(req.params.id);
      const vendorId = req.user?.vendorId || 1;
      const [journey] = await db
        .select()
        .from(marketingCustomerJourneys)
        .where(and(eq(marketingCustomerJourneys.id, journeyId), eq(marketingCustomerJourneys.vendorId, vendorId)));

      if (!journey) {
        return res.status(404).json({ message: "Journey not found" });
      }

      await db.transaction(async (tx) => {
        const stages = await tx
          .select()
          .from(marketingJourneyStages)
          .where(eq(marketingJourneyStages.journeyId, journeyId));
        const stageIds = stages.map((stage) => stage.id);

        if (stageIds.length) {
          await tx.delete(marketingJourneyTouchpoints).where(inArray(marketingJourneyTouchpoints.stageId, stageIds));
        }
        await tx.delete(marketingJourneyStages).where(eq(marketingJourneyStages.journeyId, journeyId));
        await tx.delete(marketingCustomerJourneys).where(eq(marketingCustomerJourneys.id, journeyId));
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete customer journey:", error);
      res.status(500).json({ message: "Failed to delete customer journey" });
    }
  });

  app.delete("/api/marketing/journeys/touchpoints/:touchpointId", isAuthenticated, async (req, res) => {
    try {
      const touchpointId = parseInt(req.params.touchpointId);
      const vendorId = req.user?.vendorId || 1;

      const [touchpointRecord] = await db
        .select({
          touchpointId: marketingJourneyTouchpoints.id,
          stageId: marketingJourneyStages.id,
          journeyId: marketingCustomerJourneys.id,
        })
        .from(marketingJourneyTouchpoints)
        .innerJoin(marketingJourneyStages, eq(marketingJourneyTouchpoints.stageId, marketingJourneyStages.id))
        .innerJoin(marketingCustomerJourneys, eq(marketingJourneyStages.journeyId, marketingCustomerJourneys.id))
        .where(and(eq(marketingJourneyTouchpoints.id, touchpointId), eq(marketingCustomerJourneys.vendorId, vendorId)));

      if (!touchpointRecord) {
        return res.status(404).json({ message: "Touchpoint not found" });
      }

      await db.delete(marketingJourneyTouchpoints).where(eq(marketingJourneyTouchpoints.id, touchpointId));
      await db
        .update(marketingCustomerJourneys)
        .set({ updatedAt: new Date() })
        .where(eq(marketingCustomerJourneys.id, touchpointRecord.journeyId));

      const [updatedJourney] = await getMarketingJourneysForVendor(vendorId).then((journeys) =>
        journeys.filter((journey) => Number(journey.id) === touchpointRecord.journeyId)
      );

      res.json(updatedJourney);
    } catch (error) {
      console.error("Failed to delete journey touchpoint:", error);
      res.status(500).json({ message: "Failed to delete journey touchpoint" });
    }
  });

  app.get("/api/marketing/personalization/templates", isAuthenticated, async (req, res) => {
    try {
      const vendorId = req.user?.vendorId || 1;
      const { templates } = await getMarketingPersonalizationDataForVendor(vendorId);
      res.json(templates);
    } catch (error) {
      console.error("Failed to fetch personalization templates:", error);
      res.status(500).json({ message: "Failed to fetch personalization templates" });
    }
  });

  app.post("/api/marketing/personalization/templates", isAuthenticated, async (req, res) => {
    try {
      const vendorId = req.user?.vendorId || 1;
      const parsedTemplate = insertMarketingPersonalizationTemplateSchema.safeParse({
        ...req.body,
        tags: Array.isArray(req.body.tags) ? req.body.tags : [],
      });

      if (!parsedTemplate.success) {
        return res.status(400).json({ message: parsedTemplate.error.flatten() });
      }

      const [template] = await db
        .insert(marketingPersonalizationTemplates)
        .values({
          vendorId,
          name: parsedTemplate.data.name,
          description: parsedTemplate.data.description,
          target: parsedTemplate.data.target,
          structure: parsedTemplate.data.structure,
          thumbnail: parsedTemplate.data.thumbnail || null,
          tags: parsedTemplate.data.tags,
        })
        .returning();

      res.status(201).json({
        ...template,
        id: String(template.id),
        tags: Array.isArray(template.tags) ? template.tags : [],
      });
    } catch (error) {
      console.error("Failed to create personalization template:", error);
      res.status(500).json({ message: "Failed to create personalization template" });
    }
  });

  app.patch("/api/marketing/personalization/templates/:id", isAuthenticated, async (req, res) => {
    try {
      const templateId = parseInt(req.params.id);
      const vendorId = req.user?.vendorId || 1;
      const parsedTemplate = insertMarketingPersonalizationTemplateSchema.partial().safeParse({
        ...req.body,
        tags: Array.isArray(req.body.tags) ? req.body.tags : req.body.tags === undefined ? undefined : [],
      });

      if (!parsedTemplate.success) {
        return res.status(400).json({ message: parsedTemplate.error.flatten() });
      }

      const [existingTemplate] = await db
        .select()
        .from(marketingPersonalizationTemplates)
        .where(and(eq(marketingPersonalizationTemplates.id, templateId), eq(marketingPersonalizationTemplates.vendorId, vendorId)));

      if (!existingTemplate) {
        return res.status(404).json({ message: "Personalization template not found" });
      }

      const [updatedTemplate] = await db
        .update(marketingPersonalizationTemplates)
        .set({
          ...parsedTemplate.data,
          updatedAt: new Date(),
        })
        .where(eq(marketingPersonalizationTemplates.id, templateId))
        .returning();

      res.json({
        ...updatedTemplate,
        id: String(updatedTemplate.id),
        tags: Array.isArray(updatedTemplate.tags) ? updatedTemplate.tags : [],
      });
    } catch (error) {
      console.error("Failed to update personalization template:", error);
      res.status(500).json({ message: "Failed to update personalization template" });
    }
  });

  app.delete("/api/marketing/personalization/templates/:id", isAuthenticated, async (req, res) => {
    try {
      const templateId = parseInt(req.params.id);
      const vendorId = req.user?.vendorId || 1;

      const [existingTemplate] = await db
        .select()
        .from(marketingPersonalizationTemplates)
        .where(and(eq(marketingPersonalizationTemplates.id, templateId), eq(marketingPersonalizationTemplates.vendorId, vendorId)));

      if (!existingTemplate) {
        return res.status(404).json({ message: "Personalization template not found" });
      }

      await db
        .update(marketingPersonalizationRules)
        .set({ templateId: null, updatedAt: new Date() })
        .where(eq(marketingPersonalizationRules.templateId, templateId));

      await db.delete(marketingPersonalizationTemplates).where(eq(marketingPersonalizationTemplates.id, templateId));
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete personalization template:", error);
      res.status(500).json({ message: "Failed to delete personalization template" });
    }
  });

  app.get("/api/marketing/personalization/rules", isAuthenticated, async (req, res) => {
    try {
      const vendorId = req.user?.vendorId || 1;
      const { rules } = await getMarketingPersonalizationDataForVendor(vendorId);
      res.json(rules);
    } catch (error) {
      console.error("Failed to fetch personalization rules:", error);
      res.status(500).json({ message: "Failed to fetch personalization rules" });
    }
  });

  app.post("/api/marketing/personalization/evaluate", isAuthenticated, async (req, res) => {
    try {
      const vendorId = req.user?.vendorId || 1;
      const context: PersonalizationEvaluationContext = {
        target: String(req.body.target || ""),
        segmentId: req.body.segmentId ? Number(req.body.segmentId) : null,
        segment: req.body.segment ? String(req.body.segment) : undefined,
        behavior: req.body.behavior ? String(req.body.behavior) : undefined,
        device: req.body.device ? String(req.body.device) : undefined,
        location: req.body.location ? String(req.body.location) : undefined,
        time: req.body.time ? String(req.body.time) : undefined,
      };

      if (!context.target) {
        return res.status(400).json({ message: "target is required" });
      }

      const { rules } = await getMarketingPersonalizationDataForVendor(vendorId);
      const matches = rules
        .map((rule) => ({
          rule,
          score: calculateRuleMatchScore(
            {
              target: rule.target,
              status: rule.status,
              conditions: rule.conditions,
              segmentId: rule.segmentId ? Number(rule.segmentId) : null,
              priority: rule.priority,
              startDate: rule.startDate,
              endDate: rule.endDate,
            },
            context
          ),
        }))
        .filter((item) => item.score !== null)
        .sort((a, b) => {
          if ((a.score?.priority ?? 100) !== (b.score?.priority ?? 100)) {
            return (a.score?.priority ?? 100) - (b.score?.priority ?? 100);
          }
          if ((b.score?.specificity ?? 0) !== (a.score?.specificity ?? 0)) {
            return (b.score?.specificity ?? 0) - (a.score?.specificity ?? 0);
          }
          if ((b.score?.score ?? 0) !== (a.score?.score ?? 0)) {
            return (b.score?.score ?? 0) - (a.score?.score ?? 0);
          }
          return new Date(b.rule.updatedAt || 0).getTime() - new Date(a.rule.updatedAt || 0).getTime();
        });

      const bestMatch = matches[0]?.rule || null;
      if (!bestMatch) {
        return res.json({ matched: false, rule: null, variation: null });
      }

      const selectedVariation = bestMatch.variations
        .slice()
        .sort((a, b) => {
          if (a.impressions !== b.impressions) return a.impressions - b.impressions;
          const aRate = a.impressions ? a.conversions / a.impressions : 0;
          const bRate = b.impressions ? b.conversions / b.impressions : 0;
          return bRate - aRate;
        })[0] || null;

      res.json({
        matched: true,
        rule: bestMatch,
        variation: selectedVariation,
      });
    } catch (error) {
      console.error("Failed to evaluate personalization rule:", error);
      res.status(500).json({ message: "Failed to evaluate personalization rule" });
    }
  });

  app.post("/api/marketing/personalization/rules", isAuthenticated, async (req, res) => {
    try {
      const vendorId = req.user?.vendorId || 1;
      const userId = req.user?.id || null;
      const parsedRule = insertMarketingPersonalizationRuleSchema.safeParse(req.body);
      const variations = Array.isArray(req.body.variations) ? req.body.variations : [];

      if (!parsedRule.success) {
        return res.status(400).json({ message: parsedRule.error.flatten() });
      }

      if (!variations.length) {
        return res.status(400).json({ message: "At least one variation is required" });
      }

      const parsedVariations = variations.map((variation) =>
        insertMarketingPersonalizationVariationSchema.safeParse(variation)
      );
      if (parsedVariations.some((result) => !result.success)) {
        return res.status(400).json({ message: "Invalid variation payload" });
      }

      if (parsedRule.data.segmentId) {
        const [segment] = await db
          .select()
          .from(customerSegments)
          .where(and(eq(customerSegments.id, parsedRule.data.segmentId), eq(customerSegments.vendorId, vendorId)));

        if (!segment) {
          return res.status(404).json({ message: "Customer segment not found" });
        }
      }

      if (parsedRule.data.templateId) {
        const [template] = await db
          .select()
          .from(marketingPersonalizationTemplates)
          .where(and(eq(marketingPersonalizationTemplates.id, parsedRule.data.templateId), eq(marketingPersonalizationTemplates.vendorId, vendorId)));

        if (!template) {
          return res.status(404).json({ message: "Personalization template not found" });
        }
      }

      const createdRuleId = await db.transaction(async (tx) => {
        const [rule] = await tx
          .insert(marketingPersonalizationRules)
          .values({
            vendorId,
            templateId: parsedRule.data.templateId || null,
            segmentId: parsedRule.data.segmentId || null,
            name: parsedRule.data.name,
            description: parsedRule.data.description,
            audience: parsedRule.data.audience,
            target: parsedRule.data.target,
            status: parsedRule.data.status,
            priority: parsedRule.data.priority ?? 100,
            startDate: parsedRule.data.startDate ?? null,
            endDate: parsedRule.data.endDate ?? null,
            conditions: parsedRule.data.conditions,
            createdByUserId: userId,
          })
          .returning();

        await tx.insert(marketingPersonalizationVariations).values(
          parsedVariations.map((result) => ({
            ruleId: rule.id,
            name: result.success ? result.data.name : "",
            content: result.success ? result.data.content : "",
          }))
        );

        return rule.id;
      });

      const [createdRule] = await getMarketingPersonalizationDataForVendor(vendorId).then((data) =>
        data.rules.filter((item) => Number(item.id) === createdRuleId)
      );
      res.status(201).json(createdRule);
    } catch (error) {
      console.error("Failed to create personalization rule:", error);
      res.status(500).json({ message: "Failed to create personalization rule" });
    }
  });

  app.patch("/api/marketing/personalization/rules/:id", isAuthenticated, async (req, res) => {
    try {
      const ruleId = parseInt(req.params.id);
      const vendorId = req.user?.vendorId || 1;
      const parsedRule = insertMarketingPersonalizationRuleSchema.partial().safeParse(req.body);

      if (!parsedRule.success) {
        return res.status(400).json({ message: parsedRule.error.flatten() });
      }

      const [existingRule] = await db
        .select()
        .from(marketingPersonalizationRules)
        .where(and(eq(marketingPersonalizationRules.id, ruleId), eq(marketingPersonalizationRules.vendorId, vendorId)));

      if (!existingRule) {
        return res.status(404).json({ message: "Personalization rule not found" });
      }

      if (parsedRule.data.segmentId) {
        const [segment] = await db
          .select()
          .from(customerSegments)
          .where(and(eq(customerSegments.id, parsedRule.data.segmentId), eq(customerSegments.vendorId, vendorId)));
        if (!segment) {
          return res.status(404).json({ message: "Customer segment not found" });
        }
      }

      if (parsedRule.data.templateId) {
        const [template] = await db
          .select()
          .from(marketingPersonalizationTemplates)
          .where(and(eq(marketingPersonalizationTemplates.id, parsedRule.data.templateId), eq(marketingPersonalizationTemplates.vendorId, vendorId)));
        if (!template) {
          return res.status(404).json({ message: "Personalization template not found" });
        }
      }

      await db
        .update(marketingPersonalizationRules)
        .set({
          ...parsedRule.data,
          startDate: parsedRule.data.startDate === undefined ? existingRule.startDate : parsedRule.data.startDate,
          endDate: parsedRule.data.endDate === undefined ? existingRule.endDate : parsedRule.data.endDate,
          updatedAt: new Date(),
        })
        .where(eq(marketingPersonalizationRules.id, ruleId));

      const [updatedRule] = await getMarketingPersonalizationDataForVendor(vendorId).then((data) =>
        data.rules.filter((item) => Number(item.id) === ruleId)
      );
      res.json(updatedRule);
    } catch (error) {
      console.error("Failed to update personalization rule:", error);
      res.status(500).json({ message: "Failed to update personalization rule" });
    }
  });

  app.delete("/api/marketing/personalization/rules/:id", isAuthenticated, async (req, res) => {
    try {
      const ruleId = parseInt(req.params.id);
      const vendorId = req.user?.vendorId || 1;
      const [existingRule] = await db
        .select()
        .from(marketingPersonalizationRules)
        .where(and(eq(marketingPersonalizationRules.id, ruleId), eq(marketingPersonalizationRules.vendorId, vendorId)));

      if (!existingRule) {
        return res.status(404).json({ message: "Personalization rule not found" });
      }

      await db.transaction(async (tx) => {
        await tx.delete(marketingPersonalizationEvents).where(eq(marketingPersonalizationEvents.ruleId, ruleId));
        await tx.delete(marketingPersonalizationVariations).where(eq(marketingPersonalizationVariations.ruleId, ruleId));
        await tx.delete(marketingPersonalizationRules).where(eq(marketingPersonalizationRules.id, ruleId));
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete personalization rule:", error);
      res.status(500).json({ message: "Failed to delete personalization rule" });
    }
  });

  app.post("/api/marketing/personalization/rules/:id/variations", isAuthenticated, async (req, res) => {
    try {
      const ruleId = parseInt(req.params.id);
      const vendorId = req.user?.vendorId || 1;
      const parsedVariation = insertMarketingPersonalizationVariationSchema.safeParse(req.body);

      if (!parsedVariation.success) {
        return res.status(400).json({ message: parsedVariation.error.flatten() });
      }

      const [existingRule] = await db
        .select()
        .from(marketingPersonalizationRules)
        .where(and(eq(marketingPersonalizationRules.id, ruleId), eq(marketingPersonalizationRules.vendorId, vendorId)));

      if (!existingRule) {
        return res.status(404).json({ message: "Personalization rule not found" });
      }

      await db.insert(marketingPersonalizationVariations).values({
        ruleId,
        name: parsedVariation.data.name,
        content: parsedVariation.data.content,
      });

      const [updatedRule] = await getMarketingPersonalizationDataForVendor(vendorId).then((data) =>
        data.rules.filter((item) => Number(item.id) === ruleId)
      );
      res.status(201).json(updatedRule);
    } catch (error) {
      console.error("Failed to create personalization variation:", error);
      res.status(500).json({ message: "Failed to create personalization variation" });
    }
  });

  app.patch("/api/marketing/personalization/variations/:id", isAuthenticated, async (req, res) => {
    try {
      const variationId = parseInt(req.params.id);
      const vendorId = req.user?.vendorId || 1;
      const parsedVariation = insertMarketingPersonalizationVariationSchema.partial().safeParse(req.body);

      if (!parsedVariation.success) {
        return res.status(400).json({ message: parsedVariation.error.flatten() });
      }

      const [variationRecord] = await db
        .select({
          variationId: marketingPersonalizationVariations.id,
          ruleId: marketingPersonalizationRules.id,
        })
        .from(marketingPersonalizationVariations)
        .innerJoin(marketingPersonalizationRules, eq(marketingPersonalizationVariations.ruleId, marketingPersonalizationRules.id))
        .where(and(eq(marketingPersonalizationVariations.id, variationId), eq(marketingPersonalizationRules.vendorId, vendorId)));

      if (!variationRecord) {
        return res.status(404).json({ message: "Personalization variation not found" });
      }

      await db
        .update(marketingPersonalizationVariations)
        .set({
          ...parsedVariation.data,
          updatedAt: new Date(),
        })
        .where(eq(marketingPersonalizationVariations.id, variationId));

      await db
        .update(marketingPersonalizationRules)
        .set({ updatedAt: new Date() })
        .where(eq(marketingPersonalizationRules.id, variationRecord.ruleId));

      const [updatedRule] = await getMarketingPersonalizationDataForVendor(vendorId).then((data) =>
        data.rules.filter((item) => Number(item.id) === variationRecord.ruleId)
      );
      res.json(updatedRule);
    } catch (error) {
      console.error("Failed to update personalization variation:", error);
      res.status(500).json({ message: "Failed to update personalization variation" });
    }
  });

  app.delete("/api/marketing/personalization/variations/:id", isAuthenticated, async (req, res) => {
    try {
      const variationId = parseInt(req.params.id);
      const vendorId = req.user?.vendorId || 1;
      const [variationRecord] = await db
        .select({
          variationId: marketingPersonalizationVariations.id,
          ruleId: marketingPersonalizationRules.id,
        })
        .from(marketingPersonalizationVariations)
        .innerJoin(marketingPersonalizationRules, eq(marketingPersonalizationVariations.ruleId, marketingPersonalizationRules.id))
        .where(and(eq(marketingPersonalizationVariations.id, variationId), eq(marketingPersonalizationRules.vendorId, vendorId)));

      if (!variationRecord) {
        return res.status(404).json({ message: "Personalization variation not found" });
      }

      const variationCount = await db
        .select()
        .from(marketingPersonalizationVariations)
        .where(eq(marketingPersonalizationVariations.ruleId, variationRecord.ruleId));

      if (variationCount.length <= 1) {
        return res.status(400).json({ message: "A rule must keep at least one variation" });
      }

      await db.transaction(async (tx) => {
        await tx.delete(marketingPersonalizationEvents).where(eq(marketingPersonalizationEvents.variationId, variationId));
        await tx.delete(marketingPersonalizationVariations).where(eq(marketingPersonalizationVariations.id, variationId));
        await tx
          .update(marketingPersonalizationRules)
          .set({ updatedAt: new Date() })
          .where(eq(marketingPersonalizationRules.id, variationRecord.ruleId));
      });

      const [updatedRule] = await getMarketingPersonalizationDataForVendor(vendorId).then((data) =>
        data.rules.filter((item) => Number(item.id) === variationRecord.ruleId)
      );
      res.json(updatedRule);
    } catch (error) {
      console.error("Failed to delete personalization variation:", error);
      res.status(500).json({ message: "Failed to delete personalization variation" });
    }
  });

  app.post("/api/marketing/personalization/rules/:id/track", async (req, res) => {
    try {
      const ruleId = parseInt(req.params.id);
      const parsedEvent = insertMarketingPersonalizationEventSchema.safeParse(req.body);
      const vendorId = Number(req.body.vendorId);
      const variationId = req.body.variationId ? Number(req.body.variationId) : null;

      if (!parsedEvent.success || !vendorId) {
        return res.status(400).json({ message: "rule track payload is invalid" });
      }

      const [rule] = await db
        .select()
        .from(marketingPersonalizationRules)
        .where(and(eq(marketingPersonalizationRules.id, ruleId), eq(marketingPersonalizationRules.vendorId, vendorId)));

      if (!rule) {
        return res.status(404).json({ message: "Personalization rule not found" });
      }

      if (variationId) {
        const [variation] = await db
          .select()
          .from(marketingPersonalizationVariations)
          .where(and(eq(marketingPersonalizationVariations.id, variationId), eq(marketingPersonalizationVariations.ruleId, ruleId)));
        if (!variation) {
          return res.status(404).json({ message: "Personalization variation not found" });
        }
      }

      await db.transaction(async (tx) => {
        await tx.insert(marketingPersonalizationEvents).values({
          ruleId,
          variationId,
          vendorId,
          eventType: parsedEvent.data.eventType,
          visitorKey: parsedEvent.data.visitorKey,
          eventValue: parsedEvent.data.eventValue !== undefined ? String(parsedEvent.data.eventValue) : null,
        });

        if (variationId) {
          await tx
            .update(marketingPersonalizationVariations)
            .set({
              impressions: sql`${marketingPersonalizationVariations.impressions} + ${parsedEvent.data.eventType === "impression" ? 1 : 0}`,
              conversions: sql`${marketingPersonalizationVariations.conversions} + ${parsedEvent.data.eventType === "conversion" ? 1 : 0}`,
              updatedAt: new Date(),
            })
            .where(eq(marketingPersonalizationVariations.id, variationId));
        }

        await tx
          .update(marketingPersonalizationRules)
          .set({ updatedAt: new Date() })
          .where(eq(marketingPersonalizationRules.id, ruleId));
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Failed to track personalization event:", error);
      res.status(500).json({ message: "Failed to track personalization event" });
    }
  });

  app.post("/api/marketing/ab-tests/:id/track", async (req, res) => {
    try {
      const testId = parseInt(req.params.id);
      const { variantId, eventType, visitorKey, eventValue, metadata, vendorId: vendorIdFromBody } = req.body;
      const vendorId = Number(vendorIdFromBody);

      if (!variantId || !eventType || !visitorKey || !vendorId) {
        return res.status(400).json({ message: "variantId, eventType, visitorKey, and vendorId are required" });
      }

      const [test] = await db
        .select()
        .from(marketingAbTests)
        .where(and(eq(marketingAbTests.id, testId), eq(marketingAbTests.vendorId, vendorId)));

      if (!test) {
        return res.status(404).json({ message: "A/B test not found" });
      }

      const [variant] = await db
        .select()
        .from(marketingAbTestVariants)
        .where(and(eq(marketingAbTestVariants.id, Number(variantId)), eq(marketingAbTestVariants.testId, testId)));

      if (!variant) {
        return res.status(404).json({ message: "Variant not found for this test" });
      }

      await db
        .insert(marketingAbTestEvents)
        .values({
          vendorId,
          testId,
          variantId: Number(variantId),
          eventType,
          visitorKey,
          eventValue: eventValue ?? 0,
          metadata: metadata || null,
          createdAt: new Date(),
        });

      res.status(201).json({ success: true });
    } catch (error) {
      console.error("Failed to track A/B event:", error);
      res.status(500).json({ message: "Failed to track A/B event" });
    }
  });

  app.post("/api/marketing/campaigns", isAuthenticated, async (req, res) => {
    try {
      console.log("Received campaign data:", JSON.stringify(req.body, null, 2));
      
      const result = insertMarketingCampaignSchema.safeParse(req.body);
      
      if (!result.success) {
        console.error("Validation errors:", JSON.stringify(result.error.format(), null, 2));
        return res.status(400).json({ 
          message: "Invalid campaign data", 
          errors: result.error.format() 
        });
      }
      
      console.log("Validated data:", JSON.stringify(result.data, null, 2));
      
      // Use the user's vendorId if not specified
      const vendorId = result.data.vendorId || req.user?.vendorId || 1;
      
      try {
        // For debugging
        const campaignData = {
          name: result.data.name,
          description: result.data.description || null,
          type: result.data.type,
          targetSegment: result.data.targetSegment,
          budget: typeof result.data.budget === 'string' 
            ? parseFloat(result.data.budget) 
            : result.data.budget,
          startDate: result.data.startDate,
          endDate: result.data.endDate,
          active: Boolean(result.data.active),
          channels: result.data.channels,
          goals: result.data.goals || null,
          vendorId: vendorId
        };
        
        console.log("Attempting to create campaign with data:", JSON.stringify(campaignData, null, 2));
        
        // First check if start date is before end date
        const startDate = new Date(campaignData.startDate);
        const endDate = new Date(campaignData.endDate);
        
        if (startDate > endDate) {
          return res.status(400).json({
            message: "Start date must be on or before end date",
            error: "INVALID_DATE_RANGE"
          });
        }
        
        // Create campaign with direct query
        const [campaign] = await db
          .insert(marketingCampaigns)
          .values({
            name: campaignData.name,
            description: campaignData.description,
            type: campaignData.type,
            targetSegment: campaignData.targetSegment,
            budget: campaignData.budget,
            startDate: startDate,
            endDate: endDate,
            active: campaignData.active,
            channels: campaignData.channels,
            goals: campaignData.goals,
            vendorId: vendorId,
            status: 'draft',
            createdAt: new Date(),
            updatedAt: new Date()
          })
          .returning();
        
        console.log("Created campaign:", campaign);
        res.status(201).json(campaign);
      } catch (dbError: any) {
        console.error("Database error during campaign creation:", dbError);
        
        // Provide more user-friendly error messages
        let errorMessage = "Database error during campaign creation";
        let errorCode = "DB_ERROR";
        
        if (dbError.message?.includes("budget")) {
          errorMessage = "Invalid budget value. Please provide a valid number.";
          errorCode = "INVALID_BUDGET";
        } else if (dbError.message?.includes("date")) {
          errorMessage = "Invalid date format. Please use YYYY-MM-DD format.";
          errorCode = "INVALID_DATE";
        } else if (dbError.message?.includes("constraint")) {
          errorMessage = "This campaign conflicts with an existing campaign.";
          errorCode = "CONSTRAINT_VIOLATION";
        }
        
        res.status(500).json({ 
          message: errorMessage, 
          error: errorCode,
          details: dbError.message 
        });
      }
    } catch (error) {
      console.error("Failed to create marketing campaign:", error);
      res.status(500).json({ 
        message: "Failed to create marketing campaign",
        error: error.message
      });
    }
  });

  app.get("/api/marketing/campaigns/:id", isAuthenticated, async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      const vendorId = req.user?.vendorId || 1;
      
      const [campaign] = await db
        .select()
        .from(marketingCampaigns)
        .where(
          and(
            eq(marketingCampaigns.id, campaignId),
            eq(marketingCampaigns.vendorId, vendorId)
          )
        );
      
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      res.json(campaign);
    } catch (error) {
      console.error("Failed to fetch marketing campaign:", error);
      res.status(500).json({ message: "Failed to fetch marketing campaign" });
    }
  });

  app.patch("/api/marketing/campaigns/:id", isAuthenticated, async (req, res) => {
    try {
      console.log("Received campaign update data:", JSON.stringify(req.body, null, 2));
      
      const campaignId = parseInt(req.params.id);
      const vendorId = req.user?.vendorId || 1;
      
      // First check if campaign exists and belongs to vendor
      const [existingCampaign] = await db
        .select()
        .from(marketingCampaigns)
        .where(
          and(
            eq(marketingCampaigns.id, campaignId),
            eq(marketingCampaigns.vendorId, vendorId)
          )
        );
      
      if (!existingCampaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      // Validate the update data (more flexible than creation validation)
      // This allows partial updates
      const result = insertMarketingCampaignSchema.partial().safeParse(req.body);
      
      if (!result.success) {
        console.error("Validation errors:", JSON.stringify(result.error.format(), null, 2));
        return res.status(400).json({ 
          message: "Invalid campaign data", 
          errors: result.error.format() 
        });
      }
      
      console.log("Validated update data:", JSON.stringify(result.data, null, 2));
      
      // Prepare the update data with proper type conversions
      const updateData: any = {
        ...result.data,
        updatedAt: new Date()
      };
      
      // Handle budget type conversion if present
      if (updateData.budget !== undefined) {
        updateData.budget = typeof updateData.budget === 'string'
          ? parseFloat(updateData.budget)
          : updateData.budget;
      }
      
      // If both startDate and endDate are provided, validate the range
      if (updateData.startDate && updateData.endDate) {
        const startDate = new Date(updateData.startDate);
        const endDate = new Date(updateData.endDate);
        
        if (startDate > endDate) {
          return res.status(400).json({
            message: "Start date must be on or before end date",
            error: "INVALID_DATE_RANGE"
          });
        }
        
        // Convert dates to proper Date objects
        updateData.startDate = startDate;
        updateData.endDate = endDate;
      } else if (updateData.startDate) {
        updateData.startDate = new Date(updateData.startDate);
      } else if (updateData.endDate) {
        updateData.endDate = new Date(updateData.endDate);
      }
      
      try {
        const updatedCampaign = await db
          .update(marketingCampaigns)
          .set(updateData)
          .where(eq(marketingCampaigns.id, campaignId))
          .returning();
        
        console.log("Updated campaign:", updatedCampaign[0]);
        res.json(updatedCampaign[0]);
      } catch (dbError: any) {
        console.error("Database error during campaign update:", dbError);
        
        // Provide more user-friendly error messages
        let errorMessage = "Database error during campaign update";
        let errorCode = "DB_ERROR";
        
        if (dbError.message?.includes("budget")) {
          errorMessage = "Invalid budget value. Please provide a valid number.";
          errorCode = "INVALID_BUDGET";
        } else if (dbError.message?.includes("date")) {
          errorMessage = "Invalid date format. Please use YYYY-MM-DD format.";
          errorCode = "INVALID_DATE";
        } else if (dbError.message?.includes("constraint")) {
          errorMessage = "This campaign update conflicts with an existing campaign.";
          errorCode = "CONSTRAINT_VIOLATION";
        }
        
        res.status(500).json({ 
          message: errorMessage, 
          error: errorCode,
          details: dbError.message 
        });
      }
    } catch (error) {
      console.error("Failed to update marketing campaign:", error);
      res.status(500).json({ 
        message: "Failed to update marketing campaign",
        error: error.message 
      });
    }
  });

  app.delete("/api/marketing/campaigns/:id", hasRole(['admin']), async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      const vendorId = req.user?.vendorId || 1;
      
      const deletedCampaign = await db
        .delete(marketingCampaigns)
        .where(
          and(
            eq(marketingCampaigns.id, campaignId),
            eq(marketingCampaigns.vendorId, vendorId)
          )
        )
        .returning();
      
      if (!deletedCampaign.length) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      res.json(deletedCampaign[0]);
    } catch (error) {
      console.error("Failed to delete marketing campaign:", error);
      res.status(500).json({ message: "Failed to delete marketing campaign" });
    }
  });

  app.post("/api/marketing/campaigns/:id/activate", isAuthenticated, async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      const vendorId = req.user?.vendorId || 1;
      
      // First check if campaign exists and belongs to vendor
      const [existingCampaign] = await db
        .select()
        .from(marketingCampaigns)
        .where(
          and(
            eq(marketingCampaigns.id, campaignId),
            eq(marketingCampaigns.vendorId, vendorId)
          )
        );
      
      if (!existingCampaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      // Check if dates are valid
      const now = new Date();
      const startDate = new Date(existingCampaign.startDate);
      const endDate = new Date(existingCampaign.endDate);
      
      let status = 'active';
      if (startDate > now) {
        status = 'scheduled';
      } else if (endDate < now) {
        status = 'expired';
      }
      
      const activatedCampaign = await db
        .update(marketingCampaigns)
        .set({
          status,
          updatedAt: now
        })
        .where(eq(marketingCampaigns.id, campaignId))
        .returning();
      
      res.json(activatedCampaign[0]);
    } catch (error) {
      console.error("Failed to activate marketing campaign:", error);
      res.status(500).json({ message: "Failed to activate marketing campaign" });
    }
  });

  app.post("/api/marketing/campaigns/:id/pause", isAuthenticated, async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      const vendorId = req.user?.vendorId || 1;
      
      const pausedCampaign = await db
        .update(marketingCampaigns)
        .set({
          status: 'paused',
          updatedAt: new Date()
        })
        .where(
          and(
            eq(marketingCampaigns.id, campaignId),
            eq(marketingCampaigns.vendorId, vendorId)
          )
        )
        .returning();
      
      if (!pausedCampaign.length) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      res.json(pausedCampaign[0]);
    } catch (error) {
      console.error("Failed to pause marketing campaign:", error);
      res.status(500).json({ message: "Failed to pause marketing campaign" });
    }
  });

  // Customer Segments endpoints
  app.get("/api/marketing/segments", isAuthenticated, async (req, res) => {
    try {
      console.log("\n===== DEBUGGING CUSTOMER SEGMENTS API =====");
      console.log("Request received at:", new Date().toISOString());
      console.log("User:", req.user?.username);
      console.log("User object:", JSON.stringify(req.user, null, 2));
      
      let vendorId = 1;  // Default to vendor 1
      if (req.user?.vendorId) {
        vendorId = req.user.vendorId;
        console.log("Using authenticated user's vendorId:", vendorId);
      } else {
        console.log("No vendorId found on user, using default:", vendorId);
      }
      
      // Check if customer_segments table exists
      try {
        const tableExists = await db.execute(sql`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public'
            AND table_name = 'customer_segments'
          );
        `);
        console.log("customer_segments table exists:", tableExists.rows[0].exists);
      } catch (tableErr) {
        console.error("Error checking table existence:", tableErr);
      }
      
      // Fetch all customer segments for this vendor
      console.log("Executing query to fetch segments for vendor:", vendorId);
      const segments = await db
        .select()
        .from(customerSegments)
        .where(eq(customerSegments.vendorId, vendorId));
      
      console.log(`Found ${segments.length} segments`);
      
      // Format the segments for the frontend
      console.log("Processing segments and fetching membership counts...");
      const formattedSegments = await Promise.all(segments.map(async (segment) => {
        console.log(`Processing segment: ${segment.id} - ${segment.name}`);
        
        // Get the number of customers in this segment
        console.log(`Fetching membership count for segment ${segment.id}`);
        const memberships = await db
          .select({ count: sql<number>`count(*)` })
          .from(customerSegmentMemberships)
          .where(eq(customerSegmentMemberships.segmentId, segment.id));
        
        const count = memberships[0]?.count || 0;
        console.log(`Segment ${segment.id} has ${count} members`);
        
        // Generate metrics based on segment type
        let metrics: any = {};
        
        // Adapt database fields to frontend expected format
        if (segment.metrics) {
          console.log(`Using metrics from database for segment ${segment.id}`);
          metrics = segment.metrics;
        } else {
          console.log(`Generating metrics based on segment type: ${segment.type}`);
          // Generate metrics based on segment type
          switch(segment.type) {
            case 'rfm':
              if (segment.name.includes('High Value')) {
                metrics.avgOrderValue = '$102.30';
                metrics.lifetimeValue = '$742.18';
              } else if (segment.name.includes('Frequent')) {
                metrics.repeatPurchase = '63%';
                metrics.avgOrderValue = '$67.50';
              } else if (segment.name.includes('Recent')) {
                metrics.lastPurchase = 'Within 30 days';
                metrics.conversionRate = '8.7%';
              } else if (segment.name.includes('At Risk')) {
                metrics.lastPurchase = '180+ days ago';
                metrics.recoveryRate = '12.4%';
              }
              break;
            case 'behavioral':
              if (segment.name.includes('New')) {
                metrics.avgOrderValue = '$42.80';
                metrics.conversionRate = '4.2%';
              }
              break;
            default:
              metrics.avgOrderValue = '$0.00';
          }
        }
        
        const formattedSegment = {
          id: segment.id.toString(),
          name: segment.name,
          description: segment.description || '',
          count: count,
          metrics: metrics
        };
        
        console.log(`Formatted segment ${segment.id}:`, formattedSegment);
        return formattedSegment;
      }));
      
      console.log("Successfully processed all segments, returning response");
      console.log("===== END DEBUGGING =====\n");
      
      return res.json(formattedSegments);
    } catch (error) {
      console.error("\n===== ERROR IN CUSTOMER SEGMENTS API =====");
      console.error("Failed to fetch customer segments. Full error:", error);
      console.error("Error type:", typeof error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      console.error("===== END ERROR =====\n");
      
      return res.status(500).json({ 
        message: "Failed to fetch customer segments",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/marketing/segments/:id", isAuthenticated, async (req, res) => {
    try {
      const segmentId = parseInt(req.params.id);
      const vendorId = req.user?.vendorId || 1;
      
      // Fetch the specific segment
      const [segment] = await db
        .select()
        .from(customerSegments)
        .where(
          and(
            eq(customerSegments.id, segmentId),
            eq(customerSegments.vendorId, vendorId)
          )
        );
      
      if (!segment) {
        return res.status(404).json({ message: "Segment not found" });
      }
      
      // Get the customers in this segment
      const memberships = await db
        .select()
        .from(customerSegmentMemberships)
        .where(eq(customerSegmentMemberships.segmentId, segmentId));
      
      const customerIds = memberships.map(m => m.customerId);
      
      // Get customer data
      const segmentCustomers = customerIds.length > 0 
        ? await db
            .select()
            .from(customers)
            .where(inArray(customers.id, customerIds))
        : [];
      
      // Format metrics
      let metrics: any = segment.metrics || {};
      if (Object.keys(metrics).length === 0) {
        // Generate placeholder metrics based on segment type if none exist
        switch(segment.type) {
          case 'rfm':
            if (segment.name.includes('High Value')) {
              metrics.avgOrderValue = '$102.30';
              metrics.lifetimeValue = '$742.18';
            } else if (segment.name.includes('Frequent')) {
              metrics.repeatPurchase = '63%';
              metrics.avgOrderValue = '$67.50';
            } else if (segment.name.includes('Recent')) {
              metrics.lastPurchase = 'Within 30 days';
              metrics.conversionRate = '8.7%';
            } else if (segment.name.includes('At Risk')) {
              metrics.lastPurchase = '180+ days ago';
              metrics.recoveryRate = '12.4%';
            }
            break;
          case 'behavioral':
            if (segment.name.includes('New')) {
              metrics.avgOrderValue = '$42.80';
              metrics.conversionRate = '4.2%';
            }
            break;
          default:
            metrics.avgOrderValue = '$0.00';
        }
      }
      
      // Return formatted data
      res.json({
        id: segment.id.toString(),
        name: segment.name,
        description: segment.description || '',
        count: segmentCustomers.length,
        metrics: metrics,
        customers: segmentCustomers.map(c => ({
          id: c.id,
          email: c.email,
          name: `${c.firstName || ''} ${c.lastName || ''}`.trim(),
          totalSpent: c.totalSpent,
          totalOrders: c.totalOrders,
          lastActive: c.lastActive
        })),
        conditions: segment.conditions
      });
      
    } catch (error) {
      console.error("Failed to fetch customer segment details:", error);
      res.status(500).json({ message: "Failed to fetch customer segment details" });
    }
  });

  app.post("/api/marketing/segments", isAuthenticated, async (req, res) => {
    try {
      const vendorId = req.user?.vendorId || 1;
      const userId = req.user?.id;
      
      // Validate the segment data
      const { name, description, conditions, type = 'custom' } = req.body;
      
      if (!name || !conditions) {
        return res.status(400).json({ message: "Name and conditions are required" });
      }
      
      // Create the segment
      const [segment] = await db
        .insert(customerSegments)
        .values({
          vendorId,
          name,
          description,
          type: type as any,
          conditions,
          isActive: true,
          createdBy: userId,
          lastUpdated: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      res.status(201).json(segment);
    } catch (error) {
      console.error("Failed to create customer segment:", error);
      res.status(500).json({ message: "Failed to create customer segment" });
    }
  });

  app.patch("/api/marketing/segments/:id", isAuthenticated, async (req, res) => {
    try {
      const segmentId = parseInt(req.params.id);
      const vendorId = req.user?.vendorId || 1;
      
      // Fetch the segment first to ensure it exists
      const [existingSegment] = await db
        .select()
        .from(customerSegments)
        .where(
          and(
            eq(customerSegments.id, segmentId),
            eq(customerSegments.vendorId, vendorId)
          )
        );
      
      if (!existingSegment) {
        return res.status(404).json({ message: "Segment not found" });
      }
      
      // Update the segment
      const [updatedSegment] = await db
        .update(customerSegments)
        .set({
          ...req.body,
          lastUpdated: new Date(),
          updatedAt: new Date()
        })
        .where(
          and(
            eq(customerSegments.id, segmentId),
            eq(customerSegments.vendorId, vendorId)
          )
        )
        .returning();
      
      res.json(updatedSegment);
    } catch (error) {
      console.error("Failed to update customer segment:", error);
      res.status(500).json({ message: "Failed to update customer segment" });
    }
  });

  app.delete("/api/marketing/segments/:id", hasRole(['admin']), async (req, res) => {
    try {
      const segmentId = parseInt(req.params.id);
      const vendorId = req.user?.vendorId || 1;
      
      // Delete all segment memberships first to maintain referential integrity
      await db
        .delete(customerSegmentMemberships)
        .where(eq(customerSegmentMemberships.segmentId, segmentId));
      
      // Then delete the segment
      const deletedSegments = await db
        .delete(customerSegments)
        .where(
          and(
            eq(customerSegments.id, segmentId),
            eq(customerSegments.vendorId, vendorId)
          )
        )
        .returning();
      
      if (!deletedSegments.length) {
        return res.status(404).json({ message: "Segment not found" });
      }
      
      res.json({ message: "Segment deleted successfully" });
    } catch (error) {
      console.error("Failed to delete customer segment:", error);
      res.status(500).json({ message: "Failed to delete customer segment" });
    }
  });
  
  // Email marketing endpoints
  app.post("/api/marketing/email/send", isAuthenticated, async (req, res) => {
    try {
      const { to, subject, content, html } = req.body;
      
      if (!to || !subject || (!content && !html)) {
        return res.status(400).json({ 
          success: false, 
          message: "Missing required fields: to, subject, and either content or html are required" 
        });
      }
      
      // Get the user's email as the sender
      const fromEmail = process.env.EMAIL_FROM || "noreply@easespotter.com";
      const senderName = req.user?.username ? `${req.user.username} via EaseSpotter` : "EaseSpotter Marketing";
      
      // Import the sendMarketingEmail function from our Brevo marketing service
      const { sendMarketingEmail } = await import("./services/brevo-marketing");
      
      // Send the email using Brevo marketing API
      const result = await sendMarketingEmail(
        to,
        subject,
        html || `<div>${content}</div>`, // Convert plain text to HTML if HTML isn't provided
        content,
        senderName,
        fromEmail
      );
      
      if (result.success) {
        res.json({ 
          success: true, 
          message: "Email sent successfully",
          messageId: result.messageId
        });
      } else {
        res.status(500).json({ 
          success: false, 
          message: result.error || "Failed to send email" 
        });
      }
    } catch (error) {
      console.error("Error in marketing email send route:", error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : "Unknown error occurred"
      });
    }
  });
  
  // New route to get marketing contact lists from Brevo
  app.get("/api/marketing/email/lists", isAuthenticated, async (req, res) => {
    try {
      const { getContactLists } = await import("./services/brevo-marketing");
      const result = await getContactLists();
      
      if (result.success) {
        res.json({ success: true, lists: result.lists });
      } else {
        res.status(500).json({ success: false, message: result.error });
      }
    } catch (error) {
      console.error("Error fetching contact lists:", error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : "Unknown error occurred"
      });
    }
  });
  
  // New route to get marketing campaigns from Brevo
  app.get("/api/marketing/email/campaigns", isAuthenticated, async (req, res) => {
    try {
      const { getMarketingCampaigns } = await import("./services/brevo-marketing");
      const result = await getMarketingCampaigns();
      
      if (result.success) {
        res.json({ success: true, campaigns: result.campaigns });
      } else {
        res.status(500).json({ success: false, message: result.error });
      }
    } catch (error) {
      console.error("Error fetching marketing campaigns:", error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : "Unknown error occurred"
      });
    }
  });
  
  // New route to create an email template in Brevo
  app.post("/api/marketing/email/templates", isAuthenticated, async (req, res) => {
    try {
      const { name, subject, htmlContent } = req.body;
      
      if (!name || !subject || !htmlContent) {
        return res.status(400).json({ 
          success: false, 
          message: "Missing required fields: name, subject, and htmlContent are required" 
        });
      }
      
      const { createEmailTemplate } = await import("./services/brevo-marketing");
      const result = await createEmailTemplate(name, subject, htmlContent);
      
      if (result.success) {
        res.json({ success: true, template: result.template });
      } else {
        res.status(500).json({ success: false, message: result.error });
      }
    } catch (error) {
      console.error("Error creating email template:", error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : "Unknown error occurred"
      });
    }
  });
  
  // New route to get email templates from Brevo
  app.get("/api/marketing/email/templates", isAuthenticated, async (req, res) => {
    try {
      const { getEmailTemplates } = await import("./services/brevo-marketing");
      const result = await getEmailTemplates();
      
      if (result.success) {
        res.json({ success: true, templates: result.templates });
      } else {
        res.status(500).json({ success: false, message: result.error });
      }
    } catch (error) {
      console.error("Error fetching email templates:", error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : "Unknown error occurred"
      });
    }
  });
  
  // New route to create an email campaign in Brevo
  app.post("/api/marketing/email/campaigns", isAuthenticated, async (req, res) => {
    try {
      const { name, templateId, listIds, subject, scheduledAt } = req.body;
      
      if (!name || !templateId || !listIds || !Array.isArray(listIds) || listIds.length === 0) {
        return res.status(400).json({ 
          success: false,
          message: "Missing required fields: name, templateId, and at least one listId are required" 
        });
      }
      
      const { createCampaign } = await import("./services/brevo-marketing");
      
      // Convert scheduledAt to Date if provided
      const scheduledDate = scheduledAt ? new Date(scheduledAt) : undefined;
      
      const result = await createCampaign(name, templateId, listIds, subject, scheduledDate);
      
      if (result.success) {
        res.json({ success: true, campaign: result.campaign });
      } else {
        res.status(500).json({ success: false, message: result.error });
      }
    } catch (error) {
      console.error("Error creating email campaign:", error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : "Unknown error occurred"
      });
    }
  });
  
  // New route to get specific campaign details from Brevo
  app.get("/api/marketing/email/campaigns/:id", isAuthenticated, async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      
      if (isNaN(campaignId)) {
        return res.status(400).json({ 
          success: false,
          message: "Invalid campaign ID" 
        });
      }
      
      const { getCampaignDetails } = await import("./services/brevo-marketing");
      const result = await getCampaignDetails(campaignId);
      
      if (result.success) {
        res.json({ success: true, campaign: result.campaign });
      } else {
        res.status(500).json({ success: false, message: result.error });
      }
    } catch (error) {
      console.error("Error fetching campaign details:", error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : "Unknown error occurred"
      });
    }
  });
  
  // New route to schedule an existing campaign in Brevo
  app.post("/api/marketing/email/campaigns/:id/schedule", isAuthenticated, async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      const { scheduledAt } = req.body;
      
      if (isNaN(campaignId)) {
        return res.status(400).json({ 
          success: false,
          message: "Invalid campaign ID" 
        });
      }
      
      if (!scheduledAt) {
        return res.status(400).json({ 
          success: false,
          message: "scheduledAt date is required" 
        });
      }
      
      // Convert to Date object
      const scheduledDate = new Date(scheduledAt);
      
      // Ensure the scheduled date is in the future
      if (scheduledDate <= new Date()) {
        return res.status(400).json({ 
          success: false,
          message: "Scheduled date must be in the future" 
        });
      }
      
      const { scheduleCampaign } = await import("./services/brevo-marketing");
      const result = await scheduleCampaign(campaignId, scheduledDate);
      
      if (result.success) {
        res.json({ success: true, message: "Campaign scheduled successfully" });
      } else {
        res.status(500).json({ success: false, message: result.error });
      }
    } catch (error) {
      console.error("Error scheduling campaign:", error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : "Unknown error occurred"
      });
    }
  });

  // Advanced Analytics endpoints
  app.get("/api/analytics/performance-metrics", isAuthenticated, async (req, res) => {
    try {
      const vendorId = req.user?.vendorId || 1;
      const { productId, period } = req.query;
      
      // Check if table exists and has data, otherwise return empty array
      try {
        let query = `
          SELECT * FROM product_performance_metrics 
          WHERE vendor_id = ${vendorId}
        `;
        
        if (productId) {
          query += ` AND product_id = ${Number(productId)}`;
        }
        
        if (period) {
          query += ` AND period = '${String(period)}'`;
        }
        
        query += ` ORDER BY end_date DESC`;
        
        const metrics = await db.execute(query);
        res.json(metrics || []);
      } catch (e) {
        // If table doesn't exist yet, return empty array
        console.log("Performance metrics table may not exist yet:", e);
        res.json([]);
      }
    } catch (error) {
      console.error("Error fetching performance metrics:", error);
      res.status(500).json({ error: "Failed to fetch performance metrics" });
    }
  });
  
  app.get("/api/analytics/forecasts", isAuthenticated, async (req, res) => {
    try {
      const vendorId = req.user?.vendorId || 1;
      const { productId, forecastType, startDate, endDate } = req.query;
      
      // Check if table exists and has data, otherwise return empty array
      try {
        const conditions = [eq(timeSeriesForecasts.vendorId, vendorId)];

        if (productId) {
          const parsedProductId = Number(productId);
          if (!Number.isFinite(parsedProductId)) {
            return res.status(400).json({ error: "Invalid productId" });
          }
          conditions.push(eq(timeSeriesForecasts.productId, parsedProductId));
        }

        if (forecastType) {
          conditions.push(eq(timeSeriesForecasts.forecastType, String(forecastType)));
        }

        if (startDate) {
          const parsedStartDate = new Date(String(startDate));
          if (Number.isNaN(parsedStartDate.getTime())) {
            return res.status(400).json({ error: "Invalid startDate" });
          }
          conditions.push(gte(timeSeriesForecasts.endDate, parsedStartDate));
        }

        if (endDate) {
          const parsedEndDate = new Date(String(endDate));
          if (Number.isNaN(parsedEndDate.getTime())) {
            return res.status(400).json({ error: "Invalid endDate" });
          }
          conditions.push(lte(timeSeriesForecasts.startDate, parsedEndDate));
        }

        const forecasts = await db
          .select()
          .from(timeSeriesForecasts)
          .where(and(...conditions))
          .orderBy(desc(timeSeriesForecasts.createdAt));

        res.json(forecasts || []);
      } catch (e) {
        // If table doesn't exist yet, return empty array
        console.log("Forecasts table may not exist yet:", e);
        res.json([]);
      }
    } catch (error) {
      console.error("Error fetching forecasts:", error);
      res.status(500).json({ error: "Failed to fetch forecasts" });
    }
  });
  
  app.get("/api/analytics/competitor-trends", isAuthenticated, async (req, res) => {
    try {
      const vendorId = req.user?.vendorId || 1;
      const { competitorId, analysisType, period } = req.query;

      const parsedCompetitorId = competitorId ? Number(competitorId) : undefined;
      if (competitorId && !Number.isFinite(parsedCompetitorId)) {
        return res.status(400).json({ error: "Invalid competitorId" });
      }

      const requestedPeriod = typeof period === "string" ? period : "monthly";
      const requestedAnalysisType = typeof analysisType === "string" ? analysisType : undefined;

      const periodStart = new Date();
      switch (requestedPeriod) {
        case "daily":
          periodStart.setDate(periodStart.getDate() - 1);
          break;
        case "weekly":
          periodStart.setDate(periodStart.getDate() - 7);
          break;
        case "quarterly":
          periodStart.setMonth(periodStart.getMonth() - 3);
          break;
        case "yearly":
          periodStart.setFullYear(periodStart.getFullYear() - 1);
          break;
        case "monthly":
        default:
          periodStart.setMonth(periodStart.getMonth() - 1);
          break;
      }

      const priceConditions = [
        eq(competitors.vendorId, vendorId),
        gte(competitorPrices.timestamp, periodStart),
      ];

      if (parsedCompetitorId) {
        priceConditions.push(eq(competitors.id, parsedCompetitorId));
      }

      const rawPrices = await db
        .select({
          competitorId: competitors.id,
          competitorName: competitors.name,
          productId: competitorProducts.productId,
          price: competitorPrices.price,
          timestamp: competitorPrices.timestamp,
        })
        .from(competitorPrices)
        .innerJoin(competitorProducts, eq(competitorPrices.competitorProductId, competitorProducts.id))
        .innerJoin(competitors, eq(competitorProducts.competitorId, competitors.id))
        .where(and(...priceConditions))
        .orderBy(desc(competitorPrices.timestamp));

      const groupedByCompetitor = rawPrices.reduce<Record<number, typeof rawPrices>>((acc, entry) => {
        if (!acc[entry.competitorId]) {
          acc[entry.competitorId] = [];
        }
        acc[entry.competitorId].push(entry);
        return acc;
      }, {});

      const trends = Object.entries(groupedByCompetitor).flatMap(([key, entries]) => {
        const competitorIdValue = Number(key);
        const numericPrices = entries
          .map((entry) => Number(entry.price))
          .filter((value) => Number.isFinite(value));

        if (numericPrices.length === 0) {
          return [];
        }

        const latest = entries[0];
        const earliest = entries[entries.length - 1];
        const averagePrice = numericPrices.reduce((sum, value) => sum + value, 0) / numericPrices.length;
        const changeRate = numericPrices.length > 1 && Number(earliest.price) > 0
          ? (Number(latest.price) - Number(earliest.price)) / Number(earliest.price)
          : 0;
        const productCount = new Set(entries.map((entry) => entry.productId)).size;
        const priceRanking = Math.round(averagePrice);

        const baseTrend = {
          vendorId,
          competitorId: competitorIdValue,
          period: requestedPeriod,
          startDate: periodStart.toISOString(),
          endDate: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const generated = [
          {
            ...baseTrend,
            id: Number(`${competitorIdValue}1`),
            analysisType: "price_volatility",
            metrics: {
              changeRate: changeRate.toFixed(4),
              averagePrice: averagePrice.toFixed(2),
              productCount: numericPrices.length,
              priceRanking,
            },
            insights: `${latest.competitorName} has ${numericPrices.length} recorded competitor price snapshots for the selected ${requestedPeriod} window.`,
          },
          {
            ...baseTrend,
            id: Number(`${competitorIdValue}2`),
            analysisType: "market_share",
            metrics: {
              changeRate: changeRate.toFixed(4),
              averagePrice: averagePrice.toFixed(2),
              productCount,
              priceRanking,
            },
            insights: `${latest.competitorName} is linked to ${productCount} tracked product${productCount === 1 ? "" : "s"} in your catalog.`,
          },
          {
            ...baseTrend,
            id: Number(`${competitorIdValue}3`),
            analysisType: "product_launch",
            metrics: {
              changeRate: changeRate.toFixed(4),
              averagePrice: averagePrice.toFixed(2),
              productCount,
              priceRanking,
            },
            insights: `${latest.competitorName} has ${numericPrices.length} observed pricing updates in the selected ${requestedPeriod} window.`,
          },
        ];

        return requestedAnalysisType
          ? generated.filter((entry) => entry.analysisType === requestedAnalysisType)
          : generated;
      });

      res.json(trends);
    } catch (error) {
      console.error("Error fetching competitor trends:", error);
      res.status(500).json({ error: "Failed to fetch competitor trends" });
    }
  });
  
  // Generate sample data for advanced analytics
  app.post("/api/analytics/generate-sample-data", isAuthenticated, async (req, res) => {
    try {
      console.log("Generating sample analytics data...");
      const vendorId = req.user?.vendorId || 1;
      
      // Get products
      const productsData = await db
        .select()
        .from(products)
        .where(eq(products.vendorId, vendorId))
        .limit(5);
      
      console.log(`Found ${productsData.length} products for sample data generation`);
      
      if (productsData.length === 0) {
        return res.status(400).json({ error: "No products found to generate analytics for" });
      }
      
      // Get competitors for optional competitor trend generation
      let competitorsData = await db
        .select()
        .from(competitors)
        .where(eq(competitors.vendorId, vendorId))
        .limit(3);

      if (competitorsData.length === 0) {
        competitorsData = await db
          .insert(competitors)
          .values([
            {
              vendorId,
              name: "MarketMart",
              website: "https://marketmart.example.com",
              marketShare: "18.50",
              priceIndex: "0.96",
              isActive: true,
              lastScanned: new Date(),
            },
            {
              vendorId,
              name: "ValueHub",
              website: "https://valuehub.example.com",
              marketShare: "12.25",
              priceIndex: "0.91",
              isActive: true,
              lastScanned: new Date(),
            },
            {
              vendorId,
              name: "PremiumPoint",
              website: "https://premiumpoint.example.com",
              marketShare: "9.75",
              priceIndex: "1.08",
              isActive: true,
              lastScanned: new Date(),
            },
          ])
          .returning();
      }
      
      console.log(`Found ${competitorsData.length} competitors for sample data generation`);
      
      // Clear existing competitor trend data for this vendor
      try {
        await db
          .delete(competitorTrendAnalysis)
          .where(eq(competitorTrendAnalysis.vendorId, vendorId));
        console.log("Cleared existing competitor trend data");
      } catch (error) {
        console.log("No existing competitor trend data to clear or table doesn't exist yet");
      }
      
      // Generate performance metrics for each product
      const performanceMetrics = [];
      const periods = ["daily", "weekly", "monthly"];
      
      for (const product of productsData) {
        for (const period of periods) {
          let startDate, endDate;
          
          if (period === "daily") {
            endDate = new Date();
            startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - 1);
          } else if (period === "weekly") {
            endDate = new Date();
            startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - 7);
          } else {
            endDate = new Date();
            startDate = new Date(endDate);
            startDate.setMonth(startDate.getMonth() - 1);
          }
          
          performanceMetrics.push({
            product_id: product.id,
            vendor_id: vendorId,
            period,
            sales_volume: Math.floor(Math.random() * 1000),
            revenue: (Math.random() * 10000).toFixed(2),
            profit_margin: (Math.random() * 0.4 + 0.1).toFixed(2),
            inventory_turnover: (Math.random() * 10).toFixed(2),
            average_rating: (Math.random() * 2 + 3).toFixed(1),
            return_rate: (Math.random() * 0.1).toFixed(2),
            click_through_rate: (Math.random() * 0.2 + 0.05).toFixed(2),
            conversion_rate: (Math.random() * 0.15 + 0.02).toFixed(2),
            start_date: startDate,
            end_date: endDate
          });
        }
      }
      
      console.log(`Generated ${performanceMetrics.length} performance metrics`);
      
      // Generate forecasts for each product
      const forecasts = [];
      const forecastTypes = ["price", "sales", "inventory"];
      const forecastMethods = ["linear_regression", "moving_average", "exponential_smoothing", "arima"];
      
      for (const product of productsData) {
        for (const forecastType of forecastTypes) {
          const method = forecastMethods[Math.floor(Math.random() * forecastMethods.length)];
          
          const forecastStartDate = new Date();
          const forecastEndDate = new Date(forecastStartDate);
          forecastEndDate.setMonth(forecastEndDate.getMonth() + 3);
          
          const forecastData = [];
          
          // Generate forecast points (30 days)
          for (let i = 0; i < 30; i++) {
            const date = new Date(forecastStartDate);
            date.setDate(date.getDate() + i);
            
            let value;
            if (forecastType === "price") {
              // Price trends slightly upward
              value = parseFloat(product.basePrice) * (1 + (Math.random() * 0.2 - 0.05) * (i / 30));
            } else if (forecastType === "sales") {
              // Sales varies but trends upward
              value = 100 + Math.sin(i / 5) * 20 + i * 2;
            } else {
              // Inventory decreases
              value = 500 - i * 10 + Math.random() * 50;
            }
            
            forecastData.push({
              date: date.toISOString().split('T')[0],
              value: value.toFixed(2),
              lowerBound: (value * 0.9).toFixed(2),
              upperBound: (value * 1.1).toFixed(2)
            });
          }
          
          forecasts.push({
            product_id: product.id,
            vendor_id: vendorId,
            forecast_type: forecastType,
            method,
            parameters: { alpha: 0.3, beta: 0.1 },
            forecast_data: forecastData,
            confidence_interval: { lower: 0.9, upper: 1.1 },
            accuracy: (0.7 + Math.random() * 0.25).toFixed(2),
            start_date: forecastStartDate,
            end_date: forecastEndDate
          });
        }
      }
      
      console.log(`Generated ${forecasts.length} forecasts`);
      
      // Generate competitor trends
      const trends = [];
      const analysisTypes = ["price_volatility", "market_share", "product_launch"];
      
      if (competitorsData.length > 0) {
        for (const competitor of competitorsData) {
          for (const analysisType of analysisTypes) {
            for (const period of periods) {
              let startDate, endDate;
              
              if (period === "daily") {
                endDate = new Date();
                startDate = new Date(endDate);
                startDate.setDate(startDate.getDate() - 1);
              } else if (period === "weekly") {
                endDate = new Date();
                startDate = new Date(endDate);
                startDate.setDate(startDate.getDate() - 7);
              } else {
                endDate = new Date();
                startDate = new Date(endDate);
                startDate.setMonth(startDate.getMonth() - 1);
              }
              
              const metrics = {
                changeRate: (Math.random() * 0.3 - 0.1).toFixed(2),
                averagePrice: (Math.random() * 100 + 50).toFixed(2),
                productCount: Math.floor(Math.random() * 100 + 10),
                priceRanking: Math.floor(Math.random() * 10 + 1)
              };
              
              const insights = [
                "Competitor prices are trending upward",
                "New product launches detected",
                "Increased promotional activity observed",
                "Price volatility has decreased"
              ];
              
              trends.push({
                vendor_id: vendorId,
                competitor_id: competitor.id,
                analysis_type: analysisType,
                period,
                metrics,
                insights: insights[Math.floor(Math.random() * insights.length)],
                start_date: startDate,
                end_date: endDate
              });
            }
          }
        }
      }
      
      console.log(`Generated ${trends.length} competitor trends`);
      
      try {
        console.log("Inserting performance metrics...");
        if (performanceMetrics.length > 0) {
          await db.delete(productPerformanceMetrics).where(eq(productPerformanceMetrics.vendorId, vendorId));
          await db.insert(productPerformanceMetrics).values(
            performanceMetrics.map((metric) => ({
              vendorId: metric.vendor_id,
              productId: metric.product_id,
              period: metric.period,
              salesVolume: metric.sales_volume,
              revenue: metric.revenue,
              profitMargin: metric.profit_margin,
              inventoryTurnover: metric.inventory_turnover,
              averageRating: metric.average_rating,
              returnRate: metric.return_rate,
              clickThroughRate: metric.click_through_rate,
              conversionRate: metric.conversion_rate,
              startDate: metric.start_date,
              endDate: metric.end_date,
              createdAt: new Date(),
              updatedAt: new Date(),
            }))
          );
          console.log("Performance metrics inserted successfully");
        }
        
        console.log("Inserting forecasts...");
        if (forecasts.length > 0) {
          await db.delete(timeSeriesForecasts).where(eq(timeSeriesForecasts.vendorId, vendorId));
          await db.insert(timeSeriesForecasts).values(
            forecasts.map((forecast) => ({
              vendorId: forecast.vendor_id,
              productId: forecast.product_id,
              forecastType: forecast.forecast_type,
              method: forecast.method as any,
              parameters: forecast.parameters,
              forecastData: forecast.forecast_data,
              confidenceInterval: forecast.confidence_interval,
              accuracy: forecast.accuracy,
              startDate: forecast.start_date,
              endDate: forecast.end_date,
              createdAt: new Date(),
              updatedAt: new Date(),
            }))
          );
          console.log("Forecasts inserted successfully");
        }
        
        console.log("Inserting competitor trends...");
        if (trends.length > 0) {
          await db.delete(competitorTrendAnalysis).where(eq(competitorTrendAnalysis.vendorId, vendorId));
          await db.insert(competitorTrendAnalysis).values(
            trends.map((trend) => ({
              vendorId: trend.vendor_id,
              competitorId: trend.competitor_id,
              analysisType: trend.analysis_type,
              period: trend.period,
              metrics: trend.metrics,
              insights: [trend.insights],
              startDate: trend.start_date,
              endDate: trend.end_date,
              createdAt: new Date(),
              updatedAt: new Date(),
            }))
          );
          console.log("Competitor trends inserted successfully");
        }
        
        console.log("Sample data generation completed successfully");
        
        res.json({ 
          success: true, 
          message: "Demo analytics data generated successfully",
          counts: {
            performanceMetrics: performanceMetrics.length,
            forecasts: forecasts.length,
            competitorTrends: trends.length
          },
          skipped: competitorsData.length === 0 ? ["competitorTrends"] : []
        });
      } catch (insertError) {
        console.error("Error inserting analytics data:", insertError);
        res.status(500).json({ 
          error: "Failed to insert analytics data", 
          details: insertError.message
        });
      }
    } catch (error) {
      console.error("Error generating demo analytics data:", error);
      res.status(500).json({ 
        error: "Failed to generate demo analytics data",
        details: error.message  
      });
    }
  });

  // AI Pricing Assistant endpoints
  app.post('/api/pricing/ai-chat', isAuthenticated, async (req, res) => {
    try {
      const { message, productId, parameters } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }
      
      // Get product info if productId is provided
      let productInfo = null;
      if (productId) {
        const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
        if (product) {
          productInfo = product;
        }
      }
      
      // Import the AI pricing assistant service
      const { handleUserMessage } = await import('./services/pricing-assistant');
      
      // Process the message
      const response = await handleUserMessage(req.user.id, message, productInfo, parameters);
      
      res.json(response);
    } catch (error) {
      console.error('Error processing AI chat:', error);
      res.status(500).json({ error: 'Failed to process chat message' });
    }
  });
  
  app.post('/api/pricing/ai-recommendation', isAuthenticated, async (req, res) => {
    try {
      console.log('AI Recommendation request received:', req.body);
      const { 
        productId, 
        category, 
        targetMargin, 
        competitorFocus, 
        demandElasticity, 
        marketShare,
        prompt 
      } = req.body;
      
      if (!productId) {
        return res.status(400).json({ error: 'Product ID is required' });
      }
      
      // Import the pricing assistant service
      const { getPricingRecommendation } = await import('./services/pricing-assistant');
      
      // Get the recommendation
      const recommendation = await getPricingRecommendation(req.user.id, productId, {
        category,
        targetMargin,
        competitorFocus,
        demandElasticity,
        marketShare,
        prompt
      });
      
      res.json(recommendation);
    } catch (error) {
      console.error('Error generating AI recommendation:', error);
      res.status(500).json({ error: 'Failed to generate recommendation' });
    }
  });
      
  /* Old implementation - replaced with new version above
  app.post('/api/pricing/ai-recommendation-old', isAuthenticated, async (req, res) => {
    try {
      console.log('AI Recommendation request received:', req.body);
      const { 
        productId, 
        category, 
        targetMargin, 
        competitorFocus, 
        demandElasticity, 
        marketShare,
        prompt 
      } = req.body;
      
      // Get additional product and market data to inform the recommendation
      let productData = {};
      let competitorData = {};
      let marketData = {};
      let avgProductPrice = 0;
      let avgCompetitorPrice = 0;
      let priceTrend = 0;
      
      // Get product data if productId is provided
      if (productId) {
        const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
        if (product) {
          productData = product;
          avgProductPrice = parseFloat(product.currentPrice);
          
          // Get competitor prices for this product
          const competitorPricesData = await db
            .select()
            .from(competitorPrices)
            .where(eq(competitorPrices.competitorProductId, productId))
            .orderBy(desc(competitorPrices.timestamp))
            .limit(10);
            
          if (competitorPricesData.length > 0) {
            competitorData = competitorPricesData;
            avgCompetitorPrice = competitorPricesData.reduce((sum, item) => 
              sum + parseFloat(item.price), 0) / competitorPricesData.length;
          }
          
          // Get price history for this product
          const priceHistoryData = await db
            .select()
            .from(priceHistory)
            .where(eq(priceHistory.productId, productId))
            .orderBy(desc(priceHistory.timestamp))
            .limit(10);
            
          if (priceHistoryData.length > 2) {
            marketData = {
              priceHistory: priceHistoryData
            };
            
            // Calculate price trend (positive or negative)
            const oldestPrice = parseFloat(priceHistoryData[priceHistoryData.length - 1].newPrice);
            const newestPrice = parseFloat(priceHistoryData[0].newPrice);
            priceTrend = ((newestPrice - oldestPrice) / oldestPrice) * 100;
          }
        }
      }
      
      // Get sample product data for the given category if no productId
      if (!productId && category && category !== 'all') {
        const categoryProducts = await db
          .select()
          .from(products)
          .where(eq(products.category, category))
          .limit(5);
          
        if (categoryProducts.length > 0) {
          productData = {
            categoryProducts
          };
          
          // Calculate average price for the category
          avgProductPrice = categoryProducts.reduce((sum, product) => 
            sum + parseFloat(product.currentPrice), 0) / categoryProducts.length;
            
          // Get competitor prices for the category
          const competitorIds = categoryProducts.map(p => p.id);
          if (competitorIds.length > 0) {
            const competitorPricesData = await db
              .select()
              .from(competitorPrices)
              .where(inArray(competitorPrices.competitorProductId, competitorIds))
              .orderBy(desc(competitorPrices.timestamp))
              .limit(20);
              
            if (competitorPricesData.length > 0) {
              competitorData = competitorPricesData;
              avgCompetitorPrice = competitorPricesData.reduce((sum, item) => 
                sum + parseFloat(item.price), 0) / competitorPricesData.length;
            }
          }
        }
      }
      
      // Import the AI service for Anthropic integration
      const { generateAIRecommendation } = await import('./services/ai');
      
      // Try to get AI-generated recommendation
      const aiRecommendation = await generateAIRecommendation({
        targetMargin,
        competitorFocus,
        demandElasticity,
        marketShare,
        avgProductPrice,
        avgCompetitorPrice,
        priceTrend,
        category,
        productData,
        competitorData,
        marketData,
        prompt
      });
      
      // If AI recommendation was successful, return it
      if (aiRecommendation) {
        console.log('Using AI-generated pricing recommendation');
        res.json(aiRecommendation);
        return;
      } 
      
      // Otherwise fall back to the simulation-based approach
      console.log('Falling back to simulation-based pricing recommendation');
      const recommendation = generatePricingRecommendation({
        targetMargin,
        competitorFocus,
        demandElasticity,
        marketShare,
        avgProductPrice,
        avgCompetitorPrice,
        priceTrend,
        category,
        productData,
        competitorData,
        marketData
      });
      
      res.json(recommendation);
    } catch (error) {
      console.error('Error generating price recommendation:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error details:', errorMessage);
      
      res.status(500).json({ 
        error: 'Failed to generate pricing recommendation', 
        details: errorMessage 
      });
    }
  });
  */
  
  // Helper function to generate a simulated pricing recommendation
  function generatePricingRecommendation(params: {
    targetMargin: number;
    competitorFocus: boolean;
    demandElasticity: number;
    marketShare: boolean;
    avgProductPrice: number;
    avgCompetitorPrice: number;
    priceTrend: number;
    category: string;
    productData: any;
    competitorData: any;
    marketData: any;
  }) {
    const { 
      targetMargin, 
      competitorFocus, 
      demandElasticity, 
      marketShare,
      avgProductPrice,
      avgCompetitorPrice,
      priceTrend,
      category
    } = params;
    
    // Initialize random factors with seeds based on input parameters to ensure consistency
    const confidenceSeed = (targetMargin * 0.5) + (demandElasticity * 10) + (competitorFocus ? 15 : 0) + (marketShare ? 10 : 0);
    const confidenceBase = Math.min(Math.max(50 + confidenceSeed, 55), 95);
    const confidence = Math.floor(confidenceBase);
    
    // Calculate optimal price adjustment based on inputs
    let priceAdjustmentBase = 0;
    
    // Factor 1: Target margin influence
    if (targetMargin > 30) {
      priceAdjustmentBase += (targetMargin - 30) * 0.15;
    } else if (targetMargin < 30) {
      priceAdjustmentBase -= (30 - targetMargin) * 0.1;
    }
    
    // Factor 2: Competitor focus influence
    if (competitorFocus && avgCompetitorPrice > 0 && avgProductPrice > 0) {
      const priceDifference = ((avgProductPrice - avgCompetitorPrice) / avgCompetitorPrice) * 100;
      if (priceDifference > 5) {
        // Our price is higher than competitors
        priceAdjustmentBase -= Math.min(priceDifference * 0.3, 5);
      } else if (priceDifference < -5) {
        // Our price is lower than competitors
        priceAdjustmentBase += Math.min(Math.abs(priceDifference) * 0.2, 3);
      }
    }
    
    // Factor 3: Demand elasticity influence
    // Higher elasticity means price changes have larger impact on demand
    const elasticityFactor = (demandElasticity - 5) * 0.3;
    if (elasticityFactor > 0) {
      priceAdjustmentBase -= elasticityFactor; // More elastic demand suggests lower prices
    } else {
      priceAdjustmentBase += Math.abs(elasticityFactor) * 0.5; // Less elastic demand can handle higher prices
    }
    
    // Factor 4: Market share goal influence
    if (marketShare) {
      priceAdjustmentBase -= 1.5; // Prioritizing market share suggests lower prices
    }
    
    // Factor 5: Historical price trend influence
    if (priceTrend !== 0) {
      // If prices have been rising, suggest a smaller increase or even a decrease
      if (priceTrend > 5) {
        priceAdjustmentBase -= priceTrend * 0.1;
      } 
      // If prices have been falling, suggest a smaller decrease or an increase
      else if (priceTrend < -5) {
        priceAdjustmentBase -= priceTrend * 0.1; // Note: negative * negative = positive
      }
    }
    
    // Ensure the price adjustment is within reasonable bounds
    const finalPriceAdjustment = Math.min(Math.max(priceAdjustmentBase, -10), 10);
    const optimalPriceAdjustment = finalPriceAdjustment > 0 
      ? `+${finalPriceAdjustment.toFixed(1)}%` 
      : `${finalPriceAdjustment.toFixed(1)}%`;
    
    // Generate insights based on the parameters
    const insights = generateInsights({
      targetMargin,
      competitorFocus,
      demandElasticity,
      marketShare,
      priceAdjustment: finalPriceAdjustment,
      avgProductPrice,
      avgCompetitorPrice,
      priceTrend,
      category
    });
    
    // Generate competitor analysis
    const competitorAnalysis = generateCompetitorAnalysis({
      avgProductPrice,
      avgCompetitorPrice,
      competitorFocus,
      priceTrend
    });
    
    // Generate what-if scenarios
    const whatIfScenarios = generateWhatIfScenarios(finalPriceAdjustment, demandElasticity);
    
    return {
      recommendation: {
        optimalPriceAdjustment,
        confidence,
        rationale: generateRationale({
          targetMargin,
          competitorFocus,
          demandElasticity,
          marketShare,
          priceAdjustment: finalPriceAdjustment,
          avgProductPrice,
          avgCompetitorPrice,
          category
        })
      },
      insights,
      competitorAnalysis,
      whatIfScenarios
    };
  }
  
  // Helper function to generate insights
  function generateInsights(params: any) {
    const {
      targetMargin,
      competitorFocus,
      demandElasticity,
      marketShare,
      priceAdjustment,
      avgProductPrice,
      avgCompetitorPrice,
      priceTrend,
      category
    } = params;
    
    const insights = [];
    
    // Generate 5-6 insights based on the parameters
    if (competitorFocus && avgCompetitorPrice > 0) {
      const priceDifference = ((avgProductPrice - avgCompetitorPrice) / avgCompetitorPrice) * 100;
      if (priceDifference > 5) {
        insights.push(`Your current pricing is ${priceDifference.toFixed(1)}% higher than competitors, which may be limiting your market penetration.`);
      } else if (priceDifference < -5) {
        insights.push(`Your current pricing is ${Math.abs(priceDifference).toFixed(1)}% lower than competitors, which may be leaving profit on the table.`);
      } else {
        insights.push(`Your pricing is well-aligned with competitors (within ±5%), maintaining competitive positioning.`);
      }
    }
    
    if (targetMargin > 35) {
      insights.push(`Your target margin of ${targetMargin}% is higher than industry average. This strategy works best for premium or niche products with unique value propositions.`);
    } else if (targetMargin < 25) {
      insights.push(`Your target margin of ${targetMargin}% is lower than industry average, suggesting a volume-based strategy. Ensure your operational efficiency can support this approach.`);
    }
    
    if (demandElasticity > 7) {
      insights.push(`High demand elasticity (${demandElasticity}/10) indicates customers are very price-sensitive. Consider periodic promotions rather than permanent price changes.`);
    } else if (demandElasticity < 3) {
      insights.push(`Low demand elasticity (${demandElasticity}/10) suggests customers value your product regardless of price. Focus on quality and unique features to maintain this advantage.`);
    }
    
    if (priceTrend > 5) {
      insights.push(`Prices have increased by ${priceTrend.toFixed(1)}% recently. Monitor customer retention carefully to ensure price increases aren't driving customers away.`);
    } else if (priceTrend < -5) {
      insights.push(`Prices have decreased by ${Math.abs(priceTrend).toFixed(1)}% recently. Evaluate if this is sustainable and whether it's achieving the intended market objectives.`);
    }
    
    if (marketShare) {
      insights.push(`Your focus on market share over immediate profitability suggests a longer-term strategy. Ensure you have the financial runway to support this approach and clear KPIs to measure success.`);
    }
    
    // Category-specific insights
    if (category && category !== 'all') {
      const categoryInsights = {
        'electronics': `The electronics category typically allows for dynamic pricing strategies due to frequent model updates and varying consumer knowledge about fair pricing.`,
        'clothing': `Seasonal factors heavily influence clothing prices. Consider implementing more aggressive markdown strategies near the end of each season.`,
        'food': `Food products often benefit from psychological pricing (e.g. $3.99 vs $4.00) and bundle promotions to increase average transaction value.`,
        'home': `Home goods pricing should account for shipping costs, as these items often have lower margins when delivery is factored in.`,
        'beauty': `Beauty products typically support higher margins through brand positioning and loyalty programs that incentivize repeat purchases.`
      };
      
      if (categoryInsights[category]) {
        insights.push(categoryInsights[category]);
      }
    }
    
    // Ensure we have at least 4 insights
    if (insights.length < 4) {
      insights.push(`Regular price testing can help optimize your pricing strategy over time. Consider A/B testing different price points on a subset of products.`);
    }
    
    if (insights.length < 4) {
      insights.push(`Bundle pricing strategies can increase average order value while providing customers with perceived discounts.`);
    }
    
    return insights;
  }
  
  // Helper function to generate competitor analysis
  function generateCompetitorAnalysis(params: any) {
    const {
      avgProductPrice,
      avgCompetitorPrice,
      competitorFocus,
      priceTrend
    } = params;
    
    let positioningSummary = "Insufficient competitor data to determine market positioning.";
    let priceGap = "0%";
    let trendSummary = "Insufficient historical data to determine pricing trends.";
    
    if (avgCompetitorPrice > 0 && avgProductPrice > 0) {
      const priceDifference = ((avgProductPrice - avgCompetitorPrice) / avgCompetitorPrice) * 100;
      priceGap = `${priceDifference > 0 ? '+' : ''}${priceDifference.toFixed(1)}%`;
      
      if (priceDifference > 10) {
        positioningSummary = "Your products are positioned as premium offerings, significantly above competitor pricing. This suggests a quality or feature differentiation strategy.";
      } else if (priceDifference > 3) {
        positioningSummary = "Your products are priced moderately higher than competitors, suggesting slightly premium positioning while remaining competitive.";
      } else if (priceDifference < -10) {
        positioningSummary = "Your products are positioned as value offerings, significantly below competitor pricing. This suggests a market penetration or volume-based strategy.";
      } else if (priceDifference < -3) {
        positioningSummary = "Your products are priced moderately lower than competitors, suggesting a competitive pricing strategy focused on value.";
      } else {
        positioningSummary = "Your products are price-matched with competitors, suggesting a direct competitive strategy where differentiation must come from features, quality, or service.";
      }
    }
    
    if (priceTrend !== 0) {
      if (priceTrend > 5) {
        trendSummary = `Recent price trends show an upward movement of approximately ${priceTrend.toFixed(1)}%. This may indicate increasing costs, higher demand, or strategic repositioning in the market.`;
      } else if (priceTrend > 0) {
        trendSummary = `Recent price trends show a slight upward movement of approximately ${priceTrend.toFixed(1)}%, generally in line with inflation and market conditions.`;
      } else if (priceTrend < -5) {
        trendSummary = `Recent price trends show a significant downward movement of approximately ${Math.abs(priceTrend).toFixed(1)}%. This may indicate increasing competition, changing market dynamics, or strategic efforts to gain market share.`;
      } else {
        trendSummary = `Recent price trends show a slight downward movement of approximately ${Math.abs(priceTrend).toFixed(1)}%, which may be seasonal or part of a tactical promotional strategy.`;
      }
    }
    
    return {
      positioningSummary,
      priceGap,
      trendSummary
    };
  }
  
  // Helper function to generate what-if scenarios
  function generateWhatIfScenarios(recommendedAdjustment: number, demandElasticity: number) {
    // Define three different price change scenarios: conservative, recommended, and aggressive
    const scenarios = [];
    
    // Factor to convert price elasticity to estimated volume changes
    const elasticityImpact = demandElasticity / 5;
    
    // Conservative scenario (smaller change)
    const conservativeChange = recommendedAdjustment / 2;
    scenarios.push({
      name: "Conservative Adjustment",
      priceChange: `${conservativeChange > 0 ? '+' : ''}${conservativeChange.toFixed(1)}%`,
      estimatedImpact: {
        revenue: `${(conservativeChange - (conservativeChange * elasticityImpact * 0.5)).toFixed(1)}%`,
        margin: `${(conservativeChange * 0.8).toFixed(1)}%`,
        salesVolume: `${(-conservativeChange * elasticityImpact * 0.5).toFixed(1)}%`,
        totalProfit: `${(conservativeChange - (conservativeChange * elasticityImpact * 0.3)).toFixed(1)}%`
      },
      riskLevel: Math.abs(conservativeChange) < 3 ? "Very Low" : "Low"
    });
    
    // Recommended scenario
    scenarios.push({
      name: "Recommended Adjustment",
      priceChange: `${recommendedAdjustment > 0 ? '+' : ''}${recommendedAdjustment.toFixed(1)}%`,
      estimatedImpact: {
        revenue: `${(recommendedAdjustment - (recommendedAdjustment * elasticityImpact * 0.7)).toFixed(1)}%`,
        margin: `${(recommendedAdjustment * 1.2).toFixed(1)}%`,
        salesVolume: `${(-recommendedAdjustment * elasticityImpact * 0.7).toFixed(1)}%`,
        totalProfit: `${(recommendedAdjustment - (recommendedAdjustment * elasticityImpact * 0.4)).toFixed(1)}%`
      },
      riskLevel: Math.abs(recommendedAdjustment) < 3 ? "Low" : (Math.abs(recommendedAdjustment) < 7 ? "Medium" : "High")
    });
    
    // Aggressive scenario (larger change)
    const aggressiveChange = recommendedAdjustment * 1.5;
    scenarios.push({
      name: "Aggressive Adjustment",
      priceChange: `${aggressiveChange > 0 ? '+' : ''}${aggressiveChange.toFixed(1)}%`,
      estimatedImpact: {
        revenue: `${(aggressiveChange - (aggressiveChange * elasticityImpact)).toFixed(1)}%`,
        margin: `${(aggressiveChange * 1.7).toFixed(1)}%`,
        salesVolume: `${(-aggressiveChange * elasticityImpact).toFixed(1)}%`,
        totalProfit: `${(aggressiveChange - (aggressiveChange * elasticityImpact * 0.6)).toFixed(1)}%`
      },
      riskLevel: Math.abs(aggressiveChange) < 5 ? "Medium" : (Math.abs(aggressiveChange) < 10 ? "High" : "Very High")
    });
    
    return scenarios;
  }
  
  // Helper function to generate rationale
  function generateRationale(params: any) {
    const {
      targetMargin,
      competitorFocus,
      demandElasticity,
      marketShare,
      priceAdjustment,
      avgProductPrice,
      avgCompetitorPrice,
      category
    } = params;
    
    let rationale = `Based on the analysis of your pricing parameters, a ${priceAdjustment > 0 ? 'price increase' : 'price decrease'} of ${Math.abs(priceAdjustment).toFixed(1)}% is recommended. `;
    
    // Add details about the key factors influencing this recommendation
    let factors = [];
    
    if (targetMargin) {
      factors.push(`your target margin of ${targetMargin}%`);
    }
    
    if (competitorFocus && avgCompetitorPrice > 0) {
      const priceDifference = ((avgProductPrice - avgCompetitorPrice) / avgCompetitorPrice) * 100;
      factors.push(`your current ${priceDifference > 0 ? 'premium' : 'discount'} positioning relative to competitors (${priceDifference.toFixed(1)}%)`);
    }
    
    if (demandElasticity) {
      const elasticityDescription = demandElasticity > 7 ? 'high' : (demandElasticity < 4 ? 'low' : 'moderate');
      factors.push(`${elasticityDescription} price sensitivity (${demandElasticity}/10)`);
    }
    
    if (marketShare) {
      factors.push(`your focus on market share growth`);
    }
    
    if (category && category !== 'all') {
      factors.push(`typical pricing dynamics in the ${category} category`);
    }
    
    if (factors.length > 0) {
      rationale += `This recommendation takes into account ${factors.join(', ')}. `;
    }
    
    // Add explanation about the expected outcome
    if (priceAdjustment > 0) {
      rationale += `The suggested price increase should help improve margins while maintaining a competitive market position. `;
      if (demandElasticity > 7) {
        rationale += `However, due to high price sensitivity, closely monitor sales volume after implementation.`;
      } else {
        rationale += `Given the moderate to low price sensitivity, this adjustment should have minimal impact on sales volume.`;
      }
    } else if (priceAdjustment < 0) {
      rationale += `The suggested price decrease should help improve market penetration and sales volume. `;
      if (targetMargin > 30) {
        rationale += `While this may temporarily reduce margins, it aligns with a strategic approach to grow market share while maintaining acceptable profitability.`;
      } else {
        rationale += `Ensure operational efficiency is optimized to maintain profitability at these lower price points.`;
      }
    } else {
      rationale += `Current pricing appears optimal given the analyzed factors. Continue monitoring market conditions and competitor pricing for future adjustments.`;
    }
    
    return rationale;
  }

  // Vendor Health Dashboard API
  app.get("/api/vendor-health", isAuthenticated, async (req, res) => {
    try {
      const vendorId = getVendorHealthVendorId(req, res);
      if (!vendorId) return;

      res.json(await buildVendorHealthPayload(vendorId));
    } catch (error) {
      console.error("Error fetching vendor health data:", error);
      res.status(500).json({ error: "Failed to fetch vendor health data" });
    }
  });
  
  app.post("/api/vendor-recommendations/implement", isAuthenticated, async (req, res) => {
    try {
      const { recommendationId } = req.body;
      const vendorId = req.user?.vendorId;
      
      if (!recommendationId) {
        return res.status(400).json({ error: "Recommendation ID is required" });
      }

      if (!vendorId) {
        return res.status(403).json({ error: "You must be associated with a vendor to implement a recommendation" });
      }

      const healthData = await buildVendorHealthPayload(vendorId);
      const recommendation = healthData.recommendations.find((entry) => entry.id === recommendationId);

      if (!recommendation) {
        return res.status(404).json({ error: "Recommendation not found for this vendor" });
      }
      
      res.status(200).json({ 
        success: true,
        message: "Recommendation acknowledged",
        recommendation,
      });
    } catch (error) {
      console.error("Error implementing recommendation:", error);
      res.status(500).json({ error: "Failed to implement recommendation" });
    }
  });

  // Supplier Management API Endpoints
  
  // Get all suppliers for the vendor
  app.get("/api/suppliers", isAuthenticated, async (req, res) => {
    try {
      // Check if a specific vendor ID is requested
      const queryVendorId = req.query.vendorId ? parseInt(req.query.vendorId as string) : null;
      
      // If a specific vendor ID is requested, verify access permissions
      if (queryVendorId) {
        // Only allow admin users or users associated with the requested vendor
        if (req.user?.role !== 'admin' && req.user?.vendorId !== queryVendorId) {
          return res.status(403).json({ message: "You don't have access to this vendor's suppliers" });
        }
      } else if (!req.user?.vendorId) {
        // If no specific vendor requested and user is not associated with any vendor
        return res.status(403).json({ message: "You must be associated with a vendor to access supplier data" });
      }
      
      // Use the requested vendor ID if provided, otherwise use the user's vendor ID
      const vendorId = queryVendorId || req.user?.vendorId;
      const result = await db.select().from(suppliers).where(eq(suppliers.vendorId, vendorId));
      res.status(200).json(result);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
      res.status(500).json({ error: "Failed to fetch suppliers" });
    }
  });

  // Get a specific supplier by ID
  app.get("/api/suppliers/:id", isAuthenticated, async (req, res) => {
    try {
      const supplierId = parseInt(req.params.id);
      
      // Check if a specific vendor ID is requested in the query
      const queryVendorId = req.query.vendorId ? parseInt(req.query.vendorId as string) : null;
      
      // If a specific vendor ID is requested, verify access permissions
      if (queryVendorId) {
        // Only allow admin users or users associated with the requested vendor
        if (req.user?.role !== 'admin' && req.user?.vendorId !== queryVendorId) {
          return res.status(403).json({ message: "You don't have access to this vendor's suppliers" });
        }
      } else if (!req.user?.vendorId) {
        // If no specific vendor requested and user is not associated with any vendor
        return res.status(403).json({ message: "You must be associated with a vendor to access supplier data" });
      }
      
      // Use the requested vendor ID if provided, otherwise use the user's vendor ID
      const vendorId = queryVendorId || req.user?.vendorId;
      
      const [result] = await db.select()
        .from(suppliers)
        .where(
          and(
            eq(suppliers.id, supplierId),
            eq(suppliers.vendorId, vendorId)
          )
        )
        .limit(1);
      
      if (!result) {
        return res.status(404).json({ error: "Supplier not found" });
      }
      
      res.status(200).json(result);
    } catch (error) {
      console.error("Error fetching supplier:", error);
      res.status(500).json({ error: "Failed to fetch supplier" });
    }
  })
  
  // Create a new supplier
  app.post("/api/suppliers", isAuthenticated, async (req, res) => {
    try {
      const vendorId = req.user?.vendorId || 1;
      
      // Validate the request body using the schema
      const validatedData = { ...req.body, vendorId };
      
      // Insert the new supplier
      const [newSupplier] = await db
        .insert(suppliers)
        .values(validatedData)
        .returning();
      
      res.status(201).json(newSupplier);
    } catch (error) {
      console.error("Error creating supplier:", error);
      res.status(500).json({ 
        error: "Failed to create supplier",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Update an existing supplier
  app.put("/api/suppliers/:id", isAuthenticated, async (req, res) => {
    try {
      const supplierId = parseInt(req.params.id);
      
      // Get the vendor ID from the authenticated user
      const userVendorId = req.user?.vendorId;
      
      // Check if the user is authorized to update this supplier
      if (!userVendorId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "You must be associated with a vendor to update suppliers" });
      }
      
      // Find the supplier to verify ownership
      const [supplier] = await db
        .select()
        .from(suppliers)
        .where(eq(suppliers.id, supplierId))
        .limit(1);
      
      if (!supplier) {
        return res.status(404).json({ error: "Supplier not found" });
      }
      
      // Verify that the supplier belongs to the user's vendor or user is admin
      if (supplier.vendorId !== userVendorId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "You don't have permission to update this supplier" });
      }
      
      // Prepare update data, preserving the original vendorId
      const updateData = { 
        ...req.body,
        vendorId: supplier.vendorId, // Ensure vendorId doesn't change
        updatedAt: new Date()
      };
      
      // Remove id from update data if present
      delete updateData.id;
      
      // Update the supplier
      const [updatedSupplier] = await db
        .update(suppliers)
        .set(updateData)
        .where(eq(suppliers.id, supplierId))
        .returning();
      
      res.status(200).json(updatedSupplier);
    } catch (error) {
      console.error("Error updating supplier:", error);
      res.status(500).json({ 
        error: "Failed to update supplier",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Delete a supplier
  app.delete("/api/suppliers/:id", isAuthenticated, async (req, res) => {
    try {
      const supplierId = parseInt(req.params.id);
      
      // Get the vendor ID from the authenticated user
      const userVendorId = req.user?.vendorId;
      
      // Check if the user is authorized to delete this supplier
      if (!userVendorId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "You must be associated with a vendor to delete suppliers" });
      }
      
      // Find the supplier to verify ownership
      const [supplier] = await db
        .select()
        .from(suppliers)
        .where(eq(suppliers.id, supplierId))
        .limit(1);
      
      if (!supplier) {
        return res.status(404).json({ error: "Supplier not found" });
      }
      
      // Verify that the supplier belongs to the user's vendor or user is admin
      if (supplier.vendorId !== userVendorId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "You don't have permission to delete this supplier" });
      }
      
      // Delete the supplier
      await db
        .delete(suppliers)
        .where(eq(suppliers.id, supplierId));
      
      res.status(200).json({ message: "Supplier deleted successfully" });
    } catch (error) {
      console.error("Error deleting supplier:", error);
      res.status(500).json({ 
        error: "Failed to delete supplier",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get supplier performance metrics
  app.get("/api/supplier-performance/:supplierId", isAuthenticated, async (req, res) => {
    try {
      const supplierId = parseInt(req.params.supplierId);
      
      // Check if a specific vendor ID is requested in the query
      const queryVendorId = req.query.vendorId ? parseInt(req.query.vendorId as string) : null;
      
      // If a specific vendor ID is requested, verify access permissions
      if (queryVendorId) {
        // Only allow admin users or users associated with the requested vendor
        if (req.user?.role !== 'admin' && req.user?.vendorId !== queryVendorId) {
          return res.status(403).json({ message: "You don't have access to this vendor's supplier performance data" });
        }
      } else if (!req.user?.vendorId) {
        // If no specific vendor requested and user is not associated with any vendor
        return res.status(403).json({ message: "You must be associated with a vendor to access supplier performance data" });
      }
      
      // Use the requested vendor ID if provided, otherwise use the user's vendor ID
      const vendorId = queryVendorId || req.user?.vendorId;
      
      // Find the most recent performance record for this supplier
      const [result] = await db.select()
        .from(supplierPerformance)
        .where(
          and(
            eq(supplierPerformance.supplierId, supplierId),
            eq(supplierPerformance.vendorId, vendorId)
          )
        )
        .orderBy(desc(supplierPerformance.metricDate))
        .limit(1);
      
      if (!result) {
        return res.status(404).json({ error: "Supplier performance metrics not found" });
      }
      
      res.status(200).json(result);
    } catch (error) {
      console.error("Error fetching supplier performance:", error);
      res.status(500).json({ error: "Failed to fetch supplier performance metrics" });
    }
  });

  // Get supplier cost history
  app.get("/api/supplier-costs", isAuthenticated, async (req, res) => {
    try {
      const supplierId = parseInt(req.query.supplierId as string);
      
      if (!supplierId) {
        return res.status(400).json({ error: "Supplier ID is required" });
      }
      
      // Check if a specific vendor ID is requested in the query
      const queryVendorId = req.query.vendorId ? parseInt(req.query.vendorId as string) : null;
      
      // If a specific vendor ID is requested, verify access permissions
      if (queryVendorId) {
        // Only allow admin users or users associated with the requested vendor
        if (req.user?.role !== 'admin' && req.user?.vendorId !== queryVendorId) {
          return res.status(403).json({ message: "You don't have access to this vendor's supplier cost data" });
        }
      } else if (!req.user?.vendorId) {
        // If no specific vendor requested and user is not associated with any vendor
        return res.status(403).json({ message: "You must be associated with a vendor to access supplier cost data" });
      }
      
      // Use the requested vendor ID if provided, otherwise use the user's vendor ID
      const vendorId = queryVendorId || req.user?.vendorId;
      
      // Join with products to get product names
      const result = await db.select({
        id: supplierCosts.id,
        supplierId: supplierCosts.supplierId,
        vendorId: supplierCosts.vendorId,
        productId: supplierCosts.productId,
        productName: products.name,
        costDate: supplierCosts.costDate,
        unitCost: supplierCosts.unitCost,
        currencyCode: supplierCosts.currencyCode,
        quantity: supplierCosts.quantity,
        totalCost: supplierCosts.totalCost,
        priceFluctuation: supplierCosts.priceFluctuation,
        notes: supplierCosts.notes,
        createdAt: supplierCosts.createdAt,
        updatedAt: supplierCosts.updatedAt
      })
        .from(supplierCosts)
        .innerJoin(products, eq(supplierCosts.productId, products.id))
        .where(
          and(
            eq(supplierCosts.supplierId, supplierId),
            eq(supplierCosts.vendorId, vendorId)
          )
        )
        .orderBy(desc(supplierCosts.costDate));
      
      res.status(200).json(result);
    } catch (error) {
      console.error("Error fetching supplier costs:", error);
      res.status(500).json({ error: "Failed to fetch supplier cost history" });
    }
  });

  app.post("/api/supplier-costs", isAuthenticated, async (req, res) => {
    try {
      const vendorId = req.user?.vendorId;

      if (!vendorId && req.user?.role !== "admin") {
        return res.status(403).json({ message: "You must be associated with a vendor to add supplier costs" });
      }

      const supplierId = Number(req.body.supplierId);
      const productId = Number(req.body.productId);
      const unitCost = Number(req.body.unitCost);
      const quantity = req.body.quantity !== undefined && req.body.quantity !== "" ? Number(req.body.quantity) : null;
      const costDate = req.body.costDate ? new Date(req.body.costDate) : new Date();
      const scopedVendorId = req.user?.role === "admin" && req.body.vendorId ? Number(req.body.vendorId) : vendorId;

      if (!scopedVendorId) {
        return res.status(400).json({ message: "vendorId is required" });
      }

      if (!Number.isInteger(supplierId) || !Number.isInteger(productId) || !Number.isFinite(unitCost) || unitCost <= 0) {
        return res.status(400).json({ message: "supplierId, productId, and positive unitCost are required" });
      }

      if (Number.isNaN(costDate.getTime())) {
        return res.status(400).json({ message: "costDate is invalid" });
      }

      const [supplier] = await db
        .select()
        .from(suppliers)
        .where(and(eq(suppliers.id, supplierId), eq(suppliers.vendorId, scopedVendorId)))
        .limit(1);

      const [product] = await db
        .select()
        .from(products)
        .where(and(eq(products.id, productId), eq(products.vendorId, scopedVendorId)))
        .limit(1);

      if (!supplier) {
        return res.status(404).json({ message: "Supplier not found" });
      }

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const [previousCost] = await db
        .select()
        .from(supplierCosts)
        .where(and(
          eq(supplierCosts.productId, productId),
          eq(supplierCosts.vendorId, scopedVendorId),
        ))
        .orderBy(desc(supplierCosts.costDate))
        .limit(1);

      const previousUnitCost = previousCost ? Number(previousCost.unitCost) : null;
      const priceFluctuation = previousUnitCost && previousUnitCost > 0
        ? ((unitCost - previousUnitCost) / previousUnitCost) * 100
        : 0;
      const totalCost = quantity && quantity > 0 ? unitCost * quantity : null;

      const [newCost] = await db
        .insert(supplierCosts)
        .values({
          supplierId,
          vendorId: scopedVendorId,
          productId,
          costDate,
          unitCost: unitCost.toFixed(2),
          currencyCode: req.body.currencyCode || "USD",
          quantity,
          totalCost: totalCost === null ? null : totalCost.toFixed(2),
          priceFluctuation: priceFluctuation.toFixed(2),
          notes: req.body.notes || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      res.status(201).json(newCost);
    } catch (error) {
      console.error("Error creating supplier cost:", error);
      res.status(500).json({
        error: "Failed to create supplier cost",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.patch("/api/supplier-costs/:id", isAuthenticated, async (req, res) => {
    try {
      const costId = Number(req.params.id);

      if (!Number.isInteger(costId)) {
        return res.status(400).json({ message: "Invalid supplier cost id" });
      }

      const [existingCost] = await db
        .select()
        .from(supplierCosts)
        .where(eq(supplierCosts.id, costId))
        .limit(1);

      if (!existingCost) {
        return res.status(404).json({ message: "Supplier cost not found" });
      }

      if (req.user?.role !== "admin" && existingCost.vendorId !== req.user?.vendorId) {
        return res.status(403).json({ message: "You don't have permission to update this supplier cost" });
      }

      const unitCost = req.body.unitCost !== undefined ? Number(req.body.unitCost) : Number(existingCost.unitCost);
      const quantity = req.body.quantity !== undefined && req.body.quantity !== "" ? Number(req.body.quantity) : existingCost.quantity;
      const costDate = req.body.costDate ? new Date(req.body.costDate) : existingCost.costDate;

      if (!Number.isFinite(unitCost) || unitCost <= 0) {
        return res.status(400).json({ message: "unitCost must be a positive number" });
      }

      if (costDate && Number.isNaN(new Date(costDate).getTime())) {
        return res.status(400).json({ message: "costDate is invalid" });
      }

      const totalCost = quantity && quantity > 0 ? unitCost * quantity : null;

      const [updatedCost] = await db
        .update(supplierCosts)
        .set({
          unitCost: unitCost.toFixed(2),
          quantity,
          costDate: costDate ? new Date(costDate) : null,
          totalCost: totalCost === null ? null : totalCost.toFixed(2),
          currencyCode: req.body.currencyCode || existingCost.currencyCode || "USD",
          notes: req.body.notes ?? existingCost.notes,
          updatedAt: new Date(),
        })
        .where(eq(supplierCosts.id, costId))
        .returning();

      res.json(updatedCost);
    } catch (error) {
      console.error("Error updating supplier cost:", error);
      res.status(500).json({
        error: "Failed to update supplier cost",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/api/supplier-invoices/import", isAuthenticated, async (req, res) => {
    try {
      await ensurePricingAutomationTables();

      const vendorId = req.user?.vendorId;
      const supplierId = Number(req.body.supplierId);

      if (!vendorId && req.user?.role !== "admin") {
        return res.status(403).json({ message: "You must be associated with a vendor to import invoices" });
      }

      const scopedVendorId = req.user?.role === "admin" && req.body.vendorId ? Number(req.body.vendorId) : vendorId;
      if (!scopedVendorId || !Number.isInteger(supplierId)) {
        return res.status(400).json({ message: "supplierId and vendor scope are required" });
      }

      const [supplier] = await db
        .select()
        .from(suppliers)
        .where(and(eq(suppliers.id, supplierId), eq(suppliers.vendorId, scopedVendorId)))
        .limit(1);

      if (!supplier) {
        return res.status(404).json({ message: "Supplier not found" });
      }

      const rawLines = Array.isArray(req.body.lines)
        ? req.body.lines
        : typeof req.body.csvText === "string"
          ? parseInvoiceCsv(req.body.csvText)
          : [];

      const lines = rawLines
        .map((line: any, index: number) => ({
          sourceSku: line.sourceSku || line.sku || undefined,
          description: String(line.description || line.productName || `Invoice line ${index + 1}`),
          quantity: line.quantity !== undefined && line.quantity !== "" ? Number(line.quantity) : undefined,
          unitCost: Number(line.unitCost ?? line.cost),
          totalCost: line.totalCost !== undefined && line.totalCost !== "" ? Number(line.totalCost) : undefined,
        }))
        .filter((line: any) => Number.isFinite(line.unitCost) && line.unitCost > 0);

      if (!lines.length) {
        return res.status(400).json({ message: "At least one invoice line with a positive unitCost is required" });
      }

      const vendorProducts = await db
        .select({
          id: products.id,
          name: products.name,
          sku: products.sku,
        })
        .from(products)
        .where(eq(products.vendorId, scopedVendorId));

      const matchedLines = lines.map((line: any) => {
        const skuMatch = line.sourceSku
          ? vendorProducts.find((product) => product.sku && product.sku.toLowerCase() === String(line.sourceSku).toLowerCase())
          : undefined;
        const nameMatch = skuMatch || vendorProducts.find((product) =>
          product.name.toLowerCase() === line.description.toLowerCase() ||
          line.description.toLowerCase().includes(product.name.toLowerCase())
        );

        return {
          ...line,
          productId: nameMatch?.id,
          matchStatus: nameMatch ? "matched" : "unmatched",
          matchConfidence: skuMatch ? 100 : nameMatch ? 80 : 0,
        };
      });

      const invoiceSubtotal = matchedLines.reduce((sum: number, line: any) => {
        const lineTotal = Number.isFinite(line.totalCost)
          ? line.totalCost
          : Number(line.unitCost) * Number(line.quantity || 1);
        return sum + lineTotal;
      }, 0);

      const [invoice] = await db
        .insert(supplierInvoices)
        .values({
          vendorId: scopedVendorId,
          supplierId,
          invoiceNumber: req.body.invoiceNumber || null,
          invoiceDate: req.body.invoiceDate ? new Date(req.body.invoiceDate) : new Date(),
          status: matchedLines.every((line: any) => line.productId) ? "matched" : "needs_review",
          sourceType: req.body.csvText ? "csv" : "manual",
          subtotal: invoiceSubtotal.toFixed(2),
          currencyCode: req.body.currencyCode || "USD",
          notes: req.body.notes || null,
          importedByUserId: req.user?.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any)
        .returning();

      const insertedLines = await db
        .insert(supplierInvoiceLineItems)
        .values(matchedLines.map((line: any) => ({
          invoiceId: invoice.id,
          vendorId: scopedVendorId,
          supplierId,
          productId: line.productId || null,
          sourceSku: line.sourceSku || null,
          description: line.description,
          quantity: line.quantity || null,
          unitCost: Number(line.unitCost).toFixed(2),
          totalCost: Number.isFinite(line.totalCost)
            ? Number(line.totalCost).toFixed(2)
            : (Number(line.unitCost) * Number(line.quantity || 1)).toFixed(2),
          matchStatus: line.matchStatus,
          matchConfidence: String(line.matchConfidence),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any)))
        .returning();

      res.status(201).json({ invoice, lineItems: insertedLines });
    } catch (error) {
      console.error("Error importing supplier invoice:", error);
      res.status(500).json({
        error: "Failed to import supplier invoice",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/api/supplier-invoices", isAuthenticated, async (req, res) => {
    try {
      await ensurePricingAutomationTables();
      const vendorId = req.user?.role === "admin" && req.query.vendorId
        ? Number(req.query.vendorId)
        : req.user?.vendorId;

      if (!vendorId) {
        return res.status(403).json({ message: "No vendor scope available for invoices" });
      }

      const invoices = await db
        .select({
          id: supplierInvoices.id,
          supplierId: supplierInvoices.supplierId,
          supplierName: suppliers.name,
          invoiceNumber: supplierInvoices.invoiceNumber,
          invoiceDate: supplierInvoices.invoiceDate,
          status: supplierInvoices.status,
          sourceType: supplierInvoices.sourceType,
          subtotal: supplierInvoices.subtotal,
          currencyCode: supplierInvoices.currencyCode,
          notes: supplierInvoices.notes,
          createdAt: supplierInvoices.createdAt,
        })
        .from(supplierInvoices)
        .leftJoin(suppliers, eq(supplierInvoices.supplierId, suppliers.id))
        .where(eq(supplierInvoices.vendorId, vendorId))
        .orderBy(desc(supplierInvoices.createdAt));

      res.json(invoices);
    } catch (error) {
      console.error("Error fetching supplier invoices:", error);
      res.status(500).json({ error: "Failed to fetch supplier invoices" });
    }
  });

  app.get("/api/supplier-invoices/:id/line-items", isAuthenticated, async (req, res) => {
    try {
      await ensurePricingAutomationTables();
      const invoiceId = Number(req.params.id);
      const vendorId = req.user?.vendorId;

      if (!vendorId && req.user?.role !== "admin") {
        return res.status(403).json({ message: "No vendor scope available for invoice line items" });
      }

      const lineItems = await db
        .select({
          id: supplierInvoiceLineItems.id,
          invoiceId: supplierInvoiceLineItems.invoiceId,
          productId: supplierInvoiceLineItems.productId,
          productName: products.name,
          sourceSku: supplierInvoiceLineItems.sourceSku,
          description: supplierInvoiceLineItems.description,
          quantity: supplierInvoiceLineItems.quantity,
          unitCost: supplierInvoiceLineItems.unitCost,
          totalCost: supplierInvoiceLineItems.totalCost,
          matchStatus: supplierInvoiceLineItems.matchStatus,
          matchConfidence: supplierInvoiceLineItems.matchConfidence,
        })
        .from(supplierInvoiceLineItems)
        .leftJoin(products, eq(supplierInvoiceLineItems.productId, products.id))
        .where(and(
          eq(supplierInvoiceLineItems.invoiceId, invoiceId),
          req.user?.role === "admin" ? undefined : eq(supplierInvoiceLineItems.vendorId, vendorId as number),
        ))
        .orderBy(supplierInvoiceLineItems.id);

      res.json(lineItems);
    } catch (error) {
      console.error("Error fetching invoice line items:", error);
      res.status(500).json({ error: "Failed to fetch invoice line items" });
    }
  });

  app.patch("/api/supplier-invoice-line-items/:id/match", isAuthenticated, async (req, res) => {
    try {
      await ensurePricingAutomationTables();
      const lineItemId = Number(req.params.id);
      const productId = Number(req.body.productId);

      if (!Number.isInteger(lineItemId) || !Number.isInteger(productId)) {
        return res.status(400).json({ message: "line item id and productId are required" });
      }

      const [lineItem] = await db
        .select()
        .from(supplierInvoiceLineItems)
        .where(eq(supplierInvoiceLineItems.id, lineItemId))
        .limit(1);

      if (!lineItem) {
        return res.status(404).json({ message: "Invoice line item not found" });
      }

      if (req.user?.role !== "admin" && lineItem.vendorId !== req.user?.vendorId) {
        return res.status(403).json({ message: "You don't have permission to update this invoice line item" });
      }

      const [product] = await db
        .select()
        .from(products)
        .where(and(eq(products.id, productId), eq(products.vendorId, lineItem.vendorId)))
        .limit(1);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const [updatedLine] = await db
        .update(supplierInvoiceLineItems)
        .set({
          productId,
          matchStatus: "matched",
          matchConfidence: "100",
          updatedAt: new Date(),
        } as any)
        .where(eq(supplierInvoiceLineItems.id, lineItemId))
        .returning();

      res.json(updatedLine);
    } catch (error) {
      console.error("Error matching invoice line item:", error);
      res.status(500).json({ error: "Failed to match invoice line item" });
    }
  });

  app.post("/api/supplier-invoices/:id/post-costs", isAuthenticated, async (req, res) => {
    try {
      await ensurePricingAutomationTables();
      const invoiceId = Number(req.params.id);
      const targetMargin = Number(req.body.targetMargin || 35);

      if (!Number.isFinite(targetMargin) || targetMargin <= 0 || targetMargin >= 95) {
        return res.status(400).json({ message: "targetMargin must be between 0 and 95" });
      }

      const [invoice] = await db
        .select()
        .from(supplierInvoices)
        .where(eq(supplierInvoices.id, invoiceId))
        .limit(1);

      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      if (req.user?.role !== "admin" && invoice.vendorId !== req.user?.vendorId) {
        return res.status(403).json({ message: "You don't have permission to post this invoice" });
      }

      const matchedLines = await db
        .select()
        .from(supplierInvoiceLineItems)
        .where(and(
          eq(supplierInvoiceLineItems.invoiceId, invoiceId),
          eq(supplierInvoiceLineItems.matchStatus, "matched"),
        ));

      const createdCosts = [];
      const createdApprovals = [];

      for (const line of matchedLines) {
        if (!line.productId) continue;

        const [product] = await db
          .select()
          .from(products)
          .where(eq(products.id, line.productId))
          .limit(1);

        if (!product) continue;

        const [previousCost] = await db
          .select()
          .from(supplierCosts)
          .where(and(
            eq(supplierCosts.productId, line.productId),
            eq(supplierCosts.vendorId, invoice.vendorId),
          ))
          .orderBy(desc(supplierCosts.costDate))
          .limit(1);

        const unitCost = Number(line.unitCost);
        const previousUnitCost = previousCost ? Number(previousCost.unitCost) : null;
        const priceFluctuation = previousUnitCost && previousUnitCost > 0
          ? ((unitCost - previousUnitCost) / previousUnitCost) * 100
          : 0;

        const [cost] = await db
          .insert(supplierCosts)
          .values({
            supplierId: invoice.supplierId,
            vendorId: invoice.vendorId,
            productId: line.productId,
            costDate: invoice.invoiceDate,
            unitCost: unitCost.toFixed(2),
            currencyCode: invoice.currencyCode || "USD",
            quantity: line.quantity || null,
            totalCost: line.totalCost || null,
            priceFluctuation: priceFluctuation.toFixed(2),
            notes: `Imported from invoice ${invoice.invoiceNumber || invoice.id}`,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any)
          .returning();

        createdCosts.push(cost);

        const currentPrice = Number(product.currentPrice);
        const recommendedPrice = unitCost / (1 - targetMargin / 100);

        if (Number.isFinite(currentPrice) && Math.abs((recommendedPrice - currentPrice) / currentPrice) >= 0.01) {
          const [approval] = await db
            .insert(priceChangeApprovals)
            .values({
              vendorId: invoice.vendorId,
              productId: line.productId,
              supplierCostId: cost.id,
              invoiceLineItemId: line.id,
              oldPrice: currentPrice.toFixed(2),
              recommendedPrice: recommendedPrice.toFixed(2),
              targetMargin: targetMargin.toFixed(2),
              latestUnitCost: unitCost.toFixed(2),
              status: "pending",
              requestedByUserId: req.user?.id,
              notes: `Created from supplier invoice ${invoice.invoiceNumber || invoice.id}`,
              createdAt: new Date(),
              updatedAt: new Date(),
            } as any)
            .returning();

          createdApprovals.push(approval);
        }
      }

      await db
        .update(supplierInvoices)
        .set({ status: "posted", updatedAt: new Date() } as any)
        .where(eq(supplierInvoices.id, invoiceId));

      res.json({ supplierCosts: createdCosts, approvals: createdApprovals });
    } catch (error) {
      console.error("Error posting invoice costs:", error);
      res.status(500).json({
        error: "Failed to post invoice costs",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/api/pricing/approvals", isAuthenticated, async (req, res) => {
    try {
      await ensurePricingAutomationTables();
      const vendorId = req.user?.role === "admin" && req.query.vendorId
        ? Number(req.query.vendorId)
        : req.user?.vendorId;

      if (!vendorId) {
        return res.status(403).json({ message: "No vendor scope available for pricing approvals" });
      }

      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const conditions = [eq(priceChangeApprovals.vendorId, vendorId)];
      if (status && status !== "all") {
        conditions.push(eq(priceChangeApprovals.status, status));
      }

      const approvals = await db
        .select({
          id: priceChangeApprovals.id,
          productId: priceChangeApprovals.productId,
          productName: products.name,
          oldPrice: priceChangeApprovals.oldPrice,
          recommendedPrice: priceChangeApprovals.recommendedPrice,
          targetMargin: priceChangeApprovals.targetMargin,
          latestUnitCost: priceChangeApprovals.latestUnitCost,
          status: priceChangeApprovals.status,
          notes: priceChangeApprovals.notes,
          createdAt: priceChangeApprovals.createdAt,
          reviewedAt: priceChangeApprovals.reviewedAt,
          appliedAt: priceChangeApprovals.appliedAt,
        })
        .from(priceChangeApprovals)
        .innerJoin(products, eq(priceChangeApprovals.productId, products.id))
        .where(and(...conditions))
        .orderBy(desc(priceChangeApprovals.createdAt));

      res.json(approvals);
    } catch (error) {
      console.error("Error fetching pricing approvals:", error);
      res.status(500).json({ error: "Failed to fetch pricing approvals" });
    }
  });

  app.patch("/api/pricing/approvals/:id", isAuthenticated, async (req, res) => {
    try {
      await ensurePricingAutomationTables();
      const approvalId = Number(req.params.id);
      const action = String(req.body.action || "");

      if (!["approve", "reject", "apply"].includes(action)) {
        return res.status(400).json({ message: "action must be approve, reject, or apply" });
      }

      const [approval] = await db
        .select()
        .from(priceChangeApprovals)
        .where(eq(priceChangeApprovals.id, approvalId))
        .limit(1);

      if (!approval) {
        return res.status(404).json({ message: "Approval request not found" });
      }

      if (req.user?.role !== "admin" && approval.vendorId !== req.user?.vendorId) {
        return res.status(403).json({ message: "You don't have permission to update this approval" });
      }

      if (action === "reject") {
        const [updated] = await db
          .update(priceChangeApprovals)
          .set({
            status: "rejected",
            reviewedByUserId: req.user?.id,
            reviewedAt: new Date(),
            notes: req.body.notes ?? approval.notes,
            updatedAt: new Date(),
          } as any)
          .where(eq(priceChangeApprovals.id, approvalId))
          .returning();

        return res.json(updated);
      }

      if (action === "approve") {
        const [updated] = await db
          .update(priceChangeApprovals)
          .set({
            status: "approved",
            reviewedByUserId: req.user?.id,
            reviewedAt: new Date(),
            notes: req.body.notes ?? approval.notes,
            updatedAt: new Date(),
          } as any)
          .where(eq(priceChangeApprovals.id, approvalId))
          .returning();

        return res.json(updated);
      }

      if (!["pending", "approved"].includes(approval.status)) {
        return res.status(400).json({ message: "Only pending or approved requests can be applied" });
      }

      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, approval.productId))
        .limit(1);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const oldPrice = Number(product.currentPrice);
      const newPrice = Number(approval.recommendedPrice);
      const latestUnitCost = Number(approval.latestUnitCost);

      if (Number.isFinite(latestUnitCost)) {
        const minimumMarginPercent = await getApplicableMinimumMarginGuardrail(approval.vendorId, product);
        if (minimumMarginPercent !== null) {
          const minimumAllowedPrice = getMinimumPriceForMargin(latestUnitCost, minimumMarginPercent);

          if (newPrice < minimumAllowedPrice) {
            return res.status(400).json({
              message: `Blocked by margin guardrail. Price must be at least $${minimumAllowedPrice.toFixed(2)} to keep ${minimumMarginPercent}% margin.`,
              minimumMarginPercent,
              minimumAllowedPrice: Number(minimumAllowedPrice.toFixed(2)),
            });
          }
        }
      }

      await db
        .update(products)
        .set({ currentPrice: newPrice.toFixed(2), updatedAt: new Date() } as any)
        .where(eq(products.id, approval.productId));

      await db.insert(priceHistory).values({
        productId: approval.productId,
        oldPrice: oldPrice.toFixed(2),
        newPrice: newPrice.toFixed(2),
        reason: `Approved margin optimization: supplier cost ${Number(approval.latestUnitCost).toFixed(2)}, target margin ${approval.targetMargin}%`,
        timestamp: new Date(),
      });

      const [updated] = await db
        .update(priceChangeApprovals)
        .set({
          status: "applied",
          reviewedByUserId: req.user?.id,
          reviewedAt: approval.reviewedAt || new Date(),
          appliedAt: new Date(),
          updatedAt: new Date(),
        } as any)
        .where(eq(priceChangeApprovals.id, approvalId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating pricing approval:", error);
      res.status(500).json({
        error: "Failed to update pricing approval",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  async function runRepricingForVendor(vendorId: number, targetMargin: number, mode: string, userId?: number) {
    const vendorProducts = await db
      .select()
      .from(products)
      .where(eq(products.vendorId, vendorId));

    const results = { approvalsCreated: 0, pricesApplied: 0, skipped: 0 };

    for (const product of vendorProducts) {
      const [latestCost] = await db
        .select()
        .from(supplierCosts)
        .where(and(eq(supplierCosts.productId, product.id), eq(supplierCosts.vendorId, vendorId)))
        .orderBy(desc(supplierCosts.costDate))
        .limit(1);

      if (!latestCost) {
        results.skipped += 1;
        continue;
      }

      const unitCost = Number(latestCost.unitCost);
      const currentPrice = Number(product.currentPrice);
      const recommendedPrice = unitCost / (1 - targetMargin / 100);
      const minimumMarginPercent = await getApplicableMinimumMarginGuardrail(vendorId, product);
      const minimumAllowedPrice = minimumMarginPercent !== null
        ? getMinimumPriceForMargin(unitCost, minimumMarginPercent)
        : null;
      const nextRecommendedPrice = minimumAllowedPrice !== null && recommendedPrice < minimumAllowedPrice
        ? minimumAllowedPrice
        : recommendedPrice;
      const guardrailNote = minimumMarginPercent !== null && minimumAllowedPrice !== null && recommendedPrice < minimumAllowedPrice
        ? ` Margin guardrail raised the recommendation to preserve ${minimumMarginPercent}% margin.`
        : "";

      if (!Number.isFinite(nextRecommendedPrice) || currentPrice <= 0 || Math.abs((nextRecommendedPrice - currentPrice) / currentPrice) < 0.01) {
        results.skipped += 1;
        continue;
      }

      if (mode === "auto_apply") {
        await db
          .update(products)
          .set({ currentPrice: nextRecommendedPrice.toFixed(2), updatedAt: new Date() } as any)
          .where(eq(products.id, product.id));

        await db.insert(priceHistory).values({
          productId: product.id,
          oldPrice: currentPrice.toFixed(2),
          newPrice: nextRecommendedPrice.toFixed(2),
          reason: `Scheduled margin optimization: supplier cost ${unitCost.toFixed(2)}, target margin ${targetMargin}%.${guardrailNote}`,
          timestamp: new Date(),
        });

        results.pricesApplied += 1;
      } else {
        await db
          .insert(priceChangeApprovals)
          .values({
            vendorId,
            productId: product.id,
            supplierCostId: latestCost.id,
            oldPrice: currentPrice.toFixed(2),
            recommendedPrice: nextRecommendedPrice.toFixed(2),
            targetMargin: targetMargin.toFixed(2),
            latestUnitCost: unitCost.toFixed(2),
            status: "pending",
            requestedByUserId: userId,
            notes: `Created by scheduled repricing.${guardrailNote}`,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any);

        results.approvalsCreated += 1;
      }
    }

    return results;
  }

  app.get("/api/pricing/repricing-schedule", isAuthenticated, async (req, res) => {
    try {
      await ensurePricingAutomationTables();
      const vendorId = req.user?.role === "admin" && req.query.vendorId
        ? Number(req.query.vendorId)
        : req.user?.vendorId;

      if (!vendorId) {
        return res.status(403).json({ message: "No vendor scope available for repricing schedule" });
      }

      const [schedule] = await db
        .select()
        .from(repricingSchedules)
        .where(eq(repricingSchedules.vendorId, vendorId))
        .limit(1);

      res.json(schedule || {
        vendorId,
        isEnabled: false,
        targetMargin: "35",
        mode: "approval_required",
        frequency: "daily",
        nextRunAt: null,
      });
    } catch (error) {
      console.error("Error fetching repricing schedule:", error);
      res.status(500).json({ error: "Failed to fetch repricing schedule" });
    }
  });

  app.put("/api/pricing/repricing-schedule", isAuthenticated, async (req, res) => {
    try {
      await ensurePricingAutomationTables();
      const vendorId = req.user?.role === "admin" && req.body.vendorId
        ? Number(req.body.vendorId)
        : req.user?.vendorId;
      const targetMargin = Number(req.body.targetMargin || 35);
      const frequency = ["hourly", "daily", "weekly"].includes(req.body.frequency) ? req.body.frequency : "daily";
      const mode = req.body.mode === "auto_apply" ? "auto_apply" : "approval_required";

      if (!vendorId) {
        return res.status(403).json({ message: "No vendor scope available for repricing schedule" });
      }

      const [existing] = await db
        .select()
        .from(repricingSchedules)
        .where(eq(repricingSchedules.vendorId, vendorId))
        .limit(1);

      const values = {
        vendorId,
        isEnabled: Boolean(req.body.isEnabled),
        targetMargin: targetMargin.toFixed(2),
        mode,
        frequency,
        nextRunAt: Boolean(req.body.isEnabled) ? getNextRepricingRun(frequency) : null,
        updatedAt: new Date(),
      } as any;

      const [schedule] = existing
        ? await db.update(repricingSchedules).set(values).where(eq(repricingSchedules.vendorId, vendorId)).returning()
        : await db.insert(repricingSchedules).values({ ...values, createdAt: new Date() }).returning();

      res.json(schedule);
    } catch (error) {
      console.error("Error saving repricing schedule:", error);
      res.status(500).json({ error: "Failed to save repricing schedule" });
    }
  });

  app.post("/api/pricing/repricing-schedule/run", isAuthenticated, async (req, res) => {
    try {
      await ensurePricingAutomationTables();
      const vendorId = req.user?.role === "admin" && req.body.vendorId
        ? Number(req.body.vendorId)
        : req.user?.vendorId;

      if (!vendorId) {
        return res.status(403).json({ message: "No vendor scope available for scheduled repricing" });
      }

      const [schedule] = await db
        .select()
        .from(repricingSchedules)
        .where(eq(repricingSchedules.vendorId, vendorId))
        .limit(1);

      const targetMargin = Number(req.body.targetMargin || schedule?.targetMargin || 35);
      const mode = req.body.mode || schedule?.mode || "approval_required";
      const frequency = schedule?.frequency || "daily";
      const result = await runRepricingForVendor(vendorId, targetMargin, mode, req.user?.id);

      if (schedule) {
        await db
          .update(repricingSchedules)
          .set({
            lastRunAt: new Date(),
            nextRunAt: schedule.isEnabled ? getNextRepricingRun(frequency) : null,
            updatedAt: new Date(),
          } as any)
          .where(eq(repricingSchedules.vendorId, vendorId));
      }

      res.json(result);
    } catch (error) {
      console.error("Error running scheduled repricing:", error);
      res.status(500).json({
        error: "Failed to run scheduled repricing",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get negotiation recommendations
  app.get("/api/negotiation-recommendations", isAuthenticated, async (req, res) => {
    try {
      const supplierId = parseInt(req.query.supplierId as string);
      
      if (!supplierId) {
        return res.status(400).json({ error: "Supplier ID is required" });
      }
      
      // Check if a specific vendor ID is requested in the query
      const queryVendorId = req.query.vendorId ? parseInt(req.query.vendorId as string) : null;
      
      // If a specific vendor ID is requested, verify access permissions
      if (queryVendorId) {
        // Only allow admin users or users associated with the requested vendor
        if (req.user?.role !== 'admin' && req.user?.vendorId !== queryVendorId) {
          return res.status(403).json({ message: "You don't have access to this vendor's negotiation recommendations" });
        }
      } else if (!req.user?.vendorId) {
        // If no specific vendor requested and user is not associated with any vendor
        return res.status(403).json({ message: "You must be associated with a vendor to access negotiation recommendations" });
      }
      
      // Use the requested vendor ID if provided, otherwise use the user's vendor ID
      const vendorId = queryVendorId || req.user?.vendorId;
      
      const result = await db.select()
        .from(negotiationRecommendations)
        .where(
          and(
            eq(negotiationRecommendations.supplierId, supplierId),
            eq(negotiationRecommendations.vendorId, vendorId)
          )
        )
        .orderBy(desc(negotiationRecommendations.recommendationDate));
      
      // Parse the tactics JSON for each recommendation
      const formattedResults = result.map(rec => ({
        ...rec,
        tactics: rec.tactics ? JSON.stringify(rec.tactics) : '[]'
      }));
      
      res.status(200).json(formattedResults);
    } catch (error) {
      console.error("Error fetching negotiation recommendations:", error);
      res.status(500).json({ error: "Failed to fetch negotiation recommendations" });
    }
  });

  setInterval(async () => {
    try {
      await ensurePricingAutomationTables();
      const dueSchedules = await db
        .select()
        .from(repricingSchedules)
        .where(and(
          eq(repricingSchedules.isEnabled, true),
          lte(repricingSchedules.nextRunAt, new Date()),
        ));

      for (const schedule of dueSchedules) {
        const targetMargin = Number(schedule.targetMargin || 35);
        await runRepricingForVendor(schedule.vendorId, targetMargin, schedule.mode);
        await db
          .update(repricingSchedules)
          .set({
            lastRunAt: new Date(),
            nextRunAt: getNextRepricingRun(schedule.frequency),
            updatedAt: new Date(),
          } as any)
          .where(eq(repricingSchedules.id, schedule.id));
      }
    } catch (error) {
      console.error("Scheduled repricing check failed:", error);
    }
  }, 60 * 1000);

  return httpServer;
}
console.log('DEBUG: Checking customer segments endpoint');
