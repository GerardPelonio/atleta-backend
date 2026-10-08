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

    res.setHeader('Cache-Control', 'public, max-age=10, stale-while-revalidate=30');

    // Check fast server cache for all matches
    const cacheKey = `all_matches_raw`;
    let allMatches = serverCache.get<any[]>(cacheKey);

    if (!allMatches) {
      const snap = await db.collection('Match_Logs').get();
      allMatches = snap.docs.map((doc) => ({
        id: doc.id,
        match_id: doc.id,
        ...doc.data(),
      }));
      serverCache.set(cacheKey, allMatches, 30, ['matches']);
    }

    let matches = allMatches;
    if (coachId && !showAll) {
      const possibleCoachIds = [coachId, `coach_${coachId}`, coachId.replace('coach_', '')];
      // Find teams managed by this coach
      const teamsCacheKey = `coach_teams_${coachId}`;
      let coachTeamIds = serverCache.get<Set<string>>(teamsCacheKey);
      if (!coachTeamIds) {
        const teamsSnap = await db.collection('Teams').where('coach_id', 'in', possibleCoachIds).get();
        coachTeamIds = new Set(teamsSnap.docs.map((d) => d.id));
        serverCache.set(teamsCacheKey, coachTeamIds, 60, ['teams']);
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
        // Team-based association
        if (m.team_id && coachTeamIds.has(m.team_id)) return true;
        if (m.home_team_id && coachTeamIds.has(m.home_team_id)) return true;
        if (m.away_team_id && coachTeamIds.has(m.away_team_id)) return true;
        return false;
      });

      matches = coachMatches;
    }

    res.status(200).json({ matches });
  } catch (error: any) {
    console.error('getAllMatchesHandler error:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch matches' });
  }
}

export async function submitMatch(req: AuthRequest, res: Response): Promise<void> {
  try {
    const coachId = req.user?.uid || 'coach_default';
    let idempotencyKey = (req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || req.body?.idempotency_key) as string | undefined;
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
      idempotencyKey = `idemp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    const raw = req.body || {};
    const normalizedSport = String(raw.sport_type || 'Basketball').trim();
    const normalizedGameResult = String(raw.game_result || 'WIN').toUpperCase().includes('LO') ? 'LOSS' : 'WIN';
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

    const payload: MatchSubmissionPayload = {
      team_id: raw.team_id || raw.team_name || raw.home_team_name || 'team_home',
      sport_type: normalizedSport as any,
      match_name: raw.match_name || raw.game_name || 'Match Game',
      match_type: raw.match_type || raw.game_type || 'Practice',
      match_date: raw.match_date || raw.date_time || new Date().toISOString(),
      location: raw.location || 'Stadium',
      opponent_team_name: raw.opponent_team_name || raw.away_team_name || 'OPPONENT',
      game_result: normalizedGameResult as any,
      home_score: raw.home_score !== undefined ? Number(raw.home_score) : undefined,
      away_score: raw.away_score !== undefined ? Number(raw.away_score) : undefined,
      notes: raw.notes || '',
      player_stats: playerStats,
    };

    const errors = validateSubmitMatch(payload, idempotencyKey);
    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }

    const result = await submitMatchSession(coachId, payload, idempotencyKey);
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

    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');

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

    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');

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
