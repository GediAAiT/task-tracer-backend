import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CreateTaskDto } from '../dto/create-task.dto';
import { SortOrder, TaskSortBy } from '../dto/query-tasks.dto';
import { Task, TaskPriority, TaskStatus } from '../entities/task.entity';
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

describe('TasksController', () => {
  let controller: TasksController;
  let service: jest.Mocked<TasksService>;

  beforeEach(async () => {
    const serviceMock: Partial<jest.Mocked<TasksService>> = {
      create: jest.fn().mockResolvedValue(task),
      findAll: jest.fn().mockResolvedValue({
        items: [task],
        meta: {
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      }),
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

    const result = await controller.findAll(query);

    expect(result.items).toEqual([task]);
    expect(result.meta.total).toBe(1);
    expect(service.findAll).toHaveBeenCalledWith(query);
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
