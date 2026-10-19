import fetch from "node-fetch";
import { db } from "@db";
import { storeIntegrationLogs, storeProfiles, storeProducts } from "@db/schema";
import { eq } from "drizzle-orm";

// Helper function to create integration logs
async function createIntegrationLog(vendorId: number, action: string, status: string, details?: any, errorMessage?: string) {
  try {
    await db.insert(storeIntegrationLogs).values({
      vendorId: vendorId,
      integrationType: "woocommerce",
      action: action,
      status: status,
      details: details ? JSON.stringify(details) : null,
      errorMessage: errorMessage || null,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Failed to create integration log:", error);
  }
}

// Test WooCommerce connection
export async function testWooCommerceConnection(
  storeId: number,
  vendorId: number,
  siteUrl: string,
  consumerKey: string,
  consumerSecret: string
) {
  try {
    // Remove trailing slash if present
    const baseUrl = siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl;
    
    // Test connection with WooCommerce API
    const response = await fetch(
      `${baseUrl}/wp-json/wc/v3/products?consumer_key=${consumerKey}&consumer_secret=${consumerSecret}&per_page=1`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const errorDetails = typeof data === 'object' ? data : { message: "Unknown error" };
      await createIntegrationLog(
        vendorId,
        "test_connection",
        "failed",
        { url: siteUrl },
        errorDetails.message || "Failed to connect to WooCommerce API"
      );
      return {
        success: false,
        message: errorDetails.message || "Failed to connect to WooCommerce API",
      };
    }

    // Connection successful
    await createIntegrationLog(
      vendorId,
      "test_connection",
      "success",
      { url: siteUrl }
    );

    return {
      success: true,
      message: "Successfully connected to WooCommerce API",
    };
  } catch (error) {
    await createIntegrationLog(
      vendorId,
      "test_connection",
      "failed",
      { url: siteUrl },
      (error as Error).message || "Unknown error occurred"
    );
    return {
      success: false,
      message: (error as Error).message || "Unknown error occurred",
    };
  }
}

// Save WooCommerce credentials
export async function saveWooCommerceCredentials(
  storeId: number,
  vendorId: number,
  siteUrl: string,
  consumerKey: string,
  consumerSecret: string
) {
  try {
    // Update store profile with WooCommerce credentials
    const integrationSettings = JSON.stringify({
      wooCommerceSiteUrl: siteUrl,
      wooCommerceConsumerKey: consumerKey,
      wooCommerceConsumerSecret: consumerSecret ? consumerSecret.substring(0, 3) + "..." : "",
    });

    await db
      .update(storeProfiles)
      .set({
        integrationType: "woocommerce",
        integrationSettings: integrationSettings,
        updatedAt: new Date(),
      })
      .where(eq(storeProfiles.id, storeId));

    await createIntegrationLog(
      vendorId,
      "save_credentials",
      "success",
      { url: siteUrl }
    );

    return {
      success: true,
      message: "WooCommerce credentials saved successfully",
    };
  } catch (error) {
    await createIntegrationLog(
      vendorId,
      "save_credentials",
      "failed",
      { url: siteUrl },
      (error as Error).message || "Unknown error occurred"
    );
    return {
      success: false,
      message: (error as Error).message || "Unknown error occurred",
    };
  }
}

// Import products from WooCommerce
export async function importWooCommerceProducts(
  storeId: number,
  vendorId: number,
  siteUrl: string,
  consumerKey: string,
  consumerSecret: string
) {
  try {
    // Log the import attempt
    await createIntegrationLog(
      vendorId,
      "import_products",
      "in_progress",
      { url: siteUrl }
    );

    // Remove trailing slash if present
    const baseUrl = siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl;
    
    // Get products from WooCommerce API (first 100 products)
    const response = await fetch(
      `${baseUrl}/wp-json/wc/v3/products?consumer_key=${consumerKey}&consumer_secret=${consumerSecret}&per_page=100`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const errorDetails = typeof data === 'object' ? data : { message: "Unknown error" };
      await createIntegrationLog(
        vendorId,
        "import_products",
        "failed",
        { url: siteUrl },
        errorDetails.message || "Failed to import products from WooCommerce"
      );
      return {
        success: false,
        message: errorDetails.message || "Failed to import products from WooCommerce",
      };
    }

    // Process and save the products
    const importedProducts = [];
    for (const product of data) {
      // Skip variations and non-simple products for simplicity
      if (product.type !== "simple") continue;

      try {
        // Create basic product record
        const importedProduct = await db
          .insert(storeProducts)
          .values({
            storeId: Number(storeId),
            name: product.name,
            sku: product.sku || `WC-${product.id}`,
            description: product.description || product.short_description || "",
            category: product.categories?.length > 0 ? product.categories[0].name : "Other",
            basePrice: String(product.regular_price || product.price || 0),
            currentPrice: String(product.sale_price || product.price || 0),
            imageUrl: product.images?.length > 0 ? product.images[0].src : "",
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        importedProducts.push(importedProduct[0]);
      } catch (err) {
        console.error(`Failed to import product ${product.name}:`, err);
      }
    }

    // Log the successful import
    await createIntegrationLog(
      vendorId,
      "import_products",
      "success",
      { 
        url: siteUrl,
        count: importedProducts.length 
      }
    );

    return {
      success: true,
      message: `Successfully imported ${importedProducts.length} products from WooCommerce`,
      products: importedProducts,
    };
  } catch (error) {
    await createIntegrationLog(
      vendorId,
      "import_products",
      "failed",
      { url: siteUrl },
      (error as Error).message || "Unknown error occurred"
    );
    return {
      success: false,
      message: (error as Error).message || "Failed to import products",
    };
  }
}