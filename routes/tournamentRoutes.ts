import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import {
  getBracketsHandler,
  getBracketByIdHandler,
  saveBracketHandler,
  advanceBracketHandler,
  createDefaultBracketHandler,
  deleteBracketHandler,
} from '../controllers/tournamentController';

import { cacheMiddleware, invalidateCacheMiddleware } from '../middlewares/cacheMiddleware';

const router = Router();

// Tournament Brackets
router.get(
  '/brackets',
  authenticate,
  cacheMiddleware({ ttlSeconds: 120, tags: ['tournaments', 'brackets'] }),
  getBracketsHandler
);
router.get(
  '/brackets/:bracketId',
  authenticate,
  cacheMiddleware({ ttlSeconds: 120, tags: ['tournaments', 'brackets'] }),
  getBracketByIdHandler
);
router.post(
  '/brackets',
  authenticate,
  invalidateCacheMiddleware(['tournaments', 'brackets']),
  saveBracketHandler
);
router.put(
  '/brackets/:bracketId',
  authenticate,
  invalidateCacheMiddleware(['tournaments', 'brackets']),
  saveBracketHandler
);
router.delete(
  '/brackets/:bracketId',
  authenticate,
  invalidateCacheMiddleware(['tournaments', 'brackets']),
  deleteBracketHandler
);
router.delete(
  '/:bracketId',
  authenticate,
  invalidateCacheMiddleware(['tournaments', 'brackets']),
  deleteBracketHandler
);
router.post(
  '/brackets/:bracketId/advance',
  authenticate,
  invalidateCacheMiddleware(['tournaments', 'brackets']),
  advanceBracketHandler
);
router.post(
  '/brackets/default',
  authenticate,
  invalidateCacheMiddleware(['tournaments', 'brackets']),
  createDefaultBracketHandler
);

export default router;
