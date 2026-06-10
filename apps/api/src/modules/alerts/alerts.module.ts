import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertRule } from '../../database/entities/alert-rule.entity';
import { AlertEvaluation } from '../../database/entities/alert-evaluation.entity';
import { AlertNotification } from '../../database/entities/alert-notification.entity';
import { Datasource } from '../../database/entities/datasource.entity';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { DatasourcesModule } from '../datasources/datasources.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AlertRule, AlertEvaluation, AlertNotification, Datasource]),
    DatasourcesModule,
    NotificationsModule,
  ],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
