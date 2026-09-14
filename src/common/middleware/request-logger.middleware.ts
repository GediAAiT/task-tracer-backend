import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const startTime = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;

      this.logger.log(
        JSON.stringify({
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
        }),
      );
    });

    next();
  }
}
