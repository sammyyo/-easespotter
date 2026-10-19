import { pool } from './db';

async function createStoreTables() {
  try {
    // Using raw pool connection
    console.log('Creating store_integration_type enum if it doesn\'t exist...');
    await pool.query(`
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'store_integration_type') THEN
              CREATE TYPE store_integration_type AS ENUM ('manual', 'shopify', 'woocommerce', 'magento', 'bigcommerce', 'other');
          END IF;
      END
      $$;
    `);
    
    console.log('Creating store_profiles table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS store_profiles (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER NOT NULL UNIQUE REFERENCES vendors(id),
        name VARCHAR(100) NOT NULL,
        description TEXT,
        logo_url TEXT,
        banner_url TEXT,
        theme_color VARCHAR(7),
        contact_email VARCHAR(255),
        contact_phone VARCHAR(20),
        website TEXT,
        social_links JSONB,
        store_type VARCHAR(50),
        business_hours JSONB,
        is_verified BOOLEAN DEFAULT FALSE,
        verification_date TIMESTAMP,
        integration_settings JSONB,
        integration_type store_integration_type DEFAULT 'manual',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    console.log('Creating store_followers table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS store_followers (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        store_id INTEGER NOT NULL REFERENCES store_profiles(id),
        status VARCHAR(20) DEFAULT 'active',
        follow_date TIMESTAMP DEFAULT NOW(),
        notification_preferences JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    console.log('Creating promotion_type enum if it doesn\'t exist...');
    await pool.query(`
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'promotion_type') THEN
              CREATE TYPE promotion_type AS ENUM ('percent_off', 'amount_off', 'buy_one_get_one', 'free_shipping', 'bundle', 'gift_with_purchase', 'other');
          END IF;
      END
      $$;
    `);

    console.log('Creating enhanced_promotions table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS enhanced_promotions (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER NOT NULL REFERENCES vendors(id),
        name VARCHAR(100) NOT NULL,
        type promotion_type NOT NULL,
        value DECIMAL(10,2) NOT NULL,
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        description TEXT,
        image_url TEXT,
        code VARCHAR(50),
        usage_limit INTEGER,
        used_count INTEGER DEFAULT 0,
        min_purchase_amount DECIMAL(10,2),
        applicable_products JSONB,
        customer_targeting JSONB,
        terms_and_conditions TEXT,
        is_featured BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    console.log('Creating store_integration_logs table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS store_integration_logs (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER NOT NULL REFERENCES vendors(id),
        status VARCHAR(50) NOT NULL,
        action VARCHAR(100) NOT NULL,
        details JSONB,
        integration_type store_integration_type,
        source VARCHAR(100),
        timestamp TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    console.log('Creating store_notifications table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS store_notifications (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER NOT NULL REFERENCES vendors(id),
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        type VARCHAR(50),
        status VARCHAR(50) DEFAULT 'unread',
        is_read BOOLEAN DEFAULT FALSE,
        read_at TIMESTAMP,
        target_users JSONB,
        notification_data JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    console.log('Store integration tables created successfully!');
  } catch (error) {
    console.error('Error creating store integration tables:', error);
  }
}

createStoreTables();