import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const ipLimitMap = new Map<string, RateLimitRecord>();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 5;

export function authRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.ip || req.socket.remoteAddress || '127.0.0.1';
  const now = Date.now();

  const record = ipLimitMap.get(clientIp);

  if (!record || now > record.resetTime) {
    ipLimitMap.set(clientIp, {
      count: 1,
      resetTime: now + WINDOW_MS,
    });
    next();
    return;
  }

  if (record.count >= MAX_REQUESTS) {
    res.status(429).json({
      error: 'Rate limit exceeded. Too many authentication attempts. Please try again after 1 minute.',
      retry_after_seconds: Math.ceil((record.resetTime - now) / 1000),
    });
    return;
  }

  record.count += 1;
  next();
}

export function resetAuthRateLimiter(ip?: string): void {
  if (ip) {
    ipLimitMap.delete(ip);
  } else {
    ipLimitMap.clear();
  }
}
