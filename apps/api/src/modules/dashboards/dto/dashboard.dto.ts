import { IsString, IsEnum, IsOptional, IsArray, IsBoolean, IsNumber, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DashboardStatus, DashboardVisibility } from '../../../database/entities';

class LayoutItemDto {
  @IsString() i: string;
  @IsNumber() x: number;
  @IsNumber() y: number;
  @IsNumber() w: number;
  @IsNumber() h: number;
}

class DashboardFilterDto {
  @IsString() id: string;
  @IsString() label: string;
  @IsIn(['date_range', 'select', 'text']) type: 'date_range' | 'select' | 'text';
  @IsOptional() defaultValue?: unknown;
}

export class CreateDashboardDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: DashboardVisibility })
  @IsOptional()
  @IsEnum(DashboardVisibility)
  visibility?: DashboardVisibility;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  refreshIntervalSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DashboardFilterDto)
  filters?: DashboardFilterDto[];
}

export class UpdateDashboardDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: DashboardStatus })
  @IsOptional()
  @IsEnum(DashboardStatus)
  status?: DashboardStatus;

  @ApiPropertyOptional({ enum: DashboardVisibility })
  @IsOptional()
  @IsEnum(DashboardVisibility)
  visibility?: DashboardVisibility;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LayoutItemDto)
  layout?: LayoutItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  refreshIntervalSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DashboardFilterDto)
  filters?: DashboardFilterDto[];
}
