import express, { Request, Response } from 'express';
import { 
  generateStoreQrCode, 
  generateProductQrCode, 
  getStoreInfo, 
  getStoreAddresses,
  getProductInfo,
  recordStoreVisit,
  bookmarkProduct
} from './controllers/qr-code.controller';
import { db } from '@db';
import { products, users, userBookmarks, vendors, userStoreSessions } from '@db/schema';
import { eq, and } from 'drizzle-orm';

const router = express.Router();

// QR code generation routes
router.get('/api/qr/store/:vendorId', generateStoreQrCode);
router.get('/api/qr/product/:productId', generateProductQrCode);

// Direct URL endpoints for QR code scanning
router.get('/api/stores/:storeId/addresses', getStoreAddresses);
router.get('/api/stores/:storeId', getStoreInfo);
router.get('/api/products/:productId(\\d+)', getProductInfo);

// Record store visit (separate endpoint called after QR code scan)
router.post('/api/user/:userId/store-session', recordStoreVisit);

// Bookmark product (separate endpoint called after QR code scan)
router.post('/api/user/:userId/product-bookmark', bookmarkProduct);

// Public endpoints for QR code testing (no authentication required)
router.post('/api/public/bookmark-product', async (req, res) => {
  try {
    const { productId, userId, notes } = req.body;
    
    if (!productId || !userId) {
      return res.status(400).json({ error: 'Product ID and User ID are required' });
    }
    
    // Simulate successful product bookmarking for testing purposes
    // This allows the QR code functionality to be tested even if the database is unavailable
    return res.status(201).json({
      success: true,
      message: 'Product bookmarked successfully (simulation mode)',
      data: {
        id: Math.floor(Math.random() * 1000), // Generate a random ID for testing
        productId: productId,
        productName: `Product ${productId}`,
        createdAt: new Date().toISOString(),
        notes: notes || null
      }
    });
  } catch (error: any) {
    console.error('Error bookmarking product:', error);
    return res.status(500).json({ error: 'Failed to bookmark product', details: error.message });
  }
});

// Public endpoint to record store visits for QR code testing
router.post('/api/public/record-store-visit', async (req, res) => {
  try {
    const { storeId, userId } = req.body;
    
    if (!storeId || !userId) {
      return res.status(400).json({ error: 'Store ID and User ID are required' });
    }
    
    // Simulate successful store visit recording for testing purposes
    // This allows the QR code functionality to be tested even if the database is unavailable
    return res.status(200).json({
      success: true,
      message: 'Store visit recorded (simulation mode)',
      data: {
        storeId: storeId,
        storeName: `Store ${storeId}`,
        visitCount: 1,
        lastVisit: new Date()
      }
    });
  } catch (error: any) {
    console.error('Error recording store visit:', error);
    return res.status(500).json({ error: 'Failed to record store visit', details: error.message });
  }
});

export default router;
