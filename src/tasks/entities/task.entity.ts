import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  BLOCKED = 'BLOCKED',
  DONE = 'DONE',
}

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export class Task {
  @ApiProperty({
    description: 'Unique identifier of the task',
    format: 'uuid',
  })
  id: string;

  @ApiProperty({ description: 'Short summary of the work' })
  title: string;

  @ApiProperty({
    description: 'Longer free-form details',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({ enum: TaskStatus, enumName: 'TaskStatus' })
  status: TaskStatus;

  @ApiProperty({ enum: TaskPriority, enumName: 'TaskPriority' })
  priority: TaskPriority;

  @ApiProperty({
    description: 'When the task is due, ISO 8601',
    nullable: true,
    format: 'date-time',
  })
  dueDate: string | null;

  @ApiProperty({
    description: 'Person responsible for the task',
    nullable: true,
  })
  assignee: string | null;

  @ApiProperty({
    description: 'Free-form labels used for grouping and filtering',
    type: [String],
  })
  tags: string[];

  @ApiPropertyOptional({
    description:
      'Set automatically when the task moves to DONE, cleared when it moves back',
    nullable: true,
    format: 'date-time',
  })
  completedAt: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}
