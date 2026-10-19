import { Router } from 'express';
import { authenticate, optionalAuth } from '../middlewares/authMiddleware';
import {
  browseTeams,
  getTeam,
  createTeamHandler,
  updateTeamHandler,
  updateRosterHandler,
} from '../controllers/teamController';

const router = Router();

// Browse & Search Teams (Named and Root Routes)
router.get('/browse', optionalAuth, browseTeams);
router.get('/search', optionalAuth, browseTeams);
router.get('/list', optionalAuth, browseTeams);
router.get('/all', optionalAuth, browseTeams);
router.get('/', optionalAuth, browseTeams);

// Team Creation & Registration
router.post('/create', authenticate, createTeamHandler);
router.post('/register', authenticate, createTeamHandler);
router.post('/', authenticate, createTeamHandler);

// Roster Management
router.patch('/:teamId/roster', authenticate, updateRosterHandler);
router.post('/:teamId/roster', authenticate, updateRosterHandler);

// Team Profile Details & Updates
router.get('/details/:teamId', optionalAuth, getTeam);
router.get('/:teamId', optionalAuth, getTeam);
router.patch('/:teamId', authenticate, updateTeamHandler);
router.put('/:teamId', authenticate, updateTeamHandler);

export default router;

