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
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    res.status(500).json({ error: 'Server authentication configuration error: JWT_SECRET missing.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as { uid: string; email: string; role: string };
    req.user = decoded;
    next();
  } catch (_) {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  const token = authHeader.split(' ')[1];
  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret) {
    try {
      const decoded = jwt.verify(token, jwtSecret) as { uid: string; email: string; role: string };
      if (decoded) {
        req.user = decoded;
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
