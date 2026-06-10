import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { DatasourcesService } from './datasources.service';
import { CreateDatasourceDto, UpdateDatasourceDto } from './dto/datasource.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, UserRole } from '../../database/entities';

interface MulterFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

@ApiTags('datasources')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('datasources')
export class DatasourcesController {
  constructor(private readonly datasourcesService: DatasourcesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Create a new data source connection' })
  create(@CurrentUser() user: User, @Body() dto: CreateDatasourceDto) {
    return this.datasourcesService.create(user.tenantId, user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all data sources in the tenant' })
  findAll(@CurrentUser() user: User) {
    return this.datasourcesService.findAll(user.tenantId, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a data source by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.datasourcesService.findOne(id, user.tenantId, user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Update a data source configuration' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDatasourceDto,
    @CurrentUser() user: User,
  ) {
    return this.datasourcesService.update(id, user.tenantId, user, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a data source' })
  delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.datasourcesService.delete(id, user.tenantId, user);
  }

  @Post(':id/test')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test data source connection' })
  testConnection(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.datasourcesService.testConnection(id, user.tenantId, user);
  }

  @Get(':id/databases')
  @ApiOperation({ summary: 'List available databases or schemas for this connection' })
  getDatabases(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.datasourcesService.getDatabases(id, user.tenantId, user);
  }

  @Get(':id/collections')
  @ApiOperation({ summary: 'List collections in a database (MongoDB)' })
  getCollections(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('database') database: string,
    @CurrentUser() user: User,
  ) {
    if (!database) throw new BadRequestException('database query param is required');
    return this.datasourcesService.getCollections(id, user.tenantId, database, user);
  }

  @Get(':id/schema')
  @ApiOperation({ summary: 'Retrieve schema metadata (tables + columns)' })
  getSchema(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Query('schema') schema?: string,
  ) {
    return this.datasourcesService.getSchema(id, user.tenantId, user, schema);
  }

  @Post('upload')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a CSV or Excel file as a virtual datasource' })
  uploadFile(@CurrentUser() user: User, @UploadedFile() file: MulterFile) {
    if (!file) throw new BadRequestException('file is required');
    return this.datasourcesService.uploadFile(user.tenantId, user, file);
  }
}
