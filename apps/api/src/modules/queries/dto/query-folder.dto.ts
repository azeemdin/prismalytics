import { IsString, IsEnum, IsOptional, IsUUID, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QueryVisibility } from '../../../database/entities';

export class CreateQueryFolderDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Parent folder UUID — omit for a root-level folder' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ enum: QueryVisibility, default: QueryVisibility.PRIVATE })
  @IsOptional()
  @IsEnum(QueryVisibility)
  visibility?: QueryVisibility;
}

export class UpdateQueryFolderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Move to a different parent folder. Send null to move to root.' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ enum: QueryVisibility })
  @IsOptional()
  @IsEnum(QueryVisibility)
  visibility?: QueryVisibility;
}
