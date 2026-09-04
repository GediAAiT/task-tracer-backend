import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { HealthDto } from './app.dto';
import { AppService } from './app.service';

@ApiTags('service')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @ApiOkResponse({ type: HealthDto })
  getHealth(): HealthDto {
    return this.appService.getHealth();
  }
}
