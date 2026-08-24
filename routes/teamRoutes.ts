import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import {
  browseTeams,
  getTeam,
  createTeamHandler,
  updateTeamHandler,
  updateRosterHandler,
} from '../controllers/teamController';

const router = Router();

// Browse & Search Teams (Named and Root Routes)
router.get('/browse', authenticate, browseTeams);
router.get('/search', authenticate, browseTeams);
router.get('/list', authenticate, browseTeams);
router.get('/all', authenticate, browseTeams);
router.get('/', authenticate, browseTeams);

// Team Creation & Registration
router.post('/create', authenticate, createTeamHandler);
router.post('/register', authenticate, createTeamHandler);
router.post('/', authenticate, createTeamHandler);

// Roster Management
router.patch('/:teamId/roster', authenticate, updateRosterHandler);
router.post('/:teamId/roster', authenticate, updateRosterHandler);

// Team Profile Details & Updates
router.get('/details/:teamId', authenticate, getTeam);
router.get('/:teamId', authenticate, getTeam);
router.patch('/:teamId', authenticate, updateTeamHandler);
router.put('/:teamId', authenticate, updateTeamHandler);

export default router;

