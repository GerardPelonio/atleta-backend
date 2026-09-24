import { Router } from 'express';
import multer from 'multer';
import { authenticate, optionalAuth, requireCoach } from '../middlewares/authMiddleware';
import {
  submitMatch,
  uploadScoresheet,
  scanStandaloneScoresheet,
  getBoxscore,
  getMatchDetailsHandler,
  getAllMatchesHandler,
} from '../controllers/matchController';
import {
  submitAuditRequestController,
  exportMatchPdfController,
} from '../controllers/auditController';
import {
  createOfficialMatchHandler,
  deleteMatchHandler,
} from '../controllers/validationController';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

// Dedicated Web & Mobile OCR Scoresheet Scanners
router.post('/web/scan-scoresheet', optionalAuth, upload.any(), scanStandaloneScoresheet);
router.post('/web/ocr', optionalAuth, upload.any(), scanStandaloneScoresheet);
router.post('/mobile/scan-scoresheet', optionalAuth, upload.any(), scanStandaloneScoresheet);
router.post('/mobile/ocr', optionalAuth, upload.any(), scanStandaloneScoresheet);
router.post('/scan-scoresheet', optionalAuth, upload.any(), scanStandaloneScoresheet);
router.post('/ocr/scan', optionalAuth, upload.any(), scanStandaloneScoresheet);
router.post('/scoresheet', optionalAuth, upload.any(), scanStandaloneScoresheet);

// Match Endpoints (Named and Root Routes)
router.get('/', optionalAuth, getAllMatchesHandler);
router.get('/all', optionalAuth, getAllMatchesHandler);
router.get('/list', optionalAuth, getAllMatchesHandler);
router.post('/submit', optionalAuth, submitMatch);
router.post('/create', optionalAuth, submitMatch);
router.post('/log', optionalAuth, submitMatch);
router.post('/log-match', optionalAuth, submitMatch);
router.post('/', optionalAuth, submitMatch);

// Official Match Endpoints
router.post('/official', optionalAuth, createOfficialMatchHandler);
router.post('/create-official', optionalAuth, createOfficialMatchHandler);

// Single Match Lookup & Artifacts
router.post('/:matchId/scoresheet', optionalAuth, upload.any(), uploadScoresheet);
router.get('/:matchId/boxscore', optionalAuth, getBoxscore);
router.get('/:matchId/details', optionalAuth, getMatchDetailsHandler);
router.get('/:matchId', optionalAuth, getMatchDetailsHandler);
router.post('/:matchId/audit-request', authenticate, requireCoach, submitAuditRequestController);
router.get('/:matchId/pdf', authenticate, requireCoach, exportMatchPdfController);
router.delete('/:matchId', authenticate, deleteMatchHandler);

export default router;

