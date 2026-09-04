import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('reports ok with an uptime and a timestamp', () => {
      const health = appController.getHealth();

      expect(health.status).toBe('ok');
      expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(Date.parse(health.timestamp))).toBe(false);
    });
  });
});
