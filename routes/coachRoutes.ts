import { Router } from 'express';
import multer from 'multer';
import { authenticate, requireCoach } from '../middlewares/authMiddleware';
import { authRateLimiter } from '../middlewares/rateLimitMiddleware';
import { registerCoach, loginUser } from '../controllers/userController';
import {
  getCoachProfileHandler,
  getCoachSettingsHandler,
  updateCoachSettingsHandler,
  updateCoachProfileHandler,
  changeCoachPasswordHandler,
  getCoachManagedAthletesHandler,
} from '../controllers/coachInquiryController';
import { getScoutingAthleteProfileController } from '../controllers/scoutingController';
import { postSrpeLog, getAthleteWorkloadHandler } from '../controllers/workloadController';
import { syncCoachOfflineBatchHandler, getCoachOfflineSnapshotHandler } from '../controllers/syncController';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// Coach Registration & Auth (Named and Root Routes)
router.post('/register-coach', authRateLimiter, upload.single('professional_documents'), registerCoach);
router.post('/register', authRateLimiter, upload.single('professional_documents'), registerCoach);
router.post('/coach', authRateLimiter, upload.single('professional_documents'), registerCoach);
router.post('/', authRateLimiter, upload.single('professional_documents'), registerCoach);
router.post('/login', authRateLimiter, loginUser);

// Clean Token-Based Routes (No Coach ID required)
router.get('/me', authenticate, getCoachProfileHandler);
router.get('/profile', authenticate, getCoachProfileHandler);

// Coach Handled Athletes (both with team and unassigned)
router.get('/me/athletes', authenticate, getCoachManagedAthletesHandler);
router.get('/athletes', authenticate, getCoachManagedAthletesHandler);

// Coach Settings
router.get('/me/settings', authenticate, getCoachSettingsHandler);
router.get('/settings', authenticate, getCoachSettingsHandler);
router.patch('/me/settings', authenticate, updateCoachSettingsHandler);
router.patch('/settings', authenticate, updateCoachSettingsHandler);

// Coach Profile Update
router.patch('/me/profile', authenticate, updateCoachProfileHandler);
router.patch('/profile', authenticate, updateCoachProfileHandler);

// Coach Password Change
router.patch('/me/password', authenticate, changeCoachPasswordHandler);
router.patch('/password', authenticate, changeCoachPasswordHandler);
router.post('/change-password', authenticate, changeCoachPasswordHandler);

// Offline Synchronization
router.post('/sync-offline', authenticate, requireCoach, syncCoachOfflineBatchHandler);
router.get('/offline-snapshot', authenticate, requireCoach, getCoachOfflineSnapshotHandler);

// Coach Actions on Athletes & Teams
router.get('/scouting/athletes/:athleteId', authenticate, requireCoach, getScoutingAthleteProfileController);
router.post('/athletes/:athleteId/workload', authenticate, requireCoach, postSrpeLog);
router.get('/athletes/:athleteId/workload', authenticate, requireCoach, getAthleteWorkloadHandler);
router.get('/:coachId/athletes', authenticate, getCoachManagedAthletesHandler);

// Public / Parameterized Coach lookup
router.get('/:coachId', getCoachProfileHandler);

export default router;

