import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import { postSrpeLog, getWorkload } from '../controllers/workloadController';

const router = Router();

// sRPE Workload Logging
router.post('/srpe', authenticate, postSrpeLog);
router.post('/workload', authenticate, postSrpeLog);

// Workload Analytics (Token-Based & Parameterized)
router.get('/workload', authenticate, getWorkload);
router.get('/:athleteId/workload', authenticate, getWorkload);

export default router;

