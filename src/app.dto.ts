import { ApiProperty } from '@nestjs/swagger';

export class HealthDto {
  @ApiProperty()
  status: string;

  @ApiProperty({ description: 'Seconds since the process finished booting' })
  uptimeSeconds: number;

  @ApiProperty({ format: 'date-time' })
  timestamp: string;
}
