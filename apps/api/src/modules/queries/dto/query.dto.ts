import { IsString, IsUUID, IsOptional, IsEnum, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QueryStatus, QueryVisibility } from '../../../database/entities';

export class QueryParameterDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ enum: ['string', 'number', 'date', 'boolean'] })
  type: 'string' | 'number' | 'date' | 'boolean';

  @ApiPropertyOptional()
  @IsOptional()
  defaultValue?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  required?: boolean;
}

export class CreateQueryDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsUUID()
  datasourceId: string;

  @ApiProperty()
  @IsString()
  sql: string;

  @ApiPropertyOptional({ description: 'MongoDB collection (for queries that use a collection picker)' })
  @IsOptional()
  @IsString()
  targetCollection?: string;

  @ApiPropertyOptional({ description: 'MongoDB database for this query' })
  @IsOptional()
  @IsString()
  targetDatabase?: string;

  @ApiPropertyOptional({ type: [QueryParameterDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QueryParameterDto)
  parameters?: QueryParameterDto[];

  @ApiPropertyOptional({ description: 'Folder to save the query in' })
  @IsOptional()
  @IsUUID()
  folderId?: string;

  @ApiPropertyOptional({ enum: QueryVisibility, default: QueryVisibility.EDITORS })
  @IsOptional()
  @IsEnum(QueryVisibility)
  visibility?: QueryVisibility;
}

export class UpdateQueryDto {
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
  sql?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetCollection?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetDatabase?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(QueryStatus)
  status?: QueryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QueryParameterDto)
  parameters?: QueryParameterDto[];

  @ApiPropertyOptional({ description: 'Move query to a different folder. Send empty string to remove from folder.' })
  @IsOptional()
  @IsUUID()
  folderId?: string;

  @ApiPropertyOptional({ enum: QueryVisibility })
  @IsOptional()
  @IsEnum(QueryVisibility)
  visibility?: QueryVisibility;
}

export class ExecuteQueryDto {
  @ApiProperty({ description: 'Raw SQL to execute' })
  @IsString()
  sql: string;

  @ApiProperty()
  @IsUUID()
  datasourceId: string;

  @ApiPropertyOptional()
  @IsOptional()
  parameters?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Target database/schema to run the query against' })
  @IsOptional()
  @IsString()
  targetDatabase?: string;

  @ApiPropertyOptional({ description: 'MongoDB collection to query (allows bare filter {} or pipeline [{...}] in sql field)' })
  @IsOptional()
  @IsString()
  targetCollection?: string;
}
