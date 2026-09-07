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
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
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
import { TasksService } from '../tasks.service';

@ApiTags('tasks')
@ApiBadRequestResponse({ type: ErrorResponseDto })
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiCreatedResponse({ type: Task })
  async create(@Body() createTaskDto: CreateTaskDto): Promise<Task> {
    return this.tasksService.create(createTaskDto);
  }

  @Get()
  @ApiOkResponse({ type: PaginatedTasksDto })
  async findAll(@Query() query: QueryTasksDto): Promise<PaginatedTasksDto> {
    return this.tasksService.findAll(query);
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
