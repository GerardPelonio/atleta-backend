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
    const rawDocType = req.body.doc_type || req.body.document_type || 'psa_birth_certificate';
    const file = (req as any).file || (Array.isArray((req as any).files) ? (req as any).files[0] : undefined);

    if (!athleteId) {
      res.status(400).json({ error: 'Athlete ID is required.' });
      return;
    }

    const cleanType = String(rawDocType).toLowerCase();
    let normalizedDocType: string = 'psa_birth_certificate';
    if (cleanType.includes('residency') || cleanType.includes('proof')) {
      normalizedDocType = 'proof_of_residency';
    } else if (cleanType.includes('med')) {
      normalizedDocType = 'medical_clearance';
    } else if (cleanType.includes('school') || cleanType.includes('student') || cleanType.includes('id')) {
      normalizedDocType = 'school_id';
    } else if (cleanType.includes('birth') || cleanType.includes('psa')) {
      normalizedDocType = 'psa_birth_certificate';
    } else {
      normalizedDocType = cleanType.replace(/\s+/g, '_') || 'other_document';
    }

    const updatedProfile = await uploadAthleteDocument(athleteId, normalizedDocType, file);

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
