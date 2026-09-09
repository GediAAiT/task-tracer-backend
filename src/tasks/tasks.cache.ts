import { PaginatedTasksDto } from './dto/paginated-tasks.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
export const TASKS_LIST_TTL_SECONDS = 60 * 60 * 24 * 90;

export const TASKS_LIST_VERSION_KEY = 'tasks:list-version';

const KEY_PREFIX = 'tasks:list';

export function listCacheKey(query: QueryTasksDto, version: number): string {
  const parts = Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`);

  return `${KEY_PREFIX}:v${version}:${parts.join('&')}`;
}

export const CACHE_HEADERS = {
  status: 'X-Cache',
  key: 'X-Cache-Key',
  age: 'X-Cache-Age',
  invalidation: 'X-Cache-Invalidation',
} as const;

export const BREAK_INVALIDATION_ENV = 'TASKS_CACHE_BREAK_INVALIDATION';

export type CacheStatus = 'HIT' | 'MISS' | 'BYPASS';

export interface CacheOutcome {
  status: CacheStatus;
  key: string | null;
  ageSeconds: number | null;
}

export interface CachedListResult {
  page: PaginatedTasksDto;
  cache: CacheOutcome;
}

export interface CachedListPage {
  cachedAt: number;
  page: PaginatedTasksDto;
}

export function ageInSeconds(cachedAt: number, now = Date.now()): number {
  return Math.max(0, Math.round((now - cachedAt) / 1000));
}

export function isCachedListPage(value: unknown): value is CachedListPage {
  const candidate = value as CachedListPage | null;
  return (
    typeof candidate?.cachedAt === 'number' &&
    typeof candidate.page === 'object' &&
    candidate.page !== null
  );
}

export function isInvalidationBroken(raw: string | undefined): boolean {
  return raw === 'true' || raw === '1';
}
