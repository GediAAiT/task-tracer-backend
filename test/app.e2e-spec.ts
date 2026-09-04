import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { buildOpenApiDocument, configureApp } from './../src/bootstrap';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = configureApp(
      moduleFixture.createNestApplication(),
    ) as INestApplication<App>;
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health (GET) reports ok', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body.status).toBe('ok');
  });

  it('404s an unknown route', async () => {
    await request(app.getHttpServer()).get('/nope').expect(404);
  });

  describe('OpenAPI document', () => {
    it('documents every task operation', () => {
      const document = buildOpenApiDocument(app);

      expect(document.info.title).toBe('Task Tracer API');
      expect(Object.keys(document.paths).sort()).toEqual([
        '/health',
        '/tasks',
        '/tasks/stats',
        '/tasks/{id}',
      ]);
      expect(document.paths['/tasks']).toHaveProperty('get');
      expect(document.paths['/tasks']).toHaveProperty('post');
      expect(document.paths['/tasks/{id}']).toHaveProperty('get');
      expect(document.paths['/tasks/{id}']).toHaveProperty('patch');
      expect(document.paths['/tasks/{id}']).toHaveProperty('delete');
    });

    it('describes the task schema and the filter parameters', () => {
      const document = buildOpenApiDocument(app);

      expect(Object.keys(document.components?.schemas ?? {})).toEqual(
        expect.arrayContaining([
          'Task',
          'CreateTaskDto',
          'UpdateTaskDto',
          'PaginatedTasksDto',
          'TaskStatsDto',
        ]),
      );

      const listParams = (document.paths['/tasks'].get?.parameters ??
        []) as Array<{ name: string }>;
      expect(listParams.map((parameter) => parameter.name)).toEqual(
        expect.arrayContaining([
          'status',
          'priority',
          'assignee',
          'tag',
          'search',
          'overdue',
          'page',
          'limit',
          'sortBy',
          'sortOrder',
        ]),
      );
    });
  });
});
