import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemConfig } from '../../database/entities';
import { SystemConfigService } from './system-config.service';
import { SystemConfigController } from './system-config.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationsService } from '../notifications/notifications.service';
import { applyProxyConfig } from '../../common/utils/proxy.util';

@Module({
  imports: [TypeOrmModule.forFeature([SystemConfig]), NotificationsModule],
  providers: [SystemConfigService],
  controllers: [SystemConfigController],
  exports: [SystemConfigService],
})
export class SystemConfigModule implements OnModuleInit {
  constructor(
    private readonly systemConfig: SystemConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    // Wire SystemConfigService into NotificationsService so it can read DB-stored SMTP config
    this.notifications.setSystemConfig(this.systemConfig);
    // Reinitialize transporter using DB values (if any) at startup
    void this.notifications.reinitialize();
    // Apply proxy settings from DB at startup so all outbound fetch calls are routed correctly
    void this.systemConfig.getMany(['proxy.enabled', 'proxy.url', 'proxy.noProxy']).then((cfg) => {
      applyProxyConfig(
        cfg['proxy.enabled'] === 'true',
        cfg['proxy.url'] ?? null,
        cfg['proxy.noProxy'] ?? null,
      );
    });
  }
}
