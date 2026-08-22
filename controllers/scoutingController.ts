import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import {
  searchRegionalAthletes,
  getLeaderboardRankings,
  dispatchRecruitmentProposal,
  getRecruitmentProposals,
  getFullScoutingAthleteProfile,
} from '../services/scoutingService';
import { validateProposalSubmission, validateScoutingParams } from '../validators/scoutingValidator';
import { ServiceError } from '../validators/matchValidator';

export async function searchAthletesController(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { sport, minPER, search } = req.query;

    validateScoutingParams(req.query as Record<string, unknown>);

    const parsedMinPER = minPER ? parseFloat(minPER as string) : undefined;
    const athletes = await searchRegionalAthletes(
      sport as string | undefined,
      parsedMinPER,
      search as string | undefined,
    );

    res.status(200).json(athletes);
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('searchAthletesController error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function getRankingsController(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { sport, season, region } = req.query;

    const rankings = await getLeaderboardRankings(
      sport as string | undefined,
      season as string | undefined,
      region as string | undefined,
    );

    res.status(200).json(rankings);
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('getRankingsController error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function createProposalController(req: AuthRequest, res: Response): Promise<void> {
  try {
    const coachId = req.user?.uid || 'coach_default';

    const errors = validateProposalSubmission(req.body);
    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }

    const { athlete_id, offer_details } = req.body;
    const proposal = await dispatchRecruitmentProposal(coachId, athlete_id, offer_details);

    res.status(201).json(proposal);
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('createProposalController error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function getProposalsController(req: AuthRequest, res: Response): Promise<void> {
  try {
    const coachId = req.user?.uid || 'coach_default';

    const proposals = await getRecruitmentProposals(coachId);
    res.status(200).json(proposals);
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('getProposalsController error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function getScoutingAthleteProfileController(req: AuthRequest, res: Response): Promise<void> {
  try {
    const athleteId = Array.isArray(req.params.athleteId) ? req.params.athleteId[0] : req.params.athleteId;
    if (!athleteId) {
      res.status(400).json({ error: 'Athlete ID parameter is required.' });
      return;
    }

    const profile = await getFullScoutingAthleteProfile(athleteId);
    res.status(200).json(profile);
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('getScoutingAthleteProfileController error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}
