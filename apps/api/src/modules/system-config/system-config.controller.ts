import {
  Controller, Get, Patch, Post, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, UserRole } from '../../database/entities';
import { SystemConfigService } from './system-config.service';
import { UpdateSystemConfigDto } from './dto/system-config.dto';
import { NotificationsService, encryptSmtpPassword } from '../notifications/notifications.service';
import { applyProxyConfig } from '../../common/utils/proxy.util';

const SMTP_KEYS = ['smtp.host', 'smtp.port', 'smtp.secure', 'smtp.user', 'smtp.from'] as const;

@ApiTags('system-config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('system-config')
export class SystemConfigController {
  constructor(
    private readonly service: SystemConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get system configuration values (admin)' })
  @ApiQuery({ name: 'keys', required: false, description: 'Comma-separated key names to filter' })
  async getConfig(@Query('keys') keysParam?: string) {
    if (keysParam) {
      const keys = keysParam.split(',').map((k) => k.trim()).filter(Boolean);
      return this.service.getMany(keys);
    }
    return this.service.getAll();
  }

  @Patch()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update system configuration values (admin)' })
  async updateConfig(@Body() dto: UpdateSystemConfigDto) {
    await this.service.setMany(dto.config);
    return { updated: Object.keys(dto.config).length };
  }

  // ─── SMTP ────────────────────────────────────────────────────────────────────

  @Get('smtp')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get SMTP configuration (password masked)' })
  async getSmtp() {
    const values = await this.service.getMany([...SMTP_KEYS]);
    return {
      host: values['smtp.host'] ?? '',
      port: values['smtp.port'] ? parseInt(values['smtp.port'], 10) : 587,
      secure: values['smtp.secure'] === 'true',
      user: values['smtp.user'] ?? '',
      from: values['smtp.from'] ?? '',
      hasPassword: !!(await this.service.get('smtp.pass')),
    };
  }

  @Patch('smtp')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save SMTP configuration and reinitialize mail transporter' })
  async updateSmtp(
    @Body() body: {
      host: string;
      port?: number;
      secure?: boolean;
      user?: string;
      pass?: string;
      from?: string;
    },
  ) {
    const entries: Record<string, string | null> = {
      'smtp.host': body.host || null,
      'smtp.port': body.port != null ? String(body.port) : null,
      'smtp.secure': body.secure != null ? String(body.secure) : null,
      'smtp.user': body.user || null,
      'smtp.from': body.from || null,
    };
    if (body.pass) {
      entries['smtp.pass'] = encryptSmtpPassword(body.pass);
    }
    await this.service.setMany(entries);
    await this.notifications.reinitialize();
    return { updated: true };
  }

  @Post('smtp/test')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a test email to the requesting admin' })
  async testSmtp(@CurrentUser() user: User) {
    return this.notifications.sendTestEmail(user.email);
  }

  // ─── CORS ────────────────────────────────────────────────────────────────────

  @Get('cors')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get CORS allowed origins' })
  async getCors() {
    const origins = await this.service.get('cors.origins');
    return { origins: origins ?? '' };
  }

  @Patch('cors')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update CORS allowed origins (takes effect immediately)' })
  async updateCors(@Body() body: { origins: string }) {
    await this.service.set('cors.origins', body.origins || null);
    return { updated: true, note: 'Changes take effect immediately for new requests' };
  }

  // ─── Proxy ────────────────────────────────────────────────────────────────────

  @Get('proxy')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get outbound proxy configuration' })
  async getProxy() {
    const cfg = await this.service.getMany(['proxy.enabled', 'proxy.url', 'proxy.noProxy']);
    return {
      enabled: cfg['proxy.enabled'] === 'true',
      url: cfg['proxy.url'] ?? '',
      noProxy: cfg['proxy.noProxy'] ?? '',
    };
  }

  @Patch('proxy')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update outbound proxy configuration (takes effect immediately)' })
  async updateProxy(@Body() body: { enabled: boolean; url?: string; noProxy?: string }) {
    await this.service.setMany({
      'proxy.enabled': body.enabled ? 'true' : 'false',
      'proxy.url': body.url || null,
      'proxy.noProxy': body.noProxy || null,
    });
    applyProxyConfig(body.enabled, body.url || null, body.noProxy || null);
    return { updated: true };
  }
}
