import { Router } from 'express';
import { authenticate, requireCoach } from '../middlewares/authMiddleware';
import {
  searchAthletesController,
  getRankingsController,
  createProposalController,
  getProposalsController,
  getScoutingAthleteProfileController,
} from '../controllers/scoutingController';

const router = Router();

router.use(authenticate);
router.use(requireCoach);

// Athlete Scouting & Deep Profile
router.get('/athletes/:athleteId', getScoutingAthleteProfileController);
router.get('/athletes', searchAthletesController);
router.get('/search', searchAthletesController);

// Rankings & Leaderboards
router.get('/rankings', getRankingsController);
router.get('/leaderboards', getRankingsController);
router.get('/leaderboard', getRankingsController);

// Recruitment Proposals
router.post('/proposals/create', createProposalController);
router.post('/proposals', createProposalController);
router.get('/proposals/list', getProposalsController);
router.get('/proposals', getProposalsController);

export default router;

