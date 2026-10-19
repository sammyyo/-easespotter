import fetch from 'node-fetch';
import { db } from '@db';
import { storeIntegrationLogs, storeProducts } from '@db/schema';
import { eq } from 'drizzle-orm';

interface ShopifyCredentials {
  apiKey: string;
  apiSecret: string;
  storeUrl: string; // format: your-store.myshopify.com
  accessToken: string;
}

interface ShopifyProduct {
  id: number; 
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  variants: Array<{
    id: number;
    price: string;
    compare_at_price: string | null;
    sku: string;
  }>;
  images: Array<{
    src: string;
  }>;
}

/**
 * Fetch products from Shopify API
 */
export async function fetchShopifyProducts(credentials: ShopifyCredentials, vendorId: number): Promise<any> {
  try {
    const { storeUrl, accessToken } = credentials;
    
    // Log integration attempt
    await logIntegrationAction(vendorId, 'shopify', 'fetch_products', 'in_progress');
    
    const url = `https://${storeUrl}/admin/api/2023-04/products.json`;
    
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Shopify API error: ${response.status} - ${errorData}`);
    }
    
    const data = await response.json();
    
    // Log success
    await logIntegrationAction(vendorId, 'shopify', 'fetch_products', 'success', {
      productCount: data.products.length
    });
    
    return data.products;
  } catch (error) {
    // Log failure
    await logIntegrationAction(vendorId, 'shopify', 'fetch_products', 'failed', undefined, 
      error.message || 'Unknown error during Shopify product fetch');
    
    throw error;
  }
}

/**
 * Import products from Shopify into the system
 */
export async function importShopifyProducts(
  credentials: ShopifyCredentials, 
  vendorId: number,
  storeId: number
): Promise<any> {
  try {
    const shopifyProducts = await fetchShopifyProducts(credentials, vendorId);
    
    // Log import attempt
    await logIntegrationAction(vendorId, 'shopify', 'import_products', 'in_progress', {
      productCount: shopifyProducts.length
    });
    
    const products = shopifyProducts.map((product: ShopifyProduct) => {
      const variant = product.variants[0]; // Using first variant for simplicity
      
      return {
        storeId,
        name: product.title,
        sku: variant.sku || `SHOP-${product.id}`,
        basePrice: variant.compare_at_price || variant.price,
        currentPrice: variant.price,
        description: product.body_html,
        category: product.product_type,
        imageUrl: product.images.length > 0 ? product.images[0].src : null,
      };
    });
    
    // Batch insert products
    // Note: In a production environment, you should handle duplicates,
    // updates of existing products, etc.
    const insertedProducts = await db.insert(storeProducts).values(products).returning();
    
    // Log success
    await logIntegrationAction(vendorId, 'shopify', 'import_products', 'success', {
      importedCount: insertedProducts.length
    });
    
    return insertedProducts;
  } catch (error) {
    // Log failure
    await logIntegrationAction(vendorId, 'shopify', 'import_products', 'failed', undefined, 
      error.message || 'Unknown error during Shopify product import');
    
    throw error;
  }
}

/**
 * Test Shopify API connection
 */
export async function testShopifyConnection(credentials: ShopifyCredentials, vendorId: number): Promise<boolean> {
  try {
    const { storeUrl, accessToken } = credentials;
    
    // Log test attempt
    await logIntegrationAction(vendorId, 'shopify', 'test_connection', 'in_progress');
    
    const url = `https://${storeUrl}/admin/api/2023-04/shop.json`;
    
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Log success
    await logIntegrationAction(vendorId, 'shopify', 'test_connection', 'success', {
      shopName: data.shop.name,
      shopDomain: data.shop.domain
    });
    
    return true;
  } catch (error) {
    // Log failure
    await logIntegrationAction(vendorId, 'shopify', 'test_connection', 'failed', undefined, 
      error.message || 'Unknown error during Shopify connection test');
    
    return false;
  }
}

/**
 * Log integration actions to the database
 */
async function logIntegrationAction(
  vendorId: number,
  integrationType: string,
  action: string,
  status: string,
  details?: any,
  errorMessage?: string
) {
  try {
    await db.insert(storeIntegrationLogs).values({
      vendorId,
      integrationType,
      action,
      status,
      details: details ? JSON.stringify(details) : null,
      errorMessage: errorMessage || null,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Failed to log integration action:', error);
  }
}