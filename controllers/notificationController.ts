import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import {
  getAthleteNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  createNotification,
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


export async function createNotificationHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const senderId = req.user?.uid;
    const body = req.body || {};
    const recipientId =
      body.recipient_id ||
      body.recipient_user_id ||
      body.target_athlete_id ||
      body.athlete_id ||
      body.user_id ||
      body.recipient_email ||
      body.email;
    const recipientEmail = body.recipient_email || body.email || (typeof recipientId === 'string' && recipientId.includes('@') ? recipientId : undefined);
    const title = body.title || body.headline || 'Action Required: Missing Documents';
    const message = body.message || body.message_body || body.body || '';
    const type = body.type || 'ACTION_REQUIRED';
    const action_url = body.action_url;
    const metadata = body.metadata;

    if (!recipientId || !title || !message) {
      res.status(400).json({ error: 'recipient_id (or email/target_athlete_id), title, and message are required.' });
      return;
    }

    const created = await createNotification({
      recipient_id: String(recipientId).trim(),
      recipient_email: recipientEmail ? String(recipientEmail).trim().toLowerCase() : undefined,
      sender_id: senderId,
      type: type,
      title: String(title).trim(),
      message: String(message).trim(),
      action_url,
      metadata,
    });

    res.status(201).json({
      message: 'Notification created successfully.',
      notification: created,
    });
  } catch (error: any) {
    console.error('createNotificationHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}


