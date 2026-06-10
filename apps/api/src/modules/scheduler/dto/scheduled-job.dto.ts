import { IsString, IsOptional, IsBoolean, IsArray, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateScheduledJobDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '0 8 * * 1-5' })
  @IsString()
  cronExpression: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  queryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  inlineSql?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  datasourceId?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsEmail({}, { each: true })
  recipients: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateScheduledJobDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cronExpression?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  queryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  inlineSql?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  datasourceId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  recipients?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
