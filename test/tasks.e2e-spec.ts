import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { TasksService } from '../src/tasks/tasks.service';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('Tasks (e2e)', () => {
  let app: INestApplication<App>;
  let tasks: TasksService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = configureApp(
      moduleFixture.createNestApplication(),
    ) as INestApplication<App>;
    tasks = app.get(TasksService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await tasks.clear();
  });

  const createTask = (body: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/tasks')
      .send({ title: 'A task', ...body })
      .expect(201);

  describe('POST /tasks', () => {
    it('creates a task with defaults filled in', async () => {
      const response = await createTask({ title: 'Ship the tracer API' });

      expect(response.body).toMatchObject({
        title: 'Ship the tracer API',
        status: 'TODO',
        priority: 'MEDIUM',
        description: null,
        tags: [],
        completedAt: null,
      });
      expect(response.body.id).toEqual(expect.any(String));
    });

    it('trims the title', async () => {
      const response = await createTask({ title: '   padded   ' });

      expect(response.body.title).toBe('padded');
    });

    it('rejects a missing title', async () => {
      const response = await request(app.getHttpServer())
        .post('/tasks')
        .send({ description: 'no title here' })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('title')]),
      );
    });

    it('rejects an unknown status', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .send({ title: 'Bad status', status: 'NOPE' })
        .expect(400);
    });

    it('rejects a malformed due date', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .send({ title: 'Bad date', dueDate: 'next tuesday' })
        .expect(400);
    });

    it('rejects unknown properties', async () => {
      const response = await request(app.getHttpServer())
        .post('/tasks')
        .send({ title: 'Sneaky', isAdmin: true })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('isAdmin')]),
      );
    });
  });

  describe('GET /tasks', () => {
    it('returns an empty page when nothing is tracked', async () => {
      const response = await request(app.getHttpServer())
        .get('/tasks')
        .expect(200);

      expect(response.body.items).toEqual([]);
      expect(response.body.meta.total).toBe(0);
    });

    it('filters, sorts and paginates', async () => {
      await createTask({ title: 'Alpha', priority: 'LOW' });
      await createTask({ title: 'Beta', priority: 'URGENT', status: 'DONE' });
      await createTask({ title: 'Gamma', priority: 'HIGH' });

      const filtered = await request(app.getHttpServer())
        .get('/tasks?status=DONE')
        .expect(200);
      expect(
        filtered.body.items.map((t: { title: string }) => t.title),
      ).toEqual(['Beta']);

      const sorted = await request(app.getHttpServer())
        .get('/tasks?sortBy=priority&sortOrder=desc')
        .expect(200);
      expect(sorted.body.items.map((t: { title: string }) => t.title)).toEqual([
        'Beta',
        'Gamma',
        'Alpha',
      ]);

      const paged = await request(app.getHttpServer())
        .get('/tasks?limit=2&page=1&sortBy=title&sortOrder=asc')
        .expect(200);
      expect(paged.body.items).toHaveLength(2);
      expect(paged.body.meta).toMatchObject({
        total: 3,
        totalPages: 2,
        hasNextPage: true,
        hasPreviousPage: false,
      });
    });

    it('coerces numeric query parameters', async () => {
      await createTask();

      const response = await request(app.getHttpServer())
        .get('/tasks?page=1&limit=5')
        .expect(200);

      expect(response.body.meta.limit).toBe(5);
    });

    it('rejects a limit above the maximum', async () => {
      await request(app.getHttpServer()).get('/tasks?limit=500').expect(400);
    });

    it('rejects a non-numeric page', async () => {
      await request(app.getHttpServer()).get('/tasks?page=abc').expect(400);
    });

    it('filters by overdue', async () => {
      await createTask({ title: 'Late', dueDate: '2020-01-01T00:00:00.000Z' });
      await createTask({ title: 'Later', dueDate: '2030-01-01T00:00:00.000Z' });

      const response = await request(app.getHttpServer())
        .get('/tasks?overdue=true')
        .expect(200);

      expect(
        response.body.items.map((t: { title: string }) => t.title),
      ).toEqual(['Late']);
    });
  });

  describe('GET /tasks/stats', () => {
    it('summarises the tracker', async () => {
      await createTask({ status: 'DONE' });
      await createTask({ status: 'TODO', priority: 'HIGH' });

      const response = await request(app.getHttpServer())
        .get('/tasks/stats')
        .expect(200);

      expect(response.body).toMatchObject({
        total: 2,
        overdue: 0,
        completionRate: 0.5,
      });
      expect(response.body.byStatus.DONE).toBe(1);
      expect(response.body.byPriority.HIGH).toBe(1);
    });
  });

  describe('GET /tasks/:id', () => {
    it('returns the task', async () => {
      const created = await createTask({ title: 'Findable' });

      const response = await request(app.getHttpServer())
        .get(`/tasks/${created.body.id}`)
        .expect(200);

      expect(response.body).toEqual(created.body);
    });

    it('404s for an unknown id', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tasks/${MISSING_ID}`)
        .expect(404);

      expect(response.body.message).toContain(MISSING_ID);
    });

    it('400s for an id that is not a uuid', async () => {
      await request(app.getHttpServer()).get('/tasks/not-a-uuid').expect(400);
    });
  });

  describe('PATCH /tasks/:id', () => {
    it('applies a partial update', async () => {
      const created = await createTask({
        title: 'Before',
        description: 'Keep me',
      });

      const response = await request(app.getHttpServer())
        .patch(`/tasks/${created.body.id}`)
        .send({ title: 'After', priority: 'URGENT' })
        .expect(200);

      expect(response.body).toMatchObject({
        title: 'After',
        priority: 'URGENT',
        description: 'Keep me',
      });
    });

    it('stamps and clears completedAt as the status moves', async () => {
      const created = await createTask();

      const done = await request(app.getHttpServer())
        .patch(`/tasks/${created.body.id}`)
        .send({ status: 'DONE' })
        .expect(200);
      expect(done.body.completedAt).not.toBeNull();

      const reopened = await request(app.getHttpServer())
        .patch(`/tasks/${created.body.id}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      expect(reopened.body.completedAt).toBeNull();
    });

    it('accepts an empty body as a no-op', async () => {
      const created = await createTask();

      const response = await request(app.getHttpServer())
        .patch(`/tasks/${created.body.id}`)
        .send({})
        .expect(200);

      expect(response.body.title).toBe(created.body.title);
    });

    it('rejects an invalid value', async () => {
      const created = await createTask();

      await request(app.getHttpServer())
        .patch(`/tasks/${created.body.id}`)
        .send({ priority: 'WHENEVER' })
        .expect(400);
    });

    it('404s for an unknown id', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${MISSING_ID}`)
        .send({ title: 'Nope' })
        .expect(404);
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('deletes the task and returns 204', async () => {
      const created = await createTask();

      await request(app.getHttpServer())
        .delete(`/tasks/${created.body.id}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/tasks/${created.body.id}`)
        .expect(404);
    });

    it('404s for an unknown id', async () => {
      await request(app.getHttpServer())
        .delete(`/tasks/${MISSING_ID}`)
        .expect(404);
    });
  });

  it('supports a full create, read, update, delete round trip', async () => {
    const created = await createTask({
      title: 'Round trip',
      tags: ['API', 'api'],
    });
    expect(created.body.tags).toEqual(['api']);

    await request(app.getHttpServer())
      .patch(`/tasks/${created.body.id}`)
      .send({ status: 'DONE' })
      .expect(200);

    const stats = await request(app.getHttpServer())
      .get('/tasks/stats')
      .expect(200);
    expect(stats.body.completionRate).toBe(1);

    await request(app.getHttpServer())
      .delete(`/tasks/${created.body.id}`)
      .expect(204);

    const list = await request(app.getHttpServer()).get('/tasks').expect(200);
    expect(list.body.items).toEqual([]);
  });
});
