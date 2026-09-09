import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { candidates, Endpoint, isReachable, label } from '../common/endpoint';
import { TaskOrmEntity } from '../tasks/entities/task.orm-entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const logger = new Logger('Database');

        const password = config.get<string>('DB_PASSWORD');
        if (!password) {
          throw new Error(
            'DB_PASSWORD is not set. Set your PostgreSQL password in .env.',
          );
        }

        const configured: Endpoint = {
          host: config.get<string>('DB_HOST', 'localhost'),
          port: Number(config.get<string>('DB_PORT', '5432')),
        };
        const published = Number(config.get<string>('DB_PORT_HOST', '5433'));

        return {
          type: 'postgres' as const,
          ...(await resolve(configured, published, logger)),
          username: config.get<string>('DB_USERNAME', 'postgres'),
          password,
          database: config.get<string>('DB_DATABASE', 'task_tracer_backend_db'),
          entities: [TaskOrmEntity],
          synchronize: true,
        };
      },
    }),
  ],
})
export class DatabaseModule {}

async function resolve(
  configured: Endpoint,
  published: number,
  logger: Logger,
): Promise<Endpoint> {
  const options = candidates(configured, published);
  if (options.length === 1) return configured;

  for (const endpoint of options) {
    if (!(await isReachable(endpoint))) continue;

    const where = endpoint.port === published ? 'Docker' : 'local';
    logger.log(`Postgres at ${label(endpoint)} (${where})`);

    return endpoint;
  }

  logger.warn(
    `No Postgres at ${options.map(label).join(' or ')}: ` +
      `connecting to ${label(configured)} anyway`,
  );

  return configured;
}
