import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from '../redis/cache.service';
import { InMemoryCacheService } from '../redis/testing/in-memory-cache.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { SortOrder, TaskSortBy } from './dto/query-tasks.dto';
import { TaskPriority, TaskStatus } from './entities/task.entity';
import { BREAK_INVALIDATION_ENV } from './tasks.cache';
import { InMemoryTasksRepository } from './testing/in-memory-tasks.repository';
import { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('TasksService', () => {
  let service: TasksService;
  let repository: TasksRepository;
  let cache: InMemoryCacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: TasksRepository, useClass: InMemoryTasksRepository },
        { provide: CacheService, useClass: InMemoryCacheService },
      ],
    }).compile();

    service = module.get(TasksService);
    repository = module.get(TasksRepository);
    cache = module.get<InMemoryCacheService>(CacheService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const create = (dto: Partial<CreateTaskDto> = {}) =>
    service.create({ title: 'A task', ...dto } as CreateTaskDto);

  describe('create', () => {
    it('applies defaults for the fields the caller left out', async () => {
      const task = await create({ title: 'Write the docs' });

      expect(task).toMatchObject({
        title: 'Write the docs',
        description: null,
        status: TaskStatus.TODO,
        priority: TaskPriority.MEDIUM,
        dueDate: null,
        assignee: null,
        tags: [],
        completedAt: null,
      });
      expect(task.id).toHaveLength(36);
      expect(task.createdAt).toBe(task.updatedAt);
    });

    it('keeps the values the caller supplied', async () => {
      const task = await create({
        title: 'Ship it',
        description: 'Cut the release',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.URGENT,
        dueDate: '2026-12-01T10:00:00.000Z',
        assignee: 'alex',
      });

      expect(task).toMatchObject({
        description: 'Cut the release',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.URGENT,
        dueDate: '2026-12-01T10:00:00.000Z',
        assignee: 'alex',
      });
    });

    it('lowercases tags and drops blanks and duplicates', async () => {
      const task = await create({
        tags: ['Backend', 'backend', '  api ', '   '],
      });

      expect(task.tags).toEqual(['backend', 'api']);
    });

    it('stamps completedAt when the task is created already done', async () => {
      const task = await create({ status: TaskStatus.DONE });

      expect(task.completedAt).not.toBeNull();
    });

    it('gives each task its own id', async () => {
      expect((await create()).id).not.toBe((await create()).id);
    });
  });

  describe('findOne', () => {
    it('returns the stored task', async () => {
      const created = await create();

      expect(await service.findOne(created.id)).toEqual(created);
    });

    it('throws NotFoundException for an unknown id', async () => {
      await expect(service.findOne(MISSING_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    beforeEach(async () => {
      await create({
        title: 'Overdue chore',
        status: TaskStatus.TODO,
        priority: TaskPriority.LOW,
        dueDate: '2020-01-01T00:00:00.000Z',
        assignee: 'alex',
        tags: ['chore'],
      });
      await create({
        title: 'Write swagger docs',
        description: 'Document every endpoint',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.URGENT,
        dueDate: '2030-01-01T00:00:00.000Z',
        assignee: 'sam',
        tags: ['docs', 'api'],
      });
      await create({
        title: 'Finished work',
        status: TaskStatus.DONE,
        priority: TaskPriority.HIGH,
      });
    });

    it('returns every task with pagination metadata when no filters are given', async () => {
      const result = await service.findAll();

      expect(result.items).toHaveLength(3);
      expect(result.meta).toEqual({
        total: 3,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });
    });

    it('filters by status', async () => {
      const result = await service.findAll({ status: TaskStatus.DONE });

      expect(result.items.map((task) => task.title)).toEqual(['Finished work']);
      expect(result.meta.total).toBe(1);
    });

    it('filters by priority', async () => {
      const result = await service.findAll({ priority: TaskPriority.URGENT });

      expect(result.items.map((task) => task.title)).toEqual([
        'Write swagger docs',
      ]);
    });

    it('filters by assignee', async () => {
      const result = await service.findAll({ assignee: 'alex' });

      expect(result.items.map((task) => task.title)).toEqual(['Overdue chore']);
    });

    it('filters by tag regardless of the casing asked for', async () => {
      const result = await service.findAll({ tag: 'DOCS' });

      expect(result.items.map((task) => task.title)).toEqual([
        'Write swagger docs',
      ]);
    });

    it('searches title and description case-insensitively', async () => {
      expect((await service.findAll({ search: 'SWAGGER' })).items).toHaveLength(
        1,
      );
      expect(
        (await service.findAll({ search: 'every endpoint' })).items,
      ).toHaveLength(1);
      expect(
        (await service.findAll({ search: 'nothing matches this' })).items,
      ).toHaveLength(0);
    });

    it('keeps only past-due unfinished tasks when overdue is true', async () => {
      const result = await service.findAll({ overdue: true });

      expect(result.items.map((task) => task.title)).toEqual(['Overdue chore']);
    });

    it('excludes past-due unfinished tasks when overdue is false', async () => {
      const titles = (await service.findAll({ overdue: false })).items.map(
        (task) => task.title,
      );

      expect(titles).toHaveLength(2);
      expect(titles).not.toContain('Overdue chore');
    });

    it('combines filters', async () => {
      const result = await service.findAll({
        status: TaskStatus.TODO,
        assignee: 'sam',
      });

      expect(result.items).toHaveLength(0);
    });

    it('sorts by priority ascending', async () => {
      const result = await service.findAll({
        sortBy: TaskSortBy.PRIORITY,
        sortOrder: SortOrder.ASC,
      });

      expect(result.items.map((task) => task.priority)).toEqual([
        TaskPriority.LOW,
        TaskPriority.HIGH,
        TaskPriority.URGENT,
      ]);
    });

    it('sorts by title', async () => {
      const result = await service.findAll({
        sortBy: TaskSortBy.TITLE,
        sortOrder: SortOrder.ASC,
      });

      expect(result.items.map((task) => task.title)).toEqual([
        'Finished work',
        'Overdue chore',
        'Write swagger docs',
      ]);
    });

    it('sorts undated tasks last when sorting by due date', async () => {
      const ascending = await service.findAll({
        sortBy: TaskSortBy.DUE_DATE,
        sortOrder: SortOrder.ASC,
      });
      const descending = await service.findAll({
        sortBy: TaskSortBy.DUE_DATE,
        sortOrder: SortOrder.DESC,
      });

      expect(ascending.items.at(-1)?.dueDate).toBeNull();
      expect(descending.items.at(-1)?.dueDate).toBeNull();
      expect(ascending.items[0].dueDate).toBe('2020-01-01T00:00:00.000Z');
      expect(descending.items[0].dueDate).toBe('2030-01-01T00:00:00.000Z');
    });

    it('sorts by the most recently updated', async () => {
      const target = (
        await service.findAll({
          sortBy: TaskSortBy.TITLE,
          sortOrder: SortOrder.ASC,
        })
      ).items[0];
      jest.useFakeTimers().setSystemTime(new Date(Date.now() + 60_000));
      await service.update(target.id, { title: 'Just touched' });
      jest.useRealTimers();

      const newestFirst = await service.findAll({
        sortBy: TaskSortBy.UPDATED_AT,
        sortOrder: SortOrder.DESC,
      });
      const oldestFirst = await service.findAll({
        sortBy: TaskSortBy.UPDATED_AT,
        sortOrder: SortOrder.ASC,
      });

      expect(newestFirst.items[0].title).toBe('Just touched');
      expect(oldestFirst.items.at(-1)?.title).toBe('Just touched');
    });

    it('breaks ties by id so repeated queries agree', async () => {
      const first = await create({
        title: 'Tie',
        dueDate: '2031-01-01T00:00:00.000Z',
      });
      const second = await create({
        title: 'Tie',
        dueDate: '2031-01-01T00:00:00.000Z',
      });

      const tiedIds = async () =>
        (
          await service.findAll({
            sortBy: TaskSortBy.DUE_DATE,
            sortOrder: SortOrder.ASC,
          })
        ).items
          .filter((task) => task.title === 'Tie')
          .map((task) => task.id);

      expect(await tiedIds()).toEqual([first.id, second.id].sort());
      expect(await tiedIds()).toEqual(await tiedIds());
    });

    it('paginates and reports the surrounding pages', async () => {
      const page2 = await service.findAll({
        page: 2,
        limit: 2,
        sortBy: TaskSortBy.TITLE,
        sortOrder: SortOrder.ASC,
      });

      expect(page2.items.map((task) => task.title)).toEqual([
        'Write swagger docs',
      ]);
      expect(page2.meta).toEqual({
        total: 3,
        page: 2,
        limit: 2,
        totalPages: 2,
        hasNextPage: false,
        hasPreviousPage: true,
      });
    });

    it('returns an empty page past the end of the list', async () => {
      const result = await service.findAll({ page: 9, limit: 2 });

      expect(result.items).toEqual([]);
      expect(result.meta.total).toBe(3);
    });
  });

  describe('update', () => {
    it('applies only the fields present in the patch', async () => {
      const created = await create({ title: 'Before', description: 'Keep me' });

      const updated = await service.update(created.id, { title: 'After' });

      expect(updated.title).toBe('After');
      expect(updated.description).toBe('Keep me');
      expect(updated.id).toBe(created.id);
      expect(updated.createdAt).toBe(created.createdAt);
    });

    it('stamps completedAt when the task moves to DONE', async () => {
      const created = await create();

      const updated = await service.update(created.id, {
        status: TaskStatus.DONE,
      });

      expect(updated.status).toBe(TaskStatus.DONE);
      expect(updated.completedAt).not.toBeNull();
    });

    it('clears completedAt when the task moves back out of DONE', async () => {
      const created = await create({ status: TaskStatus.DONE });

      const updated = await service.update(created.id, {
        status: TaskStatus.IN_PROGRESS,
      });

      expect(updated.completedAt).toBeNull();
    });

    it('leaves completedAt alone when the status is re-sent unchanged', async () => {
      const created = await create({ status: TaskStatus.DONE });

      const updated = await service.update(created.id, {
        status: TaskStatus.DONE,
      });

      expect(updated.completedAt).toBe(created.completedAt);
    });

    it('normalizes tags on update', async () => {
      const created = await create({ tags: ['old'] });

      const updated = await service.update(created.id, {
        tags: ['NEW', 'new', ' also '],
      });

      expect(updated.tags).toEqual(['new', 'also']);
    });

    it('moves updatedAt forward and leaves createdAt alone', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const created = await create();
      jest.setSystemTime(new Date('2026-01-01T00:00:05.000Z'));

      const updated = await service.update(created.id, { title: 'Touched' });

      expect(updated.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(updated.updatedAt).toBe('2026-01-01T00:00:05.000Z');
      jest.useRealTimers();
    });

    it('throws NotFoundException for an unknown id', async () => {
      await expect(
        service.update(MISSING_ID, { title: 'Nope' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes the task', async () => {
      const created = await create();

      await service.remove(created.id);

      expect(await repository.findById(created.id)).toBeUndefined();
      expect((await service.findAll()).meta.total).toBe(0);
    });

    it('throws NotFoundException for an unknown id', async () => {
      await expect(service.remove(MISSING_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getStats', () => {
    it('reports zeroes for an empty tracker', async () => {
      const stats = await service.getStats();

      expect(stats.total).toBe(0);
      expect(stats.completionRate).toBe(0);
      expect(stats.overdue).toBe(0);
      expect(stats.byStatus[TaskStatus.TODO]).toBe(0);
      expect(stats.byPriority[TaskPriority.LOW]).toBe(0);
    });

    it('counts by status and priority, and rates completion', async () => {
      await create({ status: TaskStatus.DONE, priority: TaskPriority.HIGH });
      await create({ status: TaskStatus.DONE, priority: TaskPriority.LOW });
      await create({ status: TaskStatus.TODO, priority: TaskPriority.LOW });
      await create({ status: TaskStatus.BLOCKED, priority: TaskPriority.URGENT });

      const stats = await service.getStats();

      expect(stats.total).toBe(4);
      expect(stats.byStatus).toEqual({
        [TaskStatus.TODO]: 1,
        [TaskStatus.IN_PROGRESS]: 0,
        [TaskStatus.BLOCKED]: 1,
        [TaskStatus.DONE]: 2,
      });
      expect(stats.byPriority).toEqual({
        [TaskPriority.LOW]: 2,
        [TaskPriority.MEDIUM]: 0,
        [TaskPriority.HIGH]: 1,
        [TaskPriority.URGENT]: 1,
      });
      expect(stats.completionRate).toBe(0.5);
    });

    it('counts past-due tasks that are not done as overdue', async () => {
      await create({ dueDate: '2020-01-01T00:00:00.000Z' });
      await create({
        dueDate: '2020-01-01T00:00:00.000Z',
        status: TaskStatus.DONE,
      });
      await create({ dueDate: '2030-01-01T00:00:00.000Z' });

      expect((await service.getStats()).overdue).toBe(1);
    });
  });

  describe('list cache', () => {
    it('serves a repeated identical query without recomputing it', async () => {
      await create({ title: 'Cached' });
      await service.findAll();
      const writesAfterFirst = cache.writes;

      await service.findAll();

      expect(cache.writes).toBe(writesAfterFirst);
    });

    it('caches each distinct query separately', async () => {
      await create({ title: 'Cached' });

      await service.findAll();
      await service.findAll({ page: 2 });
      await service.findAll({ status: TaskStatus.TODO });

      expect(new Set(pageKeys(cache)).size).toBe(3);
    });

    it('gives every cached page a TTL', async () => {
      await create({ title: 'Cached' });
      await service.findAll();
      const [pageKey] = pageKeys(cache);

      expect(cache.ttlOf(pageKey)).toBeGreaterThan(0);
    });

    it('reports a MISS with the key it wrote, then a HIT on the same query', async () => {
      await create({ title: 'Cached' });

      const miss = await service.findAllWithCacheInfo();
      const hit = await service.findAllWithCacheInfo();

      expect(miss.cache).toMatchObject({ status: 'MISS', ageSeconds: 0 });
      expect(miss.cache.key).toMatch(/^tasks:list:v\d+:/);
      expect(hit.cache).toMatchObject({ status: 'HIT', key: miss.cache.key });
      expect(hit.page).toEqual(miss.page);
    });

    it('reports how old the snapshot it served is', async () => {
      await create({ title: 'Cached' });
      await service.findAllWithCacheInfo();
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 45_000);

      expect((await service.findAllWithCacheInfo()).cache.ageSeconds).toBe(45);
    });

    // Without a readable version counter the service cannot tell which
    // generation a cached page belongs to, so it must not serve one.
    it('reports a BYPASS and caches nothing when Redis is unreachable', async () => {
      await create({ title: 'Uncached' });
      jest.spyOn(cache, 'version').mockResolvedValue(undefined);

      const result = await service.findAllWithCacheInfo();

      expect(result.cache).toEqual({
        status: 'BYPASS',
        key: null,
        ageSeconds: null,
      });
      expect(pageKeys(cache)).toEqual([]);
      expect(result.page.items).toHaveLength(1);
    });

    it('treats an entry written by an older build as a miss', async () => {
      await create({ title: 'Legacy' });
      const key = (await service.findAllWithCacheInfo()).cache.key as string;
      // The pre-envelope shape: a bare page carrying no cachedAt.
      await cache.set(key, { items: [], meta: { total: 0 } }, 60);

      const result = await service.findAllWithCacheInfo();

      expect(result.cache.status).toBe('MISS');
      expect(result.page.items).toHaveLength(1);
    });

    // Each of these once left a cached page readable, so the list went on
    // serving a snapshot taken before the write.
    it('reflects a newly created task in an already-cached list', async () => {
      await create({ title: 'First' });
      await service.findAll();

      await create({ title: 'Second' });

      expect((await service.findAll()).meta.total).toBe(2);
    });

    it('reflects an update in an already-cached list', async () => {
      const created = await create({ title: 'Before' });
      await service.findAll();

      await service.update(created.id, { title: 'After' });

      expect((await service.findAll()).items[0].title).toBe('After');
    });

    it('reflects a delete in an already-cached list', async () => {
      const created = await create();
      await service.findAll();

      await service.remove(created.id);

      expect((await service.findAll()).meta.total).toBe(0);
    });

    it('invalidates every cached query variant, not just the default one', async () => {
      await create({ title: 'First' });
      await service.findAll();
      await service.findAll({ page: 1, limit: 5 });

      await create({ title: 'Second' });

      expect((await service.findAll()).meta.total).toBe(2);
      expect((await service.findAll({ page: 1, limit: 5 })).meta.total).toBe(2);
    });

    // repository.clear() truncates without touching the cache, so callers
    // reset through the service instead.
    it('reflects a service-level clear in an already-cached list', async () => {
      await create();
      await service.findAll();

      await service.clear();

      expect((await service.findAll()).meta.total).toBe(0);
    });
  });

  describe('repository contract', () => {
    it('clears every task', async () => {
      await create();
      await create();

      await repository.clear();

      expect(await repository.findAll()).toEqual([]);
    });

    it('reports no result when updating an unknown id', async () => {
      expect(
        await repository.update(MISSING_ID, { title: 'Nope' }),
      ).toBeUndefined();
    });

    it('reports whether a delete removed anything', async () => {
      const created = await create();

      expect(await repository.delete(created.id)).toBe(true);
      expect(await repository.delete(created.id)).toBe(false);
    });
  });

  it('does not let callers mutate stored state through returned objects', async () => {
    const created = await create({ tags: ['api'] });

    created.title = 'Mutated';
    created.tags.push('injected');

    const stored = await service.findOne(created.id);
    expect(stored.title).toBe('A task');
    expect(stored.tags).toEqual(['api']);
  });
});

// The flag is read once at construction, so this needs its own module.
describe('TasksService with invalidation broken', () => {
  let service: TasksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: TasksRepository, useClass: InMemoryTasksRepository },
        { provide: CacheService, useClass: InMemoryCacheService },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === BREAK_INVALIDATION_ENV ? 'true' : undefined,
          },
        },
      ],
    }).compile();

    service = module.get(TasksService);
  });

  const create = (title: string) => service.create({ title } as CreateTaskDto);

  it('reports that invalidation is switched off', () => {
    expect(service.cacheInvalidationEnabled).toBe(false);
  });

  // The bug the switch reproduces: the write reaches the repository, but the
  // page cached before it stays readable, so the list denies the row exists.
  it('keeps serving a cached list that predates a created task', async () => {
    await create('First');
    expect((await service.findAllWithCacheInfo()).cache.status).toBe('MISS');

    await create('Second');
    const after = await service.findAllWithCacheInfo();

    expect(after.cache.status).toBe('HIT');
    expect(after.page.items.map((task) => task.title)).toEqual(['First']);
    expect(after.page.meta.total).toBe(1);

    // Stats read straight through, so only the list is out of date.
    expect((await service.getStats()).total).toBe(2);
  });

  it('still retires cached pages on clear, so fixtures are not inherited', async () => {
    await create('First');
    await service.findAll();

    await service.clear();
    const result = await service.findAllWithCacheInfo();

    expect(result.cache.status).toBe('MISS');
    expect(result.page.items).toEqual([]);
  });
});

/** Cached list pages only -- never the namespace counter. */
function pageKeys(cache: InMemoryCacheService): string[] {
  return cache.keys().filter((key) => /^tasks:list:v\d+:/.test(key));
}
