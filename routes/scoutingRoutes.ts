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

router.get('/athletes/:athleteId', getScoutingAthleteProfileController);
router.get('/athletes', searchAthletesController);
router.get('/rankings', getRankingsController);
router.post('/proposals', createProposalController);
router.get('/proposals', getProposalsController);

export default router;
