import { publicAddress } from "../store-location";
import { Request, Response } from 'express';
import { db } from '@db';
import { eq, and, desc } from 'drizzle-orm';
import { vendors, products, userStoreSessions, userBookmarks, storeProfiles, promotions } from '@db/schema';
import { getPublicBaseUrl } from '../config';
import { persistImageDataUrl } from '../image-storage';

const DEFAULT_VENDOR_LOGO_PATH = '/logos/default-vendor.png';
const PUBLIC_STOCK_COUNT_THRESHOLD = 50;

const createPublicStockPayload = (stockValue: unknown) => {
  const stock = Number(stockValue ?? 0);
  const showStockCount = stock <= PUBLIC_STOCK_COUNT_THRESHOLD;

  return {
    stock: showStockCount ? stock : null,
    currentStock: showStockCount ? stock : null,
    inStock: stock > 0,
    showStockCount,
    stockDisplayThreshold: PUBLIC_STOCK_COUNT_THRESHOLD,
  };
};

const resolveStoreLogoUrl = (logoUrl: string | null | undefined, baseUrl: string) => {
  const value = logoUrl?.trim();

  if (!value || value.includes('/src/assets/') || value.includes('client/src/assets/')) {
    return `${baseUrl}${DEFAULT_VENDOR_LOGO_PATH}`;
  }

  if (value.startsWith('/')) {
    return `${baseUrl}${value}`;
  }

  return value;
};

const resolvePublicAssetUrl = (assetUrl: string | null | undefined, baseUrl: string) => {
  const value = assetUrl?.trim();

  if (!value) return null;
  if (value.startsWith('data:image/')) return value;
  if (value.startsWith('/')) return `${baseUrl}${value}`;

  return value;
};

/**
 * Generate a store QR code URL
 * @param req Request object
 * @param res Response object
 */
export const generateStoreQrCode = (req: Request, res: Response) => {
  try {
    const baseUrl = getPublicBaseUrl(req);
    const { vendorId } = req.params;
    
    if (!vendorId) {
      return res.status(400).json({ error: 'Vendor ID is required' });
    }
    
    // Generate the QR code URL
    // Check hostname dynamically
    const qrCodeUrl = `${baseUrl}/api/stores/${vendorId}`;
    
    // Return the URL for QR code generation
    return res.status(200).json({
      success: true,
      data: {
        url: qrCodeUrl,
        vendorId
      }
    });
  } catch (error: any) {
    console.error('Error generating store QR code:', error);
    return res.status(500).json({ error: 'Failed to generate store QR code', details: error.message });
  }
};

/**
 * Generate a product QR code URL
 * @param req Request object
 * @param res Response object
 */
export const generateProductQrCode = (req: Request, res: Response) => {
  try {
    const baseUrl = getPublicBaseUrl(req);
    const { productId } = req.params;
    
    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }
    
    // Generate the QR code URL
    // Check hostname dynamically
    const qrCodeUrl = `${baseUrl}/api/products/${productId}`;
    
    // Return the URL for QR code generation
    return res.status(200).json({
      success: true,
      data: {
        url: qrCodeUrl,
        productId
      }
    });
  } catch (error: any) {
    console.error('Error generating product QR code:', error);
    return res.status(500).json({ error: 'Failed to generate product QR code', details: error.message });
  }
};

/**
 * Dynamic Store API - Get store information by ID or vendor slug
 * @param req Request object
 * @param res Response object
 */
export const getStoreInfo = async (req: Request, res: Response) => {
  try {
    const baseUrl = getPublicBaseUrl(req);
    const { storeId } = req.params;
    
    if (!storeId) {
      return res.status(400).json({ error: 'Store ID or vendor slug is required' });
    }

    const isNumericStoreId = !Number.isNaN(Number(storeId));
    const [store] = await db
      .select({
        vendorId: vendors.id,
        vendorName: vendors.name,
        vendorBusinessName: vendors.businessName,
        logoUrl: storeProfiles.logoUrl,
        integrationSettings: storeProfiles.integrationSettings,
      })
      .from(vendors)
      .leftJoin(storeProfiles, eq(vendors.id, storeProfiles.vendorId))
      .where(isNumericStoreId ? eq(vendors.id, Number(storeId)) : eq(storeProfiles.slug, storeId))
      .limit(1);

    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const rawStoreProducts = await db
      .select({
        id: products.id,
        name: products.name,
        brand: products.brand,
        description: products.description,
        category: products.category,
        aisle: products.aisle,
        shelf: products.shelf,
        basePrice: products.basePrice,
        currentStock: products.currentStock,
        currentPrice: products.currentPrice,
        barcode: products.barcode,
        imageUrl: products.imageUrl,
      })
      .from(products)
      .where(eq(products.vendorId, store.vendorId))
      .orderBy(products.aisle, products.shelf, products.name);

    const storeProducts = await Promise.all(rawStoreProducts.map(async (product) => {
      if (typeof product.imageUrl !== 'string' || !product.imageUrl.startsWith('data:image/')) {
        return product;
      }

      const imageUrl = await persistImageDataUrl(product.imageUrl, 'products', `vendor-${store.vendorId}-product-${product.id}`);
      await db
        .update(products)
        .set({ imageUrl, updatedAt: new Date() })
        .where(eq(products.id, product.id));

      return { ...product, imageUrl };
    }));

    const storePromotions = await db
      .select()
      .from(promotions)
      .where(eq(promotions.vendorId, store.vendorId))
      .orderBy(desc(promotions.createdAt));

    const now = new Date();
    const activePromotions = storePromotions.filter((promotion) => {
      const startDate = promotion.startDate ? new Date(promotion.startDate) : null;
      const endDate = promotion.endDate ? new Date(promotion.endDate) : null;
      const status = String(promotion.status || '').toLowerCase();

      return (!startDate || startDate <= now)
        && (!endDate || endDate >= now)
        && status !== 'inactive'
        && status !== 'expired'
        && status !== 'cancelled';
    });

    const parseAppliedProducts = (appliedProducts: unknown): number[] => {
      if (Array.isArray(appliedProducts)) {
        return appliedProducts.map(Number).filter(Number.isFinite);
      }

      if (typeof appliedProducts === 'string') {
        try {
          const parsed = JSON.parse(appliedProducts);
          return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
        } catch {
          return [];
        }
      }

      return [];
    };

    const toNumber = (value: unknown): number | null => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const roundMoney = (value: number) => Math.round(value * 100) / 100;
    const productById = new Map(storeProducts.map((product) => [product.id, product]));

    const createPromotionProductPayload = (
      product: typeof storeProducts[number],
      discountPercent: unknown,
    ) => {
      const originalPrice = toNumber(product.currentPrice) ?? toNumber(product.basePrice) ?? 0;
      const discount = toNumber(discountPercent) ?? 0;
      const salePrice = roundMoney(originalPrice * (1 - discount / 100));
      const productImageUrl = resolvePublicAssetUrl(product.imageUrl, baseUrl);
      const stockPayload = createPublicStockPayload(product.currentStock);

      return {
        id: product.id,
        name: product.name,
        barcode: product.barcode || null,
        imageUrl: productImageUrl,
        image: productImageUrl,
        productImageUrl,
        originalPrice: roundMoney(originalPrice),
        salePrice,
        ...stockPayload,
      };
    };

    const createPromotionPayload = (promotion: typeof storePromotions[number]) => ({
      ...promotion,
      products: parseAppliedProducts(promotion.appliedProducts)
        .map((productId) => {
          const product = productById.get(productId);
          return product ? createPromotionProductPayload(product, promotion.discountPercent) : null;
        })
        .filter(Boolean),
    });

    const formattedStorePromotions = storePromotions.map(createPromotionPayload);
    const formattedActivePromotions = activePromotions.map(createPromotionPayload);

    const promotionByProductId = new Map<number, any[]>();
    activePromotions.forEach((promotion) => {
      parseAppliedProducts(promotion.appliedProducts).forEach((productId) => {
        const product = productById.get(productId);
        const promotionProduct = product ? createPromotionProductPayload(product, promotion.discountPercent) : null;
        const productPromotions = promotionByProductId.get(productId) || [];
        productPromotions.push({
          id: promotion.id,
          name: promotion.name,
          discountPercent: promotion.discountPercent,
          imageUrl: promotion.imageUrl || null,
          startDate: promotion.startDate,
          endDate: promotion.endDate,
          status: promotion.status,
          originalPrice: promotionProduct?.originalPrice ?? null,
          salePrice: promotionProduct?.salePrice ?? null,
        });
        promotionByProductId.set(productId, productPromotions);
      });
    });

    const integrationSettings = store.integrationSettings && typeof store.integrationSettings === 'object'
      ? store.integrationSettings as Record<string, any>
      : {};
    const locationLabels = integrationSettings.locationLabels && typeof integrationSettings.locationLabels === 'object'
      ? integrationSettings.locationLabels as Record<string, any>
      : {};
    const locationLabelPrimary = typeof locationLabels.primary === 'string' ? locationLabels.primary : 'Aisle';
    const locationLabelSecondary = typeof locationLabels.secondary === 'string' ? locationLabels.secondary : 'Shelf';

    const createProductPayload = (product: typeof storeProducts[number]) => {
      const productImageUrl = resolvePublicAssetUrl(product.imageUrl, baseUrl);
      const stockPayload = createPublicStockPayload(product.currentStock);

      return {
        id: product.id,
        name: product.name,
        brand: product.brand || null,
        barcode: product.barcode || null,
        description: product.description || null,
        price: product.currentPrice,
        ...stockPayload,
        imageUrl: productImageUrl,
        image: productImageUrl,
        productImageUrl,
        category: product.category,
        location: {
          aisle: product.aisle || 'N/A',
          shelf: product.shelf || 'N/A',
        },
        shelf: product.shelf || 'N/A',
        vendor: store.vendorName,
        promotions: promotionByProductId.get(product.id) || [],
      };
    };

    const productsByCategory: Record<string, any[]> = {};
    const productsByAisle: Record<string, any[]> = {};

    storeProducts.forEach((product) => {
      const category = product.category || 'Uncategorized';
      const aisle = product.aisle || 'Unassigned';

      if (!productsByCategory[category]) {
        productsByCategory[category] = [];
      }
      if (!productsByAisle[aisle]) {
        productsByAisle[aisle] = [];
      }

      productsByCategory[category].push(createProductPayload(product));
      productsByAisle[aisle].push(createProductPayload(product));
    });

    const data = {
      totalProducts: storeProducts.length,
      timestamp: now.toISOString(),
      vendorId: store.vendorId,
      vendorid: store.vendorId,
      vendorName: store.vendorName,
      vendorBusinessName: store.vendorBusinessName,
      logoUrl: resolveStoreLogoUrl(store.logoUrl, baseUrl),
      locationLabels: {
        primary: locationLabelPrimary,
        secondary: locationLabelSecondary,
      },
      promotions: formattedStorePromotions,
      activePromotions: formattedActivePromotions,
      deals: formattedActivePromotions,
      offers: formattedActivePromotions,
      discounts: formattedActivePromotions,
      productsByCategory,
      productsByAisle,
    };

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Error fetching store information:', error);
    return res.status(500).json({ error: 'Failed to fetch store information', details: error.message });
  }
};

/**
 * Get store address data by vendor ID or store slug.
 * Only the explicitly published customer-facing location is returned.
 */
export const getStoreAddresses = async (req: Request, res: Response) => {
  try {
    const {storeId} = req.params;
    const numeric = /^\d+$/.test(storeId);
    if (numeric && !Number.isSafeInteger(Number(storeId))) return res.status(400).json({error: 'Invalid store ID'});
    const [store] = await db.select({
      vendorId: vendors.id, name: storeProfiles.name, businessName: vendors.businessName,
      logoUrl: storeProfiles.logoUrl, integrationSettings: storeProfiles.integrationSettings,
      status: vendors.status,
    }).from(vendors).leftJoin(storeProfiles, eq(vendors.id, storeProfiles.vendorId))
      .where(numeric ? eq(vendors.id, Number(storeId)) : eq(storeProfiles.slug, storeId)).limit(1);
    if (!store || store.status !== 'active') return res.status(404).json({error: 'Store not found'});
    const address = publicAddress(store);
    return res.set('Cache-Control', 'no-store').json({success: true, data: address ? [address] : []});
  } catch {
    return res.status(503).json({error: 'Store addresses are temporarily unavailable.'});
  }
};

/**
 * Get product information by ID for QR code scanning
 * @param req Request object
 * @param res Response object
 */
export const getProductInfo = async (req: Request, res: Response) => {
  try {
    // Check hostname dynamically
    const baseUrl = getPublicBaseUrl(req);
    const { productId } = req.params;
    
    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }
    
    // Check if product exists
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, parseInt(productId)))
      .limit(1);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Get vendor information
    const [vendor] = await db
      .select()
      .from(vendors)
      .where(eq(vendors.id, product.vendorId))
      .limit(1);
    
    // Return product information
    return res.status(200).json({
      success: true,
      data: {
        productId: product.id,
        productName: product.name,
        description: product.description,
        price: product.currentPrice,
        category: product.category,
        imageUrl: product.imageUrl,
        vendor: {
          vendorId: vendor.id,
          vendorName: vendor.name,
          logoUrl: resolveStoreLogoUrl(null, baseUrl)
        },
        // Include other product details as needed
      }
    });
  } catch (error: any) {
    console.error('Error fetching product information:', error);
    return res.status(500).json({ error: 'Failed to fetch product information', details: error.message });
  }
};

/**
 * Record a store visit
 * This endpoint tracks when a user visits a store via QR code scan
 */
export const recordStoreVisit = async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { storeId } = req.body;
    
    if (!storeId) {
      return res.status(400).json({ error: 'Store ID is required' });
    }
    
    // Check if store exists
    const [store] = await db
      .select()
      .from(vendors)
      .where(eq(vendors.id, storeId))
      .limit(1);
    
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }
    
    // Check if user has visited this store before
    const [existingSession] = await db
      .select()
      .from(userStoreSessions)
      .where(
        and(
          eq(userStoreSessions.userId, req.user!.id),
          eq(userStoreSessions.storeId, storeId)
        )
      )
      .limit(1);
    
    if (existingSession) {
      // Update the existing session
      const [updatedSession] = await db
        .update(userStoreSessions)
        .set({
          visitCount: existingSession.visitCount + 1,
          lastVisit: new Date()
        })
        .where(eq(userStoreSessions.id, existingSession.id))
        .returning();
      
      return res.status(200).json({
        success: true,
        message: 'Store visit updated',
        data: {
          storeId: updatedSession.storeId,
          storeName: store.name,
          visitCount: updatedSession.visitCount,
          lastVisit: updatedSession.lastVisit
        }
      });
    } else {
      // Create a new session
      const [newSession] = await db
        .insert(userStoreSessions)
        .values({
          userId: req.user!.id,
          storeId: storeId,
          visitDate: new Date(),
          visitCount: 1,
          lastVisit: new Date()
        })
        .returning();
      
      return res.status(201).json({
        success: true,
        message: 'Store visit recorded',
        data: {
          storeId: newSession.storeId,
          storeName: store.name,
          visitCount: newSession.visitCount,
          lastVisit: newSession.lastVisit
        }
      });
    }
  } catch (error: any) {
    console.error('Error recording store visit:', error);
    return res.status(500).json({ error: 'Failed to record store visit', details: error.message });
  }
};

/**
 * Bookmark a product
 * This endpoint creates a bookmark for a scanned product
 */
export const bookmarkProduct = async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { productId, notes } = req.body;
    
    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }
    
    // Check if product exists
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Check if product is already bookmarked
    const [existingBookmark] = await db
      .select()
      .from(userBookmarks)
      .where(
        and(
          eq(userBookmarks.userId, req.user!.id),
          eq(userBookmarks.productId, productId)
        )
      )
      .limit(1);
    
    if (existingBookmark) {
      // Return success but note that it was already bookmarked
      return res.status(200).json({
        success: true,
        message: 'Product was already bookmarked',
        data: {
          id: existingBookmark.id,
          productId: existingBookmark.productId,
          productName: product.name,
          createdAt: existingBookmark.createdAt,
          notes: existingBookmark.notes
        }
      });
    } else {
      // Create a new bookmark
      const [newBookmark] = await db
        .insert(userBookmarks)
        .values({
          userId: req.user!.id,
          productId: productId,
          vendorId: product.vendorId, // Use the product's vendor ID
          notes: notes || null,
          metadata: { source: "qr_code", scanDate: new Date().toISOString() }
        })
        .returning();
      
      return res.status(201).json({
        success: true,
        message: 'Product bookmarked successfully',
        data: {
          id: newBookmark.id,
          productId: newBookmark.productId,
          productName: product.name,
          createdAt: newBookmark.createdAt,
          notes: newBookmark.notes
        }
      });
    }
  } catch (error: any) {
    console.error('Error bookmarking product:', error);
    return res.status(500).json({ error: 'Failed to bookmark product', details: error.message });
  }
};
