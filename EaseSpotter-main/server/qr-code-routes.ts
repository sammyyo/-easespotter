import express, { Request, Response } from 'express';
import { db } from '@db';
import { eq, and, desc } from 'drizzle-orm';
import { users, userStoreSessions, userBookmarks, products, vendors } from '@db/schema';

const router = express.Router();

/**
 * Track store visits by users via QR code scanning
 * This endpoint creates or updates a user_store_session record
 */
router.post('/api/qr/store-visit', async (req: Request, res: Response) => {
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
});

/**
 * Get the user's recently visited stores
 * This endpoint retrieves the last 10 stores the user has visited
 */
router.get('/api/qr/recent-stores', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Get recent store visits with store details
    const recentStores = await db
      .select({
        id: userStoreSessions.id,
        storeId: vendors.id,
        storeName: vendors.name,
        visitCount: userStoreSessions.visitCount,
        lastVisit: userStoreSessions.lastVisit
      })
      .from(userStoreSessions)
      .innerJoin(vendors, eq(userStoreSessions.storeId, vendors.id))
      .where(eq(userStoreSessions.userId, req.user!.id))
      .orderBy(desc(userStoreSessions.lastVisit))
      .limit(10);
    
    return res.status(200).json({
      success: true,
      data: recentStores
    });
  } catch (error: any) {
    console.error('Error retrieving recent stores:', error);
    return res.status(500).json({ error: 'Failed to retrieve recent stores', details: error.message });
  }
});

/**
 * Bookmark a product via QR code
 * This endpoint creates a bookmark for a product
 */
router.post('/api/qr/bookmark-product', async (req: Request, res: Response) => {
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
});

/**
 * Get a user's bookmarked products
 */
router.get('/api/user/:userId/bookmarks', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    
    // Check if the user is authorized to view this data
    if (!req.isAuthenticated() || (req.user!.id !== userId && req.user!.role !== 'admin')) {
      return res.status(403).json({ error: 'Not authorized to access these bookmarks' });
    }
    
    // Get bookmarked products with product details
    const bookmarkedProducts = await db
      .select({
        id: userBookmarks.id,
        productId: products.id,
        productName: products.name,
        productDescription: products.description,
        productPrice: products.currentPrice,
        productCategory: products.category,
        notes: userBookmarks.notes,
        createdAt: userBookmarks.createdAt
      })
      .from(userBookmarks)
      .innerJoin(products, eq(userBookmarks.productId, products.id))
      .where(eq(userBookmarks.userId, userId))
      .orderBy(desc(userBookmarks.createdAt));
    
    return res.status(200).json({
      success: true,
      data: bookmarkedProducts
    });
  } catch (error: any) {
    console.error('Error retrieving bookmarked products:', error);
    return res.status(500).json({ error: 'Failed to retrieve bookmarked products', details: error.message });
  }
});

export default router;