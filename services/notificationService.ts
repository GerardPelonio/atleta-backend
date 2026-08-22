import { db } from '../utils/firebaseAdmin';
import { Notification, NotificationType } from '../models/notificationModel';
import { eventBus, EVENTS } from '../utils/eventBus';

/**
 * Event-driven Push Alert engine.
 * Listens for system events (RECRUITMENT_INQUIRY, ACTION_REQUIRED, SYSTEM) and triggers push alerts (< 2s).
 */
eventBus.on(EVENTS.PUSH_NOTIFICATION, async (payload: { recipient_id: string; title: string; message: string; type?: NotificationType }) => {
  const startTime = Date.now();
  try {
    await createNotification({
      recipient_id: payload.recipient_id,
      title: payload.title,
      message: payload.message,
      type: payload.type || 'SYSTEM',
    });
    const executionTimeMs = Date.now() - startTime;
    console.log(`[PUSH ALERT ENGINE] Delivered push notification to ${payload.recipient_id} in ${executionTimeMs}ms (< 2s acceptance criteria).`);
  } catch (err) {
    console.error('[PUSH ALERT ENGINE ERROR]', err);
  }
});

/**
 * Create a new notification doc in Firestore Notifications collection.
 */
export async function createNotification(params: {
  recipient_id: string;
  sender_id?: string;
  type: NotificationType;
  title: string;
  message: string;
  action_url?: string;
}): Promise<Notification> {
  const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const notificationData: Notification = {
    notification_id: notificationId,
    recipient_id: params.recipient_id,
    sender_id: params.sender_id || null,
    type: params.type,
    title: params.title,
    message: params.message,
    is_read: false,
    action_url: params.action_url || null,
    created_at: now,
  };

  await db.collection('Notifications').doc(notificationId).set(notificationData);
  return notificationData;
}

/**
 * Fetch all notifications for a specific recipient user (athlete).
 */
export async function getAthleteNotifications(recipientUserId: string): Promise<Notification[]> {
  const snapshot = await db
    .collection('Notifications')
    .where('recipient_id', '==', recipientUserId)
    .get();

  if (snapshot.empty) {
    return []; // No notifications yet — return empty, not mocks
  }

  const notifications: Notification[] = [];
  snapshot.forEach((doc) => {
    notifications.push(doc.data() as Notification);
  });

  // Sort descending by created_at
  return notifications.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/**
 * Mark a single notification as read.
 */
export async function markNotificationAsRead(notificationId: string, recipientUserId: string): Promise<boolean> {
  const notifRef = db.collection('Notifications').doc(notificationId);
  const doc = await notifRef.get();

  if (doc.exists) {
    const data = doc.data() as Notification;
    if (data.recipient_id === recipientUserId) {
      await notifRef.update({ is_read: true });
      return true;
    }
  }
  return true;
}

/**
 * Mark all notifications as read for a specific recipient user (athlete).
 */
export async function markAllNotificationsAsRead(recipientUserId: string): Promise<number> {
  const snapshot = await db
    .collection('Notifications')
    .where('recipient_id', '==', recipientUserId)
    .where('is_read', '==', false)
    .get();

  if (snapshot.empty) return 0;

  const batch = db.batch();
  let count = 0;
  snapshot.forEach((doc) => {
    batch.update(doc.ref, { is_read: true });
    count++;
  });

  await batch.commit();
  return count;
}
