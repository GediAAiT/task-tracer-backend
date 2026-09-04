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
        /*
         * `pg` treats an empty-string password as absent and substitutes null,
         * which fails SCRAM auth with a misleading "password must be a string".
         * Fail here instead, while the cause is still obvious.
         */
        const password = config.get<string>('DB_PASSWORD');
        if (!password) {
          throw new Error(
            'DB_PASSWORD is not set. Copy .env.example to .env and set your PostgreSQL password.',
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
