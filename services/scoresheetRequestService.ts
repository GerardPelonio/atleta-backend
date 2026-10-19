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

  // Resolve match name and details from Match_Logs if not provided
  let matchName = payload.matchName;
  let teamId = payload.teamId;
  let sportType = payload.sportType;
  let coachName = payload.coachName;

  const matchRef = db.collection('Match_Logs').doc(matchId);
  const matchDoc = await matchRef.get();
  if (matchDoc.exists) {
    const m = matchDoc.data()!;
    if (!matchName) {
      matchName = m.matchName || m.match_name || m.game_name || `${m.home_team_name || 'Home'} vs ${m.away_team_name || 'Away'}`;
    }
    if (!teamId) teamId = m.team_id || m.home_team_id || 'team_default';
    if (!sportType) sportType = m.sport_type || 'BASKETBALL';
  } else {
    if (!matchName) matchName = `Match ${matchId}`;
    if (!teamId) teamId = 'team_default';
    if (!sportType) sportType = 'BASKETBALL';
  }

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
    matchName: matchName || `Match ${matchId}`,
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
    const safeMatchName = matchName || `Match ${matchId}`;
    batch.set(matchRef, {
      match_id: matchId,
      team_id: teamId,
      matchName: safeMatchName,
      game_name: safeMatchName,
      home_team_name: safeMatchName.split(/\s+vs\.?\s+/i)[0]?.trim() || 'Home Team',
      away_team_name: safeMatchName.split(/\s+vs\.?\s+/i)[1]?.trim() || 'Away Team',
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
    title: `Scoresheet Request: ${matchName}`,
    message: `${coachName} requested the official scoresheet for ${matchName}.`,
    type: 'SCORESHEET_REQUEST',
    match_id: matchId,
    request_id: requestId,
    coach_id: coachId,
    requested_by_coach: coachName,
    match_context: matchName,
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
  snap.forEach((d) => {
    const data = d.data() as ScoresheetRequestDoc;
    list.push({ ...data, id: d.id, requestId: d.id });
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
  const matchName = reqData.matchName || `Match ${matchId}`;

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
  const matchName = reqData.matchName || `Match ${matchId}`;

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
