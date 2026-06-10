import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { Tenant, User, Datasource, Dashboard, Query } from '../../database/entities';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, User, Datasource, Dashboard, Query])],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
