import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';
import { PublicDashboardController } from './public-dashboard.controller';
import { Dashboard, DashboardShare, TeamMember, Visualization, Datasource, Query, QueryFolder } from '../../database/entities';
import { DatasourcesModule } from '../datasources/datasources.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Dashboard, DashboardShare, TeamMember, Visualization, Datasource, Query, QueryFolder]),
    DatasourcesModule,
  ],
  controllers: [DashboardsController, PublicDashboardController],
  providers: [DashboardsService],
  exports: [DashboardsService],
})
export class DashboardsModule {}
