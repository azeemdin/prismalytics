import { IsString, IsEnum, IsOptional, IsUUID, IsNumber, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChartType } from '../../../database/entities';

export class CreateVisualizationDto {
  @ApiPropertyOptional({ description: 'Omit to create a standalone chart in the library' })
  @IsOptional()
  @IsUUID()
  dashboardId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  queryId?: string;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty({ enum: ChartType })
  @IsEnum(ChartType)
  chartType: ChartType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  chartConfig?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  columnMapping?: {
    xAxis?: string;
    yAxis?: string | string[];
    series?: string;
    value?: string;
    label?: string;
  };

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  inlineSql?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  defaultParameters?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  parameterMappings?: Record<string, string>;
}

export class UpdateVisualizationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ enum: ChartType })
  @IsOptional()
  @IsEnum(ChartType)
  chartType?: ChartType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  chartConfig?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  columnMapping?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  inlineSql?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  queryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  defaultParameters?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  parameterMappings?: Record<string, string>;
}
