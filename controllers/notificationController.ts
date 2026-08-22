import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import {
  getAthleteNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../services/notificationService';

export async function getNotifications(req: AuthRequest, res: Response): Promise<void> {
  try {
    const recipientId = req.user!.uid;
    const notifications = await getAthleteNotifications(recipientId);

    res.status(200).json({
      recipient_id: recipientId,
      unread_count: notifications.filter((n) => !n.is_read).length,
      notifications,
    });
  } catch (error: any) {
    console.error('getNotifications error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function markAsRead(req: AuthRequest, res: Response): Promise<void> {
  try {
    const notificationId = Array.isArray(req.params.notificationId)
      ? req.params.notificationId[0]
      : req.params.notificationId;
    const recipientId = req.user!.uid;

    if (!notificationId) {
      res.status(400).json({ error: 'Notification ID is required.' });
      return;
    }

    await markNotificationAsRead(notificationId, recipientId);
    res.status(200).json({
      message: 'Notification marked as read.',
      notification_id: notificationId,
    });
  } catch (error: any) {
    console.error('markAsRead error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function markAllAsRead(req: AuthRequest, res: Response): Promise<void> {
  try {
    const recipientId = req.user!.uid;
    const count = await markAllNotificationsAsRead(recipientId);

    res.status(200).json({
      message: 'All notifications marked as read.',
      updated_count: count,
    });
  } catch (error: any) {
    console.error('markAllAsRead error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}
