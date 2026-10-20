import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { serverCache } from '../utils/cache';

export interface CacheMiddlewareOptions {
  /** Time to live in seconds. Defaults to 60. */
  ttlSeconds?: number;
  /** Tags for bulk invalidation (e.g. ['matches', 'teams']). */
  tags?: string[] | ((req: Request) => string[]);
  /** If true, cache key is scoped to the authenticated user's uid. */
  isUserSpecific?: boolean;
}

/**
 * Express middleware that caches JSON responses in server memory.
 * Repeated requests within `ttlSeconds` return instantaneously with X-Cache: HIT,
 * saving Firestore document reads and compute quotas.
 */
export function cacheMiddleware(options: CacheMiddlewareOptions = {}) {
  const { ttlSeconds = 60, tags = [], isUserSpecific = false } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Only cache GET and HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    const userId = isUserSpecific ? ((req as any).user?.uid || 'anonymous') : 'public';
    const cacheKey = `http_cache:${userId}:${req.originalUrl || req.url}`;

    const cached = serverCache.get<{ body: any; etag: string; contentType: string }>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('ETag', cached.etag);
      res.setHeader('Cache-Control', `private, max-age=${ttlSeconds}`);

      // Handle conditional HTTP 304 Not Modified
      if (req.headers['if-none-match'] === cached.etag) {
        res.status(304).end();
        return;
      }

      res.status(200).json(cached.body);
      return;
    }

    res.setHeader('X-Cache', 'MISS');

    // Intercept res.json to capture response payload
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      // Only cache successful 200 responses with actual content
      if (res.statusCode === 200 && body !== undefined && body !== null) {
        try {
          const bodyStr = JSON.stringify(body);
          const etag = `"${crypto.createHash('md5').update(bodyStr).digest('hex')}"`;
          res.setHeader('ETag', etag);
          res.setHeader('Cache-Control', `private, max-age=${ttlSeconds}`);

          const evaluatedTags = typeof tags === 'function' ? tags(req) : tags;
          const finalTags = isUserSpecific
            ? [...evaluatedTags, `user_${userId}`, 'http_cache']
            : [...evaluatedTags, 'http_cache'];

          serverCache.set(
            cacheKey,
            { body, etag, contentType: 'application/json' },
            ttlSeconds,
            finalTags
          );
        } catch (e) {
          console.warn('[CacheMiddleware] Failed to serialize cache payload:', e);
        }
      }
      return originalJson(body);
    };

    next();
  };
}

/**
 * Middleware that automatically purges cached tags upon successful mutating requests (POST/PUT/PATCH/DELETE).
 */
export function invalidateCacheMiddleware(tags: string[]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        serverCache.invalidateTags(tags);
      }
    });
    next();
  };
}
