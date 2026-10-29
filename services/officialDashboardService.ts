import { db } from '../utils/firebaseAdmin';
import { serverCache } from '../utils/cache';
import { OfficialNotification, OfficialSchedule } from '../models/userModel';

/**
 * Retrieve aggregated metrics (total matches, pending count, audited count) and new match audit queues.
 * Optimised to respond under 200ms by running queries in parallel.
 */
export async function getOfficialDashboardMetrics(officialId: string) {
  const cacheKey = `dashboard_metrics_${officialId}`;
  const cached = serverCache.get<any>(cacheKey);
  if (cached) return cached;

  let totalMatches = 0;
  let pendingCount = 0;
  let auditedCount = 0;
  let pendingAuditsDocs: any[] = [];

  try {
    // Fast parallel aggregation counts
    const [matchesCount, pendingCountRes, auditedCountRes, pendingAudits] = await Promise.all([
      db.collection('Match_Logs').count().get().catch(() => null),
      db.collection('Official_Audits').where('status', 'in', ['Pending', 'pending', 'PENDING REQUEST', 'PENDING']).count().get().catch(() => null),
      db.collection('Official_Audits').where('status', 'in', ['Approved', 'approved', 'Fulfilled', 'fulfilled', 'Certify', 'Certified', 'Rejected']).count().get().catch(() => null),
      db.collection('Official_Audits')
        .where('status', 'in', ['Pending', 'pending', 'PENDING REQUEST', 'PENDING'])
        .limit(50)
        .get()
        .catch(() => null)
    ]);

    if (matchesCount && pendingCountRes && auditedCountRes && pendingAudits) {
      totalMatches = matchesCount.data().count;
      pendingCount = pendingCountRes.data().count;
      auditedCount = auditedCountRes.data().count;
      pendingAuditsDocs = pendingAudits.docs;
    } else {
      throw new Error('Count aggregation fallback needed');
    }
  } catch {
    // Bounded fallback with lightweight projections
    const [matchesSnap, pendingAuditsSnap, auditedSnap] = await Promise.all([
      db.collection('Match_Logs').select('match_id', 'is_certified').limit(150).get().catch(() => ({ size: 0, docs: [] } as any)),
      db.collection('Official_Audits').where('status', 'in', ['Pending', 'pending', 'PENDING REQUEST']).limit(50).get().catch(() => ({ size: 0, docs: [] } as any)),
      db.collection('Official_Audits').where('status', 'in', ['Approved', 'approved', 'Fulfilled', 'fulfilled', 'Certify', 'Certified', 'Rejected']).limit(100).get().catch(() => ({ size: 0, docs: [] } as any))
    ]);

    totalMatches = matchesSnap.size;
    pendingCount = pendingAuditsSnap.size;
    auditedCount = auditedSnap.size;
    pendingAuditsDocs = pendingAuditsSnap.docs;
  }

  // Populate lightweight match details for pending audit queue in parallel
  const matchIds = Array.from(new Set(pendingAuditsDocs.map(d => d.data().match_id).filter(Boolean)));
  const matchDocs = await Promise.all(
    matchIds.map(id =>
      db.collection('Match_Logs')
        .doc(id)
        .get()
        .catch(() => null)
    )
  );

  const matchesMap = new Map<string, any>();
  matchDocs.forEach(mDoc => {
    if (mDoc && mDoc.exists) {
      const data = mDoc.data() || {};
      const resolvedName = String(data.matchName || data.match_name || data.game_name || data.gameName || '').trim();
      matchesMap.set(mDoc.id, {
        match_id: data.match_id || mDoc.id,
        matchName: resolvedName,
        match_name: resolvedName,
        gameName: resolvedName,
        game_name: resolvedName,
        home_team_name: data.home_team_name || data.home_team || 'Home Team',
        away_team_name: data.away_team_name || data.away_team || 'Away Team',
        sport_type: data.sport_type || 'Basketball',
        match_date: data.match_date || data.created_at || new Date().toISOString(),
        scoresheet_url: data.scoresheet_url || '',
        is_certified: Boolean(data.is_certified),
        logged_by_coach_id: data.logged_by_coach_id || data.coach_id || '',
        coach_name: data.coach_name || '',
      });
    }
  });

  const auditQueue = pendingAuditsDocs.map(d => {
    const auditData = d.data();
    const details = matchesMap.get(auditData.match_id) || {};
    const customMatchName = String(
      auditData.customGameTitle ||
      auditData.custom_game_title ||
      details.customGameTitle ||
      details.custom_game_title ||
      auditData.matchName ||
      auditData.match_name ||
      auditData.gameName ||
      auditData.game_name ||
      details.matchName ||
      details.match_name ||
      details.gameName ||
      details.game_name ||
      ''
    ).trim();

    return {
      audit_id: auditData.audit_id || d.id,
      match_id: auditData.match_id || details.match_id || d.id,
      validation_id: auditData.validation_id || auditData.audit_id || d.id,
      matchName: customMatchName,
      match_name: customMatchName,
      gameName: customMatchName,
      game_name: customMatchName,
      requested_by: auditData.requested_by_coach_id || auditData.requested_by || details.logged_by_coach_id || 'Coach',
      requested_by_coach_id: auditData.requested_by_coach_id || auditData.requested_by || details.logged_by_coach_id || 'Coach',
      status: auditData.status || 'Pending',
      requested_at: auditData.requested_at || auditData.created_at || new Date().toISOString(),
      match_details: details.match_id ? details : null,
      home_team_name: details.home_team_name || 'Home Team',
      away_team_name: details.away_team_name || 'Away Team',
      sport_type: details.sport_type || 'Basketball',
    };
  });

  const result = {
    total_matches: totalMatches,
    pending_count: pendingCount,
    audited_count: auditedCount,
    audit_queue: auditQueue
  };

  serverCache.set(cacheKey, result, 45, ['dashboard', 'matches', 'validations']);
  return result;
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
  const rawUid = officialId.replace(/^off_/, '');
  const canonicalOfficialId = officialId.startsWith('off_') ? officialId : `off_${officialId}`;

  const [snap1, snap2, snap3, snapOfficialNotifs, snapScoresheetRequests] = await Promise.all([
    db.collection('Notifications').where('recipient_id', 'in', [officialId, rawUid, canonicalOfficialId]).get().catch(() => ({ forEach: () => {} } as any)),
    db.collection('Notifications').where('user_id', 'in', [officialId, rawUid, canonicalOfficialId]).get().catch(() => ({ forEach: () => {} } as any)),
    db.collection('Notifications').where('official_id', '==', officialId).get().catch(() => ({ forEach: () => {} } as any)),
    db.collection('Official_Notifications').limit(50).get().catch(() => ({ forEach: () => {} } as any)),
    db.collection('scoresheetRequests').limit(50).get().catch(() => ({ forEach: () => {} } as any)),
  ]);

  const seenIds = new Set<string>();
  const notifications: any[] = [];

  const processDoc = (doc: any) => {
    if (seenIds.has(doc.id)) return;
    seenIds.add(doc.id);
    const data = doc.data();
    if (data.request_id) {
      seenIds.add(`req_${data.request_id}`);
      seenIds.add(data.request_id);
    }
    const resolvedCustomTitle = (
      data.customGameTitle ||
      data.custom_game_title ||
      data.matchName ||
      data.match_name ||
      data.match_context ||
      undefined
    );

    notifications.push({
      notification_id: data.notification_id || doc.id,
      official_id: data.official_id || data.recipient_id || officialId,
      type: data.type || 'OFFICIAL_ALERT',
      title: data.title || (resolvedCustomTitle ? `Scoresheet Request: ${resolvedCustomTitle}` : 'Notification'),
      message: data.message || '',
      reference_id: data.reference_id || data.request_id || data.match_id || null,
      request_id: data.request_id || null,
      match_id: data.match_id || null,
      match_name: resolvedCustomTitle,
      customGameTitle: resolvedCustomTitle,
      custom_game_title: resolvedCustomTitle,
      requested_by_coach: data.requested_by_coach || data.coach_name || undefined,
      match_context: resolvedCustomTitle,
      sport_discipline: data.sport_discipline || data.sport || undefined,
      status: data.status || 'pending',
      scoresheet_url: data.scoresheetUrl || data.scoresheet_url || null,
      is_read: Boolean(data.is_read),
      created_at: data.created_at || data.timestamp || new Date().toISOString(),
    });
  };

  snap1.forEach(processDoc);
  snap2.forEach(processDoc);
  snap3.forEach(processDoc);
  snapOfficialNotifs.forEach(processDoc);

  // Surface scoresheetRequests documents into notifications
  snapScoresheetRequests.forEach((doc: any) => {
    const data = doc.data();
    const reqId = data.id || data.requestId || doc.id;
    const notifKey = `req_${reqId}`;
    if (seenIds.has(notifKey) || seenIds.has(reqId) || seenIds.has(doc.id) || seenIds.has(`notif_${notifKey}`)) return;
    seenIds.add(notifKey);
    seenIds.add(reqId);

    const isFulfilled = data.status === 'fulfilled';
    const matchTitle = (
      data.customGameTitle ||
      data.custom_game_title ||
      data.matchName ||
      data.match_name ||
      data.gameName ||
      data.game_name ||
      'Match'
    );

    notifications.push({
      notification_id: notifKey,
      request_id: reqId,
      official_id: officialId,
      type: 'SCORESHEET_REQUEST',
      title: `Scoresheet Request: ${matchTitle}`,
      message: `${data.coachName || 'Coach'} requested the official scoresheet for ${matchTitle}.`,
      reference_id: data.matchId || null,
      match_id: data.matchId || null,
      match_name: matchTitle,
      customGameTitle: matchTitle,
      custom_game_title: matchTitle,
      requested_by_coach: data.coachName || 'Coach',
      coach_id: data.coachId || null,
      team_id: data.teamId || null,
      match_context: matchTitle,
      sport_discipline: data.sportType || 'BASKETBALL',
      scoresheet_url: data.scoresheetUrl || data.scoresheet_url || null,
      status: data.status || 'pending',
      is_read: Boolean(data.is_read_by_official || isFulfilled),
      created_at: data.createdAt || data.created_at || new Date().toISOString(),
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
