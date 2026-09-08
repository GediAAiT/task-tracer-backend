import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { TaskPriority, TaskStatus } from '../entities/task.entity';
import { UpdateTaskDto } from './update-task.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

const metadata = {
  type: 'body' as const,
  metatype: UpdateTaskDto,
  data: '',
};

async function parse(body: unknown): Promise<UpdateTaskDto> {
  return (await pipe.transform(body, metadata)) as UpdateTaskDto;
}

async function rejectionMessages(body: unknown): Promise<string[]> {
  try {
    await parse(body);
  } catch (error) {
    const response = (error as BadRequestException).getResponse();
    return (response as { message: string[] }).message;
  }

  throw new Error('expected the body to be rejected');
}

function form(overrides: Record<string, string>): Record<string, string> {
  return {
    title: '',
    description: '',
    status: '',
    priority: '',
    dueDate: '',
    assignee: '',
    tags: '',
    ...overrides,
  };
}

describe('UpdateTaskDto', () => {
  describe('a form-encoded body', () => {
    it('keeps every field the editor left blank', async () => {

      expect(await parse(form({ priority: TaskPriority.URGENT }))).toEqual({
        priority: TaskPriority.URGENT,
      });
    });

    it('carries through the fields the editor did fill in', async () => {
      expect(
        await parse(
          form({
            title: '  Ship the release notes  ',
            status: TaskStatus.IN_PROGRESS,
            assignee: 'sam@example.com',
            dueDate: '2026-10-05T09:30:00.000Z',
            tags: 'release, docs',
          }),
        ),
      ).toEqual({
        title: 'Ship the release notes',
        status: TaskStatus.IN_PROGRESS,
        assignee: 'sam@example.com',
        dueDate: '2026-10-05T09:30:00.000Z',
        tags: ['release', 'docs'],
      });
    });

    it('accepts a due day with no time', async () => {
      expect(await parse(form({ dueDate: '2026-10-05' }))).toEqual({
        dueDate: '2026-10-05',
      });
    });
  });

  describe('a JSON body', () => {
    it('accepts null to clear a nullable field', async () => {
      expect(
        await parse({ assignee: null, dueDate: null, description: null }),
      ).toEqual({ assignee: null, dueDate: null, description: null });
    });

    it('accepts an empty array to clear the tags', async () => {
      expect(await parse({ tags: [] })).toEqual({ tags: [] });
    });
  });

  describe('rejects', () => {
    it('a status outside the enum', async () => {
      expect(await rejectionMessages({ status: 'NOPE' })).toEqual([
        'status must be one of the following values: TODO, IN_PROGRESS, BLOCKED, DONE',
      ]);
    });

    it('a priority outside the enum', async () => {
      expect(await rejectionMessages({ priority: 'SOON' })).toEqual([
        'priority must be one of the following values: LOW, MEDIUM, HIGH, URGENT',
      ]);
    });

    it('a due date that is not ISO 8601', async () => {
      expect(await rejectionMessages({ dueDate: 'next tuesday' })).toEqual([
        'dueDate must be a valid ISO 8601 date string',
      ]);
    });

    it('an unknown field', async () => {
      expect(await rejectionMessages({ completedAt: '2026-10-05' })).toEqual([
        'property completedAt should not exist',
      ]);
    });
  });
});
