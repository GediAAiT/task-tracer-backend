import { PartialType } from '@nestjs/swagger';
import { CreateTaskDto } from './create-task.dto';

/**
 * Every field is optional; only the keys present in the body are applied.
 * `completedAt` is derived from `status` and so is not settable directly.
 */
export class UpdateTaskDto extends PartialType(CreateTaskDto) {}
