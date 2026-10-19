import { db } from "./db";
import { competitorTrendAnalysis, productPerformanceMetrics, timeSeriesForecasts } from "./db/schema";

async function createAnalyticsTables() {
  try {
    console.log("Creating analytics tables...");
    
    // Create time_series_forecasts table
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
    console.log("time_series_forecasts table created");
    
    // Create product_performance_metrics table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS product_performance_metrics (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER NOT NULL,
        product_id INTEGER,
        category VARCHAR(255),
        time_period VARCHAR(255) NOT NULL,
        metrics JSONB NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log("product_performance_metrics table created");
    
    // Create competitor_trend_analysis table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS competitor_trend_analysis (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER NOT NULL,
        competitor_id INTEGER,
        product_category VARCHAR(255),
        analysis_period VARCHAR(255) NOT NULL,
        price_trends JSONB NOT NULL,
        trend_direction VARCHAR(255),
        change_rate DECIMAL,
        insights TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log("competitor_trend_analysis table created");
    
    console.log("All analytics tables created successfully");
  } catch (error) {
    console.error("Error creating analytics tables:", error);
  } finally {
    process.exit(0);
  }
}

createAnalyticsTables();