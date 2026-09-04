import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export const SWAGGER_PATH = 'api/docs';

export function resolvePort(): number {
  return Number(process.env.PORT ?? 3000);
}

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
        'Tasks are held in memory, so restarting the process clears them.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addTag('tasks')
    .addTag('service')
    .addServer('http://localhost:3000', 'Local development')
    .build();

  return SwaggerModule.createDocument(app, config);
}

export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup(SWAGGER_PATH, app, buildOpenApiDocument(app), {
    jsonDocumentUrl: `${SWAGGER_PATH}-json`,
    yamlDocumentUrl: `${SWAGGER_PATH}-yaml`,
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });
}
