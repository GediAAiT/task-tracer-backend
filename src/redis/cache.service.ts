import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { MemoryCacheStore } from './memory-cache.store';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  private readonly memory = new MemoryCacheStore();

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis | null) {}

  async get<T>(key: string): Promise<T | undefined> {
    const redis = this.redis();
    try {
      const raw = redis ? await redis.get(key) : this.memory.get(key);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    } catch (error) {
      this.logger.warn(`get(${key}) failed: ${describe(error)}`);
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const redis = this.redis();
    try {
      const raw = JSON.stringify(value);
      if (redis) await redis.set(key, raw, 'EX', ttlSeconds);
      else this.memory.set(key, raw, ttlSeconds);
    } catch (error) {
      this.logger.warn(`set(${key}) failed: ${describe(error)}`);
    }
  } 
  async version(key: string): Promise<number | undefined> {
    const redis = this.redis();
    try {
      const raw = redis ? await redis.get(key) : this.memory.get(key);
      if (raw === null) return 0;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    } catch (error) {
      this.logger.warn(`version(${key}) failed: ${describe(error)}`);
      return undefined;
    }
  }

  async bumpVersion(key: string): Promise<void> {
    this.memory.incr(key);
    const redis = this.redis();
    if (!redis) return;
    try {
      await redis.incr(key);
    } catch (error) {
      this.logger.warn(`bumpVersion(${key}) failed: ${describe(error)}`);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    this.memory.del(keys);
    const redis = this.redis();
    if (!redis) return;
    try {
      await redis.del(...keys);
    } catch (error) {
      this.logger.warn(`del(${keys.join(', ')}) failed: ${describe(error)}`);
    }
  }

  private redis(): Redis | null {
    return this.client?.status === 'ready' ? this.client : null;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
