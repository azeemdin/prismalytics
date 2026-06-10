import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, UserRole } from '../../database/entities';

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('current')
  @ApiOperation({ summary: 'Get current tenant details' })
  getCurrent(@CurrentUser() user: User) {
    return this.tenantsService.findOne(user.tenantId);
  }

  @Get('current/stats')
  @ApiOperation({ summary: 'Get tenant usage statistics' })
  getStats(@CurrentUser() user: User) {
    return this.tenantsService.getStats(user.tenantId);
  }

  @Patch('current/settings')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update tenant settings (admin only)' })
  updateSettings(
    @CurrentUser() user: User,
    @Body() body: { settings?: Record<string, unknown>; branding?: Record<string, unknown> },
  ) {
    return this.tenantsService.updateSettings(user.tenantId, body.settings, body.branding);
  }
}
