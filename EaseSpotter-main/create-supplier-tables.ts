import { db, pool } from "./db";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import {
  suppliers,
  supplierPerformance,
  supplierCosts,
  negotiationRecommendations,
  vendors
} from "./db/schema";

async function createSupplierTables() {
  console.log("Creating supplier management tables...");

  try {
    // Ensure the tables exist
    await db.execute(/*sql*/`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'suppliers'
      );
    `);

    // Create a test supplier for each vendor
    const allVendors = await db.select().from(vendors);
    
    for (const vendor of allVendors) {
      // Check if supplier already exists for this vendor
      const existingSuppliers = await db
        .select()
        .from(suppliers)
        .where(eq(suppliers.vendorId, vendor.id))
        .limit(1);
      
      if (existingSuppliers.length === 0) {
        console.log(`Creating test supplier for vendor: ${vendor.name}`);
        
        // Insert supplier
        const [newSupplier] = await db
          .insert(suppliers)
          .values({
            name: `${vendor.name} Prime Supplier`,
            vendorId: vendor.id,
            contactName: "John Doe",
            contactEmail: "john.doe@example.com",
            contactPhone: "+1 555-123-4567",
            address: "123 Main St, Anytown, USA",
            country: "USA",
            categories: "Electronics,Apparel",
            status: "active",
            paymentTerms: "Net 30",
            leadTime: 7,
            minimumOrderQuantity: 100,
            performanceScore: "4.2",
            createdAt: new Date(),
            updatedAt: new Date()
          })
          .returning();
        
        // Insert performance metrics
        await db
          .insert(supplierPerformance)
          .values({
            supplierId: newSupplier.id,
            vendorId: vendor.id,
            metricDate: new Date(),
            onTimeDeliveryRate: "0.94",
            qualityScore: "4.3",
            responseTime: "6.5",
            priceCompetitiveness: "4.1",
            costSavings: "12500.00",
            defectRate: "0.02",
            riskScore: "1.5",
            complianceScore: "4.7",
            innovationScore: "3.8",
            overallScore: "4.2",
            notes: "Consistent performer with excellent quality standards.",
            createdAt: new Date(),
            updatedAt: new Date()
          });
        
        // Insert some supplier costs for common products
        const products = await db
          .select()
          .from(vendors.products)
          .where(eq(vendors.products.vendorId, vendor.id))
          .limit(5);
        
        for (const product of products) {
          const basePrice = Math.round(Math.random() * 50) + 10;
          
          // Current cost
          await db
            .insert(supplierCosts)
            .values({
              supplierId: newSupplier.id,
              vendorId: vendor.id,
              productId: product.id,
              costDate: new Date(),
              unitCost: basePrice.toFixed(2),
              currencyCode: "USD",
              quantity: 1000,
              totalCost: (basePrice * 1000).toFixed(2),
              priceFluctuation: "0.00",
              notes: "Initial cost entry",
              createdAt: new Date(),
              updatedAt: new Date()
            });
          
          // Historical cost (30 days ago)
          const oldPrice = basePrice * (1 + (Math.random() * 0.2 - 0.1));
          const oldCost = oldPrice.toFixed(2);
          const priceFluctuation = (((basePrice - oldPrice) / oldPrice) * 100).toFixed(2);
          
          await db
            .insert(supplierCosts)
            .values({
              supplierId: newSupplier.id,
              vendorId: vendor.id,
              productId: product.id,
              costDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              unitCost: oldCost,
              currencyCode: "USD",
              quantity: 800,
              totalCost: (oldCost * 800).toFixed(2),
              priceFluctuation: priceFluctuation,
              notes: "Historical cost record",
              createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              updatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            });
        }
        
        // Insert a negotiation recommendation
        await db
          .insert(negotiationRecommendations)
          .values({
            supplierId: newSupplier.id,
            vendorId: vendor.id,
            recommendationDate: new Date(),
            recommendationType: "price",
            status: "pending",
            currentValue: "10000.00",
            recommendedValue: "9500.00",
            potentialSavings: "500.00",
            confidenceScore: "0.85",
            rationale: "Based on market analysis and supplier performance, a 5% discount is achievable while maintaining the same quality of service.",
            tactics: JSON.stringify([
              {
                tactic: "Volume commitment",
                description: "Offer to increase order volume by 15% in exchange for price reduction.",
                priority: 1
              },
              {
                tactic: "Extended contract",
                description: "Propose a longer-term contract with guaranteed minimum orders.",
                priority: 2
              },
              {
                tactic: "Payment terms",
                description: "Offer faster payment in exchange for discount.",
                priority: 3
              }
            ]),
            createdAt: new Date(),
            updatedAt: new Date()
          });
        
        console.log(`Created supplier ${newSupplier.name} with ID ${newSupplier.id}`);
      } else {
        console.log(`Supplier already exists for vendor: ${vendor.name}`);
      }
    }

    console.log("Supplier management tables created and populated successfully!");
  } catch (error) {
    console.error("Error creating supplier tables:", error);
  } finally {
    await pool.end();
  }
}

// Run the function
createSupplierTables();

export { createSupplierTables };