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

router.get('/', authenticate, getSportsHandler);
router.get('/:sportId', authenticate, getSportByIdHandler);
router.post('/', requireSystemAdmin, createSportHandler);
router.patch('/:sportId', requireSystemAdmin, updateSportHandler);

export default router;
