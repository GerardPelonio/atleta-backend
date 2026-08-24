import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
} from '../controllers/notificationController';
import {
  getOfficialNotificationsHandler,
  markAllOfficialNotificationsAsReadHandler,
} from '../controllers/officialDashboardController';

const router = Router();

const handleReadAll = (req: any, res: any) => {
  if (req.user && req.user.role === 'Official') {
    return markAllOfficialNotificationsAsReadHandler(req, res);
  }
  return markAllAsRead(req, res);
};

// Official Notifications
router.get('/official', authenticate, getOfficialNotificationsHandler);

// Notification Inbox (Named and Root Routes)
router.get('/me', authenticate, getNotifications);
router.get('/list', authenticate, getNotifications);
router.get('/all', authenticate, getNotifications);
router.get('/', authenticate, getNotifications);

// Mark All As Read
router.patch('/read-all', authenticate, handleReadAll);
router.post('/read-all', authenticate, handleReadAll);

// Mark Specific Notification As Read
router.patch('/:notificationId/read', authenticate, markAsRead);
router.post('/:notificationId/read', authenticate, markAsRead);

export default router;

