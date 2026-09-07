import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await this.client.get(key);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    } catch (error) {
      this.logger.warn(`get(${key}) failed: ${describe(error)}`);
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(`set(${key}) failed: ${describe(error)}`);
    }
  }

  /** 0 when unset, undefined when Redis is unreachable. */
  async version(key: string): Promise<number | undefined> {
    try {
      const raw = await this.client.get(key);
      if (raw === null) return 0;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    } catch (error) {
      this.logger.warn(`version(${key}) failed: ${describe(error)}`);
      return undefined;
    }
  }

  async bumpVersion(key: string): Promise<void> {
    try {
      await this.client.incr(key);
    } catch (error) {
      this.logger.warn(`bumpVersion(${key}) failed: ${describe(error)}`);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.client.del(...keys);
    } catch (error) {
      this.logger.warn(`del(${keys.join(', ')}) failed: ${describe(error)}`);
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
