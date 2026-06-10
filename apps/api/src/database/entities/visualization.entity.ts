import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AppBaseEntity } from './base.entity';
import { Tenant } from './tenant.entity';
import { Dashboard } from './dashboard.entity';
import { Query } from './query.entity';
import { jsonColumn, enumColType } from '../column-helpers';

export enum ChartType {
  LINE = 'line',
  BAR = 'bar',
  AREA = 'area',
  PIE = 'pie',
  SCATTER = 'scatter',
  TABLE = 'table',
  HEATMAP = 'heatmap',
  FUNNEL = 'funnel',
  GAUGE = 'gauge',
  TREEMAP = 'treemap',
  METRIC = 'metric',
  PIVOT = 'pivot',
}

@Entity('visualizations')
@Index(['tenantId'])
@Index(['dashboardId'])
export class Visualization extends AppBaseEntity {
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'dashboard_id', nullable: true })
  dashboardId: string | null;

  @ManyToOne(() => Dashboard, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dashboard_id' })
  dashboard: Dashboard | null;

  @Column({ name: 'query_id', nullable: true })
  queryId?: string;

  @ManyToOne(() => Query, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'query_id' })
  query?: Query;

  @Column()
  title: string;

  @Column({ type: enumColType(), enum: ChartType })
  chartType: ChartType;

  @Column(jsonColumn())
  chartConfig: Record<string, unknown> = {};

  @Column(jsonColumn({ nullable: true }))
  columnMapping?: {
    xAxis?: string;
    yAxis?: string | string[];
    series?: string;
    value?: string;
    label?: string;
  };

  @Column({ nullable: true })
  inlineSql?: string;

  @Column(jsonColumn({ nullable: true }))
  defaultParameters?: Record<string, string>;

  // Maps query param name → incoming field name (cross-filter/drill-down field)
  // e.g. { givenDate: "Day" } means :givenDate receives the value of the "Day" cross-filter
  @Column(jsonColumn({ nullable: true }))
  parameterMappings?: Record<string, string>;

  @Column({ default: 0 })
  sortOrder: number;
}
