import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { validateSrpeInput } from '../validators/workloadValidator';
import {
  logSrpeEntry,
  getWorkloadAnalytics,
  getAthleteWorkloadSummary,
  setAthleteWorkloadTarget,
} from '../services/workloadService';
import { ServiceError } from '../validators/matchValidator';

export async function postSrpeLog(req: AuthRequest, res: Response): Promise<void> {
  try {
    const authenticatedUid = req.user?.uid;
    const userRole = (req.user as any)?.role;

    const rawParam = req.params.athleteId;
    const athleteId = (Array.isArray(rawParam) ? rawParam[0] : rawParam)
      || req.body.athlete_id
      || authenticatedUid;

    if (!athleteId) {
      res.status(400).json({ error: 'Athlete ID is required.' });
      return;
    }

    const payload = {
      ...req.body,
      athlete_id: athleteId,
    };

    const errors = validateSrpeInput(payload);
    if (errors.length > 0) {
      res.status(400).json({
        error: 'Bad Request. Validation failed.',
        details: errors,
      });
      return;
    }

    const { session_duration_mins, srpe_score, entry_date, notes, session_type } = payload;

    const entry = await logSrpeEntry({
      athlete_id: athleteId,
      session_duration_mins: Number(session_duration_mins),
      srpe_score: Number(srpe_score),
      entry_date: entry_date || new Date().toISOString().split('T')[0],
      logged_by_coach_id: userRole === 'Coach' ? authenticatedUid : undefined,
      notes: notes || undefined,
      session_type: session_type || 'Practice',
    });

    res.status(201).json({
      message: 'sRPE entry logged successfully.',
      entry,
    });
  } catch (error: any) {
    console.error('postSrpeLog error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function getWorkload(req: AuthRequest, res: Response): Promise<void> {
  try {
    const rawParam = req.params.athleteId;
    const athleteId = (Array.isArray(rawParam) ? rawParam[0] : rawParam)
      || req.query.athlete_id
      || req.user?.uid;

    if (!athleteId) {
      res.status(400).json({ error: 'Athlete ID is required.' });
      return;
    }

    const startTime = Date.now();
    const analytics = await getWorkloadAnalytics(String(athleteId));
    const responseTimeMs = Date.now() - startTime;

    if (!analytics) {
      const summary = await getAthleteWorkloadSummary(String(athleteId));
      res.set('Cache-Control', 'private, max-age=60');
      res.status(200).json(summary);
      return;
    }

    res.set('Cache-Control', 'private, max-age=60');
    res.set('X-Response-Time-Ms', String(responseTimeMs));
    res.status(200).json(analytics);
  } catch (error: any) {
    console.error('getWorkload error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function getAthleteWorkloadHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const rawParam = req.params.athleteId;
    const athleteId = (Array.isArray(rawParam) ? rawParam[0] : rawParam)
      || req.query.athlete_id
      || req.user?.uid;

    if (!athleteId) {
      res.status(400).json({ error: 'Athlete ID is required.' });
      return;
    }

    const summary = await getAthleteWorkloadSummary(String(athleteId));
    res.status(200).json(summary);
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('getAthleteWorkloadHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function setWorkloadTargetHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const coachId = req.user?.uid || 'coach_default';
    const rawParam = req.params.athleteId;
    const athleteId = (Array.isArray(rawParam) ? rawParam[0] : rawParam)
      || req.body.athlete_id
      || req.user?.uid;

    if (!athleteId) {
      res.status(400).json({ error: 'Athlete ID is required.' });
      return;
    }

    const { target_7day_effort_pts, target_intensity, notes } = req.body;
    if (!target_7day_effort_pts || isNaN(Number(target_7day_effort_pts))) {
      res.status(400).json({ error: 'target_7day_effort_pts must be a valid number.' });
      return;
    }

    const result = await setAthleteWorkloadTarget(coachId, String(athleteId), {
      target_7day_effort_pts: Number(target_7day_effort_pts),
      target_intensity: target_intensity ? Number(target_intensity) : undefined,
      notes,
    });

    res.status(200).json(result);
  } catch (error: any) {
    console.error('setWorkloadTargetHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}
