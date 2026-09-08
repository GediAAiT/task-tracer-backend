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
import { blankToUndefined, csvToTags } from './transforms';

export class CreateTaskDto {
  @ApiProperty({
    description: 'Short summary of the work',
    minLength: 1,
    maxLength: 200,
    example: 'Ship the release notes',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({
    description: 'Longer free-form details',
    maxLength: 2000,
    example: 'Draft the notes and circulate them for review',
  })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
  @ApiPropertyOptional({
    description: 'Lifecycle state of the task',
    enum: TaskStatus,
    default: TaskStatus.TODO,
  })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({
    description: 'How urgent the task is',
    enum: TaskPriority,
    default: TaskPriority.MEDIUM,
  })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({
    description: 'When the task is due, ISO 8601 date and time',
    format: 'date-time',
    example: '2026-09-30T17:00:00.000Z',
  })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional({
    description: 'Person responsible for the task',
    maxLength: 120,
    example: 'alex@example.com',
  })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  assignee?: string;

  @ApiPropertyOptional({
    description:
      'Free-form labels used for grouping and filtering. A form-encoded body may send these as one comma-separated field.',
    type: [String],
    maxItems: 20,
    example: ['release', 'docs'],
  })
  @Transform(csvToTags)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}
