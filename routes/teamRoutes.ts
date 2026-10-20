import { Router } from 'express';
import { authenticate, optionalAuth } from '../middlewares/authMiddleware';
import {
  browseTeams,
  getTeam,
  createTeamHandler,
  updateTeamHandler,
  updateRosterHandler,
} from '../controllers/teamController';

import { cacheMiddleware, invalidateCacheMiddleware } from '../middlewares/cacheMiddleware';

const router = Router();

const teamCache = cacheMiddleware({ ttlSeconds: 60, tags: ['teams', 'roster'] });
const teamInvalidate = invalidateCacheMiddleware(['teams', 'roster']);

// Browse & Search Teams (Named and Root Routes)
router.get('/browse', optionalAuth, teamCache, browseTeams);
router.get('/search', optionalAuth, teamCache, browseTeams);
router.get('/list', optionalAuth, teamCache, browseTeams);
router.get('/all', optionalAuth, teamCache, browseTeams);
router.get('/', optionalAuth, teamCache, browseTeams);

// Team Creation & Registration
router.post('/create', authenticate, teamInvalidate, createTeamHandler);
router.post('/register', authenticate, teamInvalidate, createTeamHandler);
router.post('/', authenticate, teamInvalidate, createTeamHandler);

// Roster Management
router.patch('/:teamId/roster', authenticate, teamInvalidate, updateRosterHandler);
router.post('/:teamId/roster', authenticate, teamInvalidate, updateRosterHandler);

// Team Profile Details & Updates
router.get('/details/:teamId', optionalAuth, teamCache, getTeam);
router.get('/:teamId', optionalAuth, teamCache, getTeam);
router.patch('/:teamId', authenticate, teamInvalidate, updateTeamHandler);
router.put('/:teamId', authenticate, teamInvalidate, updateTeamHandler);

export default router;

