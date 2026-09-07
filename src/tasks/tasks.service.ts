import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../redis/cache.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { PaginatedTasksDto } from './dto/paginated-tasks.dto';
import { QueryTasksDto, SortOrder, TaskSortBy } from './dto/query-tasks.dto';
import { TaskStatsDto } from './dto/task-stats.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { Task, TaskPriority, TaskStatus } from './entities/task.entity';
import {
  ageInSeconds,
  BREAK_INVALIDATION_ENV,
  CachedListPage,
  CachedListResult,
  isCachedListPage,
  isInvalidationBroken,
  listCacheKey,
  TASKS_LIST_TTL_SECONDS,
  TASKS_LIST_VERSION_KEY,
} from './tasks.cache';
import { TasksRepository } from './tasks.repository';

const PRIORITY_RANK: Record<TaskPriority, number> = {
  [TaskPriority.LOW]: 0,
  [TaskPriority.MEDIUM]: 1,
  [TaskPriority.HIGH]: 2,
  [TaskPriority.URGENT]: 3,
};

const NO_DUE_DATE = Number.MAX_SAFE_INTEGER;

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  private readonly invalidationEnabled: boolean;

  constructor(
    private readonly repository: TasksRepository,
    private readonly cache: CacheService,
    // Optional so unit tests can construct the service without a config
    // module; absent config leaves the switch off, which is the safe default.
    @Optional() config?: ConfigService,
  ) {
    this.invalidationEnabled = !isInvalidationBroken(
      config?.get<string>(BREAK_INVALIDATION_ENV),
    );

    if (!this.invalidationEnabled) {
      this.logger.warn(
        `${BREAK_INVALIDATION_ENV} is set: writes will not retire cached list ` +
          `pages, so GET /tasks can serve rows up to ` +
          `${TASKS_LIST_TTL_SECONDS}s out of date.`,
      );
    }
  }

  /** Whether writes still retire cached pages. Reported to clients in a header. */
  get cacheInvalidationEnabled(): boolean {
    return this.invalidationEnabled;
  }

  async create(dto: CreateTaskDto): Promise<Task> {
    const status = dto.status ?? TaskStatus.TODO;

    const task = await this.repository.create({
      title: dto.title,
      description: dto.description ?? null,
      status,
      priority: dto.priority ?? TaskPriority.MEDIUM,
      dueDate: dto.dueDate ? new Date(dto.dueDate).toISOString() : null,
      assignee: dto.assignee ?? null,
      tags: normalizeTags(dto.tags),
      completedAt: status === TaskStatus.DONE ? new Date().toISOString() : null,
    });

    await this.invalidateLists();

    return task;
  }

  async findAll(query: QueryTasksDto = {}): Promise<PaginatedTasksDto> {
    return (await this.findAllWithCacheInfo(query)).page;
  }

  /**
   * findAll plus which source answered.
   *
   * The controller uses this one so it can tell clients whether they are
   * looking at Redis or at the database; a cached page and a fresh page are
   * otherwise indistinguishable.
   */
  async findAllWithCacheInfo(
    query: QueryTasksDto = {},
  ): Promise<CachedListResult> {
    // undefined means Redis is unreachable: serve straight from the repository.
    const version = await this.cache.version(TASKS_LIST_VERSION_KEY);
    const cacheKey =
      version === undefined ? undefined : listCacheKey(query, version);

    if (cacheKey) {
      const cached = await this.cache.get<unknown>(cacheKey);
      if (isCachedListPage(cached)) {
        return {
          page: cached.page,
          cache: {
            status: 'HIT',
            key: cacheKey,
            ageSeconds: ageInSeconds(cached.cachedAt),
          },
        };
      }
    }

    const page = this.computePage(await this.repository.findAll(), query);

    if (!cacheKey) {
      return { page, cache: { status: 'BYPASS', key: null, ageSeconds: null } };
    }

    const entry: CachedListPage = { cachedAt: Date.now(), page };
    await this.cache.set(cacheKey, entry, TASKS_LIST_TTL_SECONDS);

    return { page, cache: { status: 'MISS', key: cacheKey, ageSeconds: 0 } };
  }

  /** Filters, sorts and slices in memory. Nothing to do with the cache. */
  private computePage(tasks: Task[], query: QueryTasksDto): PaginatedTasksDto {
    const {
      page = 1,
      limit = 20,
      sortBy = TaskSortBy.CREATED_AT,
      sortOrder = SortOrder.DESC,
    } = query;

    const matched = tasks.filter((task) => matches(task, query));
    matched.sort(comparator(sortBy, sortOrder));

    const totalPages = Math.ceil(matched.length / limit);
    const start = (page - 1) * limit;

    return {
      items: matched.slice(start, start + limit),
      meta: {
        total: matched.length,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1 && matched.length > 0,
      },
    };
  }

  async findOne(id: string): Promise<Task> {
    const task = await this.repository.findById(id);
    if (!task) throw new NotFoundException(`Task with id ${id} was not found`);
    return task;
  }

  async update(id: string, dto: UpdateTaskDto): Promise<Task> {
    const existing = await this.findOne(id);
    const patch: Partial<Task> = {};

    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.priority !== undefined) patch.priority = dto.priority;
    if (dto.assignee !== undefined) patch.assignee = dto.assignee;
    if (dto.tags !== undefined) patch.tags = normalizeTags(dto.tags);
    if (dto.dueDate !== undefined)
      patch.dueDate = new Date(dto.dueDate).toISOString();

    if (dto.status !== undefined && dto.status !== existing.status) {
      patch.status = dto.status;
      patch.completedAt =
        dto.status === TaskStatus.DONE ? new Date().toISOString() : null;
    }


    const updated = (await this.repository.update(id, patch)) as Task;

    await this.invalidateLists();

    return updated;
  }

  async remove(id: string): Promise<void> {
    if (!(await this.repository.delete(id))) {
      throw new NotFoundException(`Task with id ${id} was not found`);
    }

    await this.invalidateLists();
  }

  /** Removes every task, cache included. Test and fixture setup only. */
  async clear(): Promise<void> {
    await this.repository.clear();
    // Bumps unconditionally, even with the break switch on: this is fixture
    // setup, and a test inheriting the previous test's cached rows would fail
    // for reasons unrelated to what it asserts.
    await this.cache.bumpVersion(TASKS_LIST_VERSION_KEY);
  }

  private async invalidateLists(): Promise<void> {
    if (!this.invalidationEnabled) return;
    await this.cache.bumpVersion(TASKS_LIST_VERSION_KEY);
  }

  async getStats(): Promise<TaskStatsDto> {
    const tasks = await this.repository.findAll();

    const byStatus = Object.fromEntries(
      Object.values(TaskStatus).map((status) => [status, 0]),
    ) as Record<TaskStatus, number>;
    const byPriority = Object.fromEntries(
      Object.values(TaskPriority).map((priority) => [priority, 0]),
    ) as Record<TaskPriority, number>;

    let overdue = 0;
    for (const task of tasks) {
      byStatus[task.status] += 1;
      byPriority[task.priority] += 1;
      if (isOverdue(task)) overdue += 1;
    }

    return {
      total: tasks.length,
      byStatus,
      byPriority,
      overdue,
      completionRate: tasks.length
        ? Number((byStatus[TaskStatus.DONE] / tasks.length).toFixed(4))
        : 0,
    };
  }
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (trimmed) seen.add(trimmed.toLowerCase());
  }
  return Array.from(seen);
}

function isOverdue(task: Task, now = Date.now()): boolean {
  return (
    task.status !== TaskStatus.DONE &&
    task.dueDate !== null &&
    new Date(task.dueDate).getTime() < now
  );
}

function matches(task: Task, query: QueryTasksDto): boolean {
  if (query.status && task.status !== query.status) return false;
  if (query.priority && task.priority !== query.priority) return false;
  if (query.assignee && task.assignee !== query.assignee) return false;
  if (query.tag && !task.tags.includes(query.tag.trim().toLowerCase()))
    return false;
  if (query.overdue !== undefined && isOverdue(task) !== query.overdue)
    return false;

  if (query.search) {
    const needle = query.search.toLowerCase();
    const haystack = `${task.title} ${task.description ?? ''}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  return true;
}

function comparator(sortBy: TaskSortBy, sortOrder: SortOrder) {
  const direction = sortOrder === SortOrder.ASC ? 1 : -1;

  return (a: Task, b: Task): number => {
    let result: number;

    switch (sortBy) {
      case TaskSortBy.PRIORITY:
        result = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        break;
      case TaskSortBy.TITLE:
        result = a.title.localeCompare(b.title);
        break;
      case TaskSortBy.DUE_DATE: {
        const left = a.dueDate ? new Date(a.dueDate).getTime() : NO_DUE_DATE;
        const right = b.dueDate ? new Date(b.dueDate).getTime() : NO_DUE_DATE;
        if (left === right) result = 0;

        else if (left === NO_DUE_DATE) return 1;
        else if (right === NO_DUE_DATE) return -1;
        else result = left - right;
        break;
      }
      case TaskSortBy.UPDATED_AT:
        result = Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
        break;
      default:
        result = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    }


    return (result || a.id.localeCompare(b.id)) * direction;
  };
}
