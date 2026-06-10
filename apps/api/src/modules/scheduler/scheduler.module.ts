import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduledJob, Datasource } from '../../database/entities';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';
import { DatasourcesModule } from '../datasources/datasources.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { QueriesModule } from '../queries/queries.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduledJob, Datasource]),
    DatasourcesModule,
    NotificationsModule,
    QueriesModule,
  ],
  controllers: [SchedulerController],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
