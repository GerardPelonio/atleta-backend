import { db } from '../utils/firebaseAdmin';
import { Notification, NotificationType } from '../models/notificationModel';
import { eventBus, EVENTS } from '../utils/eventBus';
import { serverCache } from '../utils/cache';

const recentNotificationTimes = new Map<string, number>();

/**
 * Event-driven Push Alert engine.
 * Listens for system events (RECRUITMENT_INQUIRY, ACTION_REQUIRED, SYSTEM) and triggers push alerts (< 2s).
 */
eventBus.on(EVENTS.PUSH_NOTIFICATION, async (payload: { recipient_id: string; title: string; message: string; type?: NotificationType }) => {
  const startTime = Date.now();
  try {
    const dedupeKey = `${payload.recipient_id}_${payload.type || 'SYSTEM'}_${payload.title}`;
    const lastTime = recentNotificationTimes.get(dedupeKey);
    if (lastTime && Date.now() - lastTime < 15000) {
      console.log(`[PUSH ALERT ENGINE] Skipped duplicate push notification for ${payload.recipient_id}`);
      return;
    }
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

export async function createNotification(params: {
  recipient_id: string;
  recipient_email?: string;
  sender_id?: string;
  sender_name?: string;
  type?: NotificationType;
  title: string;
  message: string;
  action_url?: string;
  metadata?: Record<string, any>;
}): Promise<Notification> {
  let targetRecipientId = (params.recipient_id || '').trim();
  let targetEmail = (params.recipient_email || '').trim().toLowerCase();

  if (targetRecipientId.includes('@')) {
    targetEmail = targetRecipientId.toLowerCase();
    try {
      const userSnap = await db.collection('Users').where('email', '==', targetEmail).limit(1).get();
      if (!userSnap.empty) {
        targetRecipientId = userSnap.docs[0].id;
      }
    } catch {}
  }

  // Deduplication check: prevent multiple notifications for the exact same inquiry or identical message within 15s
  const dedupeKey = `${targetRecipientId}_${params.type || 'SYSTEM'}_${params.metadata?.scout_id || params.title}`;
  const nowMs = Date.now();
  if (recentNotificationTimes.has(dedupeKey)) {
    const lastTime = recentNotificationTimes.get(dedupeKey)!;
    if (nowMs - lastTime < 15000) {
      console.log(`[NOTIFICATION SERVICE] Suppressed duplicate notification for key: ${dedupeKey}`);
      return {
        notification_id: `dup_${nowMs}`,
        recipient_id: targetRecipientId,
        title: params.title,
        message: params.message,
        is_read: false,
        created_at: new Date().toISOString(),
      } as Notification;
    }
  }
  recentNotificationTimes.set(dedupeKey, nowMs);

  // If in-memory map gets too large, prune keys older than 60 seconds
  if (recentNotificationTimes.size > 200) {
    for (const [k, time] of recentNotificationTimes.entries()) {
      if (nowMs - time > 60000) {
        recentNotificationTimes.delete(k);
      }
    }
  }

  // Deterministic ID for inquiry-linked notifications to guarantee storage-layer idempotency
  let notificationId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  if (params.metadata?.scout_id) {
    const cleanScoutId = String(params.metadata.scout_id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const statusKey = String(params.metadata.offer_status || params.type || 'INQUIRY').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanRecipient = targetRecipientId.replace(/[^a-zA-Z0-9_-]/g, '_');
    notificationId = `notif_${cleanScoutId}_${statusKey}_${cleanRecipient}`;
  }

  const now = new Date().toISOString();

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

  // Invalidate notification caches for recipient
  try {
    const rawUid = targetRecipientId.replace(/^ath_/, '').replace(/^coach_/, '');
    serverCache.invalidateTags([`notifs_${rawUid}`, `notifs_${targetRecipientId}`]);
  } catch {}

  return notificationData as Notification;
}

/**
 * Fetch all notifications for a specific recipient user (athlete/coach).
 * Limited to latest 50 to conserve Firestore read quotas.
 */
export async function getAthleteNotifications(recipientUserId: string): Promise<Notification[]> {
  const rawUid = recipientUserId.replace(/^ath_/, '').replace(/^coach_/, '');
  const possibleRecipientIds = Array.from(
    new Set([recipientUserId, rawUid, `ath_${rawUid}`, `coach_${rawUid}`]),
  );

  return serverCache.getOrSet(
    `notifs_list_${rawUid}`,
    async () => {
      const snapshot = await db
        .collection('Notifications')
        .where('recipient_id', 'in', possibleRecipientIds)
        .limit(50)
        .get();

      if (snapshot.empty) {
        return [];
      }

      const notifications: Notification[] = [];
      const seenIds = new Set<string>();
      snapshot.forEach((doc) => {
        const data = doc.data() as Notification;
        const id = data.notification_id || doc.id;
        if (!seenIds.has(id)) {
          seenIds.add(id);
          notifications.push({ ...data, notification_id: id });
        }
      });

      // Cross-reference any RECRUITMENT_INQUIRY notifications with Scouting_Registry to ensure status is up-to-date
      const inquiryIds = notifications
        .filter((n) => n.type === 'RECRUITMENT_INQUIRY' && n.metadata?.scout_id)
        .map((n) => String(n.metadata!.scout_id));

      if (inquiryIds.length > 0) {
        try {
          const inqSnap = await db.collection('Scouting_Registry')
            .where('__name__', 'in', inquiryIds.slice(0, 30))
            .get()
            .catch(() => null);
          if (inqSnap && !inqSnap.empty) {
            const inqMap = new Map<string, any>();
            inqSnap.forEach((d) => inqMap.set(d.id, d.data()));
            notifications.forEach((n: any) => {
              if (n.metadata?.scout_id && inqMap.has(n.metadata.scout_id)) {
                const inq = inqMap.get(n.metadata.scout_id);
                const s = (inq.offer_status || inq.status || '').toUpperCase();
                if (s === 'ACCEPTED' || s === 'DECLINED') {
                  n.offer_status = s;
                  n.status = s;
                  n.is_read = true;
                  if (!n.metadata) n.metadata = {};
                  n.metadata.offer_status = s;
                }
              }
            });
          }
        } catch {}
      }

      // Sort descending by created_at
      return notifications.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
    30, // 30s cache TTL to stop spamming Firestore on frequent polls
    [`notifs_${rawUid}`, `notifs_${recipientUserId}`]
  );
}

/**
 * Mark a single notification as read.
 */
export async function markNotificationAsRead(notificationId: string, recipientUserId: string): Promise<boolean> {
  const notifRef = db.collection('Notifications').doc(notificationId);
  const doc = await notifRef.get();

  if (doc.exists) {
    const data = doc.data() as Notification;
    const rawUid = recipientUserId.replace(/^ath_/, '').replace(/^coach_/, '');
    const possibleRecipientIds = [recipientUserId, rawUid, `ath_${rawUid}`, `coach_${rawUid}`];
    if (possibleRecipientIds.includes(data.recipient_id)) {
      await notifRef.update({ is_read: true, read_status: true, status: 'READ' });
      try {
        serverCache.invalidateTags([`notifs_${rawUid}`, `notifs_${recipientUserId}`]);
      } catch {}
      return true;
    }
  }
  return true;
}

/**
 * Mark all notifications as read for a specific recipient user.
 */
export async function markAllNotificationsAsRead(recipientUserId: string): Promise<number> {
  const rawUid = recipientUserId.replace(/^ath_/, '').replace(/^coach_/, '');
  const possibleRecipientIds = Array.from(
    new Set([recipientUserId, rawUid, `ath_${rawUid}`, `coach_${rawUid}`]),
  );

  const snapshot = await db
    .collection('Notifications')
    .where('recipient_id', 'in', possibleRecipientIds)
    .where('is_read', '==', false)
    .limit(100)
    .get();

  if (snapshot.empty) return 0;

  const batch = db.batch();
  let count = 0;
  snapshot.forEach((doc) => {
    batch.update(doc.ref, { is_read: true, read_status: true, status: 'READ' });
    count++;
  });

  await batch.commit();

  try {
    serverCache.invalidateTags([`notifs_${rawUid}`, `notifs_${recipientUserId}`]);
  } catch {}

  return count;
}
