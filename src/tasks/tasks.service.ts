import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateTaskDto } from './dto/create-task.dto';
import { PaginatedTasksDto } from './dto/paginated-tasks.dto';
import { QueryTasksDto, SortOrder, TaskSortBy } from './dto/query-tasks.dto';
import { TaskStatsDto } from './dto/task-stats.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { Task, TaskPriority, TaskStatus } from './entities/task.entity';
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
  constructor(private readonly repository: TasksRepository) {}

  create(dto: CreateTaskDto): Promise<Task> {
    const status = dto.status ?? TaskStatus.TODO;

    return this.repository.create({
      title: dto.title,
      description: dto.description ?? null,
      status,
      priority: dto.priority ?? TaskPriority.MEDIUM,
      dueDate: dto.dueDate ? new Date(dto.dueDate).toISOString() : null,
      assignee: dto.assignee ?? null,
      tags: normalizeTags(dto.tags),
      completedAt: status === TaskStatus.DONE ? new Date().toISOString() : null,
    });
  }

  async findAll(query: QueryTasksDto = {}): Promise<PaginatedTasksDto> {
    const {
      page = 1,
      limit = 20,
      sortBy = TaskSortBy.CREATED_AT,
      sortOrder = SortOrder.DESC,
    } = query;

    const matched = (await this.repository.findAll()).filter((task) =>
      matches(task, query),
    );
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


    return (await this.repository.update(id, patch)) as Task;
  }

  async remove(id: string): Promise<void> {
    if (!(await this.repository.delete(id))) {
      throw new NotFoundException(`Task with id ${id} was not found`);
    }
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
