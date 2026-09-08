import { ApiPropertyOptional } from '@nestjs/swagger';
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
import { blankToUndefined, csvToTags, trimToUndefined } from './transforms';
export class UpdateTaskDto {
  @ApiPropertyOptional({
    description:
      'Short summary of the work. Leave blank to keep the current title.',
    minLength: 1,
    maxLength: 200,
  })
  @Transform(trimToUndefined)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({
    description:
      'Longer free-form details. Leave blank to keep the current description, or send null to clear it.',
    maxLength: 2000,
    nullable: true,
  })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
  @ApiPropertyOptional({
    description:
      'Lifecycle state of the task. Leave blank to keep the current status. Moving to DONE stamps completedAt; moving away clears it.',
    enum: TaskStatus,
  })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({
    description:
      'How urgent the task is. Leave blank to keep the current priority.',
    enum: TaskPriority,
  })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({
    description:
      'When the task is due: a day (2026-09-30) or a day and time (2026-09-30T17:00:00.000Z). Leave blank to keep the current due date, or send null to clear it.',
    format: 'date-time',
    nullable: true,
  })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsISO8601()
  dueDate?: string | null;

  @ApiPropertyOptional({
    description:
      'Person responsible for the task. Leave blank to keep the current assignee, or send null to unassign.',
    maxLength: 120,
    nullable: true,
  })
  @Transform(blankToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  assignee?: string | null;

  @ApiPropertyOptional({
    description:
      'Free-form labels used for grouping and filtering. A form-encoded body may send these as one comma-separated field. Leave blank to keep the current tags, or send an empty JSON array to clear them.',
    type: [String],
    maxItems: 20,
  })
  @Transform(csvToTags)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}
