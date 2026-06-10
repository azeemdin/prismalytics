import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueriesController } from './queries.controller';
import { QueriesService } from './queries.service';
import { QueryFoldersController } from './query-folders.controller';
import { QueryFoldersService } from './query-folders.service';
import { Query, QueryExecution, QueryFolder, Datasource, TeamMember, Visualization } from '../../database/entities';
import { DatasourcesModule } from '../datasources/datasources.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Query, QueryExecution, QueryFolder, Datasource, TeamMember, Visualization]),
    DatasourcesModule,
    MetricsModule,
  ],
  controllers: [QueriesController, QueryFoldersController],
  providers: [QueriesService, QueryFoldersService],
  exports: [QueriesService],
})
export class QueriesModule {}
