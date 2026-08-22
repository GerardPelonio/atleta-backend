import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest } from './authMiddleware';
import { logAdminAudit } from '../services/adminService';
import { db } from '../utils/firebaseAdmin';

export interface AdminAuthRequest extends AuthRequest {
  adminUser?: {
    uid: string;
    email: string;
    role: string;
    clearance_level: number;
    department_code: string;
    is_elevated: boolean;
  };
}

export async function requireSystemAdmin(
  req: AdminAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const clientIp = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';
  const endpoint = req.originalUrl || req.url || '/admin';

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    await logAdminAudit({
      user_id: 'ANONYMOUS',
      email: 'UNKNOWN',
      action: `${req.method} ${endpoint}`,
      status: 'FAILED',
      endpoint,
      ip_address: clientIp,
      details: { error: 'No Bearer authorization token provided' },
    });
    res.status(401).json({ error: 'Access denied. No token provided.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const secret = process.env.JWT_SECRET || 'atleta-super-secret-jwt-key-2026';
    const decoded = jwt.verify(token, secret) as {
      uid: string;
      email: string;
      role: string;
      clearance_level?: number;
      department_code?: string;
      is_elevated?: boolean;
    };

    if (decoded.role !== 'SystemAdmin' && decoded.role !== 'System Admin') {
      await logAdminAudit({
        user_id: decoded.uid || 'UNKNOWN',
        email: decoded.email || 'UNKNOWN',
        action: `${req.method} ${endpoint}`,
        status: 'FAILED',
        endpoint,
        ip_address: clientIp,
        details: { error: 'Non-admin role token presented', role: decoded.role },
      });
      res.status(403).json({ error: 'Access denied. System Admin role required.' });
      return;
    }

    const adminProfilesSnap = await db.collection('Admin_Profiles').where('user_id', '==', decoded.uid).limit(1).get();
    if (!adminProfilesSnap.empty) {
      const profile = adminProfilesSnap.docs[0].data();
      if (profile.is_active === false) {
        await logAdminAudit({
          user_id: decoded.uid,
          email: decoded.email,
          action: `${req.method} ${endpoint}`,
          status: 'FAILED',
          endpoint,
          ip_address: clientIp,
          details: { error: 'Admin profile is deactivated' },
        });
        res.status(403).json({ error: 'Access denied. Admin profile is deactivated.' });
        return;
      }
    }

    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      role: 'SystemAdmin',
    };
    req.adminUser = {
      uid: decoded.uid,
      email: decoded.email,
      role: 'SystemAdmin',
      clearance_level: decoded.clearance_level || 4,
      department_code: decoded.department_code || 'SYS_ADMIN',
      is_elevated: !!decoded.is_elevated,
    };

    if (req.method === 'GET') {
      logAdminAudit({
        user_id: decoded.uid,
        email: decoded.email,
        action: `${req.method} ${endpoint}`,
        status: 'SUCCESS',
        endpoint,
        ip_address: clientIp,
        details: {
          clearance_level: req.adminUser.clearance_level,
          department_code: req.adminUser.department_code,
        },
      }).catch((err) => console.error('Async audit log error:', err));
    }

    next();
  } catch (error: any) {
    await logAdminAudit({
      user_id: 'ANONYMOUS',
      email: 'UNKNOWN',
      action: `${req.method} ${endpoint}`,
      status: 'FAILED',
      endpoint,
      ip_address: clientIp,
      details: { error: 'Invalid or expired token', message: error?.message },
    });
    res.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }
}
