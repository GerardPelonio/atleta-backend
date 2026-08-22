import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import { postSrpeLog, getWorkload } from '../controllers/workloadController';

const router = Router();

router.post('/srpe', authenticate, postSrpeLog);
router.get('/:athleteId/workload', authenticate, getWorkload);

export default router;
