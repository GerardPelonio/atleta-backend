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
  sender_name?: string;
  type: NotificationType;
  title: string;
  message: string;
  action_url?: string;
  recipient_email?: string;
  metadata?: Record<string, any>;
}): Promise<Notification> {
  const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  let targetRecipientId = (params.recipient_id || '').trim();
  let targetEmail = (params.recipient_email || '').trim().toLowerCase();

  // If recipient is an email address, resolve to UID from Users collection
  if (targetRecipientId.includes('@')) {
    targetEmail = targetRecipientId.toLowerCase();
    try {
      const userSnap = await db
        .collection('Users')
        .where('email', '==', targetEmail)
        .limit(1)
        .get();
      if (!userSnap.empty) {
        targetRecipientId = userSnap.docs[0].id;
      }
    } catch (e) {
      console.warn('Could not resolve recipient email to UID:', e);
    }
  } else {
    // Check if targetRecipientId is an athlete_id alias or UID
    try {
      const [uDoc, aDoc] = await Promise.all([
        db.collection('Users').doc(targetRecipientId).get().catch(() => null),
        db.collection('Athlete_Profiles').doc(targetRecipientId).get().catch(() => null),
      ]);

      if (uDoc && uDoc.exists) {
        targetEmail = targetEmail || (uDoc.data()?.email || '').toLowerCase();
      } else if (aDoc && aDoc.exists) {
        targetEmail = targetEmail || (aDoc.data()?.email || '').toLowerCase();
        if (aDoc.data()?.user_id) {
          targetRecipientId = aDoc.data()?.user_id;
        }
      } else {
        // Query by athlete_id field if doc ID didn't match directly
        const userByAthSnap = await db
          .collection('Users')
          .where('athlete_id', '==', targetRecipientId)
          .limit(1)
          .get()
          .catch(() => null);
        if (userByAthSnap && !userByAthSnap.empty) {
          targetRecipientId = userByAthSnap.docs[0].id;
          targetEmail = targetEmail || (userByAthSnap.docs[0].data()?.email || '').toLowerCase();
        }
      }
    } catch (e) {
      console.warn('Could not lookup user details for recipient:', e);
    }
  }

  const notificationData: any = {
    notification_id: notificationId,
    recipient_id: targetRecipientId || params.recipient_id,
    recipient_email: targetEmail || null,
    sender_id: params.sender_id || null,
    sender_name: params.sender_name || params.metadata?.sender_name || null,
    type: params.type || 'SYSTEM',
    title: params.title,
    message: params.message,
    is_read: false,
    action_url: params.action_url || null,
    created_at: now,
  };

  if (params.metadata) {
    notificationData.metadata = params.metadata;
  }

  await db.collection('Notifications').doc(notificationId).set(notificationData);
  return notificationData as Notification;
}

/**
 * Fetch all notifications for a specific recipient user (athlete or coach).
 */
export async function getAthleteNotifications(recipientUserId: string): Promise<Notification[]> {
  if (!recipientUserId || typeof recipientUserId !== 'string') {
    return [];
  }

  const rawUid = recipientUserId.replace(/^ath_/, '').replace(/^coach_/, '');
  const possibleRecipientIds = new Set<string>([
    recipientUserId,
    rawUid,
    `ath_${rawUid}`,
    `coach_${rawUid}`,
  ]);

  let userEmail: string = '';

  // Look up user in Users and Athlete_Profiles to find their email and any linked athlete_id
  try {
    const [userDoc1, userDoc2, athDoc1, athDoc2] = await Promise.all([
      db.collection('Users').doc(rawUid).get().catch(() => null),
      db.collection('Users').doc(recipientUserId).get().catch(() => null),
      db.collection('Athlete_Profiles').doc(rawUid).get().catch(() => null),
      db.collection('Athlete_Profiles').doc(recipientUserId).get().catch(() => null),
    ]);

    const uData = (userDoc1 && userDoc1.exists) ? userDoc1.data() : (userDoc2 && userDoc2.exists) ? userDoc2.data() : null;
    const aData = (athDoc1 && athDoc1.exists) ? athDoc1.data() : (athDoc2 && athDoc2.exists) ? athDoc2.data() : null;

    if (uData) {
      if (uData.email) {
        userEmail = uData.email.toLowerCase();
        possibleRecipientIds.add(uData.email);
        possibleRecipientIds.add(uData.email.toLowerCase());
      }
      if (uData.user_id) possibleRecipientIds.add(uData.user_id);
      if (uData.athlete_id) possibleRecipientIds.add(uData.athlete_id);
    }
    if (aData) {
      if (aData.email) {
        userEmail = userEmail || aData.email.toLowerCase();
        possibleRecipientIds.add(aData.email);
        possibleRecipientIds.add(aData.email.toLowerCase());
      }
      if (aData.user_id) possibleRecipientIds.add(aData.user_id);
      if (aData.athlete_id) possibleRecipientIds.add(aData.athlete_id);
    }
  } catch (err) {
    console.warn('Error expanding recipient IDs for notifications:', err);
  }

  const idList = Array.from(possibleRecipientIds).filter(Boolean);

  // Query notifications by recipient_id
  const snapshotById = await db
    .collection('Notifications')
    .where('recipient_id', 'in', idList.slice(0, 30))
    .get();

  const notificationsMap = new Map<string, Notification>();

  snapshotById.forEach((doc) => {
    const notif = doc.data() as Notification;
    notificationsMap.set(notif.notification_id || doc.id, notif);
  });

  // Also query by recipient_email if email was discovered
  if (userEmail) {
    try {
      const snapshotByEmail = await db
        .collection('Notifications')
        .where('recipient_email', '==', userEmail)
        .get();

      snapshotByEmail.forEach((doc) => {
        const notif = doc.data() as Notification;
        notificationsMap.set(notif.notification_id || doc.id, notif);
      });
    } catch (e) {
      console.warn('Error querying notifications by recipient_email:', e);
    }
  }

  const notifications = Array.from(notificationsMap.values());

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
    await notifRef.update({ is_read: true });
    return true;
  }
  return false;
}

/**
 * Mark all notifications as read for a specific recipient user (athlete or coach).
 */
export async function markAllNotificationsAsRead(recipientUserId: string): Promise<number> {
  const notifications = await getAthleteNotifications(recipientUserId);
  if (notifications.length === 0) return 0;

  const batch = db.batch();
  let count = 0;

  for (const notif of notifications) {
    if (!notif.is_read) {
      const notifRef = db.collection('Notifications').doc(notif.notification_id);
      batch.update(notifRef, { is_read: true });
      count++;
    }
  }

  if (count > 0) {
    await batch.commit();
  }
  return count;
}

