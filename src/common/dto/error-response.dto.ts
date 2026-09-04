import { ApiProperty } from '@nestjs/swagger';

/** Shape produced by Nest's built-in HTTP exception filter. */
export class ErrorResponseDto {
  @ApiProperty()
  statusCode: number;

  @ApiProperty({
    description: 'A single message, or one entry per failed validation rule',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message: string | string[];

  @ApiProperty()
  error: string;
}
