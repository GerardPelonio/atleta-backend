import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { db } from '../utils/firebaseAdmin';
import { serverCache } from '../utils/cache';
import {
  submitMatchSession,
  processScoresheetOCR,
  scanScoresheetStandalone,
  scanMultipleScoresheetsStandalone,
  getMatchBoxscore,
  getMatchResultDetails,
} from '../services/matchService';
import { validateSubmitMatch, ServiceError } from '../validators/matchValidator';
import { MatchSubmissionPayload } from '../models/matchModel';

export async function getAllMatchesHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const coachId = req.user?.uid || (typeof req.query.coach_id === 'string' ? req.query.coach_id : undefined);
    const showAll = req.query.all === 'true';

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    // Check fast server cache for all matches (bypass if client requests fresh)
    const cacheKey = `all_matches_raw`;
    const noCacheRequested = req.headers['cache-control']?.includes('no-cache') || req.headers.pragma?.includes('no-cache') || req.query.fresh === 'true';
    let allMatches = !noCacheRequested ? serverCache.get<any[]>(cacheKey) : null;

    if (!allMatches) {
      const snap = await db.collection('Match_Logs').get();
      allMatches = snap.docs.map((doc) => ({
        id: doc.id,
        match_id: doc.id,
        ...doc.data(),
      }));
      serverCache.set(cacheKey, allMatches, 5, ['matches']);
    }

    let matches = allMatches;
    if (coachId && !showAll) {
      const possibleCoachIds = [coachId, `coach_${coachId}`, coachId.replace('coach_', '')];
      // Find teams managed by this coach
      const teamsCacheKey = `coach_teams_${coachId}`;
      let coachTeamInfo = serverCache.get<{ ids: Set<string>; names: Set<string> }>(teamsCacheKey);
      if (!coachTeamInfo) {
        const teamsSnap = await db.collection('Teams').where('coach_id', 'in', possibleCoachIds).get();
        const ids = new Set(teamsSnap.docs.map((d) => d.id));
        const names = new Set(teamsSnap.docs.map((d) => String(d.data().team_name || '').toLowerCase().trim()).filter(Boolean));
        coachTeamInfo = { ids, names };
        serverCache.set(teamsCacheKey, coachTeamInfo, 60, ['teams']);
      }
      const coachTeamIds = coachTeamInfo.ids;
      const coachTeamNames = coachTeamInfo.names;

      // Find athletes managed by this coach
      const athletesCacheKey = `coach_athletes_${coachId}`;
      let coachAthleteIds = serverCache.get<Set<string>>(athletesCacheKey);
      if (!coachAthleteIds) {
        const athSnap = await db.collection('Athlete_Profiles').where('coach_id', 'in', possibleCoachIds).get().catch(() => null);
        const aIds = new Set<string>();
        if (athSnap) {
          athSnap.docs.forEach((d) => {
            aIds.add(d.id.toLowerCase());
            aIds.add(d.id.replace(/^ath_/, '').toLowerCase());
          });
        }
        coachAthleteIds = aIds;
        serverCache.set(athletesCacheKey, coachAthleteIds, 60, ['athletes']);
      }

      const coachMatches = allMatches.filter((m: any) => {
        // Official matches (created by Tournament Officials) are always visible to all coaches
        // so they can request scoresheets for any official game
        if (m.is_official === true || m.match_type === 'Official Match') return true;
        // Coach's own manually-logged or OCR-logged matches
        if (possibleCoachIds.includes(m.logged_by_coach_id)) return true;
        if (possibleCoachIds.includes(m.coach_id)) return true;
        if (possibleCoachIds.includes(m.created_by)) return true;
        if (possibleCoachIds.includes(m.requested_by_coach_id)) return true;
        // Assigned coaches array (OCR submissions often populate this)
        if (Array.isArray(m.assigned_coaches) && m.assigned_coaches.some((c: string) => possibleCoachIds.includes(c))) return true;
        if (Array.isArray(m.coaching_staff) && m.coaching_staff.some((c: string) => possibleCoachIds.includes(c))) return true;
        // Team-based association (by ID or team name)
        if (m.team_id && coachTeamIds.has(m.team_id)) return true;
        if (m.home_team_id && coachTeamIds.has(m.home_team_id)) return true;
        if (m.away_team_id && coachTeamIds.has(m.away_team_id)) return true;
        const hName = String(m.home_team_name || m.home_team || '').toLowerCase().trim();
        const aName = String(m.away_team_name || m.away_team || m.opponent_team_name || '').toLowerCase().trim();
        if (hName && coachTeamNames.has(hName)) return true;
        if (aName && coachTeamNames.has(aName)) return true;

        // Athlete-based association: match if any athlete from coach's roster participated
        const mAthletes = [
          ...(Array.isArray(m.roster_athletes) ? m.roster_athletes : []),
          ...(Array.isArray(m.rosterAthletes) ? m.rosterAthletes : []),
          ...(Array.isArray(m.athlete_ids) ? m.athlete_ids : []),
          ...(Array.isArray(m.player_stats) ? m.player_stats.map((p: any) => p.athlete_id) : []),
        ].map((id: any) => String(id || '').toLowerCase());
        if (mAthletes.some((id: string) => coachAthleteIds?.has(id) || coachAthleteIds?.has(id.replace(/^ath_/, '')))) return true;

        return false;
      });

      matches = coachMatches;
    }

    res.status(200).json({ matches: matches || [] });
  } catch (error: any) {
    console.error('getAllMatchesHandler error:', error);
    res.status(200).json({ matches: [] });
  }
}

export async function submitMatch(req: AuthRequest, res: Response): Promise<void> {
  try {
    const raw = req.body || {};
    const coachId = req.user?.uid || raw.coach_id || raw.logged_by_coach_id || 'coach_default';
    let idempotencyKey = (req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || raw.idempotency_key) as string | undefined;
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
      idempotencyKey = `idemp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    const normalizedSport = String(raw.sport_type || 'Basketball').trim();
    const isTimedSport = /SWIM|TRACK|FIELD|RUN|RACE|ATHLETIC/i.test(normalizedSport);
    const playerStats = Array.isArray(raw.player_stats)
      ? raw.player_stats
      : Array.isArray(raw.player_metrics)
      ? raw.player_metrics.map((p: any) => ({
          athlete_id: p.athlete_id,
          player_name: p.athlete_name || p.full_name || p.player_name || 'Athlete',
          jersey_number: p.jersey_number ?? null,
          team_name: p.team_name || raw.home_team_name || raw.team_name || 'Home Team',
          pts: p.stats?.points ?? p.stats?.pts ?? p.pts ?? 0,
          ast: p.stats?.assists ?? p.stats?.ast ?? p.ast ?? 0,
          reb: p.stats?.rebounds ?? p.stats?.reb ?? p.reb ?? 0,
          stats: p.stats || {},
        }))
      : [];

    const playerStatsList = Array.isArray(raw.playerStats) && raw.playerStats.length > 0
      ? raw.playerStats
      : (Array.isArray(raw.player_stats) ? raw.player_stats : playerStats);

    let bestRank: number | null = null;
    if (raw.rank !== undefined && raw.rank !== null && !isNaN(Number(raw.rank))) {
      bestRank = Number(raw.rank);
    } else if (raw.place !== undefined && raw.place !== null && !isNaN(Number(raw.place))) {
      bestRank = Number(raw.place);
    } else if (raw.placement_rank !== undefined && raw.placement_rank !== null && !isNaN(Number(raw.placement_rank))) {
      bestRank = Number(raw.placement_rank);
    }

    if (bestRank === null && Array.isArray(playerStatsList) && playerStatsList.length > 0) {
      const validRanks = playerStatsList
        .map((p: any) => {
          const r = p.rank ?? p.place ?? p.placement_rank ?? p.stats?.rank ?? p.stats?.place ?? p.sport_stats?.rank ?? p.sport_stats?.place;
          const num = Number(r);
          return !isNaN(num) && num > 0 ? num : null;
        })
        .filter((r): r is number => r !== null);
      if (validRanks.length > 0) {
        bestRank = Math.min(...validRanks);
      }
    }

    let normalizedGameResult: string;
    let resultBadgeText: string = raw.result_badge_text || raw.resultBadgeText || '';

    if (isTimedSport) {
      if (bestRank !== null) {
        if (bestRank === 1) {
          normalizedGameResult = '1st Place';
          resultBadgeText = resultBadgeText || '1ST PLACE';
        } else if (bestRank === 2) {
          normalizedGameResult = '2nd Place';
          resultBadgeText = resultBadgeText || '2ND PLACE';
        } else if (bestRank === 3) {
          normalizedGameResult = '3rd Place';
          resultBadgeText = resultBadgeText || '3RD PLACE';
        } else {
          normalizedGameResult = `${bestRank}th Place`;
          resultBadgeText = resultBadgeText || `${bestRank}TH PLACE`;
        }
      } else if (raw.game_result) {
        normalizedGameResult = String(raw.game_result).trim();
        resultBadgeText = resultBadgeText || normalizedGameResult.toUpperCase();
      } else {
        normalizedGameResult = 'COMPLETED';
        resultBadgeText = resultBadgeText || 'COMPLETED';
      }
    } else {
      const rawResUpper = String(raw.game_result || '').toUpperCase();
      if (rawResUpper.includes('LO')) {
        normalizedGameResult = 'LOSS';
        resultBadgeText = resultBadgeText || 'RESULT LOSS';
      } else if (rawResUpper.includes('TIE') || rawResUpper.includes('DRAW')) {
        normalizedGameResult = 'TIE';
        resultBadgeText = resultBadgeText || 'RESULT TIE';
      } else if (raw.home_score !== undefined && raw.away_score !== undefined && !isNaN(Number(raw.home_score)) && !isNaN(Number(raw.away_score))) {
        normalizedGameResult = Number(raw.home_score) >= Number(raw.away_score) ? 'WIN' : 'LOSS';
        resultBadgeText = resultBadgeText || (Number(raw.home_score) >= Number(raw.away_score) ? 'RESULT WIN' : 'RESULT LOSS');
      } else {
        normalizedGameResult = 'WIN';
        resultBadgeText = resultBadgeText || 'RESULT WIN';
      }
    }

    const rosterAthletesList = Array.isArray(raw.rosterAthletes)
      ? raw.rosterAthletes
      : (Array.isArray(raw.roster_athletes) ? raw.roster_athletes : []);

    const awayRosterAthletesList = Array.isArray(raw.awayRosterAthletes)
      ? raw.awayRosterAthletes
      : (Array.isArray(raw.away_roster_athletes) ? raw.away_roster_athletes : []);

    const scoresheetUrlVal = raw.scoresheetUrl || raw.scoresheet_url || '';

    const resolvedMatchName = String(raw.matchName || raw.match_name || raw.game_name || raw.gameName || '').trim() || 'Match Game';

    const payload: MatchSubmissionPayload = {
      ...raw,
      team_id: raw.team_id || raw.team_name || raw.home_team_name || 'team_home',
      sport_type: normalizedSport as any,
      matchName: resolvedMatchName,
      match_name: resolvedMatchName,
      gameName: resolvedMatchName,
      game_name: resolvedMatchName,
      match_type: raw.match_type || raw.game_type || 'Practice',
      match_date: raw.match_date || raw.date_time || new Date().toISOString(),
      location: raw.location || 'Stadium',
      opponent_team_name: raw.opponent_team_name || raw.away_team_name || (isTimedSport ? '' : 'OPPONENT'),
      game_result: normalizedGameResult as any,
      rank: bestRank !== null ? bestRank : (raw.rank !== undefined ? raw.rank : undefined),
      place: bestRank !== null ? bestRank : (raw.place !== undefined ? raw.place : undefined),
      placement_rank: bestRank !== null ? bestRank : (raw.placement_rank !== undefined ? raw.placement_rank : undefined),
      result_badge_text: resultBadgeText,
      resultBadgeText: resultBadgeText,
      home_score: raw.home_score !== undefined ? Number(raw.home_score) : undefined,
      away_score: raw.away_score !== undefined ? Number(raw.away_score) : undefined,
      notes: raw.notes || '',
      player_stats: playerStatsList,
      playerStats: playerStatsList,
      roster_athletes: rosterAthletesList,
      rosterAthletes: rosterAthletesList,
      away_roster_athletes: awayRosterAthletesList,
      awayRosterAthletes: awayRosterAthletesList,
      scoresheet_url: scoresheetUrlVal,
      scoresheetUrl: scoresheetUrlVal,
    };

    const errors = validateSubmitMatch(payload, idempotencyKey);
    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }

    const result = await submitMatchSession(coachId, payload, idempotencyKey);
    serverCache.delete('all_matches_raw');
    serverCache.invalidateTags(['matches', 'dashboard', 'validations']);
    res.status(201).json(result);
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('submitMatch error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

function extractFile(req: any): Express.Multer.File | undefined {
  if (req.file) return req.file;
  if (Array.isArray(req.files) && req.files.length > 0) return req.files[0];
  if (req.files && typeof req.files === 'object') {
    const keys = Object.keys(req.files);
    for (const key of keys) {
      if (Array.isArray(req.files[key]) && req.files[key].length > 0) {
        return req.files[key][0];
      }
    }
  }

  // Support JSON payload with base64 string or csv text
  const base64Str = req.body?.base64 || req.body?.image || req.body?.file || req.body?.data || req.body?.scoresheet;
  if (typeof base64Str === 'string' && base64Str.trim().length > 0) {
    let cleanBase64 = base64Str.trim();
    let mimeType = req.body?.mimetype || req.body?.mime_type || 'image/jpeg';
    if (cleanBase64.startsWith('data:')) {
      const match = cleanBase64.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        cleanBase64 = match[2];
      }
    }
    try {
      const buffer = Buffer.from(cleanBase64, 'base64');
      return {
        fieldname: 'file',
        originalname: req.body?.filename || req.body?.file_name || 'scoresheet.jpg',
        encoding: '7bit',
        mimetype: mimeType,
        buffer,
        size: buffer.length,
      } as Express.Multer.File;
    } catch {}
  }

  // Support CSV string in body
  if (typeof req.body?.csv === 'string' && req.body.csv.trim().length > 0) {
    const buffer = Buffer.from(req.body.csv, 'utf-8');
    return {
      fieldname: 'file',
      originalname: req.body?.filename || 'scoresheet.csv',
      encoding: '7bit',
      mimetype: 'text/csv',
      buffer,
      size: buffer.length,
    } as Express.Multer.File;
  }

  return undefined;
}

export async function uploadScoresheet(req: AuthRequest, res: Response): Promise<void> {
  try {
    const matchId = Array.isArray(req.params.matchId) ? req.params.matchId[0] : req.params.matchId;
    const file = extractFile(req);
    const customKey = (req.headers['x-gemini-key'] as string) || (req.headers['x-api-key'] as string) || (req.query.gemini_key as string) || (req.query.apiKey as string) || (req.body?.gemini_key as string) || (req.body?.apiKey as string);

    if (!matchId) {
      res.status(400).json({ error: 'Match ID is required.' });
      return;
    }

    const parsedResult = await processScoresheetOCR(matchId, file, customKey);
    serverCache.invalidateTags(['matches', 'dashboard', 'validations', `match_${matchId}`]);
    res.status(200).json({
      message: 'Scoresheet uploaded and OCR table parsing completed successfully.',
      ...parsedResult,
    });
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('uploadScoresheet error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function scanStandaloneScoresheet(req: AuthRequest, res: Response): Promise<void> {
  try {
    const file = extractFile(req);
    const customKey = (req.headers['x-gemini-key'] as string) || (req.headers['x-api-key'] as string) || (req.query.gemini_key as string) || (req.query.apiKey as string) || (req.body?.gemini_key as string) || (req.body?.apiKey as string);

    const result = await scanScoresheetStandalone(file, customKey);
    res.status(200).json({
      message: 'Scoresheet scanned and parsed successfully.',
      ...result,
    });
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('scanStandaloneScoresheet error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function scanMultiScoresheetsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    let files: Express.Multer.File[] = [];
    if (Array.isArray(req.files)) {
      files = req.files as Express.Multer.File[];
    } else if (req.files && typeof req.files === 'object') {
      for (const key of Object.keys(req.files)) {
        const item = (req.files as any)[key];
        if (Array.isArray(item)) files.push(...item);
        else if (item) files.push(item);
      }
    } else if (req.file) {
      files = [req.file];
    }

    // Support JSON body with files array containing base64 strings
    if (files.length === 0 && Array.isArray(req.body?.files) && req.body.files.length > 0) {
      for (let i = 0; i < req.body.files.length; i++) {
        const item = req.body.files[i];
        const base64Str = item?.base64 || item?.image || item?.file || item?.data;
        if (typeof base64Str === 'string' && base64Str.trim().length > 0) {
          let cleanBase64 = base64Str.trim();
          let mimeType = item?.mimetype || item?.mime_type || 'image/jpeg';
          if (cleanBase64.startsWith('data:')) {
            const match = cleanBase64.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              mimeType = match[1];
              cleanBase64 = match[2];
            }
          }
          try {
            const buffer = Buffer.from(cleanBase64, 'base64');
            files.push({
              fieldname: `file_${i}`,
              originalname: item?.filename || item?.file_name || `scoresheet_${i + 1}.jpg`,
              encoding: '7bit',
              mimetype: mimeType,
              buffer,
              size: buffer.length,
            } as Express.Multer.File);
          } catch {}
        }
      }
    }

    if (files.length === 0) {
      res.status(400).json({ error: 'No scoresheet files uploaded.' });
      return;
    }

    const customKey = (req.headers['x-gemini-key'] as string) || (req.headers['x-api-key'] as string) || (req.query.gemini_key as string) || (req.query.apiKey as string) || (req.body?.gemini_key as string) || (req.body?.apiKey as string);

    const result = await scanMultipleScoresheetsStandalone(files, customKey);
    res.status(200).json({
      message: `Successfully processed and parsed ${files.length} scoresheet files.`,
      ...result,
    });
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('scanMultiScoresheetsHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function getBoxscore(req: AuthRequest, res: Response): Promise<void> {
  try {
    const matchId = Array.isArray(req.params.matchId) ? req.params.matchId[0] : req.params.matchId;

    if (!matchId) {
      res.status(400).json({ error: 'Match ID is required.' });
      return;
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    const cacheKey = `boxscore_${matchId}`;
    let boxscore = serverCache.get<any>(cacheKey);
    if (!boxscore) {
      boxscore = await getMatchBoxscore(matchId);
      serverCache.set(cacheKey, boxscore, 60, ['matches', `match_${matchId}`]);
    }

    res.status(200).json(boxscore);
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('getBoxscore error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function getMatchDetailsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const matchId = Array.isArray(req.params.matchId) ? req.params.matchId[0] : req.params.matchId;

    if (!matchId) {
      res.status(400).json({ error: 'Match ID is required.' });
      return;
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    const cacheKey = `details_${matchId}`;
    let details = serverCache.get<any>(cacheKey);
    if (!details) {
      details = await getMatchResultDetails(matchId);
      serverCache.set(cacheKey, details, 60, ['matches', `match_${matchId}`]);
    }

    res.status(200).json(details);
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('getMatchDetailsHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}
