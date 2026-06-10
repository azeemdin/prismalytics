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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardsService } from './dashboards.service';
import { CreateDashboardDto, UpdateDashboardDto } from './dto/dashboard.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, UserRole } from '../../database/entities';

@ApiTags('dashboards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly dashboardsService: DashboardsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Create a new dashboard' })
  create(@CurrentUser() user: User, @Body() dto: CreateDashboardDto) {
    return this.dashboardsService.create(user.tenantId, user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all dashboards' })
  findAll(
    @CurrentUser() user: User,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    const publishedOnly = user.role === UserRole.VIEWER;
    return this.dashboardsService.findAll(user.tenantId, +page, +limit, publishedOnly, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get dashboard by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    const publishedOnly = user.role === UserRole.VIEWER;
    return this.dashboardsService.findOne(id, user.tenantId, publishedOnly, user.id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Update dashboard (content + layout)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDashboardDto,
    @CurrentUser() user: User,
  ) {
    return this.dashboardsService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a dashboard' })
  delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.dashboardsService.delete(id, user.tenantId);
  }

  @Post(':id/duplicate')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Duplicate a dashboard' })
  duplicate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.dashboardsService.duplicate(id, user.tenantId, user);
  }

  @Post(':id/share')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Generate a public share link for this dashboard' })
  generateShareToken(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.dashboardsService.generateShareToken(id, user.tenantId);
  }

  @Delete(':id/share')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the public share link' })
  revokeShareToken(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.dashboardsService.revokeShareToken(id, user.tenantId);
  }

  // ─── Per-user sharing ────────────────────────────────────────────────────────

  @Get(':id/sharees')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'List users this dashboard has been shared with' })
  getSharees(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.dashboardsService.getSharees(id, user.tenantId);
  }

  @Post(':id/sharees')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Share dashboard with a specific user' })
  shareWithUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { userId: string },
    @CurrentUser() user: User,
  ) {
    return this.dashboardsService.shareWithUser(id, body.userId, user.tenantId, user.id);
  }

  @Delete(':id/sharees/:userId')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove per-user access to this dashboard' })
  unshareWithUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: User,
  ) {
    return this.dashboardsService.unshareWithUser(id, userId, user.tenantId);
  }
}
