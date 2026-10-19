// Run this script to create the channel-related tables
import postgres from 'postgres';
const client = postgres(process.env.DATABASE_URL);

async function createChannelTables() {
  console.log("Creating sales channels and channel pricing tables...");

  try {
    // Create sales channels table
    await client`
      CREATE TABLE IF NOT EXISTS sales_channels (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER NOT NULL REFERENCES vendors(id),
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(vendor_id, code)
      )
    `;
    console.log("Created sales_channels table");

    // Create product channel pricing table
    await client`
      CREATE TABLE IF NOT EXISTS product_channel_pricing (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id),
        channel_id INTEGER NOT NULL REFERENCES sales_channels(id),
        price DECIMAL(10, 2) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        override_global_rules BOOLEAN NOT NULL DEFAULT FALSE,
        channel_specific_rules JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(product_id, channel_id)
      )
    `;
    console.log("Created product_channel_pricing table");

    // Create price rule channel assignments table
    await client`
      CREATE TABLE IF NOT EXISTS price_rule_channels (
        id SERIAL PRIMARY KEY,
        rule_id INTEGER NOT NULL REFERENCES price_rules(id),
        channel_id INTEGER NOT NULL REFERENCES sales_channels(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(rule_id, channel_id)
      )
    `;
    console.log("Created price_rule_channels table");

    // Create channel performance metrics table
    await client`
      CREATE TABLE IF NOT EXISTS channel_performance_metrics (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER NOT NULL REFERENCES vendors(id),
        channel_id INTEGER NOT NULL REFERENCES sales_channels(id),
        date DATE NOT NULL,
        revenue DECIMAL(12, 2) NOT NULL DEFAULT 0,
        units_sold INTEGER NOT NULL DEFAULT 0,
        average_order_value DECIMAL(10, 2),
        conversion_rate DECIMAL(5, 2),
        profit_margin DECIMAL(5, 2),
        metrics JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    console.log("Created channel_performance_metrics table");

    // Get a vendor ID to seed default channels
    const vendors = await client`SELECT id FROM vendors LIMIT 1`;
    if (vendors.length > 0) {
      const vendorId = vendors[0].id;
      
      // Check if channels already exist
      const existingChannels = await client`
        SELECT COUNT(*) FROM sales_channels WHERE vendor_id = ${vendorId}
      `;
      
      if (parseInt(existingChannels[0].count) === 0) {
        // Insert default channels
        await client`
          INSERT INTO sales_channels (vendor_id, name, code, description)
          VALUES 
            (${vendorId}, 'Website', 'web', 'Main e-commerce website'),
            (${vendorId}, 'Mobile App', 'mobile', 'Mobile application'),
            (${vendorId}, 'In-store', 'store', 'Physical retail locations'),
            (${vendorId}, 'Marketplace', 'marketplace', 'Third-party marketplace listings'),
            (${vendorId}, 'Social Media', 'social', 'Social media shopping platforms')
        `;
        console.log(`Seeded default channels for vendor ID ${vendorId}`);
      }
    }

    console.log("Channel pricing tables created successfully!");
  } catch (error) {
    console.error("Error creating channel tables:", error);
  } finally {
    await client.end();
  }
}

createChannelTables().catch(console.error);