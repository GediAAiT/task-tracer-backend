import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export const SWAGGER_PATH = 'api/docs';
export const SWAGGER_JSON_PATH = `${SWAGGER_PATH}-json`;
export const SWAGGER_YAML_PATH = `${SWAGGER_PATH}-yaml`;

/** Where the server binds; `PORT` overrides the local default. */
export function resolvePort(): number {
  return Number(process.env.PORT ?? 3000);
}

/**
 * Applied by both `main.ts` and the e2e tests, so the tests exercise the same
 * request pipeline that runs in production.
 */
export function configureApp(app: INestApplication): INestApplication {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableCors();
  return app;
}

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Task Tracer API')
    .setDescription(
      [
        'Track tasks through their lifecycle: create them, filter and sort the list,',
        'update status and priority, and read aggregate stats.',
        '',
        'Tasks are persisted in PostgreSQL.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addServer(`http://localhost:${resolvePort()}`, 'Local development')
    .build();

  return SwaggerModule.createDocument(app, config);
}

export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup(SWAGGER_PATH, app, buildOpenApiDocument(app), {
    jsonDocumentUrl: SWAGGER_JSON_PATH,
    yamlDocumentUrl: SWAGGER_YAML_PATH,
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });
}
