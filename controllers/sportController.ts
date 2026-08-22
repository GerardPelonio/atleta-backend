import { Response } from 'express';
import { AdminAuthRequest } from '../middlewares/adminMiddleware';
import { AuthRequest } from '../middlewares/authMiddleware';
import {
  getAllSportsService,
  getSportByIdService,
  createSportService,
  updateSportService,
} from '../services/sportService';
import { validateCreateSport, validateUpdateSport } from '../validators/sportValidator';
import { ServiceError } from '../validators/matchValidator';

export async function getSportsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const onlyActive = req.query.active === 'true';
    const sports = await getAllSportsService(onlyActive);

    res.status(200).json({
      message: 'Sports configurations retrieved successfully.',
      total_sports: sports.length,
      sports,
    });
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('getSportsHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function getSportByIdHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const sportId = Array.isArray(req.params.sportId) ? req.params.sportId[0] : req.params.sportId;
    if (!sportId) {
      res.status(400).json({ error: 'Sport ID parameter is required.' });
      return;
    }

    const sport = await getSportByIdService(sportId);
    res.status(200).json({
      message: 'Sport configuration retrieved successfully.',
      sport,
    });
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('getSportByIdHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function createSportHandler(req: AdminAuthRequest, res: Response): Promise<void> {
  try {
    const idempotencyKey = (req.headers['idempotency-key'] || req.headers['x-idempotency-key']) as string | undefined;
    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';
    const adminUserId = req.adminUser?.uid || req.user?.uid || 'SYS_ADMIN';

    const errors = validateCreateSport(req.body, idempotencyKey);
    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }

    const result = await createSportService(req.body, idempotencyKey!, adminUserId, clientIp);
    res.status(201).json(result);
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('createSportHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function updateSportHandler(req: AdminAuthRequest, res: Response): Promise<void> {
  try {
    const sportId = Array.isArray(req.params.sportId) ? req.params.sportId[0] : req.params.sportId;
    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';
    const adminUserId = req.adminUser?.uid || req.user?.uid || 'SYS_ADMIN';

    if (!sportId) {
      res.status(400).json({ error: 'Sport ID parameter is required.' });
      return;
    }

    const errors = validateUpdateSport(req.body);
    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }

    const result = await updateSportService(sportId, req.body, adminUserId, clientIp);
    res.status(200).json(result);
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('updateSportHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}
