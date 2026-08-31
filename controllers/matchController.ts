import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { db } from '../utils/firebaseAdmin';
import {
  submitMatchSession,
  processScoresheetOCR,
  scanScoresheetStandalone,
  getMatchBoxscore,
  getMatchResultDetails,
} from '../services/matchService';
import { validateSubmitMatch, ServiceError } from '../validators/matchValidator';
import { MatchSubmissionPayload } from '../models/matchModel';

export async function getAllMatchesHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const snap = await db.collection('Match_Logs').get();
    const matches = snap.docs.map((doc) => ({
      id: doc.id,
      match_id: doc.id,
      ...doc.data(),
    }));
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
  return undefined;
}

export async function uploadScoresheet(req: AuthRequest, res: Response): Promise<void> {
  try {
    const matchId = Array.isArray(req.params.matchId) ? req.params.matchId[0] : req.params.matchId;
    const file = extractFile(req);

    if (!matchId) {
      res.status(400).json({ error: 'Match ID is required.' });
      return;
    }

    const parsedResult = await processScoresheetOCR(matchId, file);
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

    const result = await scanScoresheetStandalone(file);
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

export async function getBoxscore(req: AuthRequest, res: Response): Promise<void> {
  try {
    const matchId = Array.isArray(req.params.matchId) ? req.params.matchId[0] : req.params.matchId;

    if (!matchId) {
      res.status(400).json({ error: 'Match ID is required.' });
      return;
    }

    const boxscore = await getMatchBoxscore(matchId);
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

    const details = await getMatchResultDetails(matchId);
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
