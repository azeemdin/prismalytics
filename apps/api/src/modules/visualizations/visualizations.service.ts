import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Visualization } from '../../database/entities';
import { CreateVisualizationDto, UpdateVisualizationDto } from './dto/visualization.dto';

@Injectable()
export class VisualizationsService {
  constructor(
    @InjectRepository(Visualization) private vizRepo: Repository<Visualization>,
  ) {}

  async create(tenantId: string, dto: CreateVisualizationDto) {
    const viz = this.vizRepo.create({
      tenantId,
      dashboardId: dto.dashboardId ?? null,
      queryId: dto.queryId,
      title: dto.title,
      chartType: dto.chartType,
      chartConfig: dto.chartConfig ?? {},
      columnMapping: dto.columnMapping,
      inlineSql: dto.inlineSql,
      defaultParameters: dto.defaultParameters,
      parameterMappings: dto.parameterMappings,
    });
    return this.vizRepo.save(viz);
  }

  async findByDashboard(dashboardId: string, tenantId: string) {
    return this.vizRepo.find({
      where: { dashboardId, tenantId },
      order: { sortOrder: 'ASC' },
      relations: ['query'],
    });
  }

  // Library: all tenant visualizations — includes standalone charts and auto-dashboard charts
  async findLibrary(tenantId: string) {
    return this.vizRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      relations: ['query', 'query.datasource'],
    });
  }

  async findOne(id: string, tenantId: string) {
    const viz = await this.vizRepo.findOne({ where: { id, tenantId } });
    if (!viz) throw new NotFoundException('Visualization not found');
    return viz;
  }

  async update(id: string, tenantId: string, dto: UpdateVisualizationDto) {
    const viz = await this.findOne(id, tenantId);
    Object.assign(viz, dto);
    return this.vizRepo.save(viz);
  }

  async delete(id: string, tenantId: string) {
    const viz = await this.findOne(id, tenantId);
    await this.vizRepo.remove(viz);
  }
}
