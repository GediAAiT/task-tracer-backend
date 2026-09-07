import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TaskPriority, TaskStatus } from '../entities/task.entity';

export class CreateTaskDto {
  @ApiProperty({
    description: 'Short summary of the work',
    minLength: 1,
    maxLength: 200,
  })
  // Runs before validation, so a whitespace-only title collapses to '' and is
  // rejected by MinLength rather than stored as blank. Non-strings pass through
  // untouched so IsString still reports the type error.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({
    description: 'Longer free-form details',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    enum: TaskStatus,
    enumName: 'TaskStatus',
    default: TaskStatus.TODO,
  })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({
    enum: TaskPriority,
    enumName: 'TaskPriority',
    default: TaskPriority.MEDIUM,
  })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({
    description: 'When the task is due, ISO 8601',
    format: 'date-time',
  })
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional({
    description: 'Person responsible for the task',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  assignee?: string;

  @ApiPropertyOptional({
    description: 'Free-form labels used for grouping and filtering',
    type: [String],
    maxItems: 20,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}
