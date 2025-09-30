import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { Logger } from 'nestjs-pino';

@Injectable()
export class CacheService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly logger: Logger,
  ) {}

  /**
   * Get value by key
   */
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = await this.cacheManager.get<T>(key);
      this.logger.debug({ key, value }, 'Cache hit');
      return value;
    } catch (error) {
      this.logger.error({ err: error, key }, 'Error getting cache key');
      return undefined;
    }
  }

  /**
   * Set value with optional TTL (in ms)
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      await this.cacheManager.set(key, value, ttl);
      this.logger.debug({ key, ttl }, 'Cache set');
    } catch (error) {
      this.logger.error({ err: error, key }, 'Error setting cache key');
    }
  }

  /**
   * Delete a cache key
   */
  async delete(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
      this.logger.debug({ key }, 'Cache deleted');
    } catch (error) {
      this.logger.error({ err: error, key }, 'Error deleting cache key');
    }
  }

  /**
   * Check if a key exists
   */
  async has(key: string): Promise<boolean> {
    try {
      const exists = (await this.cacheManager.get(key)) !== undefined;
      this.logger.debug({ key, exists }, 'Cache existence check');
      return exists;
    } catch (error) {
      this.logger.error({ err: error, key }, 'Error checking cache existence');
      return false;
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    try {
      await this.cacheManager.clear();
      this.logger.warn('Cache cleared');
    } catch (error) {
      this.logger.error({ err: error }, 'Error resetting cache');
    }
  }

  /**
   * Get value or set it using a fetcher if not present
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await fetcher();
    await this.set(key, value, ttl);
    return value;
  }

  /**
   * Utility to build namespaced keys
   */
  buildKey(...parts: (string | number | null | undefined)[]): string {
    return parts.filter(Boolean).join(':');
  }
}
