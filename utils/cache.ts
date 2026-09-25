/**
 * High-Performance In-Memory Cache with TTL and Tagged Invalidation
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  tags: string[];
}

class FastCache {
  private store = new Map<string, CacheEntry<any>>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlSeconds = 30, tags: string[] = []): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
      tags,
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  invalidateTags(tags: string[]): void {
    const tagSet = new Set(tags);
    for (const [key, entry] of this.store.entries()) {
      if (entry.tags.some((t) => tagSet.has(t))) {
        this.store.delete(key);
      }
    }
  }

  clear(): void {
    this.store.clear();
  }
}

export const serverCache = new FastCache();
