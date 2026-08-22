import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { validateSrpeInput } from '../validators/workloadValidator';
import { logSrpeEntry, getWorkloadAnalytics, getAthleteWorkloadSummary } from '../services/workloadService';
import { ServiceError } from '../validators/matchValidator';

export async function postSrpeLog(req: AuthRequest, res: Response): Promise<void> {
  try {
    const authenticatedUid = req.user?.uid;
    const userRole = (req.user as any)?.role;

    const athleteId = req.params.athleteId || req.body.athlete_id;
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

    const authUidNormalized = authenticatedUid ? authenticatedUid.replace(/^ath_/, '').replace(/^coach_/, '') : '';
    const athleteIdNormalized = athleteId ? athleteId.replace(/^ath_/, '') : '';

    if (authUidNormalized && athleteIdNormalized && authUidNormalized !== athleteIdNormalized) {
      if (userRole !== 'Coach' && userRole !== 'Admin' && userRole !== 'System Admin') {
        res.status(403).json({
          error: 'Forbidden. Only the athlete or their verified coach may submit workload data.',
        });
        return;
      }
    }

    const entry = await logSrpeEntry({
      athlete_id: athleteId,
      session_duration_mins: Number(session_duration_mins),
      srpe_score: Number(srpe_score),
      entry_date,
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
    const athleteId = Array.isArray(req.params.athleteId)
      ? req.params.athleteId[0]
      : req.params.athleteId;
    const authenticatedUid = req.user?.uid;
    const userRole = (req.user as any)?.role;

    if (!athleteId) {
      res.status(400).json({ error: 'Athlete ID is required.' });
      return;
    }

    const authUidNormalized = authenticatedUid ? authenticatedUid.replace(/^ath_/, '').replace(/^coach_/, '') : '';
    const athleteIdNormalized = athleteId ? athleteId.replace(/^ath_/, '') : '';

    if (authUidNormalized && athleteIdNormalized && authUidNormalized !== athleteIdNormalized) {
      if (userRole !== 'Coach' && userRole !== 'Admin' && userRole !== 'System Admin') {
        res.status(403).json({
          error: 'Forbidden. Only the athlete or their verified coach may view workload data.',
        });
        return;
      }
    }

    const startTime = Date.now();
    const analytics = await getWorkloadAnalytics(athleteId);
    const responseTimeMs = Date.now() - startTime;

    if (!analytics) {
      res.status(404).json({
        error: 'We need at least 28 days of workout logs to calculate your baseline fatigue meter!',
        athlete_id: athleteId,
        recommendation: 'Keep logging your daily sRPE entries. You can start viewing analytics once you have 28 days of data.',
      });
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
    const athleteId = Array.isArray(req.params.athleteId)
      ? req.params.athleteId[0]
      : req.params.athleteId;
    const authenticatedUid = req.user?.uid;
    const userRole = (req.user as any)?.role;

    if (!athleteId) {
      res.status(400).json({ error: 'Athlete ID is required.' });
      return;
    }

    const authUidNormalized = authenticatedUid ? authenticatedUid.replace(/^ath_/, '').replace(/^coach_/, '') : '';
    const athleteIdNormalized = athleteId ? athleteId.replace(/^ath_/, '') : '';

    if (authUidNormalized && athleteIdNormalized && authUidNormalized !== athleteIdNormalized) {
      if (userRole !== 'Coach' && userRole !== 'Admin' && userRole !== 'System Admin') {
        res.status(403).json({
          error: 'Forbidden. You do not have permission to view this athlete\'s workload.',
        });
        return;
      }
    }

    const summary = await getAthleteWorkloadSummary(athleteId);
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
