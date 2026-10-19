import { db, pool } from "./db";
import {
  customers,
  orders,
  orderItems,
  rfmAnalysis,
  customerSegments,
  customerSegmentMemberships,
  rfmScoreEnum,
  segmentTypeEnum,
} from "./db/schema";
import { sql } from "drizzle-orm";

async function createCustomerTables() {
  try {
    console.log("Creating customer segmentation tables...");

    // Create new enums first
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE rfm_score AS ENUM ('1', '2', '3', '4', '5');
        EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE segment_type AS ENUM ('custom', 'rfm', 'behavioral', 'demographic');
        EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Create tables
    const createCustomers = await pool.query(`
      CREATE TABLE IF NOT EXISTS "customers" (
        "id" SERIAL PRIMARY KEY,
        "vendor_id" INTEGER NOT NULL REFERENCES "vendors"("id"),
        "email" VARCHAR(255) NOT NULL,
        "first_name" VARCHAR(100),
        "last_name" VARCHAR(100),
        "phone_number" VARCHAR(20),
        "address" TEXT,
        "city" VARCHAR(100),
        "state" VARCHAR(50),
        "zip_code" VARCHAR(20),
        "country" VARCHAR(50) DEFAULT 'US',
        "birth_date" TIMESTAMP,
        "gender" VARCHAR(20),
        "status" VARCHAR(20) DEFAULT 'active' NOT NULL,
        "account_created" TIMESTAMP DEFAULT NOW() NOT NULL,
        "last_active" TIMESTAMP DEFAULT NOW(),
        "total_spent" DECIMAL(10, 2) DEFAULT '0.00',
        "total_orders" INTEGER DEFAULT 0,
        "marketing_consent" BOOLEAN DEFAULT FALSE,
        "preferences" JSONB,
        "source" VARCHAR(50),
        "metadata" JSONB,
        "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
        "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    const createOrders = await pool.query(`
      CREATE TABLE IF NOT EXISTS "orders" (
        "id" SERIAL PRIMARY KEY,
        "vendor_id" INTEGER NOT NULL REFERENCES "vendors"("id"),
        "customer_id" INTEGER NOT NULL REFERENCES "customers"("id"),
        "order_date" TIMESTAMP DEFAULT NOW() NOT NULL,
        "total_amount" DECIMAL(10, 2) NOT NULL,
        "status" VARCHAR(50) DEFAULT 'completed' NOT NULL,
        "payment_method" VARCHAR(50),
        "shipping_method" VARCHAR(50),
        "tracking_number" VARCHAR(100),
        "notes" TEXT,
        "metadata" JSONB,
        "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
        "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    const createOrderItems = await pool.query(`
      CREATE TABLE IF NOT EXISTS "order_items" (
        "id" SERIAL PRIMARY KEY,
        "order_id" INTEGER NOT NULL REFERENCES "orders"("id"),
        "product_id" INTEGER NOT NULL REFERENCES "products"("id"),
        "quantity" INTEGER NOT NULL,
        "unit_price" DECIMAL(10, 2) NOT NULL,
        "discount" DECIMAL(10, 2) DEFAULT '0.00',
        "total_price" DECIMAL(10, 2) NOT NULL,
        "notes" TEXT,
        "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    const createRfmAnalysis = await pool.query(`
      CREATE TABLE IF NOT EXISTS "rfm_analysis" (
        "id" SERIAL PRIMARY KEY,
        "vendor_id" INTEGER NOT NULL REFERENCES "vendors"("id"),
        "customer_id" INTEGER NOT NULL REFERENCES "customers"("id"),
        "recency_score" rfm_score NOT NULL,
        "frequency_score" rfm_score NOT NULL,
        "monetary_score" rfm_score NOT NULL,
        "combined_score" VARCHAR(10) NOT NULL,
        "segment" VARCHAR(50) NOT NULL,
        "last_purchase_date" TIMESTAMP,
        "days_since_last_purchase" INTEGER,
        "purchase_frequency" INTEGER,
        "average_order_value" DECIMAL(10, 2),
        "total_spent" DECIMAL(10, 2),
        "analysis_date" TIMESTAMP DEFAULT NOW() NOT NULL,
        "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    const createCustomerSegments = await pool.query(`
      CREATE TABLE IF NOT EXISTS "customer_segments" (
        "id" SERIAL PRIMARY KEY,
        "vendor_id" INTEGER NOT NULL REFERENCES "vendors"("id"),
        "name" VARCHAR(100) NOT NULL,
        "description" TEXT,
        "type" segment_type DEFAULT 'custom' NOT NULL,
        "conditions" JSONB NOT NULL,
        "is_active" BOOLEAN DEFAULT TRUE NOT NULL,
        "customer_count" INTEGER DEFAULT 0,
        "metrics" JSONB,
        "last_updated" TIMESTAMP DEFAULT NOW() NOT NULL,
        "created_by" INTEGER REFERENCES "users"("id"),
        "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
        "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    const createCustomerSegmentMemberships = await pool.query(`
      CREATE TABLE IF NOT EXISTS "customer_segment_memberships" (
        "id" SERIAL PRIMARY KEY,
        "segment_id" INTEGER NOT NULL REFERENCES "customer_segments"("id"),
        "customer_id" INTEGER NOT NULL REFERENCES "customers"("id"),
        "added_at" TIMESTAMP DEFAULT NOW() NOT NULL,
        "metadata" JSONB
      );
    `);

    // Create indexes for better performance
    const createIndexes = await Promise.all([
      // Customers indexes
      pool.query(`CREATE INDEX IF NOT EXISTS idx_customers_vendor ON customers (vendor_id);`),
      pool.query(`CREATE INDEX IF NOT EXISTS idx_customers_email ON customers (email);`),
      pool.query(`CREATE INDEX IF NOT EXISTS idx_customers_status ON customers (status);`),
      
      // Orders indexes
      pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id);`),
      pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_vendor ON orders (vendor_id);`),
      pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_date ON orders (order_date);`),
      
      // Order items indexes
      pool.query(`CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);`),
      pool.query(`CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items (product_id);`),
      
      // RFM Analysis indexes
      pool.query(`CREATE INDEX IF NOT EXISTS idx_rfm_customer ON rfm_analysis (customer_id);`),
      pool.query(`CREATE INDEX IF NOT EXISTS idx_rfm_combined_score ON rfm_analysis (combined_score);`),
      pool.query(`CREATE INDEX IF NOT EXISTS idx_rfm_segment ON rfm_analysis (segment);`),
      
      // Customer Segments indexes
      pool.query(`CREATE INDEX IF NOT EXISTS idx_segments_vendor ON customer_segments (vendor_id);`),
      pool.query(`CREATE INDEX IF NOT EXISTS idx_segments_type ON customer_segments (type);`),
      
      // Customer Segment Memberships indexes
      pool.query(`CREATE INDEX IF NOT EXISTS idx_memberships_customer ON customer_segment_memberships (customer_id);`),
      pool.query(`CREATE INDEX IF NOT EXISTS idx_memberships_segment ON customer_segment_memberships (segment_id);`),
    ]);

    console.log("Customer segmentation tables created successfully");
    
    // Insert some default segments
    const defaultSegments = await pool.query(`
      INSERT INTO customer_segments 
        (vendor_id, name, description, type, conditions, is_active) 
      VALUES 
        (1, 'High Value Customers', 'Customers with RFM score of 4 or 5 in monetary value', 'rfm', '{"monetary_score": {"min": 4}}', TRUE),
        (1, 'Frequent Shoppers', 'Customers with RFM score of 4 or 5 in frequency', 'rfm', '{"frequency_score": {"min": 4}}', TRUE),
        (1, 'Recent Shoppers', 'Customers with RFM score of 4 or 5 in recency', 'rfm', '{"recency_score": {"min": 4}}', TRUE),
        (1, 'At Risk Customers', 'Customers with high monetary value but low recency', 'rfm', '{"monetary_score": {"min": 4}, "recency_score": {"max": 2}}', TRUE),
        (1, 'New Customers', 'Customers who made their first purchase in the last 30 days', 'behavioral', '{"days_since_first_purchase": {"max": 30}}', TRUE)
      ON CONFLICT DO NOTHING;
    `);

    console.log("Default customer segments added");
    return true;
  } catch (error) {
    console.error("Error creating customer tables:", error);
    return false;
  }
}

// Execute the function
createCustomerTables()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error running migration:", err);
    process.exit(1);
  });

export { createCustomerTables };