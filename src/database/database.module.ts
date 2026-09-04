import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskOrmEntity } from '../tasks/entities/task.orm-entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USERNAME', 'postgres'),
        password: config.get<string>('DB_PASSWORD', ''),
        database: config.get<string>('DB_DATABASE', 'task_tracer_backend_db'),
        entities: [TaskOrmEntity],
        // The schema is small enough that letting TypeORM keep the tables in
        // sync removes the need for a migrations setup at this stage.
        synchronize: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
