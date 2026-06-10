import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiApiKey, AiUsageRecord, Datasource, Query, QueryFolder, Tenant, AiPromptTemplate, User } from '../../database/entities';
import { Dashboard } from '../../database/entities/dashboard.entity';
import { Visualization } from '../../database/entities/visualization.entity';
import { SystemConfigModule } from '../system-config/system-config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiApiKey, AiUsageRecord, Datasource, Query, QueryFolder, Tenant, AiPromptTemplate, Dashboard, Visualization, User]),
    SystemConfigModule,
  ],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
