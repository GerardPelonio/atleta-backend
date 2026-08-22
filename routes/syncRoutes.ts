import { Router } from 'express';
import { authenticate, requireCoach } from '../middlewares/authMiddleware';
import {
  syncCoachOfflineBatchHandler,
  syncAthleteOfflineBatchHandler,
  getCoachOfflineSnapshotHandler,
  getAthleteOfflineSnapshotHandler,
  getOfflineSyncStatusHandler,
} from '../controllers/syncController';

const router = Router();

router.post('/coach-offline-queue', authenticate, requireCoach, syncCoachOfflineBatchHandler);
router.post('/offline-queue', authenticate, requireCoach, syncCoachOfflineBatchHandler);
router.post('/batch', authenticate, syncCoachOfflineBatchHandler);
router.post('/athlete-offline-queue', authenticate, syncAthleteOfflineBatchHandler);
router.get('/coach-snapshot', authenticate, requireCoach, getCoachOfflineSnapshotHandler);
router.get('/athlete-snapshot', authenticate, getAthleteOfflineSnapshotHandler);
router.get('/athlete-snapshot/:athleteId', authenticate, getAthleteOfflineSnapshotHandler);
router.get('/status', authenticate, getOfflineSyncStatusHandler);

export default router;
