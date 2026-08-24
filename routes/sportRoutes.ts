import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import { requireSystemAdmin } from '../middlewares/adminMiddleware';
import {
  getSportsHandler,
  getSportByIdHandler,
  createSportHandler,
  updateSportHandler,
} from '../controllers/sportController';

const router = Router();

// Sports Directory Catalog (Named and Root Routes)
router.get('/list', authenticate, getSportsHandler);
router.get('/all', authenticate, getSportsHandler);
router.get('/browse', authenticate, getSportsHandler);
router.get('/', authenticate, getSportsHandler);

// Sport Creation (Admin)
router.post('/create', requireSystemAdmin, createSportHandler);
router.post('/', requireSystemAdmin, createSportHandler);

// Sport Detail & Modification
router.get('/:sportId', authenticate, getSportByIdHandler);
router.patch('/:sportId', requireSystemAdmin, updateSportHandler);
router.put('/:sportId', requireSystemAdmin, updateSportHandler);

export default router;

