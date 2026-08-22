import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middlewares/authMiddleware';
import {
  getAthleteHome,
  getAthlete,
  updateAthlete,
  uploadDocument,
  searchAthletesHandler,
  registerAthlete,
  getAthleteAllStatsHandler,
  getAthleteMatchHistoryHandler,
} from '../controllers/athleteController';
import { getAthleteTeamHandler } from '../controllers/teamController';
import { postSrpeLog, getAthleteWorkloadHandler } from '../controllers/workloadController';
import { syncAthleteOfflineBatchHandler, getAthleteOfflineSnapshotHandler } from '../controllers/syncController';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// Registration & Search
router.post('/register-athlete', upload.single('eligible_documents'), registerAthlete);
router.post('/register', upload.single('eligible_documents'), registerAthlete);
router.get('/search', authenticate, searchAthletesHandler);

// Clean Token-Based Routes (No Athlete ID required in URL)
router.get('/home', authenticate, getAthleteHome);
router.get('/team', authenticate, getAthleteTeamHandler);
router.get('/stats/all', authenticate, getAthleteAllStatsHandler);
router.get('/matches', authenticate, getAthleteMatchHistoryHandler);
router.get('/workload', authenticate, getAthleteWorkloadHandler);
router.post('/workload', authenticate, postSrpeLog);
router.post('/sync-offline', authenticate, syncAthleteOfflineBatchHandler);
router.get('/offline-snapshot', authenticate, getAthleteOfflineSnapshotHandler);
router.get('/profile', authenticate, getAthlete);
router.get('/me', authenticate, getAthlete);
router.patch('/profile', authenticate, updateAthlete);
router.patch('/me', authenticate, updateAthlete);
router.post('/documents', authenticate, upload.single('document'), uploadDocument);

// Parameterized Routes (Backward-compatible and for Coach/Scouting queries)
router.get('/:athleteId/home', authenticate, getAthleteHome);
router.get('/:athleteId/team', authenticate, getAthleteTeamHandler);
router.get('/:athleteId/stats/all', authenticate, getAthleteAllStatsHandler);
router.get('/:athleteId/matches', authenticate, getAthleteMatchHistoryHandler);
router.get('/:athleteId/workload', authenticate, getAthleteWorkloadHandler);
router.post('/:athleteId/workload', authenticate, postSrpeLog);
router.post('/:athleteId/sync-offline', authenticate, syncAthleteOfflineBatchHandler);
router.get('/:athleteId/offline-snapshot', authenticate, getAthleteOfflineSnapshotHandler);
router.get('/:athleteId', getAthlete);
router.patch('/:athleteId', authenticate, updateAthlete);
router.post('/:athleteId/documents', authenticate, upload.single('document'), uploadDocument);

export default router;
