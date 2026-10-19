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

const router = Router();

// Sports Directory Catalog (Named and Root Routes)
router.get('/list', optionalAuth, getSportsHandler);
router.get('/all', optionalAuth, getSportsHandler);
router.get('/browse', optionalAuth, getSportsHandler);
router.get('/', optionalAuth, getSportsHandler);

// Sport Creation (Admin)
router.post('/create', requireSystemAdmin, createSportHandler);
router.post('/', requireSystemAdmin, createSportHandler);

// Sport Detail & Modification
router.get('/:sportId', authenticate, getSportByIdHandler);
router.patch('/:sportId', requireSystemAdmin, updateSportHandler);
router.put('/:sportId', requireSystemAdmin, updateSportHandler);
router.delete('/:sportId', requireSystemAdmin, deleteSportHandler);

export default router;

