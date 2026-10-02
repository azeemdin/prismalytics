import {
  Controller,
  Get,
  Post,
  Put,
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
import { AlertsService } from './alerts.service';
import { CreateAlertDto, UpdateAlertDto } from './dto/alert.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, UserRole } from '../../database/entities';

@ApiTags('alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @ApiOperation({ summary: 'List all alert rules' })
  findAll(
    @CurrentUser() user: User,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.alertsService.findAll(user.tenantId, +page, +limit);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Create a new alert rule (starts inactive)' })
  create(@CurrentUser() user: User, @Body() dto: CreateAlertDto) {
    return this.alertsService.create(user.tenantId, dto);
  }

  // ─── Pending Notifications (admin-confirmed) ─────────────────────────────────
  // Declared BEFORE the ':id' routes: Nest matches in declaration order, so a
  // ':id' route above these would swallow /alerts/notifications/pending and
  // reject it with a 400 from ParseUUIDPipe.

  @Get('notifications/pending')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: list pending alert notifications awaiting confirmation' })
  getPendingNotifications(
    @CurrentUser() user: User,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    return this.alertsService.findPendingNotifications(user.tenantId, +page, +limit);
  }

  @Post('notifications/:notificationId/send')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: confirm and send a pending notification' })
  sendNotification(
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
    @CurrentUser() user: User,
  ) {
    return this.alertsService.confirmNotification(notificationId, user.tenantId, user.id);
  }

  @Patch('notifications/:notificationId/dismiss')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: dismiss a pending notification without sending' })
  dismissNotification(
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
    @CurrentUser() user: User,
  ) {
    return this.alertsService.dismissNotification(notificationId, user.tenantId);
  }

  // ─── Rule routes ─────────────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get alert rule by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.alertsService.findOne(id, user.tenantId);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Update alert rule fields (does not change active state)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAlertDto,
    @CurrentUser() user: User,
  ) {
    return this.alertsService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.EDITOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an alert rule' })
  delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.alertsService.delete(id, user.tenantId);
  }

  @Post(':id/activate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: activate rule — starts scheduled evaluation' })
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.alertsService.activateRule(id, user.tenantId);
  }

  @Post(':id/deactivate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: deactivate rule — stops scheduled evaluation' })
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.alertsService.deactivateRule(id, user.tenantId);
  }

  @Get(':id/evaluations')
  @ApiOperation({ summary: 'Get evaluation history for an alert rule' })
  getEvaluations(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.alertsService.getEvaluations(id, user.tenantId, +page, +limit);
  }
}
