import { boolean, decimal, integer, json, pgTable, serial, text, timestamp, varchar, uuid, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";

// Define enum for permission types
export const userStatusEnum = pgEnum('user_status', ['active', 'suspended', 'inactive']);
export const userActionEnum = pgEnum('user_action', ['login', 'logout', 'create', 'update', 'delete', 'view']);
export const resourceTypeEnum = pgEnum('resource_type', ['product', 'price', 'competitor', 'rule', 'promotion', 'team', 'vendor', 'system', 'store', 'bookmark']);
export const forecastMethodEnum = pgEnum('forecast_method', ['linear_regression', 'moving_average', 'exponential_smoothing', 'arima', 'sarima', 'prophet']);
export const rfmScoreEnum = pgEnum('rfm_score', ['1', '2', '3', '4', '5']);
export const segmentTypeEnum = pgEnum('segment_type', ['custom', 'rfm', 'behavioral', 'demographic']);
export const abTestStatusEnum = pgEnum('ab_test_status', ['active', 'paused', 'completed', 'draft']);
export const abTestTypeEnum = pgEnum('ab_test_type', ['email', 'page', 'element', 'funnel']);
export const abTestGoalEnum = pgEnum('ab_test_goal', ['conversion', 'engagement', 'retention', 'revenue', 'other']);
export const abTestEventTypeEnum = pgEnum('ab_test_event_type', ['visit', 'click', 'conversion', 'revenue']);
export const journeyTouchpointChannelEnum = pgEnum('journey_touchpoint_channel', ['email', 'website', 'social', 'phone', 'app', 'in-store', 'other']);
export const journeyTouchpointSentimentEnum = pgEnum('journey_touchpoint_sentiment', ['positive', 'neutral', 'negative']);
export const personalizationTargetEnum = pgEnum('personalization_target', ['email', 'website', 'app', 'notification']);
export const personalizationStatusEnum = pgEnum('personalization_status', ['active', 'draft', 'paused']);
export const personalizationEventTypeEnum = pgEnum('personalization_event_type', ['impression', 'conversion']);

// Supplier related enums
export const supplierStatusEnum = pgEnum('supplier_status', ['active', 'probation', 'inactive', 'blacklisted']);
export const negotiationStatusEnum = pgEnum('negotiation_status', ['pending', 'in_progress', 'completed', 'failed']);

// Channel related enums
export const channelTypeEnum = pgEnum('channel_type', ['web', 'mobile', 'store', 'marketplace', 'social', 'other']);

// Store related enums
export const storeIntegrationTypeEnum = pgEnum('store_integration_type', ['manual', 'shopify', 'woocommerce', 'magento', 'other']);
export const promotionTypeEnum = pgEnum('promotion_type', ['percent_off', 'amount_off', 'buy_one_get_one', 'free_shipping', 'bundle', 'gift_with_purchase', 'other']);

// Users table for authentication
const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(), // Removed .unique() constraint
  vendorId: integer("vendor_id"),
  role: varchar("role", { length: 50 }).notNull().default('vendor'),
  status: userStatusEnum("status").notNull().default('active'),
  lastLogin: timestamp("last_login"),
  failedLoginAttempts: integer("failed_login_attempts").default(0),
  lockedUntil: timestamp("locked_until"),
  phoneNumber: varchar("phone_number", { length: 20 }),
  jobTitle: varchar("job_title", { length: 100 }),
  department: varchar("department", { length: 100 }),
  isEmailVerified: boolean("is_email_verified").default(false),
  isPhoneVerified: boolean("is_phone_verified").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Vendors table for multi-tenant support
const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  businessName: varchar("business_name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).default('other'),
  address: text("address"),
  phone: varchar("phone", { length: 20 }),
  currencyCode: varchar("currency_code", { length: 3 }).default("USD"),
  status: varchar("status", { length: 20 }).notNull().default('active'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// System status table for monitoring
const systemStatus = pgTable("system_status", {
  id: serial("id").primaryKey(),
  status: varchar("status", { length: 20 }).notNull().default('healthy'),
  services: json("services").notNull(),
  metrics: json("metrics").notNull(),
  systemMetrics: json("system_metrics").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

const products = pgTable("products", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  name: text("name").notNull(),
  brand: text("brand"),
  sku: text("sku").unique().notNull(),
  barcode: text("barcode"),
  basePrice: decimal("base_price", { precision: 10, scale: 2 }).notNull(),
  currentPrice: decimal("current_price", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  category: text("category").notNull(),
  aisle: text("aisle").notNull(),
  shelf: text("shelf").notNull(),
  imageUrl: text("image_url"),
  modelUrl: text("model_url"),
  modelFormat: text("model_format"),
  currentStock: integer("current_stock").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold"),
  lastRestocked: timestamp("last_restocked"),
  reorderPoint: integer("reorder_point"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

const priceRules = pgTable("price_rules", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").default("other"),
  conditions: json("conditions").notNull(),
  adjustment: json("adjustment").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  priority: integer("priority").notNull(),
  startDate: timestamp("start_date"), // For scheduling when the rule becomes active
  endDate: timestamp("end_date"), // For scheduling when the rule expires
  targetSegment: text("target_segment"), // For customer segment targeting
  isTemplate: boolean("is_template").default(false), // For creating rule templates
  templateCategory: text("template_category"), // Category for organizing templates
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  metadata: json("metadata"), // For additional data like impact analysis or A/B test results
});

const priceHistory = pgTable("price_history", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id).notNull(),
  oldPrice: decimal("old_price", { precision: 10, scale: 2 }).notNull(),
  newPrice: decimal("new_price", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

const catalogPriceSnapshots = pgTable("catalog_price_snapshots", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  snapshotDate: timestamp("snapshot_date").notNull(),
  productCount: integer("product_count").default(0).notNull(),
  averagePrice: decimal("average_price", { precision: 10, scale: 2 }).default("0").notNull(),
  minPrice: decimal("min_price", { precision: 10, scale: 2 }).default("0").notNull(),
  maxPrice: decimal("max_price", { precision: 10, scale: 2 }).default("0").notNull(),
  totalCatalogValue: decimal("total_catalog_value", { precision: 12, scale: 2 }).default("0").notNull(),
  totalInventoryValue: decimal("total_inventory_value", { precision: 12, scale: 2 }).default("0").notNull(),
  categoryBreakdown: json("category_breakdown"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

const competitors = pgTable("competitors", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  website: text("website"),
  isActive: boolean("is_active").default(true).notNull(),
  marketShare: decimal("market_share", { precision: 5, scale: 2 }),
  priceIndex: decimal("price_index", { precision: 5, scale: 2 }),
  lastScanned: timestamp("last_scanned"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

const competitorProducts = pgTable("competitor_products", {
  id: serial("id").primaryKey(),
  competitorId: integer("competitor_id").references(() => competitors.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  competitorSku: varchar("competitor_sku", { length: 100 }),
  competitorUrl: text("competitor_url"),
  isMatched: boolean("is_matched").default(true).notNull(),
  matchConfidence: decimal("match_confidence", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

const competitorPrices = pgTable("competitor_prices", {
  id: serial("id").primaryKey(),
  competitorProductId: integer("competitor_product_id").references(() => competitorProducts.id).notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  isPromotion: boolean("is_promotion").default(false),
  promotionType: varchar("promotion_type", { length: 50 }),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  availability: varchar("availability", { length: 50 }).default("in_stock"),
});

const promotions = pgTable("promotions", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  name: text("name").notNull(),
  discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }).notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  appliedProducts: json("applied_products").notNull().$type<number[]>(),
  imageUrl: text("image_url"),
  status: varchar("status", { length: 20 }).notNull().default('scheduled'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Team invitations table
const invitations = pgTable("invitations", {
  id: serial("id").primaryKey(),
  token: uuid("token").defaultRandom().notNull().unique(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  role: varchar("role", { length: 50 }).notNull().default('user'),
  permissionProfileId: integer("permission_profile_id"),
  status: varchar("status", { length: 20 }).notNull().default('pending'),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id).notNull(),
  acceptedAt: timestamp("accepted_at"),
});

// User Activity Logs table
const userActivityLogs = pgTable("user_activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  action: userActionEnum("action").notNull(),
  resourceType: resourceTypeEnum("resource_type").notNull(),
  resourceId: integer("resource_id"),
  details: json("details"),
  ipAddress: varchar("ip_address", { length: 50 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Store sessions table to track user store visits
const userStoreSessions = pgTable("user_store_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  storeId: integer("store_id").references(() => vendors.id).notNull(),
  visitDate: timestamp("visit_date").defaultNow().notNull(),
  visitCount: integer("visit_count").default(1).notNull(),
  lastVisit: timestamp("last_visit").defaultNow().notNull(),
});

// User bookmarks table for favorited products
const userBookmarks = pgTable("user_bookmarks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  notes: text("notes"),
  metadata: json("metadata"),
});

// User Settings table
const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull().unique(),
  notificationEmail: boolean("notification_email").default(true).notNull(),
  notificationSms: boolean("notification_sms").default(false).notNull(),
  notificationInApp: boolean("notification_in_app").default(true).notNull(),
  theme: varchar("theme", { length: 20 }).default('system').notNull(),
  language: varchar("language", { length: 10 }).default('en').notNull(),
  dashboardLayout: json("dashboard_layout"),
  mfaEnabled: boolean("mfa_enabled").default(false).notNull(),
  mfaSecret: varchar("mfa_secret", { length: 100 }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Permission Profiles table for custom role definitions
const permissionProfiles = pgTable("permission_profiles", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  permissions: json("permissions").notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User Permission Assignments
const userPermissions = pgTable("user_permissions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  profileId: integer("profile_id").references(() => permissionProfiles.id).notNull(),
  customPermissions: json("custom_permissions"),
  assignedBy: integer("assigned_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Marketing Campaigns table
const marketingCampaigns = pgTable("marketing_campaigns", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  type: varchar("type", { length: 50 }).notNull(),
  targetSegment: varchar("target_segment", { length: 100 }).notNull(),
  budget: decimal("budget", { precision: 10, scale: 2 }).notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  active: boolean("active").default(false).notNull(),
  channels: json("channels").notNull().$type<string[]>(),
  goals: json("goals"),
  status: varchar("status", { length: 20 }).notNull().default('draft'),
  performance: json("performance"),
  metrics: json("metrics"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

const marketingAbTests = pgTable("marketing_ab_tests", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  hypothesis: text("hypothesis").notNull(),
  type: abTestTypeEnum("type").notNull(),
  goal: abTestGoalEnum("goal").notNull(),
  goalMetric: text("goal_metric").notNull(),
  trafficAllocation: integer("traffic_allocation").notNull().default(100),
  status: abTestStatusEnum("status").notNull().default('draft'),
  tags: json("tags").$type<string[]>().default([]).notNull(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

const marketingAbTestVariants = pgTable("marketing_ab_test_variants", {
  id: serial("id").primaryKey(),
  testId: integer("test_id").references(() => marketingAbTests.id).notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  isControl: boolean("is_control").default(false).notNull(),
  traffic: integer("traffic").notNull().default(50),
  screenshot: text("screenshot"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

const marketingAbTestEvents = pgTable("marketing_ab_test_events", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  testId: integer("test_id").references(() => marketingAbTests.id).notNull(),
  variantId: integer("variant_id").references(() => marketingAbTestVariants.id).notNull(),
  eventType: abTestEventTypeEnum("event_type").notNull(),
  visitorKey: varchar("visitor_key", { length: 255 }),
  eventValue: decimal("event_value", { precision: 12, scale: 2 }).default("0"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Product Performance Metrics
const productPerformanceMetrics = pgTable("product_performance_metrics", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id).notNull(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  salesVolume: integer("sales_volume").default(0),
  revenue: decimal("revenue", { precision: 10, scale: 2 }).default("0"),
  profitMargin: decimal("profit_margin", { precision: 5, scale: 2 }),
  inventoryTurnover: decimal("inventory_turnover", { precision: 5, scale: 2 }),
  averageRating: decimal("average_rating", { precision: 3, scale: 1 }),
  returnRate: decimal("return_rate", { precision: 5, scale: 2 }),
  clickThroughRate: decimal("click_through_rate", { precision: 5, scale: 2 }),
  conversionRate: decimal("conversion_rate", { precision: 5, scale: 2 }),
  period: varchar("period", { length: 20 }).notNull(), // daily, weekly, monthly, quarterly, yearly
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Time Series Forecasting
const timeSeriesForecasts = pgTable("time_series_forecasts", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id).notNull(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  forecastType: varchar("forecast_type", { length: 50 }).notNull(), // price, sales, inventory
  method: forecastMethodEnum("method").notNull().default('linear_regression'),
  parameters: json("parameters"), // Model parameters
  forecastData: json("forecast_data").notNull(), // Array of forecast points
  confidenceInterval: json("confidence_interval"), // Upper and lower bounds
  accuracy: decimal("accuracy", { precision: 5, scale: 2 }), // Model accuracy metrics (e.g., RMSE, MAPE)
  startDate: timestamp("start_date").notNull(), // Start of forecast period
  endDate: timestamp("end_date").notNull(), // End of forecast period
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Competitor Trend Analysis
const competitorTrendAnalysis = pgTable("competitor_trend_analysis", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  competitorId: integer("competitor_id").references(() => competitors.id).notNull(),
  analysisType: varchar("analysis_type", { length: 50 }).notNull(), // price_volatility, market_share, product_launch
  period: varchar("period", { length: 20 }).notNull(), // daily, weekly, monthly, quarterly, yearly
  metrics: json("metrics").notNull(), // Key metrics for this analysis
  insights: json("insights"), // Generated insights
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Customers table
const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  phoneNumber: varchar("phone_number", { length: 20 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }),
  zipCode: varchar("zip_code", { length: 20 }),
  country: varchar("country", { length: 50 }).default("US"),
  birthDate: timestamp("birth_date"),
  gender: varchar("gender", { length: 20 }),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  accountCreated: timestamp("account_created").defaultNow().notNull(),
  lastActive: timestamp("last_active").defaultNow(),
  totalSpent: decimal("total_spent", { precision: 10, scale: 2 }).default("0.00"),
  totalOrders: integer("total_orders").default(0),
  marketingConsent: boolean("marketing_consent").default(false),
  preferences: json("preferences"),
  source: varchar("source", { length: 50 }),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Orders table for customer purchase history
const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  orderDate: timestamp("order_date").defaultNow().notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { length: 50 }).default("completed").notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }),
  shippingMethod: varchar("shipping_method", { length: 50 }),
  trackingNumber: varchar("tracking_number", { length: 100 }),
  notes: text("notes"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Order items table
const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 10, scale: 2 }).default("0.00"),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// RFM Analysis table
const rfmAnalysis = pgTable("rfm_analysis", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  recencyScore: rfmScoreEnum("recency_score").notNull(),
  frequencyScore: rfmScoreEnum("frequency_score").notNull(),
  monetaryScore: rfmScoreEnum("monetary_score").notNull(),
  combinedScore: varchar("combined_score", { length: 10 }).notNull(), // Format: R-F-M (e.g., "5-3-4")
  segment: varchar("segment", { length: 50 }).notNull(), // Champions, Loyal, Potential, At Risk, etc.
  lastPurchaseDate: timestamp("last_purchase_date"),
  daysSinceLastPurchase: integer("days_since_last_purchase"),
  purchaseFrequency: integer("purchase_frequency"), // Number of purchases
  averageOrderValue: decimal("average_order_value", { precision: 10, scale: 2 }),
  totalSpent: decimal("total_spent", { precision: 10, scale: 2 }),
  analysisDate: timestamp("analysis_date").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Customer Segments table
const customerSegments = pgTable("customer_segments", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  type: segmentTypeEnum("type").default("custom").notNull(),
  conditions: json("conditions").notNull(), // The criteria for segment membership
  isActive: boolean("is_active").default(true).notNull(),
  customerCount: integer("customer_count").default(0),
  metrics: json("metrics"), // Performance metrics for this segment
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Customer Segment Memberships
const customerSegmentMemberships = pgTable("customer_segment_memberships", {
  id: serial("id").primaryKey(),
  segmentId: integer("segment_id").references(() => customerSegments.id).notNull(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
  metadata: json("metadata"), // Additional data about the customer in this segment
});

const marketingCustomerJourneys = pgTable("marketing_customer_journeys", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  segmentId: integer("segment_id").references(() => customerSegments.id).notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

const marketingJourneyStages = pgTable("marketing_journey_stages", {
  id: serial("id").primaryKey(),
  journeyId: integer("journey_id").references(() => marketingCustomerJourneys.id).notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  duration: text("duration").notNull().default("Not set"),
  position: integer("position").notNull().default(0),
  conversionRate: decimal("conversion_rate", { precision: 5, scale: 2 }).default("0").notNull(),
  painPoints: json("pain_points").$type<string[]>().default([]).notNull(),
  opportunities: json("opportunities").$type<string[]>().default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

const marketingJourneyTouchpoints = pgTable("marketing_journey_touchpoints", {
  id: serial("id").primaryKey(),
  stageId: integer("stage_id").references(() => marketingJourneyStages.id).notNull(),
  name: text("name").notNull(),
  channel: journeyTouchpointChannelEnum("channel").notNull(),
  description: text("description").notNull(),
  dropoff: integer("dropoff").default(0).notNull(),
  sentiment: journeyTouchpointSentimentEnum("sentiment").default("neutral").notNull(),
  metrics: json("metrics").$type<{
    engagementRate?: number;
    conversionRate?: number;
    bounceRate?: number;
    responseTime?: string;
  }>().default({}).notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

const marketingPersonalizationTemplates = pgTable("marketing_personalization_templates", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull(),
  target: personalizationTargetEnum("target").notNull(),
  structure: text("structure").notNull(),
  thumbnail: text("thumbnail"),
  tags: json("tags").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

const marketingPersonalizationRules = pgTable("marketing_personalization_rules", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  templateId: integer("template_id").references(() => marketingPersonalizationTemplates.id),
  segmentId: integer("segment_id").references(() => customerSegments.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull(),
  audience: varchar("audience", { length: 255 }).notNull(),
  target: personalizationTargetEnum("target").notNull(),
  status: personalizationStatusEnum("status").notNull().default('draft'),
  priority: integer("priority").notNull().default(100),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  conditions: json("conditions").$type<{
    segment?: string;
    behavior?: string;
    device?: string;
    location?: string;
    time?: string;
  }>().notNull(),
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

const marketingPersonalizationVariations = pgTable("marketing_personalization_variations", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id").references(() => marketingPersonalizationRules.id).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  content: text("content").notNull(),
  impressions: integer("impressions").default(0).notNull(),
  conversions: integer("conversions").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

const marketingPersonalizationEvents = pgTable("marketing_personalization_events", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id").references(() => marketingPersonalizationRules.id).notNull(),
  variationId: integer("variation_id").references(() => marketingPersonalizationVariations.id),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  eventType: personalizationEventTypeEnum("event_type").notNull(),
  visitorKey: varchar("visitor_key", { length: 255 }).notNull(),
  eventValue: decimal("event_value", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Suppliers table
const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  contactName: varchar("contact_name", { length: 100 }),
  contactEmail: varchar("contact_email", { length: 100 }),
  contactPhone: varchar("contact_phone", { length: 50 }),
  address: text("address"),
  country: varchar("country", { length: 100 }),
  categories: varchar("categories", { length: 255 }),
  status: supplierStatusEnum("status").default('active'),
  paymentTerms: varchar("payment_terms", { length: 100 }),
  leadTime: integer("lead_time"), // in days
  minimumOrderQuantity: integer("minimum_order_quantity"),
  performanceScore: decimal("performance_score", { precision: 5, scale: 2 }).default('0'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Supplier performance metrics
const supplierPerformance = pgTable("supplier_performance", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").references(() => suppliers.id).notNull(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  metricDate: timestamp("metric_date").defaultNow(),
  onTimeDeliveryRate: decimal("on_time_delivery_rate", { precision: 5, scale: 2 }),
  qualityScore: decimal("quality_score", { precision: 5, scale: 2 }),
  responseTime: decimal("response_time", { precision: 5, scale: 2 }), // in hours
  priceCompetitiveness: decimal("price_competitiveness", { precision: 5, scale: 2 }),
  costSavings: decimal("cost_savings", { precision: 10, scale: 2 }),
  defectRate: decimal("defect_rate", { precision: 5, scale: 2 }),
  riskScore: decimal("risk_score", { precision: 5, scale: 2 }),
  complianceScore: decimal("compliance_score", { precision: 5, scale: 2 }),
  innovationScore: decimal("innovation_score", { precision: 5, scale: 2 }),
  overallScore: decimal("overall_score", { precision: 5, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Supplier cost history
const supplierCosts = pgTable("supplier_costs", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").references(() => suppliers.id).notNull(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  costDate: timestamp("cost_date").defaultNow(),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }).notNull(),
  currencyCode: varchar("currency_code", { length: 3 }).default('USD'),
  quantity: integer("quantity"),
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }),
  priceFluctuation: decimal("price_fluctuation", { precision: 5, scale: 2 }), // percentage change from previous
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const supplierInvoices = pgTable("supplier_invoices", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  supplierId: integer("supplier_id").references(() => suppliers.id).notNull(),
  invoiceNumber: varchar("invoice_number", { length: 120 }),
  invoiceDate: timestamp("invoice_date").defaultNow().notNull(),
  status: varchar("status", { length: 30 }).default("imported").notNull(),
  sourceType: varchar("source_type", { length: 30 }).default("manual").notNull(),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }),
  currencyCode: varchar("currency_code", { length: 3 }).default("USD"),
  notes: text("notes"),
  importedByUserId: integer("imported_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const supplierInvoiceLineItems = pgTable("supplier_invoice_line_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").references(() => supplierInvoices.id).notNull(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  supplierId: integer("supplier_id").references(() => suppliers.id).notNull(),
  productId: integer("product_id").references(() => products.id),
  sourceSku: varchar("source_sku", { length: 120 }),
  description: text("description").notNull(),
  quantity: integer("quantity"),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }).notNull(),
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }),
  matchStatus: varchar("match_status", { length: 30 }).default("unmatched").notNull(),
  matchConfidence: decimal("match_confidence", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const priceChangeApprovals = pgTable("price_change_approvals", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  supplierCostId: integer("supplier_cost_id").references(() => supplierCosts.id),
  invoiceLineItemId: integer("invoice_line_item_id").references(() => supplierInvoiceLineItems.id),
  oldPrice: decimal("old_price", { precision: 10, scale: 2 }).notNull(),
  recommendedPrice: decimal("recommended_price", { precision: 10, scale: 2 }).notNull(),
  targetMargin: decimal("target_margin", { precision: 5, scale: 2 }).notNull(),
  latestUnitCost: decimal("latest_unit_cost", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { length: 30 }).default("pending").notNull(),
  requestedByUserId: integer("requested_by_user_id").references(() => users.id),
  reviewedByUserId: integer("reviewed_by_user_id").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  appliedAt: timestamp("applied_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const repricingSchedules = pgTable("repricing_schedules", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull().unique(),
  isEnabled: boolean("is_enabled").default(false).notNull(),
  targetMargin: decimal("target_margin", { precision: 5, scale: 2 }).default("35").notNull(),
  mode: varchar("mode", { length: 30 }).default("approval_required").notNull(),
  frequency: varchar("frequency", { length: 30 }).default("daily").notNull(),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Negotiation recommendations
const negotiationRecommendations = pgTable("negotiation_recommendations", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").references(() => suppliers.id).notNull(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  recommendationDate: timestamp("recommendation_date").defaultNow(),
  recommendationType: varchar("recommendation_type", { length: 50 }).notNull(), // e.g., price, volume, terms
  status: negotiationStatusEnum("status").default('pending'),
  currentValue: decimal("current_value", { precision: 10, scale: 2 }),
  recommendedValue: decimal("recommended_value", { precision: 10, scale: 2 }),
  potentialSavings: decimal("potential_savings", { precision: 10, scale: 2 }),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }),
  rationale: text("rationale"),
  tactics: json("tactics"), // JSON array of suggested negotiation tactics
  implementedAt: timestamp("implemented_at"),
  implementationResults: json("implementation_results"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Sales Channels table
const salesChannels = pgTable("sales_channels", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Product Channel Pricing table
const productChannelPricing = pgTable("product_channel_pricing", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id).notNull(),
  channelId: integer("channel_id").references(() => salesChannels.id).notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  overrideGlobalRules: boolean("override_global_rules").default(false).notNull(),
  channelSpecificRules: json("channel_specific_rules"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Price Rule Channel Assignments table
const priceRuleChannels = pgTable("price_rule_channels", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id").references(() => priceRules.id).notNull(),
  channelId: integer("channel_id").references(() => salesChannels.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Channel Performance Metrics table
const channelPerformanceMetrics = pgTable("channel_performance_metrics", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  channelId: integer("channel_id").references(() => salesChannels.id).notNull(),
  date: timestamp("date").notNull(),
  revenue: decimal("revenue", { precision: 12, scale: 2 }).default("0").notNull(),
  unitsSold: integer("units_sold").default(0).notNull(),
  averageOrderValue: decimal("average_order_value", { precision: 10, scale: 2 }),
  conversionRate: decimal("conversion_rate", { precision: 5, scale: 2 }),
  profitMargin: decimal("profit_margin", { precision: 5, scale: 2 }),
  metrics: json("metrics"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Store Integration Feature Tables

// Enhanced Store Profiles table
const storeProfiles = pgTable("store_profiles", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: text("description"),
  logoUrl: text("logo_url"),
  bannerUrl: text("banner_url"),
  themeColor: varchar("theme_color", { length: 7 }),
  contactEmail: varchar("contact_email", { length: 255 }),
  contactPhone: varchar("contact_phone", { length: 20 }),
  website: text("website"),
  socialLinks: json("social_links").$type<{platform: string, url: string}[]>(),
  storeType: varchar("store_type", { length: 50 }),
  businessHours: json("business_hours"),
  isVerified: boolean("is_verified").default(false),
  verificationDate: timestamp("verification_date"),
  integrationSettings: json("integration_settings"),
  integrationType: storeIntegrationTypeEnum("integration_type").default('manual'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Store Followers table (users following stores)
const storeFollowers = pgTable("store_followers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  storeId: integer("store_id").references(() => storeProfiles.id).notNull(),
  followDate: timestamp("follow_date").defaultNow().notNull(),
  notificationPreferences: json("notification_preferences").$type<{
    promotions: boolean,
    newProducts: boolean,
    priceDrops: boolean,
    restockAlerts: boolean
  }>().default({
    promotions: true,
    newProducts: false,
    priceDrops: true,
    restockAlerts: false
  }),
  status: varchar("status", { length: 20 }).default('active').notNull(),
  lastNotified: timestamp("last_notified"),
});

// Enhanced Promotions Table with Extended Capabilities
const enhancedPromotions = pgTable("enhanced_promotions", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  type: promotionTypeEnum("type").notNull(),
  value: decimal("value", { precision: 10, scale: 2 }).notNull(),  // Percentage or fixed amount
  code: varchar("code", { length: 50 }),
  minPurchase: decimal("min_purchase", { precision: 10, scale: 2 }),
  maxDiscount: decimal("max_discount", { precision: 10, scale: 2 }),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  targetSegments: json("target_segments").$type<number[]>().default([]),
  appliedProducts: json("applied_products").$type<number[]>().default([]),
  excludedProducts: json("excluded_products").$type<number[]>().default([]),
  usageLimit: integer("usage_limit"),
  usageCount: integer("usage_count").default(0),
  isActive: boolean("is_active").default(true),
  status: varchar("status", { length: 20 }).default('scheduled').notNull(),
  termsAndConditions: text("terms_and_conditions"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Store Integration Logs
const storeIntegrationLogs = pgTable("store_integration_logs", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id).notNull(),
  integrationType: storeIntegrationTypeEnum("integration_type").notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  details: json("details"),
  errorMessage: text("error_message"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Store Notifications (for tracking notification history)
const storeNotifications = pgTable("store_notifications", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => storeProfiles.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message").notNull(),
  type: varchar("type", { length: 50 }).notNull(), // promotion, price_drop, restock, new_product
  relatedEntityType: varchar("related_entity_type", { length: 50 }),
  relatedEntityId: integer("related_entity_id"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at"),
});

// Store Products table - separate from the main products table
const storeProducts = pgTable("store_products", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => storeProfiles.id).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  sku: varchar("sku", { length: 100 }),
  basePrice: decimal("base_price", { precision: 10, scale: 2 }).notNull(),
  currentPrice: decimal("current_price", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Product Reviews table
const productReviews = pgTable("product_reviews", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => storeProducts.id).notNull(),
  authorName: varchar("author_name", { length: 100 }).notNull(),
  authorEmail: varchar("author_email", { length: 255 }).notNull(),
  rating: integer("rating").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  helpful: integer("helpful").default(0).notNull(),
  verified: boolean("verified").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Define relations between tables
const usersRelations = relations(users, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [users.vendorId],
    references: [vendors.id],
  }),
  createdInvitations: many(invitations, { relationName: "createdInvitations" }),
  activityLogs: many(userActivityLogs),
  settings: one(userSettings, {
    fields: [users.id],
    references: [userSettings.userId],
  }),
  permissions: many(userPermissions),
  assignedPermissions: many(userPermissions, { relationName: "assignedPermissions" }),
}));

const vendorsRelations = relations(vendors, ({ many, one }) => ({
  users: many(users),
  products: many(products),
  competitors: many(competitors),
  priceRules: many(priceRules),
  promotions: many(promotions),
  invitations: many(invitations),
  activityLogs: many(userActivityLogs),
  permissionProfiles: many(permissionProfiles),
  marketingCampaigns: many(marketingCampaigns),
  productPerformanceMetrics: many(productPerformanceMetrics),
  timeSeriesForecasts: many(timeSeriesForecasts),
  competitorTrendAnalysis: many(competitorTrendAnalysis),
  catalogPriceSnapshots: many(catalogPriceSnapshots),
  customers: many(customers),
  customerSegments: many(customerSegments),
  rfmAnalyses: many(rfmAnalysis),
  // Supplier relations
  suppliers: many(suppliers),
  supplierPerformance: many(supplierPerformance),
  // Channel relations
  salesChannels: many(salesChannels),
  channelPerformanceMetrics: many(channelPerformanceMetrics),
  // Store relations
  storeProfile: one(storeProfiles, {
    fields: [vendors.id],
    references: [storeProfiles.vendorId],
  }),
  enhancedPromotions: many(enhancedPromotions),
  storeIntegrationLogs: many(storeIntegrationLogs),
}));

const productsRelations = relations(products, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [products.vendorId],
    references: [vendors.id],
  }),
  priceHistory: many(priceHistory),
  competitorProducts: many(competitorProducts),
  performanceMetrics: many(productPerformanceMetrics),
  forecasts: many(timeSeriesForecasts),
  channelPricing: many(productChannelPricing),
}));

const invitationsRelations = relations(invitations, ({ one }) => ({
  vendor: one(vendors, {
    fields: [invitations.vendorId],
    references: [vendors.id],
  }),
  createdBy: one(users, {
    fields: [invitations.createdBy],
    references: [users.id],
    relationName: "createdInvitations",
  }),
}));

// Marketing Campaigns relations
const marketingCampaignsRelations = relations(marketingCampaigns, ({ one }) => ({
  vendor: one(vendors, {
    fields: [marketingCampaigns.vendorId],
    references: [vendors.id],
  }),
}));

// Additional relation definitions for new tables
const userActivityLogsRelations = relations(userActivityLogs, ({ one }) => ({
  user: one(users, {
    fields: [userActivityLogs.userId],
    references: [users.id],
  }),
  vendor: one(vendors, {
    fields: [userActivityLogs.vendorId],
    references: [vendors.id],
  }),
}));

// Advanced Analytics relations
const productPerformanceMetricsRelations = relations(productPerformanceMetrics, ({ one }) => ({
  product: one(products, {
    fields: [productPerformanceMetrics.productId],
    references: [products.id],
  }),
  vendor: one(vendors, {
    fields: [productPerformanceMetrics.vendorId],
    references: [vendors.id],
  }),
}));

const timeSeriesForecastsRelations = relations(timeSeriesForecasts, ({ one }) => ({
  product: one(products, {
    fields: [timeSeriesForecasts.productId],
    references: [products.id],
  }),
  vendor: one(vendors, {
    fields: [timeSeriesForecasts.vendorId],
    references: [vendors.id],
  }),
}));

const competitorTrendAnalysisRelations = relations(competitorTrendAnalysis, ({ one }) => ({
  vendor: one(vendors, {
    fields: [competitorTrendAnalysis.vendorId],
    references: [vendors.id],
  }),
  competitor: one(competitors, {
    fields: [competitorTrendAnalysis.competitorId],
    references: [competitors.id],
  }),
}));

// Customer relations
const customersRelations = relations(customers, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [customers.vendorId],
    references: [vendors.id],
  }),
  orders: many(orders),
  rfmAnalyses: many(rfmAnalysis),
  segmentMemberships: many(customerSegmentMemberships),
}));

// Order relations
const ordersRelations = relations(orders, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [orders.vendorId],
    references: [vendors.id],
  }),
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  items: many(orderItems),
}));

// Order items relations
const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

// RFM Analysis relations
const rfmAnalysisRelations = relations(rfmAnalysis, ({ one }) => ({
  vendor: one(vendors, {
    fields: [rfmAnalysis.vendorId],
    references: [vendors.id],
  }),
  customer: one(customers, {
    fields: [rfmAnalysis.customerId],
    references: [customers.id],
  }),
}));

// Customer Segments relations
const customerSegmentsRelations = relations(customerSegments, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [customerSegments.vendorId],
    references: [vendors.id],
  }),
  createdBy: one(users, {
    fields: [customerSegments.createdBy],
    references: [users.id],
  }),
  memberships: many(customerSegmentMemberships),
}));

// Customer Segment Memberships relations
const customerSegmentMembershipsRelations = relations(customerSegmentMemberships, ({ one }) => ({
  segment: one(customerSegments, {
    fields: [customerSegmentMemberships.segmentId],
    references: [customerSegments.id],
  }),
  customer: one(customers, {
    fields: [customerSegmentMemberships.customerId],
    references: [customers.id],
  }),
}));

// Supplier relations
const suppliersRelations = relations(suppliers, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [suppliers.vendorId],
    references: [vendors.id],
  }),
  performance: many(supplierPerformance),
  costs: many(supplierCosts),
  negotiationRecommendations: many(negotiationRecommendations),
}));

// Supplier performance relations
const supplierPerformanceRelations = relations(supplierPerformance, ({ one }) => ({
  supplier: one(suppliers, {
    fields: [supplierPerformance.supplierId],
    references: [suppliers.id],
  }),
  vendor: one(vendors, {
    fields: [supplierPerformance.vendorId],
    references: [vendors.id],
  }),
}));

// Supplier costs relations
const supplierCostsRelations = relations(supplierCosts, ({ one }) => ({
  supplier: one(suppliers, {
    fields: [supplierCosts.supplierId],
    references: [suppliers.id],
  }),
  vendor: one(vendors, {
    fields: [supplierCosts.vendorId],
    references: [vendors.id],
  }),
  product: one(products, {
    fields: [supplierCosts.productId],
    references: [products.id],
  }),
}));

// Negotiation recommendations relations
const negotiationRecommendationsRelations = relations(negotiationRecommendations, ({ one }) => ({
  supplier: one(suppliers, {
    fields: [negotiationRecommendations.supplierId],
    references: [suppliers.id],
  }),
  vendor: one(vendors, {
    fields: [negotiationRecommendations.vendorId],
    references: [vendors.id],
  }),
}));

const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(users, {
    fields: [userSettings.userId],
    references: [users.id],
  }),
}));

const permissionProfilesRelations = relations(permissionProfiles, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [permissionProfiles.vendorId],
    references: [vendors.id],
  }),
  userPermissions: many(userPermissions),
}));

const userPermissionsRelations = relations(userPermissions, ({ one }) => ({
  user: one(users, {
    fields: [userPermissions.userId],
    references: [users.id],
  }),
  profile: one(permissionProfiles, {
    fields: [userPermissions.profileId],
    references: [permissionProfiles.id],
  }),
  assignedBy: one(users, {
    fields: [userPermissions.assignedBy],
    references: [users.id],
    relationName: "assignedPermissions",
  }),
}));

// Sales Channels relations
const salesChannelsRelations = relations(salesChannels, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [salesChannels.vendorId],
    references: [vendors.id],
  }),
  productPricing: many(productChannelPricing),
  priceRules: many(priceRuleChannels),
  performanceMetrics: many(channelPerformanceMetrics),
}));

// Product Channel Pricing relations
const productChannelPricingRelations = relations(productChannelPricing, ({ one }) => ({
  product: one(products, {
    fields: [productChannelPricing.productId],
    references: [products.id],
  }),
  channel: one(salesChannels, {
    fields: [productChannelPricing.channelId],
    references: [salesChannels.id],
  }),
}));

// Price Rule Channel relations
const priceRuleChannelsRelations = relations(priceRuleChannels, ({ one }) => ({
  rule: one(priceRules, {
    fields: [priceRuleChannels.ruleId],
    references: [priceRules.id],
  }),
  channel: one(salesChannels, {
    fields: [priceRuleChannels.channelId],
    references: [salesChannels.id],
  }),
}));

// Price Rules relations
const priceRulesRelations = relations(priceRules, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [priceRules.vendorId],
    references: [vendors.id],
  }),
  channelAssignments: many(priceRuleChannels),
}));

// Channel Performance Metrics relations
const channelPerformanceMetricsRelations = relations(channelPerformanceMetrics, ({ one }) => ({
  vendor: one(vendors, {
    fields: [channelPerformanceMetrics.vendorId],
    references: [vendors.id],
  }),
  channel: one(salesChannels, {
    fields: [channelPerformanceMetrics.channelId],
    references: [salesChannels.id],
  }),
}));

// Store Integration Relations
const storeProfilesRelations = relations(storeProfiles, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [storeProfiles.vendorId],
    references: [vendors.id],
  }),
  followers: many(storeFollowers),
  notifications: many(storeNotifications),
  products: many(storeProducts), // Adding relation to store products
}));

const storeFollowersRelations = relations(storeFollowers, ({ one }) => ({
  user: one(users, {
    fields: [storeFollowers.userId],
    references: [users.id],
  }),
  store: one(storeProfiles, {
    fields: [storeFollowers.storeId],
    references: [storeProfiles.id],
  }),
}));

const enhancedPromotionsRelations = relations(enhancedPromotions, ({ one }) => ({
  vendor: one(vendors, {
    fields: [enhancedPromotions.vendorId],
    references: [vendors.id],
  }),
}));

const storeIntegrationLogsRelations = relations(storeIntegrationLogs, ({ one }) => ({
  vendor: one(vendors, {
    fields: [storeIntegrationLogs.vendorId],
    references: [vendors.id],
  }),
}));

const storeNotificationsRelations = relations(storeNotifications, ({ one }) => ({
  store: one(storeProfiles, {
    fields: [storeNotifications.storeId],
    references: [storeProfiles.id],
  }),
  user: one(users, {
    fields: [storeNotifications.userId],
    references: [users.id],
  }),
}));

// Product Reviews table - Removed duplicate declaration that was here

// Store products relations
const storeProductsRelations = relations(storeProducts, ({ one, many }) => ({
  store: one(storeProfiles, {
    fields: [storeProducts.storeId],
    references: [storeProfiles.id],
  }),
  reviews: many(productReviews),
}));

// Product reviews relations
const productReviewsRelations = relations(productReviews, ({ one }) => ({
  product: one(storeProducts, {
    fields: [productReviews.productId],
    references: [storeProducts.id],
  }),
}));

// Export types
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type SelectUser = Omit<User, 'password'>;

export type Vendor = typeof vendors.$inferSelect;
export type Product = typeof products.$inferSelect;
export type PriceRule = typeof priceRules.$inferSelect;
export type PriceHistory = typeof priceHistory.$inferSelect;
export type CatalogPriceSnapshot = typeof catalogPriceSnapshots.$inferSelect;
export type InsertCatalogPriceSnapshot = typeof catalogPriceSnapshots.$inferInsert;
export type Competitor = typeof competitors.$inferSelect;
export type CompetitorProduct = typeof competitorProducts.$inferSelect;
export type CompetitorPrice = typeof competitorPrices.$inferSelect;
export type Promotion = typeof promotions.$inferSelect;
export type SystemStatus = typeof systemStatus.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type InsertInvitation = typeof invitations.$inferInsert;

// Export new team management types
export type UserActivityLog = typeof userActivityLogs.$inferSelect;
export type InsertUserActivityLog = typeof userActivityLogs.$inferInsert;
export type UserStoreSession = typeof userStoreSessions.$inferSelect;
export type InsertUserStoreSession = typeof userStoreSessions.$inferInsert;
export type UserBookmark = typeof userBookmarks.$inferSelect;
export type InsertUserBookmark = typeof userBookmarks.$inferInsert;
export type UserSetting = typeof userSettings.$inferSelect;
export type InsertUserSetting = typeof userSettings.$inferInsert;
export type PermissionProfile = typeof permissionProfiles.$inferSelect;
export type InsertPermissionProfile = typeof permissionProfiles.$inferInsert;
export type UserPermission = typeof userPermissions.$inferSelect;
export type InsertUserPermission = typeof userPermissions.$inferInsert;

// Export marketing campaign types
export type MarketingCampaign = typeof marketingCampaigns.$inferSelect;
export type InsertMarketingCampaign = typeof marketingCampaigns.$inferInsert;

// Export analytics types
export type ProductPerformanceMetric = typeof productPerformanceMetrics.$inferSelect;
export type InsertProductPerformanceMetric = typeof productPerformanceMetrics.$inferInsert;
export type TimeSeriesForecast = typeof timeSeriesForecasts.$inferSelect;
export type InsertTimeSeriesForecast = typeof timeSeriesForecasts.$inferInsert;
export type CompetitorTrendAnalysis = typeof competitorTrendAnalysis.$inferSelect;
export type InsertCompetitorTrendAnalysis = typeof competitorTrendAnalysis.$inferInsert;

// Export customer and segmentation types
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = typeof orderItems.$inferInsert;
export type RfmAnalysis = typeof rfmAnalysis.$inferSelect;
export type InsertRfmAnalysis = typeof rfmAnalysis.$inferInsert;
export type CustomerSegment = typeof customerSegments.$inferSelect;
export type InsertCustomerSegment = typeof customerSegments.$inferInsert;
export type CustomerSegmentMembership = typeof customerSegmentMemberships.$inferSelect;
export type InsertCustomerSegmentMembership = typeof customerSegmentMemberships.$inferInsert;

// Export supplier management types
export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = typeof suppliers.$inferInsert;
export type SupplierPerformance = typeof supplierPerformance.$inferSelect;
export type InsertSupplierPerformance = typeof supplierPerformance.$inferInsert;
export type SupplierCost = typeof supplierCosts.$inferSelect;
export type InsertSupplierCost = typeof supplierCosts.$inferInsert;
export type SupplierInvoice = typeof supplierInvoices.$inferSelect;
export type InsertSupplierInvoice = typeof supplierInvoices.$inferInsert;
export type SupplierInvoiceLineItem = typeof supplierInvoiceLineItems.$inferSelect;
export type InsertSupplierInvoiceLineItem = typeof supplierInvoiceLineItems.$inferInsert;
export type PriceChangeApproval = typeof priceChangeApprovals.$inferSelect;
export type InsertPriceChangeApproval = typeof priceChangeApprovals.$inferInsert;
export type RepricingSchedule = typeof repricingSchedules.$inferSelect;
export type InsertRepricingSchedule = typeof repricingSchedules.$inferInsert;
export type NegotiationRecommendation = typeof negotiationRecommendations.$inferSelect;
export type InsertNegotiationRecommendation = typeof negotiationRecommendations.$inferInsert;

// Store integration types
export type StoreProfile = typeof storeProfiles.$inferSelect;
export type InsertStoreProfile = typeof storeProfiles.$inferInsert;
export type StoreFollower = typeof storeFollowers.$inferSelect;
export type InsertStoreFollower = typeof storeFollowers.$inferInsert;
export type EnhancedPromotion = typeof enhancedPromotions.$inferSelect;
export type InsertEnhancedPromotion = typeof enhancedPromotions.$inferInsert;
export type StoreIntegrationLog = typeof storeIntegrationLogs.$inferSelect;
export type InsertStoreIntegrationLog = typeof storeIntegrationLogs.$inferInsert;
export type StoreNotification = typeof storeNotifications.$inferSelect;
export type InsertStoreNotification = typeof storeNotifications.$inferInsert;
export type StoreProduct = typeof storeProducts.$inferSelect;
export type InsertStoreProduct = typeof storeProducts.$inferInsert;
export type ProductReview = typeof productReviews.$inferSelect;
export type InsertProductReview = typeof productReviews.$inferInsert;

// Channel pricing types
export type SalesChannel = typeof salesChannels.$inferSelect;
export type InsertSalesChannel = typeof salesChannels.$inferInsert;
export type ProductChannelPricing = typeof productChannelPricing.$inferSelect;
export type InsertProductChannelPricing = typeof productChannelPricing.$inferInsert;
export type PriceRuleChannel = typeof priceRuleChannels.$inferSelect;
export type InsertPriceRuleChannel = typeof priceRuleChannels.$inferInsert;
export type ChannelPerformanceMetric = typeof channelPerformanceMetrics.$inferSelect;
export type InsertChannelPerformanceMetric = typeof channelPerformanceMetrics.$inferInsert;


// Export schemas
export const insertUserSchema = createInsertSchema(users, {
  password: z.string().min(8, "Password must be at least 8 characters"),
  email: z.string().email("Invalid email format"),
});

export const insertVendorSchema = createInsertSchema(vendors);
export const selectVendorSchema = createSelectSchema(vendors);
export const insertProductSchema = createInsertSchema(products);
export const selectProductSchema = createSelectSchema(products);
export const insertCompetitorSchema = createInsertSchema(competitors);
export const selectCompetitorSchema = createSelectSchema(competitors);
export const insertPromotionSchema = createInsertSchema(promotions);
export const selectPromotionSchema = createSelectSchema(promotions);
export const insertInvitationSchema = createInsertSchema(invitations, {
  email: z.string().email("Invalid email format").optional(),
  phone: z.string().min(10, "Phone number must be at least 10 digits").optional(),
}).refine(data => data.email || data.phone, {
  message: "Either email or phone must be provided",
});
export const selectInvitationSchema = createSelectSchema(invitations);

// New schemas for team management
export const insertUserActivityLogSchema = createInsertSchema(userActivityLogs);
export const selectUserActivityLogSchema = createSelectSchema(userActivityLogs);

export const insertUserStoreSessionSchema = createInsertSchema(userStoreSessions);
export const selectUserStoreSessionSchema = createSelectSchema(userStoreSessions);

export const insertUserBookmarkSchema = createInsertSchema(userBookmarks);
export const selectUserBookmarkSchema = createSelectSchema(userBookmarks);

export const insertUserSettingSchema = createInsertSchema(userSettings);
export const selectUserSettingSchema = createSelectSchema(userSettings);

export const insertPermissionProfileSchema = createInsertSchema(permissionProfiles, {
  permissions: z.record(z.string(), z.boolean()),
});
export const selectPermissionProfileSchema = createSelectSchema(permissionProfiles);

export const insertUserPermissionSchema = createInsertSchema(userPermissions, {
  customPermissions: z.record(z.string(), z.boolean()).optional(),
});
export const selectUserPermissionSchema = createSelectSchema(userPermissions);

// Marketing campaigns schemas
export const insertMarketingCampaignSchema = createInsertSchema(marketingCampaigns, {
  channels: z.array(z.string()).min(1, "Select at least one channel"),
  goals: z.object({
    sales: z.string().optional(),
    engagement: z.string().optional(),
    awareness: z.string().optional(),
  }).optional(),
  // Make client-server validation consistent
  budget: z.union([z.string(), z.number()]).transform(val => 
    typeof val === 'string' ? parseFloat(val) : val
  ),
  startDate: z.union([z.string(), z.date()]).transform(val => 
    typeof val === 'string' ? new Date(val) : val
  ),
  endDate: z.union([z.string(), z.date()]).transform(val => 
    typeof val === 'string' ? new Date(val) : val
  ),
  vendorId: z.number().optional(),
});
export const selectMarketingCampaignSchema = createSelectSchema(marketingCampaigns);

export const insertMarketingAbTestSchema = createInsertSchema(marketingAbTests, {
  name: z.string().min(3, "Name must be at least 3 characters"),
  description: z.string().min(5, "Description must be at least 5 characters"),
  hypothesis: z.string().min(10, "Hypothesis must be at least 10 characters"),
  goalMetric: z.string().min(2, "Goal metric is required"),
  trafficAllocation: z.number().min(1).max(100),
  tags: z.array(z.string()).default([]),
  startDate: z.union([z.string(), z.date()]).transform((val) =>
    typeof val === 'string' ? new Date(val) : val
  ).optional(),
  endDate: z.union([z.string(), z.date()]).transform((val) =>
    typeof val === 'string' ? new Date(val) : val
  ).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });
export const selectMarketingAbTestSchema = createSelectSchema(marketingAbTests);

export const insertMarketingAbTestVariantSchema = createInsertSchema(marketingAbTestVariants, {
  name: z.string().min(1, "Variant name is required"),
  description: z.string().min(1, "Variant description is required"),
  traffic: z.number().min(1).max(100),
}).omit({ id: true, createdAt: true, updatedAt: true });
export const selectMarketingAbTestVariantSchema = createSelectSchema(marketingAbTestVariants);

export const insertMarketingAbTestEventSchema = createInsertSchema(marketingAbTestEvents, {
  visitorKey: z.string().min(1, "visitorKey is required"),
  eventValue: z.union([z.string(), z.number()]).transform((val) =>
    typeof val === 'string' ? parseFloat(val) : val
  ).optional(),
}).omit({ id: true, createdAt: true });
export const selectMarketingAbTestEventSchema = createSelectSchema(marketingAbTestEvents);

export const insertMarketingCustomerJourneySchema = createInsertSchema(marketingCustomerJourneys, {
  name: z.string().min(3, "Name must be at least 3 characters"),
  description: z.string().min(5, "Description must be at least 5 characters"),
  segmentId: z.number().int().positive("Please select a customer segment"),
}).omit({ id: true, createdAt: true, updatedAt: true, vendorId: true });
export const selectMarketingCustomerJourneySchema = createSelectSchema(marketingCustomerJourneys);

export const insertMarketingJourneyStageSchema = createInsertSchema(marketingJourneyStages, {
  name: z.string().min(2, "Stage name is required"),
  description: z.string().min(5, "Stage description is required"),
  duration: z.string().min(1, "Stage duration is required"),
  conversionRate: z.union([z.string(), z.number()]).transform((val) =>
    typeof val === 'string' ? parseFloat(val) : val
  ),
  painPoints: z.array(z.string()).default([]),
  opportunities: z.array(z.string()).default([]),
}).omit({ id: true, createdAt: true, updatedAt: true });
export const selectMarketingJourneyStageSchema = createSelectSchema(marketingJourneyStages);

export const insertMarketingJourneyTouchpointSchema = createInsertSchema(marketingJourneyTouchpoints, {
  name: z.string().min(2, "Touchpoint name is required"),
  description: z.string().min(5, "Description must be at least 5 characters"),
  dropoff: z.number().min(0).max(100).default(0),
  metrics: z.object({
    engagementRate: z.number().min(0).max(100).optional(),
    conversionRate: z.number().min(0).max(100).optional(),
    bounceRate: z.number().min(0).max(100).optional(),
    responseTime: z.string().optional(),
  }).default({}),
}).omit({ id: true, createdAt: true, updatedAt: true, position: true });
export const selectMarketingJourneyTouchpointSchema = createSelectSchema(marketingJourneyTouchpoints);

export const insertMarketingPersonalizationTemplateSchema = createInsertSchema(marketingPersonalizationTemplates, {
  name: z.string().min(2, "Template name is required"),
  description: z.string().min(5, "Description must be at least 5 characters"),
  structure: z.string().min(3, "Template structure is required"),
  tags: z.array(z.string()).default([]),
}).omit({ id: true, createdAt: true, updatedAt: true, vendorId: true });
export const selectMarketingPersonalizationTemplateSchema = createSelectSchema(marketingPersonalizationTemplates);

export const insertMarketingPersonalizationRuleSchema = createInsertSchema(marketingPersonalizationRules, {
  name: z.string().min(3, "Rule name must be at least 3 characters"),
  description: z.string().min(5, "Description must be at least 5 characters"),
  audience: z.string().min(1, "Audience is required"),
  priority: z.number().int().min(1).max(1000).default(100),
  startDate: z.union([z.string(), z.date()]).transform((val) =>
    typeof val === 'string' ? new Date(val) : val
  ).optional().nullable(),
  endDate: z.union([z.string(), z.date()]).transform((val) =>
    typeof val === 'string' ? new Date(val) : val
  ).optional().nullable(),
  conditions: z.object({
    segment: z.string().optional(),
    behavior: z.string().optional(),
    device: z.string().optional(),
    location: z.string().optional(),
    time: z.string().optional(),
  }).refine((data) => Object.values(data).some(Boolean), {
    message: "At least one condition is required",
  }),
}).omit({ id: true, createdAt: true, updatedAt: true, vendorId: true, createdByUserId: true });
export const selectMarketingPersonalizationRuleSchema = createSelectSchema(marketingPersonalizationRules);

export const insertMarketingPersonalizationVariationSchema = createInsertSchema(marketingPersonalizationVariations, {
  name: z.string().min(1, "Variation name is required"),
  content: z.string().min(1, "Variation content is required"),
}).omit({ id: true, createdAt: true, updatedAt: true, impressions: true, conversions: true });
export const selectMarketingPersonalizationVariationSchema = createSelectSchema(marketingPersonalizationVariations);

export const insertMarketingPersonalizationEventSchema = createInsertSchema(marketingPersonalizationEvents, {
  visitorKey: z.string().min(1, "visitorKey is required"),
  eventValue: z.union([z.string(), z.number()]).transform((val) =>
    typeof val === 'string' ? parseFloat(val) : val
  ).optional(),
}).omit({ id: true, createdAt: true, vendorId: true });
export const selectMarketingPersonalizationEventSchema = createSelectSchema(marketingPersonalizationEvents);

// Analytics schemas
export const insertProductPerformanceMetricSchema = createInsertSchema(productPerformanceMetrics);
export const selectProductPerformanceMetricSchema = createSelectSchema(productPerformanceMetrics);
export const insertTimeSeriesForecastSchema = createInsertSchema(timeSeriesForecasts);
export const selectTimeSeriesForecastSchema = createSelectSchema(timeSeriesForecasts);
export const insertCompetitorTrendAnalysisSchema = createInsertSchema(competitorTrendAnalysis);
export const selectCompetitorTrendAnalysisSchema = createSelectSchema(competitorTrendAnalysis);

// Customer and segmentation schemas
export const insertCustomerSchema = createInsertSchema(customers, {
  email: z.string().email("Invalid email format"),
});
export const selectCustomerSchema = createSelectSchema(customers);

export const insertOrderSchema = createInsertSchema(orders);
export const selectOrderSchema = createSelectSchema(orders);

export const insertOrderItemSchema = createInsertSchema(orderItems);
export const selectOrderItemSchema = createSelectSchema(orderItems);

export const insertRfmAnalysisSchema = createInsertSchema(rfmAnalysis);
export const selectRfmAnalysisSchema = createSelectSchema(rfmAnalysis);

export const insertCustomerSegmentSchema = createInsertSchema(customerSegments, {
  conditions: z.record(z.string(), z.any()).or(z.array(z.any())),
});
export const selectCustomerSegmentSchema = createSelectSchema(customerSegments);

export const insertCustomerSegmentMembershipSchema = createInsertSchema(customerSegmentMemberships);
export const selectCustomerSegmentMembershipSchema = createSelectSchema(customerSegmentMemberships);

// Supplier management schemas
export const insertSupplierSchema = createInsertSchema(suppliers, {
  name: z.string().min(2, "Supplier name must be at least 2 characters"),
  contactEmail: z.string().email("Invalid email format").optional().nullable(),
  performanceScore: z.union([z.string(), z.number()]).transform(val => 
    typeof val === 'string' ? parseFloat(val) : val
  ).optional(),
});
export const selectSupplierSchema = createSelectSchema(suppliers);

export const insertSupplierPerformanceSchema = createInsertSchema(supplierPerformance);
export const selectSupplierPerformanceSchema = createSelectSchema(supplierPerformance);

export const insertSupplierCostSchema = createInsertSchema(supplierCosts, {
  unitCost: z.union([z.string(), z.number()]).transform(val => 
    typeof val === 'string' ? parseFloat(val) : val
  ),
  totalCost: z.union([z.string(), z.number()]).transform(val => 
    typeof val === 'string' ? parseFloat(val) : val
  ).optional(),
  priceFluctuation: z.union([z.string(), z.number()]).transform(val => 
    typeof val === 'string' ? parseFloat(val) : val
  ).optional(),
});
export const selectSupplierCostSchema = createSelectSchema(supplierCosts);

export const insertNegotiationRecommendationSchema = createInsertSchema(negotiationRecommendations, {
  tactics: z.array(z.object({
    tactic: z.string(),
    description: z.string(),
    priority: z.number().optional(),
  })).optional().nullable(),
  implementationResults: z.object({
    actualSavings: z.number().optional(),
    successLevel: z.string().optional(),
    notes: z.string().optional(),
  }).optional().nullable(),
});
export const selectNegotiationRecommendationSchema = createSelectSchema(negotiationRecommendations);

// Store integration schemas
export const insertStoreProfileSchema = createInsertSchema(storeProfiles, {
  name: z.string().min(2, "Store name must be at least 2 characters"),
  description: z.string().optional(),
  themeColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Theme color must be a valid hex color").optional(),
  contactEmail: z.string().email("Invalid email format").optional().or(z.literal("")),
});
export const selectStoreProfileSchema = createSelectSchema(storeProfiles);

export const insertStoreFollowerSchema = createInsertSchema(storeFollowers, {
  notificationPreferences: z.object({
    promotions: z.boolean().default(true),
    newProducts: z.boolean().default(false),
    priceDrops: z.boolean().default(true),
    restockAlerts: z.boolean().default(false)
  }).optional(),
});
export const selectStoreFollowerSchema = createSelectSchema(storeFollowers);

export const insertEnhancedPromotionSchema = createInsertSchema(enhancedPromotions, {
  name: z.string().min(2, "Promotion name must be at least 2 characters"),
  type: z.enum(['percent_off', 'amount_off', 'buy_one_get_one', 'free_shipping', 'bundle', 'gift_with_purchase', 'other']),
  value: z.union([z.string(), z.number()]).transform(val => 
    typeof val === 'string' ? parseFloat(val) : val
  ),
  minPurchase: z.union([z.string(), z.number()]).transform(val => 
    typeof val === 'string' ? parseFloat(val) : val
  ).optional(),
  maxDiscount: z.union([z.string(), z.number()]).transform(val => 
    typeof val === 'string' ? parseFloat(val) : val
  ).optional(),
  startDate: z.union([z.string(), z.date()]).transform(val => 
    typeof val === 'string' ? new Date(val) : val
  ),
  endDate: z.union([z.string(), z.date()]).transform(val => 
    typeof val === 'string' ? new Date(val) : val
  ),
  targetSegments: z.array(z.number()).default([]),
  appliedProducts: z.array(z.number()).default([]),
  excludedProducts: z.array(z.number()).default([]),
});
export const selectEnhancedPromotionSchema = createSelectSchema(enhancedPromotions);

export const insertStoreIntegrationLogSchema = createInsertSchema(storeIntegrationLogs);
export const selectStoreIntegrationLogSchema = createSelectSchema(storeIntegrationLogs);

export const insertStoreNotificationSchema = createInsertSchema(storeNotifications, {
  title: z.string().min(2, "Notification title must be at least 2 characters"),
  message: z.string().min(2, "Notification message must be at least 2 characters"),
});
export const selectStoreNotificationSchema = createSelectSchema(storeNotifications);

export const insertStoreProductSchema = createInsertSchema(storeProducts, {
  name: z.string().min(2, "Product name must be at least 2 characters"),
  basePrice: z.union([z.string(), z.number()]).transform(val => 
    typeof val === 'string' ? parseFloat(val) : val
  ),
  currentPrice: z.union([z.string(), z.number()]).transform(val => 
    typeof val === 'string' ? parseFloat(val) : val
  ),
  category: z.string().optional(),
});
export const selectStoreProductSchema = createSelectSchema(storeProducts);

export const insertProductReviewSchema = createInsertSchema(productReviews, {
  rating: z.number().min(1, "Rating must be at least 1").max(5, "Rating cannot exceed 5"),
  authorName: z.string().min(2, "Name must be at least 2 characters"),
  authorEmail: z.string().email("Invalid email format"),
  title: z.string().min(2, "Title must be at least 2 characters"),
  content: z.string().min(10, "Review content must be at least 10 characters"),
});
export const selectProductReviewSchema = createSelectSchema(productReviews);

// Single export of all tables
export {
  users,
  vendors,
  products,
  priceRules,
  priceHistory,
  catalogPriceSnapshots,
  competitors,
  competitorProducts,
  competitorPrices,
  promotions,
  systemStatus,
  invitations,
  // New tables for team management
  userActivityLogs,
  userStoreSessions,
  userBookmarks,
  userSettings,
  permissionProfiles,
  userPermissions,
  // Marketing campaigns
  marketingCampaigns,
  marketingAbTests,
  marketingAbTestVariants,
  marketingAbTestEvents,
  marketingCustomerJourneys,
  marketingJourneyStages,
  marketingJourneyTouchpoints,
  marketingPersonalizationTemplates,
  marketingPersonalizationRules,
  marketingPersonalizationVariations,
  marketingPersonalizationEvents,
  // Analytics tables
  productPerformanceMetrics,
  timeSeriesForecasts,
  competitorTrendAnalysis,
  // Customer and segmentation tables
  customers,
  orders,
  orderItems,
  rfmAnalysis,
  customerSegments,
  customerSegmentMemberships,
  
  // Supplier management tables
  suppliers,
  supplierPerformance,
  supplierCosts,
  supplierInvoices,
  supplierInvoiceLineItems,
  priceChangeApprovals,
  repricingSchedules,
  negotiationRecommendations,
  
  // Channel management tables
  salesChannels,
  productChannelPricing,
  priceRuleChannels,
  channelPerformanceMetrics,
  
  // Store integration tables
  storeProfiles,
  storeFollowers,
  enhancedPromotions,
  storeIntegrationLogs,
  storeNotifications,
  storeProducts,
  productReviews,
};
