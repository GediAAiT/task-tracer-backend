import { Injectable } from '@nestjs/common';

@Injectable()
export class InMemoryCacheService {
  private readonly entries = new Map<string, string>();
  private readonly ttls = new Map<string, number>();

  writes = 0;

  async get<T>(key: string): Promise<T | undefined> {
    const raw = this.entries.get(key);
    return raw === undefined ? undefined : (JSON.parse(raw) as T);
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    this.entries.set(key, JSON.stringify(value));
    this.ttls.set(key, ttlSeconds);
    this.writes += 1;
  }

  async del(...keys: string[]): Promise<void> {
    for (const key of keys) {
      this.entries.delete(key);
      this.ttls.delete(key);
    }
  }

  async version(key: string): Promise<number | undefined> {
    const raw = this.entries.get(key);
    return raw === undefined ? 0 : Number(JSON.parse(raw));
  }

  async bumpVersion(key: string): Promise<void> {
    const current = (await this.version(key)) ?? 0;
    this.entries.set(key, JSON.stringify(current + 1));
  }

  keys(): string[] {
    return Array.from(this.entries.keys());
  }

  ttlOf(key: string): number | undefined {
    return this.ttls.get(key);
  }

  clear(): void {
    this.entries.clear();
    this.ttls.clear();
    this.writes = 0;
  }
}
