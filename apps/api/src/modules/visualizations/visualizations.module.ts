import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VisualizationsController } from './visualizations.controller';
import { VisualizationsService } from './visualizations.service';
import { Visualization } from '../../database/entities';

@Module({
  imports: [TypeOrmModule.forFeature([Visualization])],
  controllers: [VisualizationsController],
  providers: [VisualizationsService],
  exports: [VisualizationsService],
})
export class VisualizationsModule {}
