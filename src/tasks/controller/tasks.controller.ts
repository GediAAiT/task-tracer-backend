import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import { CreateTaskDto } from '../dto/create-task.dto';
import { PaginatedTasksDto } from '../dto/paginated-tasks.dto';
import { QueryTasksDto } from '../dto/query-tasks.dto';
import { TaskStatsDto } from '../dto/task-stats.dto';
import { UpdateTaskDto } from '../dto/update-task.dto';
import { Task } from '../entities/task.entity';
import { CACHE_HEADERS } from '../tasks.cache';
import { TasksService } from '../tasks.service';

const BODY_CONTENT_TYPES = [
  'application/json',
  'application/x-www-form-urlencoded',
];

@ApiTags('tasks')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiConsumes(...BODY_CONTENT_TYPES)
  @ApiCreatedResponse({ type: Task })
  async create(@Body() createTaskDto: CreateTaskDto): Promise<Task> {
    return this.tasksService.create(createTaskDto);
  }

  @Get()
  @ApiOkResponse({
    type: PaginatedTasksDto,
    headers: {
      [CACHE_HEADERS.status]: {
        description: 'HIT, MISS, or BYPASS when Redis was unreachable',
        schema: { type: 'string' },
      },
      [CACHE_HEADERS.age]: {
        description: 'Seconds since the returned page was computed',
        schema: { type: 'integer' },
      },
      [CACHE_HEADERS.key]: {
        description: 'Redis key the page was read from or written to',
        schema: { type: 'string' },
      },
      [CACHE_HEADERS.invalidation]: {
        description: 'disabled when writes are not retiring cached pages',
        schema: { type: 'string' },
      },
    },
  })
  async findAll(
    @Query() query: QueryTasksDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PaginatedTasksDto> {
    const { page, cache } = await this.tasksService.findAllWithCacheInfo(query);

    response.setHeader(CACHE_HEADERS.status, cache.status);
    response.setHeader(
      CACHE_HEADERS.invalidation,
      this.tasksService.cacheInvalidationEnabled ? 'enabled' : 'disabled',
    );
    if (cache.key !== null) response.setHeader(CACHE_HEADERS.key, cache.key);
    if (cache.ageSeconds !== null) {
      response.setHeader(CACHE_HEADERS.age, String(cache.ageSeconds));
    }

    return page;
  }

  @Get('stats')
  @ApiOkResponse({ type: TaskStatsDto })
  async getStats(): Promise<TaskStatsDto> {
    return this.tasksService.getStats();
  }

  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: Task })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Task> {
    return this.tasksService.findOne(id);
  }

  @Patch(':id')
  @ApiConsumes(...BODY_CONTENT_TYPES)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: Task })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTaskDto: UpdateTaskDto,
  ): Promise<Task> {
    return this.tasksService.update(id, updateTaskDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.tasksService.remove(id);
  }
}
