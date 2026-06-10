/**
 * @prismalytics/shared-types
 *
 * Shared TypeScript interfaces and types used across the prismalytics platform.
 * These types are consumed by both the API (backend) and Web (frontend) apps.
 */

// â”€â”€â”€ User & Auth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type UserRole = 'admin' | 'editor' | 'viewer';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// â”€â”€â”€ Tenant â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  settings: TenantSettings;
  createdAt: string;
}

export interface TenantSettings {
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
  };
  ai?: {
    provider: LLMProvider;
    apiKeyConfigured: boolean;
  };
}

// â”€â”€â”€ Data Source â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface DataSource {
  id: string;
  tenantId: string;
  name: string;
  type: DataSourceType;
  host: string;
  port: number;
  database: string;
  username: string;
  // password is never sent to frontend
  status: 'connected' | 'disconnected' | 'error';
  createdAt: string;
}

export type DataSourceType =
  | 'postgresql'
  | 'mysql'
  | 'mssql'
  | 'oracle'
  | 'sqlite'
  | 'mongodb'
  | 'elasticsearch'
  | 'rest_api'
  | 'csv'
  | 'excel'
  | 'bigquery'
  | 'snowflake'
  | 'redshift';

// â”€â”€â”€ Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface Dashboard {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  layout: DashboardLayout;
  filters: DashboardFilter[];
  isPublic: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardLayout {
  widgets: DashboardWidget[];
}

export interface DashboardWidget {
  id: string;
  type: 'chart' | 'table' | 'metric' | 'text';
  position: { x: number; y: number; w: number; h: number };
  config: Record<string, unknown>;
  queryId?: string;
}

export interface DashboardFilter {
  id: string;
  field: string;
  type: 'select' | 'date_range' | 'text' | 'number';
  defaultValue?: unknown;
}

// â”€â”€â”€ Query â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface SavedQuery {
  id: string;
  tenantId: string;
  name: string;
  sql: string;
  datasourceId: string;
  parameters?: QueryParameter[];
  createdBy: string;
  createdAt: string;
}

export interface QueryParameter {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  defaultValue?: unknown;
}

export interface QueryResult {
  columns: ColumnMeta[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
}

export interface ColumnMeta {
  name: string;
  type: string;
}

// â”€â”€â”€ AI / LLM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type LLMProvider = 'gemini' | 'claude' | 'openrouter' | 'ollama';

export interface AiConfigStatus {
  configured: boolean;
  provider: LLMProvider;
  message: string;
}

export interface NlToSqlRequest {
  prompt: string;
  datasourceId: string;
}

export interface NlToSqlResponse {
  sql: string;
  explanation: string;
  confidence: number;
}

export interface AiReportRequest {
  prompt: string;
  datasourceId: string;
  context?: {
    tables?: string[];
    dateRange?: { from: string; to: string };
  };
  outputFormat: 'dashboard' | 'pdf' | 'markdown';
}

// â”€â”€â”€ API Response Envelope â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: PaginationMeta;
  error?: ApiError;
  timestamp: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
