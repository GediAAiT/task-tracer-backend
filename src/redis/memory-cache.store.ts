const MAX_ENTRIES = 1000;

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

export class MemoryCacheStore {
  private readonly entries = new Map<string, MemoryEntry>();

  get(key: string): string | null {
    const entry = this.entries.get(key);
    if (entry === undefined) return null;

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key: string, value: string, ttlSeconds?: number): void {
    this.entries.delete(key);
    this.evictIfFull();
    this.entries.set(key, {
      value,
      expiresAt:
        ttlSeconds === undefined
          ? Number.POSITIVE_INFINITY
          : Date.now() + ttlSeconds * 1000,
    });
  }

  incr(key: string): void {
    const current = Number(this.get(key) ?? 0);
    this.set(key, String((Number.isFinite(current) ? current : 0) + 1));
  }

  del(keys: string[]): void {
    for (const key of keys) this.entries.delete(key);
  }

  private evictIfFull(): void {
    if (this.entries.size < MAX_ENTRIES) return;

    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }

    for (const [key, entry] of this.entries) {
      if (this.entries.size < MAX_ENTRIES) return;
      if (Number.isFinite(entry.expiresAt)) this.entries.delete(key);
    }
  }
}
