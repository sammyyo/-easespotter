import { Router, Request, Response } from 'express';
import userDatabase, { StoreSession, Bookmark } from './user-data';

const router = Router();

// POST /api/user/:userId/store-session - save last visited store
router.post('/api/user/:userId/store-session', (req: Request, res: Response) => {
  const { userId } = req.params;
  const session: StoreSession = req.body;
  if (!session.vendorName || !session.timestamp) {
    return res.status(400).json({ success: false, message: 'Invalid session data' });
  }

  const user = userDatabase[userId] || { sessions: [], bookmarks: [] };
  user.sessions.unshift(session);
  // Keep only latest 10 sessions
  user.sessions = user.sessions.slice(0, 10);
  userDatabase[userId] = user;

  return res.json({ success: true });
});

// GET /api/user/:userId/recent-stores - return recent stores
router.get('/api/user/:userId/recent-stores', (req: Request, res: Response) => {
  const { userId } = req.params;
  const user = userDatabase[userId];
  if (!user) {
    return res.json([]);
  }
  return res.json(user.sessions);
});

// POST /api/user/:userId/bookmarks - add a bookmarked product
router.post('/api/user/:userId/bookmarks', (req: Request, res: Response) => {
  const { userId } = req.params;
  const bookmark: Bookmark = req.body;
  if (!bookmark.productId) {
    return res.status(400).json({ success: false, message: 'Invalid bookmark data' });
  }

  const user = userDatabase[userId] || { sessions: [], bookmarks: [] };
  user.bookmarks.push(bookmark);
  userDatabase[userId] = user;

  return res.json({ success: true });
});

export default router;
