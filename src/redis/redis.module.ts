import { Global, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { Redis, RedisOptions } from 'ioredis';
import { candidates, Endpoint, label } from '../common/endpoint';
import { CacheService } from './cache.service';
import { REDIS_CLIENT } from './redis.constants';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: async (config: ConfigService): Promise<Redis | null> => {
        const logger = new Logger('Redis');
        const driver = config.get<string>('CACHE_DRIVER', 'auto');

        if (driver === 'memory') {
          logger.log('CACHE_DRIVER=memory: caching in process memory');
          return null;
        }

        const options: RedisOptions = {
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          db: Number(config.get<string>('REDIS_DB', '0')),
          maxRetriesPerRequest: 2,
          enableOfflineQueue: false,
          lazyConnect: true,
        };

        const configured: Endpoint = {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: Number(config.get<string>('REDIS_PORT', '6379')),
        };

        if (driver === 'redis') {
          const client = new Redis({
            ...options,
            ...configured,
            retryStrategy: (times) => Math.min(times * 200, 2000),
          });
          attachLogging(client, logger, label(configured));

          await client.connect().catch((error: unknown) =>
            logger.error(
              `Redis at ${label(configured)} unreachable (${reason(error)}): ` +
                `caching in process memory until it reconnects`,
            ),
          );

          return client;
        }

        const tried: string[] = [];

        const published = Number(config.get<string>('REDIS_PORT_HOST', '6380'));

        for (const endpoint of candidates(configured, published)) {
          let probing = true;
          const client = new Redis({
            ...options,
            ...endpoint,
            retryStrategy: (times) =>
              probing && times > 3 ? null : Math.min(times * 200, 2000),
          });
          attachLogging(client, logger, label(endpoint));

          try {
            await client.connect();
            probing = false;
            return client;
          } catch (error) {
            tried.push(`${label(endpoint)} (${reason(error)})`);
            client.removeAllListeners();
            client.disconnect();
          }
        }

        logger.log(
          `No Redis at ${tried.join(' or ')}: caching in process memory`,
        );

        return null;
      },
    },
    CacheService,
  ],
  exports: [REDIS_CLIENT, CacheService],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(private readonly moduleRef: ModuleRef) {}

  async onApplicationShutdown(): Promise<void> {
    const client = this.moduleRef.get<Redis | null>(REDIS_CLIENT, {
      strict: false,
    });
    if (!client) return;
    await client.quit().catch(() => client.disconnect());
  }
}

function attachLogging(client: Redis, logger: Logger, target: string): void {
  let ready = false;
  let reported = false;

  client.on('error', (error: Error) => {
    if (!ready || reported) return;
    reported = true;
    logger.warn(
      `Redis at ${target} unavailable (${error.message}): ` +
        `caching in process memory until it reconnects`,
    );
  });

  client.on('ready', () => {
    if (reported) logger.log(`Redis at ${target} reconnected`);
    else if (!ready) logger.log(`Redis connected at ${target}`);
    ready = true;
    reported = false;
  });
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
