import { db } from '../utils/firebaseAdmin';
import { uploadScoresheetFileToStorage } from './matchService';
import crypto from 'crypto';

export interface ScoresheetRequestDoc {
  id: string;
  requestId?: string;
  coachId: string;
  coachName: string;
  teamId: string;
  matchId: string;
  matchName: string;
  customGameTitle?: string;
  custom_game_title?: string;
  gameName?: string;
  match_name?: string;
  game_name?: string;
  sportType?: string;
  status: 'pending' | 'fulfilled' | 'accepted' | 'rejected';
  createdAt: string;
  updatedAt: string;
  scoresheetUrl?: string;
  scoresheet_url?: string;
  fulfilledAt?: string;
  fulfilledByOfficialId?: string;
  fulfilledByOfficialName?: string;
  rejectedAt?: string;
  rejectedByOfficialId?: string;
  rejectedByOfficialName?: string;
  rejectionReason?: string;
  is_read_by_official?: boolean;
  is_read_by_coach?: boolean;
}

/**
 * Creates or updates a formal scoresheet request from a Coach.
 * Writes directly to the `scoresheetRequests` collection and notifies Tournament Officials.
 */
export async function createScoresheetRequestService(payload: {
  coachId: string;
  coachName?: string;
  teamId?: string;
  matchId: string;
  matchName?: string;
  sportType?: string;
}): Promise<ScoresheetRequestDoc> {
  const { matchId, coachId } = payload;
  if (!matchId) {
    throw new Error('matchId is required to request a scoresheet.');
  }

  // Resolve match name and details directly from Firestore match document (prioritizing official's custom title)
  let matchName = payload.matchName;
  let customGameTitle: string | undefined = (payload as any).customGameTitle || (payload as any).custom_game_title;
  let teamId = payload.teamId;
  let sportType = payload.sportType;
  let coachName = payload.coachName;

  const matchRef = db.collection('Match_Logs').doc(matchId);
  const matchDoc = await matchRef.get();
  if (matchDoc.exists) {
    const m = matchDoc.data()!;
    // Priority: Pull directly from customGameTitle, matchName, or gameName in the Firestore match document assigned by Tournament Official
    const officialAssignedTitle =
      (m.customGameTitle && String(m.customGameTitle).trim()) ||
      (m.custom_game_title && String(m.custom_game_title).trim()) ||
      (m.matchName && String(m.matchName).trim()) ||
      (m.match_name && String(m.match_name).trim()) ||
      (m.gameName && String(m.gameName).trim()) ||
      (m.game_name && String(m.game_name).trim()) ||
      null;

    if (officialAssignedTitle) {
      matchName = officialAssignedTitle;
      customGameTitle = officialAssignedTitle;
    } else if (!matchName) {
      matchName = `${m.home_team_name || 'Home Team'} vs. ${m.away_team_name || 'Away Team'}`;
    }
    if (!teamId) teamId = m.team_id || m.home_team_id || 'team_default';
    if (!sportType) sportType = m.sport_type || 'BASKETBALL';
  } else {
    if (!matchName) matchName = `Match ${matchId}`;
    if (!teamId) teamId = 'team_default';
    if (!sportType) sportType = 'BASKETBALL';
  }

  const resolvedMatchTitle = (customGameTitle || matchName || `Match ${matchId}`).trim();

  // Resolve coach name if missing
  if (!coachName) {
    const cleanCoachId = coachId.replace(/^coach_/, '');
    const userDoc = await db.collection('Users').doc(cleanCoachId).get();
    if (userDoc.exists) {
      const u = userDoc.data()!;
      coachName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || 'Coach';
    } else {
      coachName = 'Coach';
    }
  }

  const requestId = `req_${matchId}_${coachId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const now = new Date().toISOString();

  const requestDoc: ScoresheetRequestDoc = {
    id: requestId,
    requestId,
    coachId,
    coachName: coachName || 'Coach',
    teamId: teamId || 'team_default',
    matchId,
    matchName: resolvedMatchTitle,
    customGameTitle: resolvedMatchTitle,
    custom_game_title: resolvedMatchTitle,
    match_name: resolvedMatchTitle,
    gameName: resolvedMatchTitle,
    game_name: resolvedMatchTitle,
    sportType: sportType || 'BASKETBALL',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    is_read_by_official: false,
    is_read_by_coach: true,
  };

  const batch = db.batch();
  const requestRef = db.collection('scoresheetRequests').doc(requestId);
  batch.set(requestRef, requestDoc, { merge: true });

  // Update Match_Logs status
  if (matchDoc.exists) {
    batch.update(matchRef, {
      audit_status: 'PENDING REQUEST',
      verification_status: 'Pending',
      scoresheet_request_status: 'pending',
      updated_at: now,
    });
  } else {
    batch.set(matchRef, {
      match_id: matchId,
      team_id: teamId,
      matchName: resolvedMatchTitle,
      customGameTitle: resolvedMatchTitle,
      match_name: resolvedMatchTitle,
      gameName: resolvedMatchTitle,
      game_name: resolvedMatchTitle,
      home_team_name: resolvedMatchTitle.split(/\s+vs\.?\s+/i)[0]?.trim() || 'Home Team',
      away_team_name: resolvedMatchTitle.split(/\s+vs\.?\s+/i)[1]?.trim() || 'Away Team',
      sport_type: sportType,
      audit_status: 'PENDING REQUEST',
      verification_status: 'Pending',
      scoresheet_request_status: 'pending',
      logged_by_coach_id: coachId,
      created_at: now,
      updated_at: now,
    }, { merge: true });
  }

  // Trigger real-time notification on official web dashboard
  const notifId = `notif_req_${requestId}`;
  batch.set(db.collection('Official_Notifications').doc(notifId), {
    notification_id: notifId,
    title: `Scoresheet Request: ${resolvedMatchTitle}`,
    message: `${coachName} requested the official scoresheet for ${resolvedMatchTitle}.`,
    type: 'SCORESHEET_REQUEST',
    match_id: matchId,
    request_id: requestId,
    coach_id: coachId,
    requested_by_coach: coachName,
    match_context: resolvedMatchTitle,
    matchName: resolvedMatchTitle,
    customGameTitle: resolvedMatchTitle,
    custom_game_title: resolvedMatchTitle,
    match_name: resolvedMatchTitle,
    sport_discipline: sportType,
    is_read: false,
    created_at: now,
    timestamp: now,
  });

  await batch.commit();
  return requestDoc;
}

/**
 * Fetch all scoresheet requests, optionally filtered by status or coachId.
 */
export async function getScoresheetRequestsService(filters?: {
  status?: string;
  coachId?: string;
  matchId?: string;
}): Promise<ScoresheetRequestDoc[]> {
  let query: FirebaseFirestore.Query = db.collection('scoresheetRequests');

  if (filters?.status) {
    query = query.where('status', '==', filters.status);
  }
  if (filters?.coachId) {
    query = query.where('coachId', '==', filters.coachId);
  }
  if (filters?.matchId) {
    query = query.where('matchId', '==', filters.matchId);
  }

  const snap = await query.get();
  const list: ScoresheetRequestDoc[] = [];

  // Collect match IDs to enrich with custom titles directly from Firestore Match_Logs
  const matchIds = new Set<string>();
  snap.forEach((d) => {
    const data = d.data() as ScoresheetRequestDoc;
    if (data.matchId) matchIds.add(data.matchId);
  });

  const matchesMap = new Map<string, any>();
  if (matchIds.size > 0) {
    const matchDocs = await Promise.all(
      Array.from(matchIds).map((mid) => db.collection('Match_Logs').doc(mid).get().catch(() => null))
    );
    matchDocs.forEach((md) => {
      if (md && md.exists) {
        matchesMap.set(md.id, md.data());
      }
    });
  }

  snap.forEach((d) => {
    const data = d.data() as ScoresheetRequestDoc;
    const matchData = data.matchId ? matchesMap.get(data.matchId) : null;
    const officialCustomTitle =
      (matchData?.customGameTitle && String(matchData.customGameTitle).trim()) ||
      (matchData?.custom_game_title && String(matchData.custom_game_title).trim()) ||
      (matchData?.matchName && String(matchData.matchName).trim()) ||
      (matchData?.match_name && String(matchData.match_name).trim()) ||
      (matchData?.gameName && String(matchData.gameName).trim()) ||
      (matchData?.game_name && String(matchData.game_name).trim()) ||
      (data.customGameTitle && String(data.customGameTitle).trim()) ||
      (data.custom_game_title && String(data.custom_game_title).trim()) ||
      (data.matchName && String(data.matchName).trim()) ||
      (data.match_name && String(data.match_name).trim()) ||
      `Match ${data.matchId || d.id}`;

    list.push({
      ...data,
      id: d.id,
      requestId: d.id,
      matchName: officialCustomTitle,
      customGameTitle: officialCustomTitle,
      custom_game_title: officialCustomTitle,
      match_name: officialCustomTitle,
      gameName: officialCustomTitle,
      game_name: officialCustomTitle,
    });
  });

  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Fulfills an open scoresheet request by uploading the physical scoresheet file,
 * saving it to Firebase Storage (`scoresheets/{matchId}/{fileName}`), and notifying the Coach.
 */
export async function fulfillScoresheetRequestService(
  requestId: string,
  officialInfo: { officialId: string; officialName?: string },
  file?: Express.Multer.File,
  fallbackUrl?: string
): Promise<ScoresheetRequestDoc> {
  let reqRef = db.collection('scoresheetRequests').doc(requestId);
  let reqDoc = await reqRef.get();

  // If not found by doc id, search by matchId
  if (!reqDoc.exists) {
    const matchQuery = await db.collection('scoresheetRequests')
      .where('matchId', '==', requestId.replace(/^req_/, ''))
      .limit(1)
      .get();
    if (!matchQuery.empty) {
      reqRef = matchQuery.docs[0].ref;
      reqDoc = matchQuery.docs[0];
    }
  }

  if (!reqDoc.exists) {
    // If not found, create a placeholder request for this match so the fulfillment still succeeds
    const matchId = requestId.replace(/^req_/, '');
    const placeholder = await createScoresheetRequestService({
      coachId: 'coach_default',
      matchId,
    });
    reqRef = db.collection('scoresheetRequests').doc(placeholder.id);
    reqDoc = await reqRef.get();
  }

  const reqData = reqDoc.data() as ScoresheetRequestDoc;
  const matchId = reqData.matchId;

  // 1. Upload scoresheet file to Storage
  let scoresheetUrl = fallbackUrl || reqData.scoresheetUrl || '';
  if (file) {
    scoresheetUrl = await uploadScoresheetFileToStorage(matchId, file);
  }

  if (!scoresheetUrl) {
    throw new Error('A scoresheet file or download URL is required to fulfill this request.');
  }

  const now = new Date().toISOString();
  const officialName = officialInfo.officialName || 'Tournament Official';

  const updatedDoc: Partial<ScoresheetRequestDoc> = {
    status: 'fulfilled',
    scoresheetUrl,
    scoresheet_url: scoresheetUrl,
    fulfilledAt: now,
    fulfilledByOfficialId: officialInfo.officialId,
    fulfilledByOfficialName: officialName,
    is_read_by_official: true, // Auto-mark as read for the official
    updatedAt: now,
  };

  const batch = db.batch();

  // Update scoresheetRequests document
  batch.update(reqRef, updatedDoc);

  // Update Match_Logs document with the verified scoresheet URL and certified status
  const matchRef = db.collection('Match_Logs').doc(matchId);
  batch.set(matchRef, {
    scoresheet_url: scoresheetUrl,
    scoresheetUrl: scoresheetUrl,
    audit_status: 'REQUEST GRANTED',
    verification_status: 'Certify',
    is_certified: true,
    certified_at: now,
    certified_by_official_id: officialInfo.officialId,
    certified_by_official_name: officialName,
    updated_at: now,
  }, { merge: true });

  // Auto-mark official notification as read
  const notifId = `notif_req_${reqDoc.id}`;
  const notifRef = db.collection('Official_Notifications').doc(notifId);
  batch.set(notifRef, { is_read: true, status: 'fulfilled', updated_at: now }, { merge: true });

  // Push real-time notification to the coach's mobile notification center
  const coachNotifId = `coach_notif_${crypto.randomUUID()}`;
  const coachId = reqData.coachId;
  const matchSnap = await matchRef.get();
  const mLogData = matchSnap.exists ? matchSnap.data() : null;
  const matchName =
    (mLogData?.customGameTitle && String(mLogData.customGameTitle).trim()) ||
    (mLogData?.custom_game_title && String(mLogData.custom_game_title).trim()) ||
    (mLogData?.matchName && String(mLogData.matchName).trim()) ||
    (mLogData?.match_name && String(mLogData.match_name).trim()) ||
    reqData.customGameTitle ||
    reqData.matchName ||
    `Match ${matchId}`;

  batch.set(db.collection('Notifications').doc(coachNotifId), {
    notification_id: coachNotifId,
    user_id: coachId,
    recipient_id: coachId,
    type: 'SCORESHEET_SHARED',
    title: `Scoresheet Available: ${matchName}`,
    message: `${officialName} has uploaded and shared the verified scoresheet for ${matchName}. Tap to view or download.`,
    match_id: matchId,
    matchId,
    match_name: matchName,
    request_id: reqDoc.id,
    requestId: reqDoc.id,
    scoresheet_url: scoresheetUrl,
    scoresheetUrl,
    action_label: 'View / Download Scoresheet',
    is_read: false,
    status: 'UNREAD',
    created_at: now,
    timestamp: now,
  });

  await batch.commit();

  return {
    ...reqData,
    ...updatedDoc,
    status: 'fulfilled',
    scoresheetUrl,
  } as ScoresheetRequestDoc;
}

/**
 * Rejects an open scoresheet request and notifies the Coach.
 */
export async function rejectScoresheetRequestService(
  requestId: string,
  officialInfo: { officialId: string; officialName?: string },
  reason?: string
): Promise<ScoresheetRequestDoc> {
  let reqRef = db.collection('scoresheetRequests').doc(requestId);
  let reqDoc = await reqRef.get();

  if (!reqDoc.exists) {
    const matchQuery = await db.collection('scoresheetRequests')
      .where('matchId', '==', requestId.replace(/^req_/, ''))
      .limit(1)
      .get();
    if (!matchQuery.empty) {
      reqRef = matchQuery.docs[0].ref;
      reqDoc = matchQuery.docs[0];
    }
  }

  if (!reqDoc.exists) {
    throw new Error('Scoresheet request not found.');
  }

  const reqData = reqDoc.data() as ScoresheetRequestDoc;
  const matchId = reqData.matchId;
  const now = new Date().toISOString();
  const officialName = officialInfo.officialName || 'Tournament Official';
  const rejectReason = reason || 'Scoresheet request could not be fulfilled at this time.';

  const updatedDoc: Partial<ScoresheetRequestDoc> = {
    status: 'rejected',
    rejectedAt: now,
    rejectedByOfficialId: officialInfo.officialId,
    rejectedByOfficialName: officialName,
    rejectionReason: rejectReason,
    is_read_by_official: true,
    updatedAt: now,
  };

  const batch = db.batch();
  batch.update(reqRef, updatedDoc);

  // Update Match_Logs
  const matchRef = db.collection('Match_Logs').doc(matchId);
  batch.set(matchRef, {
    scoresheet_request_status: 'rejected',
    audit_status: 'REJECTED',
    verification_status: 'Rejected',
    updated_at: now,
  }, { merge: true });

  // Auto-mark official notification as read
  const notifId = `notif_req_${reqDoc.id}`;
  batch.set(db.collection('Official_Notifications').doc(notifId), {
    is_read: true,
    status: 'rejected',
    updated_at: now,
  }, { merge: true });

  // Push notification to Coach
  const coachNotifId = `coach_notif_${crypto.randomUUID()}`;
  const coachId = reqData.coachId;
  const mLogSnap = await matchRef.get();
  const mLogData = mLogSnap.exists ? mLogSnap.data() : null;
  const matchName =
    (mLogData?.customGameTitle && String(mLogData.customGameTitle).trim()) ||
    (mLogData?.custom_game_title && String(mLogData.custom_game_title).trim()) ||
    (mLogData?.matchName && String(mLogData.matchName).trim()) ||
    (mLogData?.match_name && String(mLogData.match_name).trim()) ||
    reqData.customGameTitle ||
    reqData.matchName ||
    `Match ${matchId}`;

  batch.set(db.collection('Notifications').doc(coachNotifId), {
    notification_id: coachNotifId,
    user_id: coachId,
    recipient_id: coachId,
    type: 'SCORESHEET_REJECTED',
    title: `Scoresheet Request Declined: ${matchName}`,
    message: `${officialName} has declined the scoresheet request for ${matchName}. Reason: ${rejectReason}`,
    match_id: matchId,
    matchId,
    match_name: matchName,
    request_id: reqDoc.id,
    requestId: reqDoc.id,
    is_read: false,
    status: 'UNREAD',
    created_at: now,
    timestamp: now,
  });

  await batch.commit();

  return {
    ...reqData,
    ...updatedDoc,
    status: 'rejected',
  } as ScoresheetRequestDoc;
}
