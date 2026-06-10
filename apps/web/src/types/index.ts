export type UserRole = 'admin' | 'editor' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  provider: 'local' | 'keycloak';
  tenantId: string;
  isActive: boolean;
  aiEnabled: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  description?: string;
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
  };
}

export type DatasourceType = 'postgresql' | 'mysql' | 'mssql' | 'sqlite' | 'mongodb' | 'rest_api' | 'elasticsearch' | 'csv' | 'oracle';
export type DatasourceStatus = 'active' | 'inactive' | 'error';

export interface Datasource {
  id: string;
  name: string;
  description?: string;
  type: DatasourceType;
  status: DatasourceStatus;
  visibility: 'private' | 'team' | 'shared';
  createdById: string;
  config: {
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    ssl?: boolean;
    connectionStringMode?: boolean;
    serviceName?: string;
    baseUrl?: string;
    index?: string;
  };
  lastTestedAt?: string;
  lastErrorMessage?: string;
  createdAt: string;
  createdBy?: User;
}

export interface QueryColumn {
  name: string;
  type: string;
}

export interface QueryResult {
  columns: QueryColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  truncated?: boolean;
}

export type ChartType = 'line' | 'bar' | 'area' | 'pie' | 'scatter' | 'table' | 'heatmap' | 'funnel' | 'gauge' | 'treemap' | 'metric' | 'pivot';

export interface Visualization {
  id: string;
  dashboardId: string | null;
  queryId?: string;
  /** Populated when the backend returns the query relation (e.g. public dashboard endpoints) */
  query?: {
    name?: string;
    sql: string;
    datasourceId: string;
    targetCollection?: string;
    targetDatabase?: string;
    datasource?: { id: string; name: string; type?: string };
  };
  title: string;
  chartType: ChartType;
  chartConfig: Record<string, unknown>;
  columnMapping?: {
    xAxis?: string;
    yAxis?: string | string[];
    series?: string;
    value?: string;
    label?: string;
  };
  inlineSql?: string;
  defaultParameters?: Record<string, string>;
  parameterMappings?: Record<string, string>;
  sortOrder: number;
}

export interface DashboardLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardFilter {
  id: string;
  label: string;
  type: 'date_range' | 'select' | 'text';
  defaultValue?: unknown;
}

export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'published';
  visibility: 'private' | 'team' | 'public';
  layout: DashboardLayoutItem[];
  filters?: DashboardFilter[];
  refreshIntervalSeconds?: number;
  shareToken?: string;
  aiSummary?: {
    summary: string;
    insights: string[];
    anomalies: string[];
    generatedAt: string;
  };
  createdAt: string;
  updatedAt: string;
  createdBy?: User;
}

export interface DashboardSharee {
  dashboardId: string;
  userId: string;
  user: User;
  grantedById: string;
  createdAt: string;
}

export interface TeamMember {
  ownerId: string;
  memberId: string;
  tenantId: string;
  createdAt: string;
  member: User;
}

export type QueryVisibility = 'private' | 'team' | 'editors';

export interface QueryFolder {
  id: string;
  name: string;
  parentId?: string;
  visibility: QueryVisibility;
  createdById: string;
  createdBy?: User;
  createdAt: string;
  updatedAt: string;
}

export interface SavedQuery {
  id: string;
  name: string;
  description?: string;
  datasourceId: string;
  sql: string;
  targetCollection?: string;
  targetDatabase?: string;
  status: 'draft' | 'published';
  runCount: number;
  folderId?: string;
  folder?: QueryFolder;
  visibility: QueryVisibility;
  createdAt: string;
  createdBy?: User;
  datasource?: Datasource;
}

export interface ScheduledJob {
  id: string;
  name: string;
  description?: string;
  cronExpression: string;
  queryId?: string;
  inlineSql?: string;
  datasourceId?: string;
  recipients: string[];
  enabled: boolean;
  lastRunAt?: string;
  lastRunStatus?: 'success' | 'failure';
  lastError?: string;
  createdAt: string;
}

export interface QueryExecution {
  id: string;
  sql: string;
  datasourceId: string;
  success: boolean;
  rowCount?: number;
  durationMs?: number;
  errorMessage?: string;
  createdAt: string;
  executedBy?: User;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: { page: number; total: number; limit: number };
  error?: { code: string; message: string };
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  limit: number;
}
