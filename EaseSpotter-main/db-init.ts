import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./db/schema";
import { sql } from "drizzle-orm";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }

  // Create a new postgres client with the connection string
  const client = postgres(process.env.DATABASE_URL);
  
  // Create the Drizzle DB instance with schema
  const db = drizzle(client, { schema });

  try {
    console.log("Creating database schema...");
    
    // Create the vendors table
    await client`
      CREATE TABLE IF NOT EXISTS vendors (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        business_name VARCHAR(255) NOT NULL,
        address TEXT,
        phone VARCHAR(20),
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    console.log("Created vendors table");

    // Create the products table
    await client`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER NOT NULL REFERENCES vendors(id),
        name TEXT NOT NULL,
        brand TEXT,
        sku TEXT NOT NULL UNIQUE,
        barcode TEXT,
        base_price DECIMAL(10, 2) NOT NULL,
        current_price DECIMAL(10, 2) NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        aisle TEXT NOT NULL,
        shelf TEXT NOT NULL,
        image_url TEXT,
        model_url TEXT,
        model_format TEXT,
        current_stock INTEGER NOT NULL DEFAULT 0,
        low_stock_threshold INTEGER,
        last_restocked TIMESTAMP,
        reorder_point INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    console.log("Created products table");

    await client`ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT`;
    await client`ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT`;
    console.log("Verified products table optional columns");
    await client`
      DO $$
      BEGIN
        IF to_regclass('public.invitations') IS NOT NULL THEN
          ALTER TABLE invitations ADD COLUMN IF NOT EXISTS permission_profile_id INTEGER;
        END IF;
      END $$;
    `;
    console.log("Verified invitations table optional columns");

    // Create the price_rules table
    await client`
      CREATE TABLE IF NOT EXISTS price_rules (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER NOT NULL REFERENCES vendors(id),
        name TEXT NOT NULL,
        description TEXT,
        conditions JSONB NOT NULL,
        adjustment JSONB NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        priority INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    console.log("Created price_rules table");

    // Create the price_history table
    await client`
      CREATE TABLE IF NOT EXISTS price_history (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id),
        old_price DECIMAL(10, 2) NOT NULL,
        new_price DECIMAL(10, 2) NOT NULL,
        reason TEXT,
        timestamp TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    console.log("Created price_history table");

    // Create the competitors table
    await client`
      CREATE TABLE IF NOT EXISTS competitors (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER NOT NULL REFERENCES vendors(id),
        name VARCHAR(100) NOT NULL,
        website TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        market_share DECIMAL(5, 2),
        price_index DECIMAL(5, 2),
        last_scanned TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    console.log("Created competitors table");

    // Create the competitor_products table
    await client`
      CREATE TABLE IF NOT EXISTS competitor_products (
        id SERIAL PRIMARY KEY,
        competitor_id INTEGER NOT NULL REFERENCES competitors(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        competitor_sku VARCHAR(100),
        competitor_url TEXT,
        is_matched BOOLEAN NOT NULL DEFAULT TRUE,
        match_confidence DECIMAL(5, 2),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    console.log("Created competitor_products table");

    // Create the competitor_prices table
    await client`
      CREATE TABLE IF NOT EXISTS competitor_prices (
        id SERIAL PRIMARY KEY,
        competitor_product_id INTEGER NOT NULL REFERENCES competitor_products(id),
        price DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(3) NOT NULL DEFAULT 'USD',
        is_promotion BOOLEAN DEFAULT FALSE,
        promotion_type VARCHAR(50),
        timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
        availability VARCHAR(50) DEFAULT 'in_stock'
      )
    `;
    console.log("Created competitor_prices table");

    // Create the promotions table
    await client`
      CREATE TABLE IF NOT EXISTS promotions (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER NOT NULL REFERENCES vendors(id),
        name TEXT NOT NULL,
        discount_percent DECIMAL(5, 2) NOT NULL,
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        applied_products JSONB NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    console.log("Created promotions table");

    // Add test data
    console.log("Adding test data...");
    
    // Create a test vendor
    const vendorExists = await client`SELECT EXISTS(SELECT 1 FROM vendors WHERE email = 'test@example.com')`;
    if (!vendorExists[0].exists) {
      await client`
        INSERT INTO vendors (name, email, business_name, address, phone, status)
        VALUES ('Test Vendor', 'test@example.com', 'Test Store Inc.', '123 Test St, Test City', '555-1234', 'active')
      `;
      console.log("Created test vendor");
    } else {
      console.log("Test vendor already exists");
    }
    
    // Get the vendor ID
    const vendor = await client`SELECT id FROM vendors WHERE email = 'test@example.com'`;
    const vendorId = vendor[0].id;
    console.log(`Using vendor ID: ${vendorId}`);
    
    // Check if products exist
    const productCount = await client`SELECT COUNT(*) FROM products`;
    if (parseInt(productCount[0].count) === 0) {
      // Add test products
      const products = [
        ['Laptop', 'TECH-001', 'Electronics', '999.99', '999.99', 50, 'A1', 'S1', 'High-performance laptop with 16GB RAM and 512GB SSD'],
        ['Smartphone', 'TECH-002', 'Electronics', '599.99', '549.99', 100, 'A1', 'S2', 'Latest smartphone with 128GB storage and triple camera'],
        ['Headphones', 'ACC-001', 'Accessories', '99.99', '79.99', 200, 'A2', 'S1', 'Noise-cancelling wireless headphones with 20hr battery life'],
        ['Backpack', 'ACC-002', 'Accessories', '49.99', '49.99', 150, 'A2', 'S2', 'Durable backpack with laptop compartment and water bottle holder'],
        ['Monitor', 'TECH-003', 'Electronics', '299.99', '279.99', 30, 'A1', 'S3', '27-inch 4K monitor with HDR support']
      ];
      
      for (const [name, sku, category, basePrice, currentPrice, stock, aisle, shelf, desc] of products) {
        await client`
          INSERT INTO products (vendor_id, name, sku, category, base_price, current_price, current_stock, aisle, shelf, description)
          VALUES (${vendorId}, ${name}, ${sku}, ${category}, ${basePrice}, ${currentPrice}, ${stock}, ${aisle}, ${shelf}, ${desc})
        `;
      }
      console.log(`Added ${products.length} test products`);
      
      // Get product IDs
      const productIds = await client`SELECT id FROM products`;
      
      // Create price history
      for (const product of productIds) {
        const id = product.id;
        for (let i = 0; i < 7; i++) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          const oldPrice = 90 + Math.random() * 20;
          const newPrice = 90 + Math.random() * 20;
          
          await client`
            INSERT INTO price_history (product_id, old_price, new_price, reason, timestamp)
            VALUES (${id}, ${oldPrice.toFixed(2)}, ${newPrice.toFixed(2)}, 'Market adjustment', ${date.toISOString()})
          `;
        }
      }
      console.log("Added price history data");
      
      // Create test competitors
      const competitors = [
        ['CompetitorA', 'http://competitora.example.com', 35.5, 1.05],
        ['CompetitorB', 'http://competitorb.example.com', 28.2, 0.95],
        ['CompetitorC', 'http://competitorc.example.com', 15.8, 0.85]
      ];
      
      for (const [name, website, marketShare, priceIndex] of competitors) {
        await client`
          INSERT INTO competitors (vendor_id, name, website, market_share, price_index, is_active)
          VALUES (${vendorId}, ${name}, ${website}, ${marketShare}, ${priceIndex}, TRUE)
        `;
      }
      console.log(`Added ${competitors.length} test competitors`);
      
      // Link competitors to products
      const competitorIds = await client`SELECT id FROM competitors`;
      
      for (const competitor of competitorIds) {
        for (const product of productIds) {
          await client`
            INSERT INTO competitor_products (competitor_id, product_id, competitor_sku, is_matched)
            VALUES (${competitor.id}, ${product.id}, ${'CP-' + Math.floor(Math.random() * 10000)}, TRUE)
          `;
        }
      }
      console.log("Linked competitors to products");
      
      // Add competitor prices
      const competitorProducts = await client`SELECT id, competitor_id, product_id FROM competitor_products`;
      
      for (const cp of competitorProducts) {
        for (let i = 0; i < 10; i++) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          const basePrice = 100;
          const priceVariation = 0.85 + Math.random() * 0.3; // 85% to 115% of base price
          const price = basePrice * priceVariation;
          const isPromotion = Math.random() > 0.8;
          
          await client`
            INSERT INTO competitor_prices (competitor_product_id, price, is_promotion, timestamp)
            VALUES (${cp.id}, ${price.toFixed(2)}, ${isPromotion}, ${date.toISOString()})
          `;
        }
      }
      console.log("Added competitor price data");
    } else {
      console.log(`Database already has ${productCount[0].count} products`);
    }
    
    console.log("Database initialization complete!");
  } catch (error) {
    console.error("Error during database initialization:", error);
  } finally {
    // Close the connection
    await client.end();
  }
}

main().catch(console.error);
