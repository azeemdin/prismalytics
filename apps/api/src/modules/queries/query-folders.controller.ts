import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { QueryFoldersService } from './query-folders.service';
import { CreateQueryFolderDto, UpdateQueryFolderDto } from './dto/query-folder.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, UserRole } from '../../database/entities';

@ApiTags('query-folders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('query-folders')
export class QueryFoldersController {
  constructor(private readonly foldersService: QueryFoldersService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Create a query folder' })
  create(@CurrentUser() user: User, @Body() dto: CreateQueryFolderDto) {
    return this.foldersService.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List query folders visible to the current user' })
  findAll(@CurrentUser() user: User) {
    return this.foldersService.findAll(user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Rename or move a folder' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQueryFolderDto,
    @CurrentUser() user: User,
  ) {
    return this.foldersService.update(id, user, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a folder (contained queries move to root)' })
  delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.foldersService.delete(id, user);
  }
}
