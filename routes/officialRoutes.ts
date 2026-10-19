import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import {
  registerOfficialHandler,
  loginOfficialHandler,
  getOfficialProfileHandler,
  updateOfficialProfileHandler,
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

// Authentication
router.post('/login', loginOfficialHandler);
router.post('/register', registerOfficialHandler);

// Profile & Identity (Named and Root Routes)
router.get('/profile', authenticate, getOfficialProfileHandler);
router.get('/me', authenticate, getOfficialProfileHandler);
router.get('/', authenticate, getOfficialProfileHandler);
router.patch('/profile', authenticate, updateOfficialProfileHandler);
router.put('/profile', authenticate, updateOfficialProfileHandler);
router.patch('/me', authenticate, updateOfficialProfileHandler);
router.put('/me', authenticate, updateOfficialProfileHandler);

// Tournament Management Operations & Dashboard
router.get('/dashboard', authenticate, getDashboardHandler);
router.get('/schedules', authenticate, getSchedulesHandler);

// Tournament Official Notifications
router.get('/notifications', authenticate, getOfficialNotificationsHandler);
router.patch('/notifications/read-all', authenticate, markAllOfficialNotificationsAsReadHandler);
router.post('/notifications/read-all', authenticate, markAllOfficialNotificationsAsReadHandler);
router.patch('/notifications/read', authenticate, markAllOfficialNotificationsAsReadHandler);

// Tournament Official Settings
router.get('/me/settings', authenticate, getOfficialSettingsHandler);
router.get('/settings', authenticate, getOfficialSettingsHandler);
router.patch('/me/settings', authenticate, updateOfficialSettingsHandler);
router.patch('/settings', authenticate, updateOfficialSettingsHandler);
router.put('/me/settings', authenticate, updateOfficialSettingsHandler);
router.put('/settings', authenticate, updateOfficialSettingsHandler);

export default router;

