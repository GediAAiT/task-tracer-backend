import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Task } from '../entities/task.entity';
import { NewTask } from '../tasks.repository';

/**
 * Drop-in replacement for `TasksRepository` backed by a `Map` instead of
 * Postgres. Used to unit test `TasksService` without a database — same
 * method surface, so it can be provided in place of the real repository.
 */
@Injectable()
export class InMemoryTasksRepository {
  private readonly tasks = new Map<string, Task>();

  async create(data: NewTask): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = { ...data, id: randomUUID(), createdAt: now, updatedAt: now };
    this.tasks.set(task.id, clone(task));
    return clone(task);
  }

  async findAll(): Promise<Task[]> {
    return Array.from(this.tasks.values(), clone);
  }

  async findById(id: string): Promise<Task | undefined> {
    const task = this.tasks.get(id);
    return task ? clone(task) : undefined;
  }

  async update(id: string, patch: Partial<NewTask>): Promise<Task | undefined> {
    const existing = this.tasks.get(id);
    if (!existing) return undefined;

    const updated: Task = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.tasks.set(id, clone(updated));
    return clone(updated);
  }

  async delete(id: string): Promise<boolean> {
    return this.tasks.delete(id);
  }

  async clear(): Promise<void> {
    this.tasks.clear();
  }
}

function clone(task: Task): Task {
  return { ...task, tags: [...task.tags] };
}
