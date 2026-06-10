import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Public } from '../../common/decorators/public.decorator';
import { DashboardsService } from './dashboards.service';
import { Visualization, Datasource } from '../../database/entities';
import { DatasourcesService } from '../datasources/datasources.service';
import { createConnector } from '../datasources/connectors/connector.factory';

const MAX_ROWS = 10_000;
const QUERY_TIMEOUT_MS = 30_000;
const SQL_ALLOWLIST = /^\s*SELECT\b/i;
const SQL_BLOCKLIST = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|CREATE|ALTER|GRANT|REVOKE|EXEC|EXECUTE|CALL)\b/i;

@ApiTags('public')
@Public()
@Controller('public')
export class PublicDashboardController {
  constructor(
    private readonly dashboardsService: DashboardsService,
    private readonly datasourcesService: DatasourcesService,
    @InjectRepository(Visualization) private vizRepo: Repository<Visualization>,
    @InjectRepository(Datasource) private dsRepo: Repository<Datasource>,
  ) {}

  @Get('dashboards/:token')
  @ApiOperation({ summary: 'Get public dashboard by share token (no auth)' })
  async getDashboard(@Param('token') token: string) {
    return this.dashboardsService.findByShareToken(token);
  }

  @Get('dashboards/:token/visualizations')
  @ApiOperation({ summary: 'Get visualizations for a public dashboard' })
  async getVisualizations(@Param('token') token: string) {
    const dashboard = await this.dashboardsService.findByShareToken(token);
    return this.vizRepo.find({
      where: { dashboardId: dashboard.id, tenantId: dashboard.tenantId },
      order: { sortOrder: 'ASC' },
      relations: ['query'],
    });
  }

  @Post('dashboards/:token/query')
  @ApiOperation({ summary: 'Execute a query for a public dashboard visualization' })
  async runQuery(
    @Param('token') token: string,
    @Body() body: {
      sql: string;
      datasourceId: string;
      parameters?: Record<string, unknown>;
      targetCollection?: string;
      targetDatabase?: string;
    },
  ) {
    const dashboard = await this.dashboardsService.findByShareToken(token);

    const ds = await this.dsRepo.findOne({
      where: { id: body.datasourceId, tenantId: dashboard.tenantId },
      select: { id: true, type: true, config: true, encryptedPassword: true },
    });
    if (!ds) throw new NotFoundException('Datasource not found');

    const isMongo = ds.type === 'mongodb';
    if (!isMongo) {
      if (!SQL_ALLOWLIST.test(body.sql)) throw new BadRequestException('Only SELECT queries are allowed');
      if (SQL_BLOCKLIST.test(body.sql)) throw new BadRequestException('Query contains disallowed operations');
    }

    const password = this.datasourcesService.getDecryptedPassword(ds);
    const connector = createConnector(ds, password);

    try {
      let execSql = body.sql;
      const execValues: unknown[] = [];

      if (isMongo && body.targetCollection) {
        try {
          const parsed = JSON.parse(body.sql.trim()) as unknown;
          const isFullQuery =
            !Array.isArray(parsed) &&
            typeof parsed === 'object' &&
            parsed !== null &&
            Boolean((parsed as Record<string, unknown>).collection);
          if (!isFullQuery) {
            const mongoQuery: Record<string, unknown> = Array.isArray(parsed)
              ? { collection: body.targetCollection, pipeline: parsed }
              : { collection: body.targetCollection, filter: parsed };
            execSql = JSON.stringify(mongoQuery);
          }
        } catch {
          throw new BadRequestException('Invalid JSON query');
        }
      } else if (!isMongo && body.parameters && Object.keys(body.parameters).length > 0) {
        const values: unknown[] = [];
        let index = 1;
        execSql = body.sql.replace(/:([a-zA-Z_]\w*)/g, (_m, name: string) => {
          if (name in body.parameters!) {
            values.push(body.parameters![name]);
            return `$${index++}`;
          }
          return `:${name}`;
        });
        execValues.push(...values);
      }

      const resultPromise = connector.query(execSql, execValues, body.targetDatabase);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Query timeout')), QUERY_TIMEOUT_MS),
      );
      const result = await Promise.race([resultPromise, timeoutPromise]);
      if (result.rows.length > MAX_ROWS) result.rows = result.rows.slice(0, MAX_ROWS);
      return { ...result, truncated: result.rowCount > MAX_ROWS };
    } finally {
      await connector.close().catch(() => {});
    }
  }
}
