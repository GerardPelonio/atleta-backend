import crypto from 'crypto';
import { db } from '../utils/firebaseAdmin';
import { MatchLog, OfficialAudit, SportType } from '../models/matchModel';
import { ServiceError } from '../validators/matchValidator';
import { generateStandardId } from '../utils/idGenerator';

export interface CreateOfficialMatchDto {
  match_id?: string;
  reference_id?: string;
  team_id?: string;
  home_team_id?: string;
  away_team_id?: string;
  home_team_name?: string;
  away_team_name?: string;
  opponent_team_name?: string;
  game_name?: string;
  sport_type: SportType;
  match_type?: string;
  match_date: string;
  location: string;
  assigned_coaches?: string[];
  notes?: string;
  scoresheet_url?: string;
  official_id?: string;
  home_score?: number;
  away_score?: number;
  game_result?: 'WIN' | 'LOSS' | 'TBD';
  player_stats?: any[];
  scoresheet_data?: any;
  parsed_tables?: any;
}

export interface CertifyValidationDto {
  context_notes?: string;
  scoresheet_url?: string;
}

/**
 * Creates an official match record with physical scoresheet reference and idempotency protection.
 */
export async function createOfficialMatchService(
  uid: string,
  data: CreateOfficialMatchDto,
  idempotencyKey: string,
) {
  // 1. Idempotency Check
  const idempRef = db.collection('Idempotency_Keys').doc(idempotencyKey);
  const idempDoc = await idempRef.get();
  if (idempDoc.exists) {
    return idempDoc.data()?.response;
  }

  // 2. Fetch official profile to get official_id
  let officialId = data.official_id;
  if (!officialId) {
    const rawUid = uid.replace(/^off_/, '');
    const canonicalOffId = `off_${rawUid}`;
    let profileDoc = await db.collection('Official_Profiles').doc(canonicalOffId).get();
    if (!profileDoc.exists) {
      profileDoc = await db.collection('Official_Profiles').doc(rawUid).get();
    }
    if (profileDoc.exists) {
      officialId = profileDoc.data()?.official_id || canonicalOffId;
    } else {
      officialId = canonicalOffId;
    }
  }

  const explicitId = data.match_id
    ? String(data.match_id).replace(/^#/, '').trim().toUpperCase()
    : (data.game_name && /^MATCH-\d+$/i.test(data.game_name.trim()) ? data.game_name.trim().toUpperCase() : null);

  const matchId = explicitId || (await generateStandardId('MATCH'));
  const validationId = await generateStandardId('VAL');
  const now = new Date().toISOString();

  const teamId = data.team_id || data.home_team_id || data.home_team_name || '';
  const homeName = data.home_team_name || data.home_team_id || data.team_id || '';
  const awayName = data.away_team_name || data.opponent_team_name || data.away_team_id || '';

  // 3. Construct Match Log — include display-friendly team names so coaches can see the match
  const matchLog: MatchLog = {
    match_id: matchId,
    team_id: teamId,
    home_team_name: homeName,
    away_team_name: awayName,
    sport_type: data.sport_type,
    match_type: data.match_type || 'Official Match',
    match_date: data.match_date,
    location: data.location,
    opponent_team_name: awayName,
    game_name: data.game_name || `${homeName} vs ${awayName}`,
    game_result: data.game_result || 'TBD',
    notes: data.notes || '',
    scoresheet_url: data.scoresheet_url || '',
    idempotency_key: idempotencyKey,
    reference_id: data.reference_id || crypto.randomUUID(),
    home_team_id: data.home_team_id || teamId,
    away_team_id: data.away_team_id || awayName,
    assigned_coaches: data.assigned_coaches || [],
    player_stats: data.player_stats || [],
    is_official: true,
    official_id: officialId || uid,
    is_certified: false,
    is_locked: false,
    timestamp: now,
  };

  if (data.home_score !== undefined) (matchLog as any).home_score = Number(data.home_score);
  if (data.away_score !== undefined) (matchLog as any).away_score = Number(data.away_score);
  if (data.scoresheet_data) (matchLog as any).scoresheet_data = data.scoresheet_data;
  if (data.parsed_tables) (matchLog as any).parsed_tables = data.parsed_tables;

  // 4. Construct Official Audit (Validation) Entity
  const auditDoc: OfficialAudit = {
    validation_id: validationId,
    match_id: matchId,
    official_id: officialId || uid,
    status: 'Pending',
    scoresheet_url: data.scoresheet_url || '',
    context_notes: data.notes || '',
    requested_by: uid,
    created_at: now,
  };

  // 5. Save atomically
  const batch = db.batch();
  batch.set(db.collection('Match_Logs').doc(matchId), matchLog, { merge: true });
  batch.set(db.collection('Official_Audits').doc(validationId), auditDoc, { merge: true });

  // If match already had an audit, update its scoresheet_url too
  try {
    const existingAudits = await db.collection('Official_Audits').where('match_id', '==', matchId).get();
    if (!existingAudits.empty) {
      for (const aDoc of existingAudits.docs) {
        batch.set(aDoc.ref, { scoresheet_url: data.scoresheet_url || '', updated_at: now }, { merge: true });
      }
    }
  } catch (_) {}

  // Write Performance_Metrics for provided players
  if (Array.isArray(data.player_stats) && data.player_stats.length > 0) {
    const halfCount = Math.ceil(data.player_stats.length / 2);
    for (let idx = 0; idx < data.player_stats.length; idx++) {
      const p = data.player_stats[idx];
      const pName = p.player_name || `Player ${idx + 1}`;
      const isHome = p.is_home !== undefined ? Boolean(p.is_home) : (p.team_side === 'home' ? true : p.team_side === 'away' ? false : (idx < halfCount));
      const pTeam = isHome ? (homeName || p.team_name || p.team || 'HOME TEAM') : (awayName || p.team_name || p.team || 'AWAY TEAM');
      const athleteId = p.athlete_id || `ath_ocr_${matchId}_${idx + 1}`;
      const pJersey = p.jersey_number !== undefined ? Number(p.jersey_number) : (idx + 1);
      const rawStats = p.stats || p.sport_stats || {
        points: Number(p.points ?? p.pts ?? 0),
        rebounds: Number(((p.offensive_rebounds || 0) + (p.defensive_rebounds || 0)) || (p.rebounds ?? p.reb ?? 0)),
        assists: Number(p.assists ?? p.ast ?? 0),
        steals: Number(p.steals ?? p.stl ?? 0),
        blocks: Number(p.blocks ?? p.blk ?? 0),
        turnovers: Number(p.turnovers ?? p.to ?? 0),
        fouls: Number(p.fouls ?? p.pf ?? 0),
        fg_made: Number(p.fg_made ?? p.fgm ?? 0),
        fg_attempted: Number(p.fg_attempted ?? p.fga ?? 0),
        ft_made: Number(p.ft_made ?? p.ftm ?? 0),
        ft_attempted: Number(p.ft_attempted ?? p.fta ?? 0),
      };

      const metricId = `metric_${matchId}_${athleteId}`;
      batch.set(db.collection('Performance_Metrics').doc(metricId), {
        metric_id: metricId,
        athlete_id: athleteId,
        match_id: matchId,
        player_name: pName,
        team_name: pTeam,
        jersey_number: pJersey,
        position: p.position || 'G',
        sport_category: data.sport_type || 'Basketball',
        sport_stats: rawStats,
        calculated_player_efficiency: p.calculated_efficiency || p.calculated_player_efficiency || 0,
        is_home: isHome,
        team_side: isHome ? 'home' : 'away',
        timestamp: now,
      }, { merge: true });
    }
  }

  await batch.commit();

  const response = {
    message: 'Official match instance created successfully.',
    match: matchLog,
    validation: auditDoc,
  };

  // Cache response for idempotency replay
  await idempRef.set({
    key: idempotencyKey,
    response,
    created_at: now,
  });

  return response;
}

/**
 * Retrieves all pending match verification / audit requests.
 */
export async function getPendingValidationsService() {
  const snapshot = await db
    .collection('Official_Audits')
    .where('status', '==', 'Pending')
    .get();

  const validations: (OfficialAudit & { match_details?: MatchLog })[] = [];

  for (const doc of snapshot.docs) {
    const auditData = doc.data() as OfficialAudit;
    let matchDetails: MatchLog | undefined = undefined;

    if (auditData.match_id) {
      const matchDoc = await db.collection('Match_Logs').doc(auditData.match_id).get();
      if (matchDoc.exists) {
        matchDetails = matchDoc.data() as MatchLog;
      }
    }

    validations.push({
      ...auditData,
      match_details: matchDetails,
    });
  }

  // Sort by created_at descending
  validations.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return validations;
}

/**
 * Certifies a pending validation and locks target match record to read-only status.
 * ACCEPTANCE CRITERIA: Re-auditing an already-certified match returns HTTP 409 Conflict.
 */
export async function certifyValidationService(
  validationId: string,
  officialUid: string,
  dto: CertifyValidationDto,
) {
  // 1. Fetch Official Audit document
  const validationRef = db.collection('Official_Audits').doc(validationId);
  const validationDoc = await validationRef.get();

  if (!validationDoc.exists) {
    throw new ServiceError(`Validation request '${validationId}' not found.`, 404);
  }

  const auditData = validationDoc.data() as OfficialAudit;
  const matchId = auditData.match_id;

  // 2. Fetch Match_Logs document
  const matchRef = db.collection('Match_Logs').doc(matchId);
  const matchDoc = await matchRef.get();

  if (!matchDoc.exists) {
    throw new ServiceError(`Target match record '${matchId}' not found.`, 404);
  }

  const matchData = matchDoc.data() as MatchLog;

  // 3. ACCEPTANCE CRITERIA: Re-auditing an already-certified match returns HTTP 409 Conflict
  if (matchData.is_certified === true || matchData.is_locked === true || auditData.status === 'Approved') {
    throw new ServiceError('Match record is already certified and locked. Conflict: Cannot re-audit certified records.', 409);
  }

  // Resolve official_id
  let officialId = auditData.official_id;
  const rawOfficialUid = officialUid.replace(/^off_/, '');
  const canonicalOffUid = `off_${rawOfficialUid}`;
  let profileDoc = await db.collection('Official_Profiles').doc(canonicalOffUid).get();
  if (!profileDoc.exists) {
    profileDoc = await db.collection('Official_Profiles').doc(rawOfficialUid).get();
  }
  if (profileDoc.exists) {
    officialId = profileDoc.data()?.official_id || canonicalOffUid;
  } else {
    officialId = canonicalOffUid;
  }

  const now = new Date().toISOString();

  // 4. Update Official_Audits record
  const updatedAudit: Partial<OfficialAudit> = {
    status: 'Approved',
    official_id: officialId,
    context_notes: dto.context_notes || auditData.context_notes || '',
    scoresheet_url: dto.scoresheet_url || auditData.scoresheet_url || '',
    certified_at: now,
  };

  // 5. Update Match_Logs record to lock to read-only
  const updatedMatch: Partial<MatchLog> = {
    is_certified: true,
    is_locked: true,
    scoresheet_url: dto.scoresheet_url || matchData.scoresheet_url || '',
  };

  const batch = db.batch();
  batch.update(validationRef, updatedAudit);
  batch.update(matchRef, updatedMatch);
  await batch.commit();

  return {
    message: 'Match validation successfully certified and record locked to read-only.',
    validation: {
      ...auditData,
      ...updatedAudit,
    },
    match: {
      ...matchData,
      ...updatedMatch,
    },
  };
}

/**
 * Removes or invalidates a disputed match record.
 */
export async function deleteMatchService(matchId: string) {
  const matchRef = db.collection('Match_Logs').doc(matchId);
  const matchDoc = await matchRef.get();

  if (!matchDoc.exists) {
    throw new ServiceError(`Match record '${matchId}' not found.`, 404);
  }

  // Delete match log
  await matchRef.delete();

  // Also clean up any linked audits in Official_Audits
  const auditsSnapshot = await db
    .collection('Official_Audits')
    .where('match_id', '==', matchId)
    .get();

  const batch = db.batch();
  auditsSnapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  return {
    message: `Match record '${matchId}' removed successfully.`,
    match_id: matchId,
  };
}
