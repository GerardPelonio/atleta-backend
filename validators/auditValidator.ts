import { ServiceError } from './matchValidator';

const pdfRateLimits = new Map<string, number[]>();

/**
 * Enforces rate limiting on PDF generation (max 5 requests/minute per coach).
 * Throws a 429 ServiceError if limit exceeded.
 */
export function checkPdfRateLimit(coachId: string): void {
  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;

  let timestamps = pdfRateLimits.get(coachId) || [];

  // Filter out timestamps older than 1 minute
  timestamps = timestamps.filter((time) => time > oneMinuteAgo);

  if (timestamps.length >= 5) {
    throw new ServiceError('Rate limit exceeded. Maximum 5 PDF exports per minute.', 429);
  }

  timestamps.push(now);
  pdfRateLimits.set(coachId, timestamps);
}

/**
 * Resets rate limit for a coach (primarily useful for automated testing).
 */
export function resetPdfRateLimit(coachId: string): void {
  pdfRateLimits.delete(coachId);
}
