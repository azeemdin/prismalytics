import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, UserRole } from '../../database/entities';
import { IS_SQLITE } from '../../database/column-helpers';

interface SearchHit {
  id: string;
  name: string;
  description: string | null;
  type: 'query' | 'dashboard';
}

@ApiTags('search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('search')
export class SearchController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  @ApiOperation({ summary: 'Full-text search across queries and dashboards' })
  async search(
    @CurrentUser() user: User,
    @Query('q') q: string,
    @Query('types') types?: string,
  ): Promise<{ queries: SearchHit[]; dashboards: SearchHit[] }> {
    if (!q || q.trim().length < 2) {
      return { queries: [], dashboards: [] };
    }

    const term = q.trim();
    const isViewer = user.role === UserRole.VIEWER;
    const requestedTypes = types ? types.split(',').map((t) => t.trim()) : ['queries', 'dashboards'];
    // Viewers cannot access the queries page — exclude query results entirely
    const includeTypes = isViewer
      ? requestedTypes.filter((t) => t !== 'queries')
      : requestedTypes;

    const queryResults: SearchHit[] = [];
    const dashboardResults: SearchHit[] = [];

    if (IS_SQLITE) {
      const like = `%${term.replace(/[%_]/g, '')}%`;
      if (includeTypes.includes('queries')) {
        const rows = await this.dataSource.query<{ id: string; name: string; description: string | null }[]>(
          `SELECT id, name, description FROM queries
           WHERE tenant_id = ? AND (name LIKE ? OR COALESCE(description,'') LIKE ?)
           LIMIT 10`,
          [user.tenantId, like, like],
        );
        for (const r of rows) {
          queryResults.push({ id: r.id, name: r.name, description: r.description, type: 'query' });
        }
      }
      if (includeTypes.includes('dashboards')) {
        const accessFilter = isViewer
          ? `AND status = 'published'
             AND (visibility = 'public'
                  OR EXISTS (SELECT 1 FROM team_members tm
                             WHERE tm.owner_id = dashboards.created_by_id AND tm.member_id = ?)
                  OR EXISTS (SELECT 1 FROM dashboard_shares ds
                             WHERE ds.dashboard_id = dashboards.id AND ds.user_id = ?))`
          : '';
        const params: unknown[] = isViewer
          ? [user.tenantId, like, like, user.id, user.id]
          : [user.tenantId, like, like];
        const rows = await this.dataSource.query<{ id: string; name: string; description: string | null }[]>(
          `SELECT id, name, description FROM dashboards
           WHERE tenant_id = ? AND (name LIKE ? OR COALESCE(description,'') LIKE ?) ${accessFilter}
           LIMIT 10`,
          params,
        );
        for (const r of rows) {
          dashboardResults.push({ id: r.id, name: r.name, description: r.description, type: 'dashboard' });
        }
      }
    } else {
      const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

      if (includeTypes.includes('queries')) {
        const rows = await this.dataSource.query<{ id: string; name: string; description: string | null }[]>(
          `SELECT id, name, description
           FROM queries
           WHERE tenant_id = $1
             AND (
               LOWER(name) LIKE LOWER($2)
               OR LOWER(COALESCE(description, '')) LIKE LOWER($2)
               OR to_tsvector('english', name || ' ' || COALESCE(description, ''))
                    @@ plainto_tsquery('english', $3)
             )
           ORDER BY
             CASE WHEN LOWER(name) LIKE LOWER($2) THEN 0 ELSE 1 END,
             name
           LIMIT 10`,
          [user.tenantId, like, term],
        );
        for (const r of rows) {
          queryResults.push({ id: r.id, name: r.name, description: r.description, type: 'query' });
        }
      }

      if (includeTypes.includes('dashboards')) {
        const accessClause = isViewer
          ? `AND status = 'published'
             AND (visibility = 'public'
                  OR EXISTS (SELECT 1 FROM team_members tm
                             WHERE tm.owner_id = dashboards.created_by_id AND tm.member_id = $4)
                  OR EXISTS (SELECT 1 FROM dashboard_shares ds
                             WHERE ds.dashboard_id = dashboards.id AND ds.user_id = $5))`
          : '';
        const params: unknown[] = isViewer
          ? [user.tenantId, like, term, user.id, user.id]
          : [user.tenantId, like, term];
        const rows = await this.dataSource.query<{ id: string; name: string; description: string | null }[]>(
          `SELECT id, name, description
           FROM dashboards
           WHERE tenant_id = $1
             ${accessClause}
             AND (
               LOWER(name) LIKE LOWER($2)
               OR LOWER(COALESCE(description, '')) LIKE LOWER($2)
               OR to_tsvector('english', name || ' ' || COALESCE(description, ''))
                    @@ plainto_tsquery('english', $3)
             )
           ORDER BY
             CASE WHEN LOWER(name) LIKE LOWER($2) THEN 0 ELSE 1 END,
             name
           LIMIT 10`,
          params,
        );
        for (const r of rows) {
          dashboardResults.push({ id: r.id, name: r.name, description: r.description, type: 'dashboard' });
        }
      }
    }

    return { queries: queryResults, dashboards: dashboardResults };
  }
}
