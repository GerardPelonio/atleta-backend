import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import {
  getOfficialProfileHandler,
  getOfficialSettingsHandler,
  updateOfficialSettingsHandler,
} from '../controllers/officialController';
import {
  getDashboardHandler,
  getSchedulesHandler,
  getOfficialNotificationsHandler,
  markAllOfficialNotificationsAsReadHandler,
} from '../controllers/officialDashboardController';

const router = Router();

// Profile & Identity
router.get('/profile', authenticate, getOfficialProfileHandler);
router.get('/me', authenticate, getOfficialProfileHandler);

// Tournament Management Operations & Dashboard
router.get('/dashboard', authenticate, getDashboardHandler);
router.get('/schedules', authenticate, getSchedulesHandler);

// Tournament Official Notifications
router.get('/notifications', authenticate, getOfficialNotificationsHandler);
router.patch('/notifications/read-all', authenticate, markAllOfficialNotificationsAsReadHandler);
router.patch('/notifications/read', authenticate, markAllOfficialNotificationsAsReadHandler);

// Tournament Official Settings
router.get('/me/settings', authenticate, getOfficialSettingsHandler);
router.patch('/me/settings', authenticate, updateOfficialSettingsHandler);

export default router;
