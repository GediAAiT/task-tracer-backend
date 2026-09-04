import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { TaskOrmEntity } from './entities/task.orm-entity';

export type NewTask = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Postgres-backed store. The service only depends on the methods below, so
 * the backing store can be swapped again by reimplementing this class.
 */
@Injectable()
export class TasksRepository {
  constructor(
    @InjectRepository(TaskOrmEntity)
    private readonly repo: Repository<TaskOrmEntity>,
  ) {}

  async create(data: NewTask): Promise<Task> {
    const now = new Date();
    const row = this.repo.create({
      ...toOrmFields(data),
      createdAt: now,
      updatedAt: now,
    });
    return toTask(await this.repo.save(row));
  }

  async findAll(): Promise<Task[]> {
    return (await this.repo.find()).map(toTask);
  }

  async findById(id: string): Promise<Task | undefined> {
    const row = await this.repo.findOneBy({ id });
    return row ? toTask(row) : undefined;
  }

  async update(id: string, patch: Partial<NewTask>): Promise<Task | undefined> {
    const existing = await this.repo.findOneBy({ id });
    if (!existing) return undefined;

    const merged = this.repo.merge(existing, {
      ...toOrmFields(patch),
      updatedAt: new Date(),
    });
    return toTask(await this.repo.save(merged));
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }

  async clear(): Promise<void> {
    await this.repo.clear();
  }
}

function toOrmFields(data: Partial<NewTask>): Partial<TaskOrmEntity> {
  const fields: Partial<TaskOrmEntity> = {};
  if (data.title !== undefined) fields.title = data.title;
  if (data.description !== undefined) fields.description = data.description;
  if (data.status !== undefined) fields.status = data.status;
  if (data.priority !== undefined) fields.priority = data.priority;
  if (data.assignee !== undefined) fields.assignee = data.assignee;
  if (data.tags !== undefined) fields.tags = data.tags;
  if (data.dueDate !== undefined)
    fields.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  if (data.completedAt !== undefined)
    fields.completedAt = data.completedAt ? new Date(data.completedAt) : null;
  return fields;
}

function toTask(row: TaskOrmEntity): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    assignee: row.assignee,
    tags: [...row.tags],
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
