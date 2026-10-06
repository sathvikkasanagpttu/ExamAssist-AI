/**
 * ExamAssist AI - In-Memory TTL Cache
 * Provides high-speed caching for search results and classifications.
 */

export class MemoryCache {
  constructor(defaultTtlMs = 1000 * 60 * 15) { // 15 minutes default
    this.cache = new Map();
    this.defaultTtlMs = defaultTtlMs;
  }

  generateKey(prefix, data) {
    if (typeof data === "string") {
      return `${prefix}:${data.trim().toLowerCase()}`;
    }
    return `${prefix}:${JSON.stringify(data)}`;
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    // Evict oldest entries if cache exceeds 1,000 items
    if (this.cache.size >= 1000) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

export const globalCache = new MemoryCache();
