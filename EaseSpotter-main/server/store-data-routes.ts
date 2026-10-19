import { Router, Request, Response } from 'express';
import storeDatabase from './store-data';

const router = Router();

// GET /api/store/:storeId - return store metadata and products
router.get('/api/store/:storeId', (req: Request, res: Response) => {
  const { storeId } = req.params;
  const store = storeDatabase[storeId];
  if (!store) {
    return res.status(404).json({ success: false, message: 'Store not found' });
  }
  return res.json({ success: true, data: store });
});

// POST /api/store/:storeId/products - update products for a store (in-memory)
router.post('/api/store/:storeId/products', (req: Request, res: Response) => {
  const { storeId } = req.params;
  const store = storeDatabase[storeId];
  if (!store) {
    return res.status(404).json({ success: false, message: 'Store not found' });
  }

  const { productsByCategory, productsByAisle } = req.body;
  if (productsByCategory) {
    store.productsByCategory = productsByCategory;
  }
  if (productsByAisle) {
    store.productsByAisle = productsByAisle;
  }

  // Recalculate total products if possible
  const categoryCounts = Object.values(store.productsByCategory).map(arr => arr.length);
  store.totalProducts = categoryCounts.reduce((a, b) => a + b, 0);
  store.timestamp = new Date().toISOString();

  return res.json({ success: true, data: store });
});

export default router;
