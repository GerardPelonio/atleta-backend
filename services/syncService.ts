import crypto from 'crypto';
import { db } from '../utils/firebaseAdmin';
import {
  OfflineSyncBatchRequest,
  OfflineSyncBatchResponse,
  SyncTransactionResult,
  CoachOfflineSnapshot,
  AthleteOfflineSnapshot,
  OfflineTransaction,
} from '../models/syncModel';
import { logSrpeEntry } from './workloadService';
import {
  getAthleteExpandedCareerStats,
  getAthleteDateGroupedMatches,
  getAthleteHomeSummary,
  updateAthleteProfile,
} from './athleteService';
import { getPublicCoachProfile, submitRecruitmentInquiry, respondToRecruitmentInquiry } from './coachInquiryService';
import { getAllSportsService } from './sportService';
import { getCoachManagedAthletes } from './teamService';
import { eventBus, EVENTS } from '../utils/eventBus';

export class ServiceError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, ServiceError.prototype);
  }
}

/**
 * Recursively remove undefined fields for Firestore document compatibility.
 */
function cleanUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cleanUndefined) as any;
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = cleanUndefined(value);
    }
  }
  return result as T;
}

/**
 * Generate deterministic ETag from payload object.
 */
function generateETag(payload: unknown): string {
  const str = JSON.stringify(payload);
  const hash = crypto.createHash('md5').update(str).digest('hex');
  return `W/"${hash}"`;
}

/**
 * Process a batch of queued offline transactions from a Coach.
 * Guarantees Idempotency: Duplicate transaction_ids return previously recorded results.
 */
export async function processCoachOfflineBatchService(
  coachId: string,
  batch: OfflineSyncBatchRequest,
): Promise<OfflineSyncBatchResponse> {
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const results: SyncTransactionResult[] = [];
  let successCount = 0;
  let failCount = 0;
  let replayCount = 0;

  // Sort transactions in chronological client order
  const sortedTransactions = [...batch.transactions].sort(
    (a, b) => new Date(a.client_timestamp).getTime() - new Date(b.client_timestamp).getTime()
  );

  for (const tx of sortedTransactions) {
    const txDocRef = db.collection('Offline_Sync_Audit').doc(`tx_${tx.transaction_id}`);
    const existingAudit = await txDocRef.get();

    // Idempotency Check: if previously synced, replay cached result
    if (existingAudit.exists) {
      const auditData = existingAudit.data()!;
      results.push({
        transaction_id: tx.transaction_id,
        action_type: tx.action_type,
        status: 'REPLAYED',
        synced_at: auditData.synced_at || new Date().toISOString(),
        result: auditData.server_result || null,
        error: null,
      });
      replayCount++;
      continue;
    }

    const now = new Date().toISOString();

    try {
      let serverResult: any = null;

      switch (tx.action_type) {
        case 'CREATE_MATCH': {
          const p = tx.payload;
          const matchId = p.match_id || `match_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const sportType = p.sport_type || p.sport_category || 'Basketball';
          const rosterAthletes = p.roster_athletes || (p.player_stats ? p.player_stats.map((ps: any) => ps.athlete_id) : []);

          const matchLog = {
            match_id: matchId,
            team_id: p.team_id || 'team_default',
            sport_type: sportType,
            event_name: p.event_name || 'Sideline Game',
            match_type: p.match_type || 'Unofficial',
            match_date: p.match_date || tx.client_timestamp,
            location: p.location || 'Local Court',
            opponent_team_name: p.opponent_team_name || 'Opponent',
            game_result: p.game_result || 'WIN',
            score: p.score || '0 - 0',
            roster_athletes: rosterAthletes,
            logged_by_coach_id: coachId,
            is_official: false,
            notes: p.notes || null,
            created_at: now,
            synced_offline: true,
          };
          await db.collection('Match_Logs').doc(matchId).set(matchLog, { merge: true });

          // If player_stats array is present (identical to online POST /api/v1/matches payload)
          if (p.player_stats && Array.isArray(p.player_stats)) {
            for (const item of p.player_stats) {
              const athleteId = item.athlete_id;
              const rawStats = item.stats || item.sport_stats || {};
              const metricId = `metric_${matchId}_${athleteId}`;

              let efficiency = 20.0;
              if (sportType === 'Basketball') {
                const pts = Number(rawStats.points || 0);
                const reb = Number((rawStats.offensive_rebounds || 0) + (rawStats.defensive_rebounds || 0) || rawStats.rebounds || 0);
                const ast = Number(rawStats.assists || 0);
                const stl = Number(rawStats.steals || 0);
                const blk = Number(rawStats.blocks || 0);
                const to = Number(rawStats.turnovers || 0);
                const pf = Number(rawStats.fouls || rawStats.personal_fouls || 0);
                const fga = Number(rawStats.fg_attempted || 0);
                const fgm = Number(rawStats.fg_made || 0);
                const fta = Number(rawStats.ft_attempted || 0);
                const ftm = Number(rawStats.ft_made || 0);

                efficiency = parseFloat(
                  ((pts + reb + ast + stl + blk) - ((fga - fgm) + (fta - ftm) + to + pf)).toFixed(1)
                );
              }

              const metricData = {
                metric_id: metricId,
                athlete_id: athleteId,
                match_id: matchId,
                sport_category: sportType,
                sport_stats: rawStats,
                calculated_player_efficiency: isNaN(efficiency) ? 20.0 : efficiency,
                timestamp: p.match_date || tx.client_timestamp,
                logged_by_coach_id: coachId,
                synced_offline: true,
              };

              await db.collection('Performance_Metrics').doc(metricId).set(metricData, { merge: true });
            }
          }

          serverResult = { status: 'CREATED', ...matchLog };
          break;
        }

        case 'LOG_METRIC': {
          const p = tx.payload;
          const metricId = p.metric_id || `metric_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const athleteId = p.athlete_id;
          const sportStats = p.sport_stats || {};

          // Calculate Player Efficiency locally on backend
          let efficiency = 20.0;
          if (p.sport_category === 'Basketball' || p.sport_type === 'Basketball') {
            const pts = Number(sportStats.points || 0);
            const reb = Number(sportStats.rebounds || sportStats.total_rebounds || 0);
            const ast = Number(sportStats.assists || 0);
            const stl = Number(sportStats.steals || 0);
            const blk = Number(sportStats.blocks || 0);
            const to = Number(sportStats.turnovers || 0);
            const pf = Number(sportStats.fouls || sportStats.personal_fouls || 0);
            const fga = Number(sportStats.fg_attempted || 0);
            const fgm = Number(sportStats.fg_made || 0);
            const fta = Number(sportStats.ft_attempted || 0);
            const ftm = Number(sportStats.ft_made || 0);

            // Linear Game Efficiency: (PTS + REB + AST + STL + BLK) - [(FGA - FGM) + (FTA - FTM) + TO + PF]
            efficiency = parseFloat(
              ((pts + reb + ast + stl + blk) - ((fga - fgm) + (fta - ftm) + to + pf)).toFixed(1)
            );
          }

          const metricData = {
            metric_id: metricId,
            athlete_id: athleteId,
            match_id: p.match_id || 'match_offline',
            sport_category: p.sport_category || p.sport_type || 'Basketball',
            sport_stats: sportStats,
            calculated_player_efficiency: isNaN(efficiency) ? 20.0 : efficiency,
            timestamp: p.timestamp || tx.client_timestamp,
            logged_by_coach_id: coachId,
            synced_offline: true,
          };

          await db.collection('Performance_Metrics').doc(metricId).set(metricData, { merge: true });
          serverResult = metricData;
          break;
        }

        case 'LOG_SRPE': {
          const p = tx.payload;
          const entry = await logSrpeEntry({
            athlete_id: p.athlete_id,
            session_duration_mins: Number(p.session_duration_mins),
            srpe_score: Number(p.srpe_score),
            entry_date: p.entry_date || tx.client_timestamp.split('T')[0],
            logged_by_coach_id: coachId,
            notes: p.notes || 'Offline synced session',
            session_type: p.session_type || 'Practice',
          });
          serverResult = entry;
          break;
        }

        case 'UPDATE_ROSTER': {
          const p = tx.payload;
          const teamId = p.team_id;
          if (teamId) {
            await db.collection('Teams').doc(teamId).set(
              {
                roster_athletes: p.roster_athletes || [],
                updated_at: now,
              },
              { merge: true }
            );
          }
          serverResult = { team_id: teamId, updated_roster: p.roster_athletes || [] };
          break;
        }

        case 'SEND_PROPOSAL': {
          const p = tx.payload;
          const scoutId = `scout_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const proposal = {
            scout_id: scoutId,
            athlete_id: p.athlete_id,
            coach_scout_id: coachId,
            initiated_by: coachId,
            offer_message: p.offer_message || 'Coach recruitment invitation',
            offer_status: 'Sent',
            date_initiated: tx.client_timestamp || now,
            updated_at: now,
            synced_offline: true,
          };
          await db.collection('Scouting_Registry').doc(scoutId).set(proposal, { merge: true });
          serverResult = proposal;
          break;
        }

        case 'REQUEST_AUDIT': {
          const p = tx.payload;
          const validationId = `val_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const auditReq = {
            validation_id: validationId,
            match_id: p.match_id,
            requested_by_coach_id: coachId,
            verification_status: 'Pending',
            created_at: now,
            synced_offline: true,
          };
          await db.collection('Official_Validations').doc(validationId).set(auditReq, { merge: true });
          serverResult = auditReq;
          break;
        }

        default:
          throw new ServiceError(`Unsupported action_type '${tx.action_type}' for coach.`);
      }

      // Record successful transaction in Offline_Sync_Audit
      await txDocRef.set({
        transaction_id: tx.transaction_id,
        user_id: coachId,
        user_role: 'Coach',
        action_type: tx.action_type,
        payload: cleanUndefined(tx.payload),
        client_timestamp: tx.client_timestamp,
        status: 'SYNCED',
        synced_at: now,
        server_result: cleanUndefined(serverResult),
        error_message: null,
      });

      results.push({
        transaction_id: tx.transaction_id,
        action_type: tx.action_type,
        status: 'SYNCED',
        synced_at: now,
        result: serverResult,
        error: null,
      });
      successCount++;
    } catch (err: any) {
      failCount++;
      const errorMessage = err?.message || String(err);

      // Record failed transaction in Offline_Sync_Audit
      await txDocRef.set({
        transaction_id: tx.transaction_id,
        user_id: coachId,
        user_role: 'Coach',
        action_type: tx.action_type,
        payload: tx.payload,
        client_timestamp: tx.client_timestamp,
        status: 'FAILED',
        synced_at: now,
        server_result: null,
        error_message: errorMessage,
      });

      results.push({
        transaction_id: tx.transaction_id,
        action_type: tx.action_type,
        status: 'FAILED',
        synced_at: now,
        result: null,
        error: errorMessage,
      });
    }
  }

  return {
    batch_id: batchId,
    user_id: coachId,
    total_processed: sortedTransactions.length,
    successful_count: successCount,
    failed_count: failCount,
    replayed_count: replayCount,
    results,
    last_server_timestamp: new Date().toISOString(),
  };
}

/**
 * Process a batch of queued offline transactions from an Athlete.
 */
export async function processAthleteOfflineBatchService(
  athleteId: string,
  batch: OfflineSyncBatchRequest,
): Promise<OfflineSyncBatchResponse> {
  const batchId = `batch_ath_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const results: SyncTransactionResult[] = [];
  let successCount = 0;
  let failCount = 0;
  let replayCount = 0;

  const sortedTransactions = [...batch.transactions].sort(
    (a, b) => new Date(a.client_timestamp).getTime() - new Date(b.client_timestamp).getTime()
  );

  for (const tx of sortedTransactions) {
    const txDocRef = db.collection('Offline_Sync_Audit').doc(`tx_${tx.transaction_id}`);
    const existingAudit = await txDocRef.get();

    if (existingAudit.exists) {
      const auditData = existingAudit.data()!;
      results.push({
        transaction_id: tx.transaction_id,
        action_type: tx.action_type,
        status: 'REPLAYED',
        synced_at: auditData.synced_at || new Date().toISOString(),
        result: auditData.server_result || null,
        error: null,
      });
      replayCount++;
      continue;
    }

    const now = new Date().toISOString();

    try {
      let serverResult: any = null;

      switch (tx.action_type) {
        case 'UPDATE_PROFILE': {
          const p = tx.payload;
          const updatedProfile = await updateAthleteProfile(athleteId, p);
          serverResult = updatedProfile;
          break;
        }

        case 'LOG_WORKOUT': {
          const p = tx.payload;
          const entry = await logSrpeEntry({
            athlete_id: athleteId,
            session_duration_mins: Number(p.session_duration_mins),
            srpe_score: Number(p.srpe_score),
            entry_date: p.entry_date || tx.client_timestamp.split('T')[0],
            notes: p.notes || 'Self-logged offline workout',
            session_type: p.session_type || 'Conditioning',
          });
          serverResult = entry;
          break;
        }

        case 'SEND_INQUIRY': {
          const p = tx.payload;
          const inq = await submitRecruitmentInquiry(athleteId, p.coach_id, p.message);
          serverResult = inq;
          break;
        }

        case 'RESPOND_OFFER': {
          const p = tx.payload;
          const inq = await respondToRecruitmentInquiry(p.inquiry_id, athleteId, p.status, p.decline_reason);
          serverResult = inq;
          break;
        }

        default:
          throw new ServiceError(`Unsupported action_type '${tx.action_type}' for athlete.`);
      }

      await txDocRef.set({
        transaction_id: tx.transaction_id,
        user_id: athleteId,
        user_role: 'Athlete',
        action_type: tx.action_type,
        payload: cleanUndefined(tx.payload),
        client_timestamp: tx.client_timestamp,
        status: 'SYNCED',
        synced_at: now,
        server_result: cleanUndefined(serverResult),
        error_message: null,
      });

      results.push({
        transaction_id: tx.transaction_id,
        action_type: tx.action_type,
        status: 'SYNCED',
        synced_at: now,
        result: serverResult,
        error: null,
      });
      successCount++;
    } catch (err: any) {
      failCount++;
      const errorMessage = err?.message || String(err);

      await txDocRef.set({
        transaction_id: tx.transaction_id,
        user_id: athleteId,
        user_role: 'Athlete',
        action_type: tx.action_type,
        payload: tx.payload,
        client_timestamp: tx.client_timestamp,
        status: 'FAILED',
        synced_at: now,
        server_result: null,
        error_message: errorMessage,
      });

      results.push({
        transaction_id: tx.transaction_id,
        action_type: tx.action_type,
        status: 'FAILED',
        synced_at: now,
        result: null,
        error: errorMessage,
      });
    }
  }

  return {
    batch_id: batchId,
    user_id: athleteId,
    total_processed: sortedTransactions.length,
    successful_count: successCount,
    failed_count: failCount,
    replayed_count: replayCount,
    results,
    last_server_timestamp: new Date().toISOString(),
  };
}

/**
 * Pre-fetch complete offline snapshot package for Coach.
 */
export async function getCoachOfflineSnapshotService(coachId: string): Promise<CoachOfflineSnapshot> {
  const profile = (await getPublicCoachProfile(coachId)) || {
    coach_id: coachId,
    full_name: 'Coach',
    current_institution: 'Collegiate Program',
  };

  // Fetch teams managed by coach
  const teamsSnap = await db.collection('Teams').where('coach_id', '==', coachId).get();
  const teams: any[] = [];
  const rosters: Record<string, any[]> = {};

  for (const doc of teamsSnap.docs) {
    const t = doc.data();
    teams.push(t);
    const rosterIds: string[] = t.roster_list || t.roster_athletes || [];
    if (rosterIds.length > 0) {
      const athleteDocs = await db.collection('Athlete_Profiles').where('athlete_id', 'in', rosterIds.slice(0, 10)).get().catch(() => null);
      rosters[t.team_id] = athleteDocs ? athleteDocs.docs.map(d => d.data()) : [];
    } else {
      rosters[t.team_id] = [];
    }
  }

  // Fetch dynamic sports configurations
  const sports = await getAllSportsService().catch(() => []);

  // Fetch upcoming / recent matches
  const matchMap = new Map<string, any>();
  const matchSnap = await db.collection('Match_Logs').where('logged_by_coach_id', '==', coachId).get().catch(() => null);
  if (matchSnap) {
    matchSnap.docs.forEach(d => matchMap.set(d.id, d.data()));
  }
  const allMatchesSnap = await db.collection('Match_Logs').limit(30).get().catch(() => null);
  if (allMatchesSnap) {
    allMatchesSnap.docs.forEach(d => matchMap.set(d.id, d.data()));
  }
  const scheduledMatches = Array.from(matchMap.values());

  // Fetch recent sRPE workload logs
  const wlSnap = await db.collection('Workload_Analysis').where('logged_by_coach_id', '==', coachId).limit(30).get().catch(() => null);
  const recentWorkload = wlSnap ? wlSnap.docs.map(d => d.data()) : [];

  // Fetch all handled athletes (both on teams and unassigned)
  const handledAthletes = await getCoachManagedAthletes(coachId).catch(() => []);

  const snapshotData = {
    coach_profile: profile,
    teams,
    rosters,
    handled_athletes: handledAthletes,
    sports_configurations: sports,
    scheduled_matches: scheduledMatches,
    recent_workload_logs: recentWorkload,
  };

  const etag = generateETag(snapshotData);
  const cacheVersion = `v_${Date.now()}_${etag.replace(/[^\w]/g, '').substring(0, 8)}`;

  return {
    snapshot_timestamp: new Date().toISOString(),
    cache_version: cacheVersion,
    etag,
    ...snapshotData,
  };
}

/**
 * Pre-fetch complete offline snapshot package for Athlete.
 */
export async function getAthleteOfflineSnapshotService(athleteId: string): Promise<AthleteOfflineSnapshot> {
  const athleteDoc = await db.collection('Athlete_Profiles').doc(athleteId).get();
  const profileData = athleteDoc.exists ? athleteDoc.data() : { athlete_id: athleteId, full_name: 'Athlete' };

  const [careerStats, groupedMatches, homeSummary, sports] = await Promise.all([
    getAthleteExpandedCareerStats(athleteId).catch(() => null),
    getAthleteDateGroupedMatches(athleteId).catch(() => null),
    getAthleteHomeSummary(athleteId).catch(() => null),
    getAllSportsService().catch(() => []),
  ]);

  const snapshotData = {
    athlete_profile: profileData,
    career_stats: careerStats,
    grouped_matches: groupedMatches,
    workload_summary: homeSummary?.workload_summary || null,
    team_summary: homeSummary?.current_team_summary || null,
    registered_sports: sports,
  };

  const etag = generateETag(snapshotData);
  const cacheVersion = `v_${Date.now()}_${etag.replace(/[^\w]/g, '').substring(0, 8)}`;

  return {
    snapshot_timestamp: new Date().toISOString(),
    cache_version: cacheVersion,
    etag,
    ...snapshotData,
  };
}

/**
 * Retrieve sync audit status and history for user.
 */
export async function getOfflineSyncStatusService(userId: string): Promise<any> {
  const snap = await db
    .collection('Offline_Sync_Audit')
    .where('user_id', '==', userId)
    .limit(20)
    .get();

  const history = snap.docs.map((d) => d.data());
  return {
    user_id: userId,
    total_audited_transactions: history.length,
    recent_transactions: history.sort(
      (a: any, b: any) => new Date(b.synced_at).getTime() - new Date(a.synced_at).getTime()
    ),
  };
}
