import { db } from '../utils/firebaseAdmin';
import { OfficialNotification, OfficialSchedule } from '../models/userModel';

/**
 * Retrieve aggregated metrics (total matches, pending count, audited count) and new match audit queues.
 * Optimised to respond under 200ms by running queries in parallel.
 */
export async function getOfficialDashboardMetrics(officialId: string) {
  let totalMatches = 0;
  let pendingCount = 0;
  let auditedCount = 0;
  let pendingAuditsDocs: any[] = [];

  try {
    // Run count queries in parallel. Count aggregation queries in Firestore are fast and cheap.
    const [matchesCount, pendingCountRes, auditedCountRes, pendingAudits] = await Promise.all([
      db.collection('Match_Logs').count().get(),
      db.collection('Official_Audits').where('status', '==', 'Pending').count().get(),
      db.collection('Official_Audits').where('status', 'in', ['Approved', 'Rejected']).count().get(),
      db.collection('Official_Audits').where('status', '==', 'Pending').get()
    ]);

    totalMatches = matchesCount.data().count;
    pendingCount = pendingCountRes.data().count;
    auditedCount = auditedCountRes.data().count;
    pendingAuditsDocs = pendingAudits.docs;
  } catch (err) {
    // Fallback using document snapshot size if count is not supported in the local SDK/environment
    const [matchesSnap, pendingAuditsSnap, auditedSnap] = await Promise.all([
      db.collection('Match_Logs').get(),
      db.collection('Official_Audits').where('status', '==', 'Pending').get(),
      db.collection('Official_Audits').where('status', 'in', ['Approved', 'Rejected']).get()
    ]);

    totalMatches = matchesSnap.size;
    pendingCount = pendingAuditsSnap.size;
    auditedCount = auditedSnap.size;
    pendingAuditsDocs = pendingAuditsSnap.docs;
  }

  // Populate match details for each audit request in the pending queue in parallel
  const matchIds = Array.from(new Set(pendingAuditsDocs.map(d => d.data().match_id)));
  const matchDocs = await Promise.all(
    matchIds.map(id => db.collection('Match_Logs').doc(id).get())
  );

  const matchesMap = new Map<string, any>();
  matchDocs.forEach(mDoc => {
    if (mDoc.exists) {
      matchesMap.set(mDoc.id, mDoc.data());
    }
  });

  const auditQueue = pendingAuditsDocs.map(d => {
    const auditData = d.data();
    return {
      audit_id: auditData.audit_id,
      match_id: auditData.match_id,
      requested_by: auditData.requested_by,
      status: auditData.status,
      requested_at: auditData.requested_at,
      match_details: matchesMap.get(auditData.match_id) || null
    };
  });

  return {
    total_matches: totalMatches,
    pending_count: pendingCount,
    audited_count: auditedCount,
    audit_queue: auditQueue
  };
}

/**
 * Retrieve scheduled match assignments, venue logistics, assigned officials, and court numbers.
 */
export async function getOfficialSchedules(
  officialId: string,
  month?: number,
  year?: number
): Promise<OfficialSchedule[]> {
  let query: any = db.collection('Official_Schedules');

  if (month !== undefined && !isNaN(month)) {
    query = query.where('month', '==', month);
  }
  if (year !== undefined && !isNaN(year)) {
    query = query.where('year', '==', year);
  }

  const snapshot = await query.get();
  const schedules: OfficialSchedule[] = [];

  snapshot.forEach((doc: any) => {
    const data = doc.data();
    // Filter to ensure the requesting official is assigned
    if (
      data.official_id === officialId ||
      (Array.isArray(data.assigned_officials) && data.assigned_officials.includes(officialId))
    ) {
      schedules.push({
        schedule_id: data.schedule_id,
        match_id: data.match_id,
        official_id: data.official_id,
        venue: data.venue,
        court_number: data.court_number,
        scheduled_time: data.scheduled_time,
        month: data.month,
        year: data.year,
        assigned_officials: data.assigned_officials || [],
        venue_logistics: data.venue_logistics || null,
      });
    }
  });

  // Sort by scheduled_time ascending
  return schedules.sort((a, b) => new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime());
}

/**
 * Fetch chronological notification logs for an official.
 */
export async function getOfficialNotifications(officialId: string): Promise<OfficialNotification[]> {
  const snapshot = await db.collection('Official_Notifications')
    .where('official_id', '==', officialId)
    .get();

  const notifications: OfficialNotification[] = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    notifications.push({
      notification_id: data.notification_id,
      official_id: data.official_id,
      type: data.type,
      title: data.title,
      message: data.message,
      reference_id: data.reference_id || null,
      is_read: data.is_read || false,
      created_at: data.created_at,
    });
  });

  // Sort chronologically descending
  return notifications.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/**
 * Mark all notifications as read for a specific official.
 */
export async function markAllOfficialNotificationsAsRead(officialId: string): Promise<number> {
  const snapshot = await db.collection('Official_Notifications')
    .where('official_id', '==', officialId)
    .where('is_read', '==', false)
    .get();

  if (snapshot.empty) {
    return 0;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.update(doc.ref, { is_read: true });
  });

  await batch.commit();
  return snapshot.size;
}
