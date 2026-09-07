import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { CreateTaskDto } from '../dto/create-task.dto';
import { PaginatedTasksDto } from '../dto/paginated-tasks.dto';
import { SortOrder, TaskSortBy } from '../dto/query-tasks.dto';
import { Task, TaskPriority, TaskStatus } from '../entities/task.entity';
import { CACHE_HEADERS } from '../tasks.cache';
import { TasksController } from './tasks.controller';
import { TasksService } from '../tasks.service';

const TASK_ID = '3f7c1c0e-9a5b-4a1e-b0d2-5c9a2f1e7b41';

const task: Task = {
  id: TASK_ID,
  title: 'Ship the tracer API',
  description: null,
  status: TaskStatus.TODO,
  priority: TaskPriority.MEDIUM,
  dueDate: null,
  assignee: null,
  tags: [],
  completedAt: null,
  createdAt: '2026-09-03T09:12:44.001Z',
  updatedAt: '2026-09-03T09:12:44.001Z',
};

const page: PaginatedTasksDto = {
  items: [task],
  meta: {
    total: 1,
    page: 1,
    limit: 20,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
};

const CACHE_KEY = 'tasks:list:v3:limit=20&page=1';

/** Records what the controller wrote, standing in for an express response. */
function responseStub() {
  const headers = new Map<string, string>();

  return {
    headers,
    setHeader: jest.fn((name: string, value: string | number) => {
      headers.set(name, String(value));
    }),
  };
}

describe('TasksController', () => {
  let controller: TasksController;
  let service: jest.Mocked<TasksService>;

  beforeEach(async () => {
    const serviceMock: Partial<jest.Mocked<TasksService>> = {
      create: jest.fn().mockResolvedValue(task),
      findAllWithCacheInfo: jest.fn().mockResolvedValue({
        page,
        cache: { status: 'HIT', key: CACHE_KEY, ageSeconds: 12 },
      }),
      cacheInvalidationEnabled: true,
      findOne: jest.fn().mockResolvedValue(task),
      update: jest.fn().mockResolvedValue({ ...task, title: 'Renamed' }),
      remove: jest.fn().mockResolvedValue(undefined),
      getStats: jest.fn().mockResolvedValue({
        total: 1,
        byStatus: { TODO: 1, IN_PROGRESS: 0, BLOCKED: 0, DONE: 0 },
        byPriority: { LOW: 0, MEDIUM: 1, HIGH: 0, URGENT: 0 },
        overdue: 0,
        completionRate: 0,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [{ provide: TasksService, useValue: serviceMock }],
    }).compile();

    controller = module.get(TasksController);
    service = module.get(TasksService);
  });

  it('hands the create payload to the service', async () => {
    const dto: CreateTaskDto = { title: 'Ship the tracer API' };

    await expect(controller.create(dto)).resolves.toEqual(task);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('passes the query through and returns the page', async () => {
    const query = {
      status: TaskStatus.TODO,
      page: 2,
      limit: 5,
      sortBy: TaskSortBy.DUE_DATE,
      sortOrder: SortOrder.ASC,
    };

    const result = await controller.findAll(
      query,
      responseStub() as unknown as Response,
    );

    expect(result.items).toEqual([task]);
    expect(result.meta.total).toBe(1);
    expect(service.findAllWithCacheInfo).toHaveBeenCalledWith(query);
  });

  it('reports the cache status, age and key of the page it served', async () => {
    const response = responseStub();

    await controller.findAll({}, response as unknown as Response);

    expect(Object.fromEntries(response.headers)).toEqual({
      [CACHE_HEADERS.status]: 'HIT',
      [CACHE_HEADERS.age]: '12',
      [CACHE_HEADERS.key]: CACHE_KEY,
      [CACHE_HEADERS.invalidation]: 'enabled',
    });
  });

  // A bypass has no key and no age: there is no cached copy to describe.
  it('omits the key and age headers when the cache was bypassed', async () => {
    service.findAllWithCacheInfo.mockResolvedValue({
      page,
      cache: { status: 'BYPASS', key: null, ageSeconds: null },
    });
    const response = responseStub();

    await controller.findAll({}, response as unknown as Response);

    expect(response.headers.get(CACHE_HEADERS.status)).toBe('BYPASS');
    expect(response.headers.has(CACHE_HEADERS.key)).toBe(false);
    expect(response.headers.has(CACHE_HEADERS.age)).toBe(false);
  });

  it('tells clients when invalidation is switched off', async () => {
    Object.defineProperty(service, 'cacheInvalidationEnabled', {
      value: false,
      configurable: true,
    });
    const response = responseStub();

    await controller.findAll({}, response as unknown as Response);

    expect(response.headers.get(CACHE_HEADERS.invalidation)).toBe('disabled');
  });

  it('returns the stats summary', async () => {
    expect((await controller.getStats()).total).toBe(1);
    expect(service.getStats).toHaveBeenCalledTimes(1);
  });

  it('returns a single task by id', async () => {
    await expect(controller.findOne(TASK_ID)).resolves.toEqual(task);
    expect(service.findOne).toHaveBeenCalledWith(TASK_ID);
  });

  it('propagates NotFoundException from the service', async () => {
    service.findOne.mockRejectedValue(new NotFoundException() as never);

    await expect(controller.findOne(TASK_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('forwards the update patch', async () => {
    const result = await controller.update(TASK_ID, { title: 'Renamed' });

    expect(result.title).toBe('Renamed');
    expect(service.update).toHaveBeenCalledWith(TASK_ID, { title: 'Renamed' });
  });

  it('returns nothing on delete', async () => {
    await expect(controller.remove(TASK_ID)).resolves.toBeUndefined();
    expect(service.remove).toHaveBeenCalledWith(TASK_ID);
  });
});
