import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskOrmEntity } from '../tasks/entities/task.orm-entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {

        const password = config.get<string>('DB_PASSWORD');
        if (!password) {
          throw new Error(
            'DB_PASSWORD is not set. Set your PostgreSQL password in .env.',
          );
        }

        return {
          type: 'postgres' as const,
          host: config.get<string>('DB_HOST', 'localhost'),
          port: Number(config.get<string>('DB_PORT', '5432')),
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
