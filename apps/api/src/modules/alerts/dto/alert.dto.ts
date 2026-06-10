import { PartialType, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsBoolean, IsOptional, IsArray, ValidateNested, IsEnum, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class AlertChannelDto {
  @ApiProperty({ enum: ['email', 'slack', 'webhook'] })
  @IsEnum(['email', 'slack', 'webhook'])
  type: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  target: string;

  @ApiPropertyOptional({ description: 'Dispatch immediately without admin confirmation' })
  @IsOptional()
  @IsBoolean()
  autoApprove?: boolean;
}

export class CreateAlertDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  datasourceId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sql: string;

  @ApiProperty({ enum: ['gt', 'lt', 'eq', 'gte', 'lte'] })
  @IsEnum(['gt', 'lt', 'eq', 'gte', 'lte'])
  condition: string;

  @ApiProperty()
  @IsNumber()
  threshold: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  columnName: string;

  @ApiProperty({ example: '*/15 * * * *' })
  @IsString()
  @IsNotEmpty()
  schedule: string;

  @ApiProperty({ type: () => [AlertChannelDto], default: [] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AlertChannelDto)
  channels: AlertChannelDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;
}

export class UpdateAlertDto extends PartialType(CreateAlertDto) {}
