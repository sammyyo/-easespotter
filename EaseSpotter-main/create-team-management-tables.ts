import { db, pool } from "./db";
import { sql } from "drizzle-orm";

async function createTables() {
  try {
    console.log("Creating team management tables...");

    // Create enums
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE user_status AS ENUM ('active', 'suspended', 'inactive');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE user_action AS ENUM ('login', 'logout', 'create', 'update', 'delete', 'view');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE resource_type AS ENUM ('product', 'price', 'competitor', 'rule', 'promotion', 'team', 'vendor', 'system');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Update users table
    await db.execute(sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS status user_status DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP,
      ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20),
      ADD COLUMN IF NOT EXISTS job_title VARCHAR(100),
      ADD COLUMN IF NOT EXISTS department VARCHAR(100),
      ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS is_phone_verified BOOLEAN DEFAULT FALSE;
    `);

    // Create user_activity_logs table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        vendor_id INTEGER NOT NULL REFERENCES vendors(id),
        action user_action NOT NULL,
        resource_type resource_type NOT NULL,
        resource_id INTEGER,
        details JSONB,
        ip_address VARCHAR(50),
        user_agent TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Create user_settings table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_settings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) UNIQUE,
        notification_email BOOLEAN NOT NULL DEFAULT TRUE,
        notification_sms BOOLEAN NOT NULL DEFAULT FALSE,
        notification_in_app BOOLEAN NOT NULL DEFAULT TRUE,
        theme VARCHAR(20) NOT NULL DEFAULT 'system',
        language VARCHAR(10) NOT NULL DEFAULT 'en',
        dashboard_layout JSONB,
        mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        mfa_secret VARCHAR(100),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Create permission_profiles table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS permission_profiles (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER NOT NULL REFERENCES vendors(id),
        name VARCHAR(100) NOT NULL,
        description TEXT,
        permissions JSONB NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Create user_permissions table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_permissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        profile_id INTEGER NOT NULL REFERENCES permission_profiles(id),
        custom_permissions JSONB,
        assigned_by INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    console.log("Team management tables created successfully");

    // Create default permission profiles
    const hasDefaultAdminProfile = await db.execute(sql`
      SELECT id FROM permission_profiles WHERE name = 'Admin' AND is_default = TRUE LIMIT 1;
    `);

    if (!hasDefaultAdminProfile.rows?.length) {
      await db.execute(sql`
        INSERT INTO permission_profiles (vendor_id, name, description, permissions, is_default)
        SELECT 
          id as vendor_id, 
          'Admin', 
          'Default administrator profile with all permissions', 
          '{"products.view": true, "products.create": true, "products.edit": true, "products.delete": true, 
            "prices.view": true, "prices.edit": true, 
            "competitors.view": true, "competitors.create": true, "competitors.edit": true, "competitors.delete": true, 
            "rules.view": true, "rules.create": true, "rules.edit": true, "rules.delete": true, 
            "promotions.view": true, "promotions.create": true, "promotions.edit": true, "promotions.delete": true, 
            "team.view": true, "team.create": true, "team.edit": true, "team.delete": true, 
            "settings.view": true, "settings.edit": true}'::jsonb, 
          TRUE
        FROM vendors;
      `);
      console.log("Created default Admin permission profile");
    }

    const hasDefaultUserProfile = await db.execute(sql`
      SELECT id FROM permission_profiles WHERE name = 'User' AND is_default = TRUE LIMIT 1;
    `);

    if (!hasDefaultUserProfile.rows?.length) {
      await db.execute(sql`
        INSERT INTO permission_profiles (vendor_id, name, description, permissions, is_default)
        SELECT 
          id as vendor_id, 
          'User', 
          'Default user profile with limited permissions', 
          '{"products.view": true, "products.create": false, "products.edit": false, "products.delete": false, 
            "prices.view": true, "prices.edit": false, 
            "competitors.view": true, "competitors.create": false, "competitors.edit": false, "competitors.delete": false, 
            "rules.view": true, "rules.create": false, "rules.edit": false, "rules.delete": false, 
            "promotions.view": true, "promotions.create": false, "promotions.edit": false, "promotions.delete": false, 
            "team.view": false, "team.create": false, "team.edit": false, "team.delete": false, 
            "settings.view": true, "settings.edit": false}'::jsonb, 
          TRUE
        FROM vendors;
      `);
      console.log("Created default User permission profile");
    }

    console.log("Complete!");
  } catch (error) {
    console.error("Error creating team management tables:", error);
  } finally {
    await pool.end();
  }
}

createTables();