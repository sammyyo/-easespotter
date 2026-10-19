#!/bin/bash

echo "Setting up customer segmentation tables and sample data..."

# Create the tables first
echo "Creating customer segmentation tables..."
npx tsx create-customer-segment-tables.ts

# Then seed with data
echo "Seeding customer segmentation data..."
npx tsx seed-customer-segments.ts

echo "Customer segmentation setup complete!"