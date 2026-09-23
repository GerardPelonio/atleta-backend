import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    uid: string;
    email: string;
    role: string;
  };
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Access denied. No token provided.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  const secrets = [
    process.env.JWT_SECRET,
    'sanamakapasasafinaldefense',
    'atleta-super-secret-jwt-key-2026',
  ].filter(Boolean) as string[];

  let decoded: { uid: string; email: string; role: string } | null = null;
  for (const secret of secrets) {
    try {
      decoded = jwt.verify(token, secret) as { uid: string; email: string; role: string };
      if (decoded) break;
    } catch (_) {}
  }

  if (!decoded) {
    res.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }

  req.user = decoded;
  next();
}

export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  const token = authHeader.split(' ')[1];
  const secrets = [
    process.env.JWT_SECRET,
    'sanamakapasasafinaldefense',
    'atleta-super-secret-jwt-key-2026',
  ].filter(Boolean) as string[];

  for (const secret of secrets) {
    try {
      const decoded = jwt.verify(token, secret) as { uid: string; email: string; role: string };
      if (decoded) {
        req.user = decoded;
        break;
      }
    } catch (_) {}
  }
  next();
}

export function requireCoach(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'Coach') {
    res.status(403).json({ error: 'Access denied. Coach role required.' });
    return;
  }
  next();
}
