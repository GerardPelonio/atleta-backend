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

// Coach Batch Synchronization
router.post('/coach-offline-queue', authenticate, requireCoach, syncCoachOfflineBatchHandler);
router.post('/offline-queue', authenticate, requireCoach, syncCoachOfflineBatchHandler);
router.post('/batch', authenticate, syncCoachOfflineBatchHandler);
router.post('/', authenticate, requireCoach, syncCoachOfflineBatchHandler);

// Athlete Batch Synchronization
router.post('/athlete-offline-queue', authenticate, syncAthleteOfflineBatchHandler);

// Offline Snapshots
router.get('/coach-snapshot', authenticate, requireCoach, getCoachOfflineSnapshotHandler);
router.get('/athlete-snapshot', authenticate, getAthleteOfflineSnapshotHandler);
router.get('/athlete-snapshot/:athleteId', authenticate, getAthleteOfflineSnapshotHandler);

// Sync Service Status
router.get('/status', authenticate, getOfflineSyncStatusHandler);
router.get('/', authenticate, getOfflineSyncStatusHandler);

export default router;

