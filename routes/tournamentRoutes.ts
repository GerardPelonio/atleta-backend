import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import {
  getBracketsHandler,
  getBracketByIdHandler,
  saveBracketHandler,
  advanceBracketHandler,
  createDefaultBracketHandler,
} from '../controllers/tournamentController';

const router = Router();

// Tournament Brackets
router.get('/brackets', authenticate, getBracketsHandler);
router.get('/brackets/:bracketId', authenticate, getBracketByIdHandler);
router.post('/brackets', authenticate, saveBracketHandler);
router.put('/brackets/:bracketId', authenticate, saveBracketHandler);
router.post('/brackets/:bracketId/advance', authenticate, advanceBracketHandler);
router.post('/brackets/default', authenticate, createDefaultBracketHandler);

export default router;
