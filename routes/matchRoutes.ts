import { Router } from 'express';
import multer from 'multer';
import { authenticate, requireCoach } from '../middlewares/authMiddleware';
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

// Standalone OCR Scoresheet Scanner (No match ID needed - accepts any field name)
router.post('/scan-scoresheet', authenticate, upload.any(), scanStandaloneScoresheet);
router.post('/ocr/scan', authenticate, upload.any(), scanStandaloneScoresheet);
router.post('/scoresheet', authenticate, upload.any(), scanStandaloneScoresheet);

// Match Endpoints (Named and Root Routes)
router.get('/', authenticate, getAllMatchesHandler);
router.get('/all', authenticate, getAllMatchesHandler);
router.get('/list', authenticate, getAllMatchesHandler);
router.post('/submit', authenticate, submitMatch);
router.post('/create', authenticate, submitMatch);
router.post('/log', authenticate, submitMatch);
router.post('/log-match', authenticate, submitMatch);
router.post('/', authenticate, submitMatch);

// Official Match Endpoints
router.post('/official', authenticate, createOfficialMatchHandler);
router.post('/create-official', authenticate, createOfficialMatchHandler);

// Single Match Lookup & Artifacts
router.post('/:matchId/scoresheet', authenticate, upload.any(), uploadScoresheet);
router.get('/:matchId/boxscore', authenticate, getBoxscore);
router.get('/:matchId/details', authenticate, getMatchDetailsHandler);
router.get('/:matchId', authenticate, getMatchDetailsHandler);
router.post('/:matchId/audit-request', authenticate, requireCoach, submitAuditRequestController);
router.get('/:matchId/pdf', authenticate, requireCoach, exportMatchPdfController);
router.delete('/:matchId', authenticate, deleteMatchHandler);

export default router;

