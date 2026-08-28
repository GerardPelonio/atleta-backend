import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import {
  getAthleteProfile,
  updateAthleteProfile,
  uploadAthleteDocument,
  getAthleteHomeSummary,
  getAthleteExpandedCareerStats,
  getAthleteDateGroupedMatches,
} from '../services/athleteService';
import { searchAthletes } from '../services/teamService';
import { registerUserService } from '../services/userService';
import { validateRegisterUser } from '../validators/userValidator';
import { ServiceError } from '../validators/matchValidator';

export async function getAthleteHome(req: AuthRequest, res: Response): Promise<void> {
  try {
    const rawAthleteParam = req.params.athleteId;
    const athleteId = (Array.isArray(rawAthleteParam) ? rawAthleteParam[0] : rawAthleteParam) || req.user?.uid;
    const authenticatedUid = req.user?.uid;
    const authenticatedRole = req.user?.role;

    if (!athleteId) {
      res.status(400).json({ error: 'Athlete ID is required.' });
      return;
    }

    if (authenticatedUid && authenticatedRole === 'Athlete') {
      const normalizedAthleteId = athleteId.replace(/^ath_/, '');
      const normalizedUid = authenticatedUid.replace(/^ath_/, '');
      if (normalizedUid !== normalizedAthleteId) {
        res.status(403).json({ error: 'Forbidden. You may only access your own home summary.' });
        return;
      }
    }

    const homeData = await getAthleteHomeSummary(athleteId);
    if (!homeData) {
      res.status(404).json({ error: 'Athlete not found.' });
      return;
    }

    res.set('Cache-Control', 'private, max-age=300');
    res.status(200).json(homeData);
  } catch (error: any) {
    console.error('getAthleteHome error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function getAthlete(req: Request, res: Response): Promise<void> {
  try {
    const athleteId = req.params.athleteId || (req as any).user?.uid;
    if (!athleteId) {
      res.status(400).json({ error: 'Athlete ID is required.' });
      return;
    }

    const athleteData = await getAthleteProfile(athleteId);
    res.status(200).json(athleteData);
  } catch (error: any) {
    console.error('getAthlete error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function updateAthlete(req: Request, res: Response): Promise<void> {
  try {
    const athleteId = req.params.athleteId || (req as any).user?.uid;
    if (!athleteId) {
      res.status(400).json({ error: 'Athlete ID is required.' });
      return;
    }

    const updateData = req.body;
    const updatedProfile = await updateAthleteProfile(athleteId, updateData);

    res.status(200).json({
      message: 'Athlete profile updated successfully.',
      athlete: updatedProfile,
    });
  } catch (error: any) {
    console.error('updateAthlete error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function uploadDocument(req: Request, res: Response): Promise<void> {
  try {
    const athleteId = req.params.athleteId || (req as any).user?.uid;
    const docType = req.body.doc_type || 'psa_birth_certificate';
    const file = (req as any).file as Express.Multer.File | undefined;

    if (!athleteId) {
      res.status(400).json({ error: 'Athlete ID is required.' });
      return;
    }

    if (docType !== 'psa_birth_certificate' && docType !== 'proof_of_residency') {
      res.status(400).json({ error: 'doc_type must be "psa_birth_certificate" or "proof_of_residency".' });
      return;
    }

    const updatedProfile = await uploadAthleteDocument(athleteId, docType, file);

    res.status(200).json({
      message: 'Document uploaded successfully.',
      documents: updatedProfile.documents,
    });
  } catch (error: any) {
    console.error('uploadDocument error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function searchAthletesHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const query = (req.query.query || req.query.search || req.query.q) as string | undefined;
    const sport = (req.query.sport || req.query.sport_type || req.query.category) as string | undefined;
    const athletes = await searchAthletes(query, sport);

    res.status(200).json({
      total: athletes.length,
      query: query || null,
      sport: sport || null,
      athletes,
    });
  } catch (error: any) {
    console.error('searchAthletesHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function registerAthlete(req: Request, res: Response): Promise<void> {
  try {
    const data = req.body as Record<string, unknown>;
    const file = (req as any).file as Express.Multer.File | undefined;

    const errors = validateRegisterUser(data);
    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }

    const result = await registerUserService({ ...data, role: 'Athlete' }, file);

    res.status(201).json({
      message: 'Athlete registered successfully.',
      ...result,
    });
  } catch (error: any) {
    if (error.code === 'auth/email-already-exists') {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }
    console.error('Register athlete error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function getAthleteAllStatsHandler(req: Request, res: Response): Promise<void> {
  try {
    const athleteId = req.params.athleteId || (req as any).user?.uid;
    if (!athleteId) {
      res.status(400).json({ error: 'Athlete ID is required.' });
      return;
    }

    const stats = await getAthleteExpandedCareerStats(athleteId);
    res.status(200).json(stats);
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('getAthleteAllStatsHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function getAthleteMatchHistoryHandler(req: Request, res: Response): Promise<void> {
  try {
    const athleteId = req.params.athleteId || (req as any).user?.uid;
    if (!athleteId) {
      res.status(400).json({ error: 'Athlete ID is required.' });
      return;
    }

    const matches = await getAthleteDateGroupedMatches(athleteId);
    res.status(200).json(matches);
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('getAthleteMatchHistoryHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}
