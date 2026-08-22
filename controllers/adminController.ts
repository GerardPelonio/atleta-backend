import { Request, Response } from 'express';
import { validateRegisterAdmin, validateLoginAdmin } from '../validators/adminValidator';
import {
  registerAdminService,
  loginAdminService,
  getPendingCoachQueueService,
  approveCoachService,
  rejectCoachService,
} from '../services/adminService';
import { ServiceError } from '../validators/matchValidator';
import { AdminAuthRequest } from '../middlewares/adminMiddleware';

export async function registerAdminHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = req.body as Record<string, unknown>;

    const errors = validateRegisterAdmin(data);
    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }

    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';
    const result = await registerAdminService(data as any, clientIp);

    res.status(201).json({
      message: 'System Admin account registered and provisioned successfully.',
      ...result,
    });
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('registerAdminHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function loginAdminHandler(req: Request, res: Response): Promise<void> {
  try {
    const errors = validateLoginAdmin(req.body);
    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }

    const { email, password } = req.body;
    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';

    const result = await loginAdminService(email, password, clientIp);
    res.status(200).json({
      message: 'System Admin authenticated successfully.',
      ...result,
    });
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('loginAdminHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function getAdminProfileHandler(req: AdminAuthRequest, res: Response): Promise<void> {
  res.status(200).json({
    message: 'System Admin profile and active session retrieved.',
    user: req.user,
    admin_profile: req.adminUser,
  });
}

export async function getCoachQueueHandler(req: AdminAuthRequest, res: Response): Promise<void> {
  try {
    const queue = await getPendingCoachQueueService();
    res.status(200).json({
      message: 'Pending coach accreditation queue retrieved successfully.',
      total_pending: queue.length,
      queue,
    });
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('getCoachQueueHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function approveCoachHandler(req: AdminAuthRequest, res: Response): Promise<void> {
  const adminId = req.adminUser?.uid || req.user?.uid || 'admin_default';
  const coachIdParam = Array.isArray(req.params.coachId) ? req.params.coachId[0] : req.params.coachId;

  try {
    const result = await approveCoachService(adminId, coachIdParam);
    res.status(200).json(result);
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('approveCoachHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function rejectCoachHandler(req: AdminAuthRequest, res: Response): Promise<void> {
  const adminId = req.adminUser?.uid || req.user?.uid || 'admin_default';
  const coachIdParam = Array.isArray(req.params.coachId) ? req.params.coachId[0] : req.params.coachId;
  const { rejection_reason } = req.body || {};

  try {
    const result = await rejectCoachService(adminId, coachIdParam, rejection_reason);
    res.status(200).json(result);
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('rejectCoachHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}
