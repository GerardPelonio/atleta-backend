/**
 * High-Performance In-Memory Cache with TTL, Tagged Invalidation, and In-Flight Request Deduplication
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  tags: string[];
}

class FastCache {
  private store = new Map<string, CacheEntry<any>>();
  private inFlight = new Map<string, Promise<any>>();

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

  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds = 30,
    tags: string[] = []
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    const running = this.inFlight.get(key);
    if (running) {
      return running as Promise<T>;
    }

    const promise = (async () => {
      try {
        const result = await fetchFn();
        if (result !== undefined && result !== null) {
          this.set(key, result, ttlSeconds, tags);
        }
        return result;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }

  delete(key: string): void {
    this.store.delete(key);
    this.inFlight.delete(key);
  }

  invalidateTags(tags: string[]): void {
    const tagSet = new Set(tags);
    for (const [key, entry] of this.store.entries()) {
      if (entry.tags.some((t) => tagSet.has(t))) {
        this.store.delete(key);
        this.inFlight.delete(key);
      }
    }
  }

  clear(): void {
    this.store.clear();
    this.inFlight.clear();
  }
}

export const serverCache = new FastCache();

