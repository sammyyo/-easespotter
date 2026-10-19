import { db } from "./db";

async function updateAnalyticsTables() {
  try {
    console.log("Dropping existing analytics tables...");
    
    // Drop existing tables if they exist
    await db.execute(`DROP TABLE IF EXISTS time_series_forecasts CASCADE;`);
    await db.execute(`DROP TABLE IF EXISTS product_performance_metrics CASCADE;`);
    await db.execute(`DROP TABLE IF EXISTS competitor_trend_analysis CASCADE;`);
    
    console.log("Creating time_series_forecasts table...");
    await db.execute(`
      CREATE TABLE IF NOT EXISTS time_series_forecasts (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER NOT NULL,
        product_id INTEGER,
        forecast_type VARCHAR(255) NOT NULL,
        method VARCHAR(255) NOT NULL,
        parameters JSONB,
        forecast_data JSONB NOT NULL,
        confidence_interval JSONB,
        accuracy VARCHAR(255),
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    console.log("Creating product_performance_metrics table...");
    await db.execute(`
      CREATE TABLE IF NOT EXISTS product_performance_metrics (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER NOT NULL,
        product_id INTEGER,
        period VARCHAR(255) NOT NULL,
        sales_volume INTEGER,
        revenue VARCHAR(255),
        profit_margin VARCHAR(255),
        inventory_turnover VARCHAR(255),
        average_rating VARCHAR(255),
        return_rate VARCHAR(255),
        click_through_rate VARCHAR(255),
        conversion_rate VARCHAR(255),
        start_date TIMESTAMP,
        end_date TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    console.log("Creating competitor_trend_analysis table...");
    await db.execute(`
      CREATE TABLE IF NOT EXISTS competitor_trend_analysis (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER NOT NULL,
        competitor_id INTEGER,
        analysis_type VARCHAR(255),
        period VARCHAR(255),
        metrics JSONB,
        insights TEXT,
        start_date TIMESTAMP,
        end_date TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    console.log("All analytics tables updated successfully");
  } catch (error) {
    console.error("Error updating analytics tables:", error);
  } finally {
    process.exit(0);
  }
}

updateAnalyticsTables();