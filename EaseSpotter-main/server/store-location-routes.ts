import { Router } from 'express';
import { z } from 'zod';
import { nearestStores, type StoreLocationRow } from './store-location';

const numeric = (min: number, max: number) => z.string().trim().min(1).transform(Number)
  .pipe(z.number().finite().min(min).max(max));
const querySchema = z.object({
  latitude: numeric(-90, 90),
  longitude: numeric(-180, 180),
  radiusKm: numeric(0.1, 500).default('50'),
  limit: numeric(1, 50).pipe(z.number().int()).default('10'),
});

export function storeLocationRoutes(loadStores: () => Promise<StoreLocationRow[]>) {
  const router = Router();
  router.get('/nearby', async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({error: 'Provide valid latitude, longitude, radiusKm (0.1–500) and limit (1–50).'});
    try {
      const {latitude, longitude, radiusKm, limit} = parsed.data;
      const data = nearestStores(await loadStores(), latitude, longitude, radiusKm, limit);
      return res.set('Cache-Control', 'no-store').json({success: true, data, radiusKm});
    } catch {
      return res.status(503).json({error: 'Store locations are temporarily unavailable.'});
    }
  });
  return router;
}
