import { ApiProperty } from '@nestjs/swagger';
import { Task } from '../entities/task.entity';

export class PaginationMetaDto {
  @ApiProperty({ description: 'Tasks matching the filters, before pagination' })
  total: number;

  @ApiProperty({ description: 'Page that was returned, 1-based' })
  page: number;

  @ApiProperty({ description: 'Page size that was applied' })
  limit: number;

  @ApiProperty({ description: 'Number of pages available for these filters' })
  totalPages: number;

  @ApiProperty()
  hasNextPage: boolean;

  @ApiProperty()
  hasPreviousPage: boolean;
}

export class PaginatedTasksDto {
  @ApiProperty({ type: [Task] })
  items: Task[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
