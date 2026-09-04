import { Injectable } from '@nestjs/common';
import { HealthDto } from './app.dto';

@Injectable()
export class AppService {
  private readonly startedAt = Date.now();

  getHealth(): HealthDto {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }
}
