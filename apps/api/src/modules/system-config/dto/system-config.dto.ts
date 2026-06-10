import { IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateSystemConfigDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string', nullable: true },
    example: { 'cache.enabled': 'true', 'cache.redis.host': 'localhost' },
  })
  @IsObject()
  config: Record<string, string | null>;
}
