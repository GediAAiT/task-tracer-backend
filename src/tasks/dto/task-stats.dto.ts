import { ApiProperty } from '@nestjs/swagger';
import { TaskPriority, TaskStatus } from '../entities/task.entity';

export class TaskStatsDto {
  @ApiProperty({ description: 'Total tasks tracked' })
  total: number;

  @ApiProperty({
    description: 'Task count per status, every status present even at zero',
    additionalProperties: { type: 'integer' },
  })
  byStatus: Record<TaskStatus, number>;

  @ApiProperty({
    description: 'Task count per priority, every priority present even at zero',
    additionalProperties: { type: 'integer' },
  })
  byPriority: Record<TaskPriority, number>;

  @ApiProperty({ description: 'Unfinished tasks whose due date has passed' })
  overdue: number;

  @ApiProperty({
    description: 'Share of tasks in DONE, 0 to 1, rounded to 4 decimals',
  })
  completionRate: number;
}
