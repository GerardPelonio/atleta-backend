import { Router } from 'express';
import { authenticate, optionalAuth } from '../middlewares/authMiddleware';
import { requireSystemAdmin } from '../middlewares/adminMiddleware';
import {
  getSportsHandler,
  getSportByIdHandler,
  createSportHandler,
  updateSportHandler,
  deleteSportHandler,
} from '../controllers/sportController';

import { cacheMiddleware, invalidateCacheMiddleware } from '../middlewares/cacheMiddleware';

const router = Router();

const sportsCache = cacheMiddleware({ ttlSeconds: 300, tags: ['sports', 'catalog'] });
const sportsInvalidate = invalidateCacheMiddleware(['sports', 'catalog']);

// Sports Directory Catalog (Named and Root Routes)
router.get('/list', optionalAuth, sportsCache, getSportsHandler);
router.get('/all', optionalAuth, sportsCache, getSportsHandler);
router.get('/browse', optionalAuth, sportsCache, getSportsHandler);
router.get('/', optionalAuth, sportsCache, getSportsHandler);

// Sport Creation (Admin)
router.post('/create', requireSystemAdmin, sportsInvalidate, createSportHandler);
router.post('/', requireSystemAdmin, sportsInvalidate, createSportHandler);

// Sport Detail & Modification
router.get('/:sportId', authenticate, sportsCache, getSportByIdHandler);
router.patch('/:sportId', requireSystemAdmin, sportsInvalidate, updateSportHandler);
router.put('/:sportId', requireSystemAdmin, sportsInvalidate, updateSportHandler);
router.delete('/:sportId', requireSystemAdmin, sportsInvalidate, deleteSportHandler);

export default router;

