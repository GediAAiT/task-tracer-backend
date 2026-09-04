import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  configureApp,
  resolvePort,
  setupSwagger,
  SWAGGER_PATH,
} from './bootstrap';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureApp(app);
  setupSwagger(app);

  const port = resolvePort();
  await app.listen(port);

  Logger.log(`API listening on http://localhost:${port}`, 'Bootstrap');
  Logger.log(
    `Swagger UI on http://localhost:${port}/${SWAGGER_PATH}`,
    'Bootstrap',
  );
}
bootstrap();
