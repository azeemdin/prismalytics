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
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { QueriesService } from './queries.service';
import { CreateQueryDto, UpdateQueryDto, ExecuteQueryDto } from './dto/query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, UserRole } from '../../database/entities';

@ApiTags('queries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('queries')
export class QueriesController {
  constructor(private readonly queriesService: QueriesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Save a new query' })
  create(@CurrentUser() user: User, @Body() dto: CreateQueryDto) {
    return this.queriesService.create(user.tenantId, user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List saved queries visible to the current user' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @CurrentUser() user: User,
    @Query('page') page = 1,
    @Query('limit') limit = 200,
  ) {
    return this.queriesService.findAll(user, { page: +page, limit: +limit });
  }

  @Get('history')
  @ApiOperation({ summary: 'Get query execution history' })
  getHistory(
    @CurrentUser() user: User,
    @Query('queryId') queryId?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.queriesService.getHistory(user.tenantId, queryId, +page, +limit);
  }

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute an ad-hoc SQL query' })
  execute(@CurrentUser() user: User, @Body() dto: ExecuteQueryDto) {
    return this.queriesService.execute(user.tenantId, user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a saved query by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.queriesService.findOne(id, user.tenantId);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Update a saved query' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQueryDto,
    @CurrentUser() user: User,
  ) {
    return this.queriesService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a saved query' })
  delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.queriesService.delete(id, user.tenantId);
  }

  @Post(':id/execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute a saved query by ID' })
  executeById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() body: { parameters?: Record<string, unknown> },
  ) {
    return this.queriesService.executeById(id, user.tenantId, user, body.parameters);
  }
}
