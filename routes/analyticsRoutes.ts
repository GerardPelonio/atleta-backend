import { Router } from 'express';
import { authenticate, optionalAuth } from '../middlewares/authMiddleware';
import { postSrpeLog, getWorkload } from '../controllers/workloadController';
import { getMetricProgressionHistoryHandler } from '../controllers/athleteController';

const router = Router();

// sRPE Workload Logging
router.post('/srpe', authenticate, postSrpeLog);
router.post('/workload', authenticate, postSrpeLog);

// Workload Analytics (Token-Based & Parameterized)
router.get('/workload', authenticate, getWorkload);
router.get('/:athleteId/workload', authenticate, getWorkload);

// Metric Progression History (Time-based & Distance-based sports)
router.get('/metric-progression', optionalAuth, getMetricProgressionHistoryHandler);
router.get('/progression-history', optionalAuth, getMetricProgressionHistoryHandler);
router.get('/:athleteId/metric-progression', optionalAuth, getMetricProgressionHistoryHandler);
router.get('/:athleteId/progression-history', optionalAuth, getMetricProgressionHistoryHandler);

export default router;

