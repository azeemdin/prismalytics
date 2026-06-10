import { IsString, IsEnum, IsOptional, IsNumber, IsBoolean, ValidateNested, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DatasourceType, DatasourceVisibility } from '../../../database/entities';

export class DatasourceConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  host?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  port?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  database?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  ssl?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  connectionStringMode?: boolean;

  // Oracle connector
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serviceName?: string;

  // REST API connector
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  baseUrl?: string;

  // Elasticsearch connector
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  index?: string;
}

export class CreateDatasourceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: DatasourceType })
  @IsEnum(DatasourceType)
  type: DatasourceType;

  @ApiPropertyOptional({ enum: DatasourceVisibility })
  @IsOptional()
  @IsEnum(DatasourceVisibility)
  visibility?: DatasourceVisibility;

  @ApiProperty()
  @ValidateNested()
  @Type(() => DatasourceConfigDto)
  config: DatasourceConfigDto;
}

export class UpdateDatasourceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: DatasourceVisibility })
  @IsOptional()
  @IsEnum(DatasourceVisibility)
  visibility?: DatasourceVisibility;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => DatasourceConfigDto)
  config?: DatasourceConfigDto;
}
