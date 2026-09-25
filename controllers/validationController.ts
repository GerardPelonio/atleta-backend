import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { serverCache } from '../utils/cache';
import {
  validateCreateOfficialMatch,
  validateCertifyValidation,
} from '../validators/validationValidator';
import {
  createOfficialMatchService,
  getPendingValidationsService,
  certifyValidationService,
  deleteMatchService,
} from '../services/validationService';
import { ServiceError } from '../validators/matchValidator';

export async function createOfficialMatchHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const uid = req.user?.uid || 'off_default';
    const idempotencyKey = (
      req.headers['idempotency-key'] ||
      req.headers['x-idempotency-key'] ||
      `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    ) as string;

    const errors = validateCreateOfficialMatch(req.body, idempotencyKey);
    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }

    const result = await createOfficialMatchService(uid, req.body, idempotencyKey);
    serverCache.invalidateTags(['matches', 'dashboard', 'validations']);
    res.status(201).json(result);
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('createOfficialMatchHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function getPendingValidationsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'Official') {
      res.status(401).json({ error: 'Unauthorized. Official role required.' });
      return;
    }

    res.setHeader('Cache-Control', 'public, max-age=10, stale-while-revalidate=30');

    const cacheKey = `pending_validations`;
    let pendingValidations = serverCache.get<any[]>(cacheKey);
    if (!pendingValidations) {
      pendingValidations = await getPendingValidationsService();
      serverCache.set(cacheKey, pendingValidations, 20, ['validations', 'matches']);
    }

    res.status(200).json(pendingValidations);
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('getPendingValidationsHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function certifyValidationHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'Official') {
      res.status(401).json({ error: 'Unauthorized. Official role required for certification.' });
      return;
    }

    const validationId = Array.isArray(req.params.validationId) ? req.params.validationId[0] : req.params.validationId;
    if (!validationId) {
      res.status(400).json({ error: 'Validation ID parameter is required.' });
      return;
    }

    const errors = validateCertifyValidation(req.body);
    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }

    const result = await certifyValidationService(validationId, req.user.uid, req.body);
    serverCache.invalidateTags(['matches', 'dashboard', 'validations', `match_${validationId}`]);
    res.status(200).json(result);
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('certifyValidationHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function deleteMatchHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'Official') {
      res.status(401).json({ error: 'Unauthorized. Official role required.' });
      return;
    }

    const matchId = Array.isArray(req.params.matchId) ? req.params.matchId[0] : req.params.matchId;
    if (!matchId) {
      res.status(400).json({ error: 'Match ID parameter is required.' });
      return;
    }

    const result = await deleteMatchService(matchId);
    serverCache.invalidateTags(['matches', 'dashboard', 'validations', `match_${matchId}`]);
    res.status(200).json(result);
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('deleteMatchHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}
