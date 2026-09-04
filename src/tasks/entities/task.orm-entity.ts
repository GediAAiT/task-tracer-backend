import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TaskPriority, TaskStatus } from './task.entity';

/**
 * Database shape for a task. Kept separate from `Task` (the API/domain
 * model) so date columns can be `Date` here and ISO strings everywhere else;
 * `TasksRepository` maps between the two.
 */
@Entity({ name: 'tasks' })
export class TaskOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: TaskStatus, enumName: 'task_status' })
  status: TaskStatus;

  @Column({ type: 'enum', enum: TaskPriority, enumName: 'task_priority' })
  priority: TaskPriority;

  @Column({ type: 'timestamptz', nullable: true })
  dueDate: Date | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  assignee: string | null;

  @Column({ type: 'text', array: true, default: '{}' })
  tags: string[];

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
