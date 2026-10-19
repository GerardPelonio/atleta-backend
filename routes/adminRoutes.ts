import { Router } from 'express';
import { authRateLimiter } from '../middlewares/rateLimitMiddleware';
import { requireSystemAdmin } from '../middlewares/adminMiddleware';
import {
  registerAdminHandler,
  loginAdminHandler,
  getAdminProfileHandler,
  getCoachQueueHandler,
  approveCoachHandler,
  rejectCoachHandler,
  getOfficialsQueueHandler,
  approveOfficialHandler,
  rejectOfficialHandler,
} from '../controllers/adminController';

const router = Router();

// Admin Authentication
router.post('/register', authRateLimiter, registerAdminHandler);
router.post('/login', authRateLimiter, loginAdminHandler);

// Admin Profile
router.get('/profile', requireSystemAdmin, getAdminProfileHandler);
router.get('/me', requireSystemAdmin, getAdminProfileHandler);

// Coach Accreditation Queue
router.get('/coaches/queue', requireSystemAdmin, getCoachQueueHandler);
router.get('/coach-queue', requireSystemAdmin, getCoachQueueHandler);
router.post('/coaches/:coachId/approve', requireSystemAdmin, approveCoachHandler);
router.post('/coaches/:coachId/reject', requireSystemAdmin, rejectCoachHandler);

// Official Sign-Up Review & Approval Queue
router.get('/officials/queue', requireSystemAdmin, getOfficialsQueueHandler);
router.get('/official-queue', requireSystemAdmin, getOfficialsQueueHandler);
router.post('/officials/:officialId/approve', requireSystemAdmin, approveOfficialHandler);
router.post('/officials/:officialId/reject', requireSystemAdmin, rejectOfficialHandler);

export default router;

