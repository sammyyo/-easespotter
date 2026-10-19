-- Create enum types if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'supplier_status') THEN
        CREATE TYPE supplier_status AS ENUM ('active', 'probation', 'inactive', 'blacklisted');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'negotiation_status') THEN
        CREATE TYPE negotiation_status AS ENUM ('pending', 'in_progress', 'completed', 'failed');
    END IF;
END$$;

-- Create suppliers table if it doesn't exist
CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  vendor_id INTEGER REFERENCES vendors(id) NOT NULL,
  contact_name VARCHAR(100),
  contact_email VARCHAR(100),
  contact_phone VARCHAR(50),
  address TEXT,
  country VARCHAR(100),
  categories VARCHAR(255),
  status supplier_status DEFAULT 'active',
  payment_terms VARCHAR(100),
  lead_time INTEGER,
  minimum_order_quantity INTEGER,
  performance_score DECIMAL(5, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create supplier_performance table if it doesn't exist
CREATE TABLE IF NOT EXISTS supplier_performance (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER REFERENCES suppliers(id) NOT NULL,
  vendor_id INTEGER REFERENCES vendors(id) NOT NULL,
  metric_date TIMESTAMP DEFAULT NOW(),
  on_time_delivery_rate DECIMAL(5, 2),
  quality_score DECIMAL(5, 2),
  response_time DECIMAL(5, 2),
  price_competitiveness DECIMAL(5, 2),
  cost_savings DECIMAL(10, 2),
  defect_rate DECIMAL(5, 2),
  risk_score DECIMAL(5, 2),
  compliance_score DECIMAL(5, 2),
  innovation_score DECIMAL(5, 2),
  overall_score DECIMAL(5, 2),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create supplier_costs table if it doesn't exist
CREATE TABLE IF NOT EXISTS supplier_costs (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER REFERENCES suppliers(id) NOT NULL,
  vendor_id INTEGER REFERENCES vendors(id) NOT NULL,
  product_id INTEGER REFERENCES products(id) NOT NULL,
  cost_date TIMESTAMP DEFAULT NOW(),
  unit_cost DECIMAL(10, 2) NOT NULL,
  currency_code VARCHAR(3) DEFAULT 'USD',
  quantity INTEGER,
  total_cost DECIMAL(12, 2),
  price_fluctuation DECIMAL(5, 2),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create negotiation_recommendations table if it doesn't exist
CREATE TABLE IF NOT EXISTS negotiation_recommendations (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER REFERENCES suppliers(id) NOT NULL,
  vendor_id INTEGER REFERENCES vendors(id) NOT NULL,
  recommendation_date TIMESTAMP DEFAULT NOW(),
  recommendation_type VARCHAR(50) NOT NULL,
  status negotiation_status DEFAULT 'pending',
  current_value DECIMAL(10, 2),
  recommended_value DECIMAL(10, 2),
  potential_savings DECIMAL(10, 2),
  confidence_score DECIMAL(5, 2),
  rationale TEXT,
  tactics JSONB,
  implemented_at TIMESTAMP,
  implementation_results JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);