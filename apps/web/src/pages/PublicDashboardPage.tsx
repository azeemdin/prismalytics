import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Typography, Spin, Alert, Card, Space, Input, Button, Tag } from 'antd';
import { BarChartOutlined, FilterOutlined, CloseCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import { ResponsiveGridLayout, useContainerWidth } from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import ChartRenderer from '../components/charts/ChartRenderer';
import type { Dashboard, Visualization, QueryResult } from '../types';

const { Title, Text } = Typography;

// Unauthenticated axios instance for public endpoints
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';
const publicApi = axios.create({ baseURL: BASE_URL });

interface PublicVisualization extends Visualization {
  query?: {
    sql: string;
    datasourceId: string;
    targetCollection?: string;
    targetDatabase?: string;
    parameters?: { name: string; type: string; defaultValue?: unknown; required?: boolean }[];
  };
}

// Cross-filter: set when a user clicks a chart element
interface CrossFilterValue {
  field: string;
  value: unknown;
  sourceVizId: string;
}

interface VizCardPublicProps {
  viz: PublicVisualization;
  token: string;
  crossFilters: CrossFilterValue[];
  onCrossFilter: (sourceVizId: string, field: string, value: unknown) => void;
}

function resolveParameters(
  viz: PublicVisualization,
  crossFilters: CrossFilterValue[],
): Record<string, unknown> {
  const base: Record<string, unknown> = { ...(viz.defaultParameters ?? {}) };

  // Apply cross-filter values via parameterMappings
  // parameterMappings: { queryParamName: crossFilterFieldName }
  if (viz.parameterMappings) {
    for (const [paramName, filterField] of Object.entries(viz.parameterMappings)) {
      const cf = crossFilters.find((f) => f.field === filterField);
      if (cf) base[paramName] = cf.value;
    }
  }

  return base;
}

function VizCardPublic({ viz, token, crossFilters, onCrossFilter }: VizCardPublicProps) {
  const [queryData, setQueryData] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);
  const [chartHeight, setChartHeight] = useState(220);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 0;
      if (h > 0) setChartHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Inline parameter overrides for charts that declare parameters (shown as inputs)
  const declaredParams = viz.query?.parameters ?? [];
  const [paramOverrides, setParamOverrides] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of declaredParams) {
      init[p.name] = p.defaultValue != null ? String(p.defaultValue) : '';
    }
    return init;
  });

  const runQuery = useCallback(() => {
    const sql = viz.inlineSql ?? viz.query?.sql;
    const datasourceId = viz.query?.datasourceId ?? '';
    if (!sql) return;

    setLoading(true);
    setExecError(null);

    const crossFilterParams = resolveParameters(viz, crossFilters);
    const parameters: Record<string, unknown> = { ...crossFilterParams };
    // Inline overrides take priority over cross-filters for named params
    for (const [k, v] of Object.entries(paramOverrides)) {
      if (v !== '') parameters[k] = v;
    }

    publicApi
      .post(`/public/dashboards/${token}/query`, {
        sql,
        datasourceId,
        parameters,
        targetCollection: viz.query?.targetCollection,
        targetDatabase: viz.query?.targetDatabase,
      })
      .then(({ data }) => setQueryData(data.data ?? data))
      .catch((err: unknown) => {
        const msg =
          (err as { response?: { data?: { error?: { message?: string } } } })
            ?.response?.data?.error?.message ?? (err as Error).message;
        setExecError(msg ?? 'Query failed');
      })
      .finally(() => setLoading(false));
  }, [viz, token, crossFilters, paramOverrides]);

  // Re-run whenever cross-filters that affect this viz change
  useEffect(() => {
    const sql = viz.inlineSql ?? viz.query?.sql;
    if (!sql) return;
    runQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crossFilters]);

  // Initial load
  useEffect(() => {
    runQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleElementClick = useCallback(
    (params: { field: string; value: unknown }) => {
      onCrossFilter(viz.id, params.field, params.value);
    },
    [viz.id, onCrossFilter],
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
        <Text strong style={{ fontSize: 13, color: '#e2e8f0' }}>{viz.title}</Text>
      </div>

      {/* Inline parameter inputs for charts that declare parameters */}
      {declaredParams.length > 0 && (
        <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {declaredParams.map((p) => (
            <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 11, color: '#94a3b8' }}>{p.name}:</Text>
              <Input
                size="small"
                style={{ width: 100, fontSize: 12 }}
                value={paramOverrides[p.name] ?? ''}
                onChange={(e) => setParamOverrides((prev) => ({ ...prev, [p.name]: e.target.value }))}
                onPressEnter={runQuery}
                placeholder={p.type}
              />
            </div>
          ))}
          <Button size="small" type="primary" ghost onClick={runQuery} style={{ fontSize: 12 }}>
            Apply
          </Button>
        </div>
      )}

      <div ref={chartContainerRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Spin size="small" />
          </div>
        ) : execError ? (
          <div style={{ padding: 12 }}>
            <Text style={{ fontSize: 11, color: '#ef4444' }}>{execError}</Text>
          </div>
        ) : (
          <ChartRenderer
            chartType={viz.chartType}
            data={queryData ?? undefined}
            columnMapping={viz.columnMapping}
            chartConfig={viz.chartConfig}
            height={chartHeight}
            onElementClick={handleElementClick}
          />
        )}
      </div>
    </div>
  );
}

export default function PublicDashboardPage() {
  const { token } = useParams<{ token: string }>();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [visualizations, setVisualizations] = useState<PublicVisualization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [crossFilters, setCrossFilters] = useState<CrossFilterValue[]>([]);
  const { width: gridWidth, containerRef, mounted: gridMounted } = useContainerWidth();

  useEffect(() => {
    if (!token) return;
    Promise.all([
      publicApi.get(`/public/dashboards/${token}`),
      publicApi.get(`/public/dashboards/${token}/visualizations`),
    ])
      .then(([dashRes, vizRes]) => {
        setDashboard(dashRes.data.data ?? dashRes.data);
        const payload = vizRes.data.data ?? vizRes.data;
        setVisualizations(Array.isArray(payload) ? payload : []);
      })
      .catch(() => setError('This dashboard is not available or the link has been revoked.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleCrossFilter = useCallback((sourceVizId: string, field: string, value: unknown) => {
    setCrossFilters((prev) => {
      // Toggle off if same source+field+value is clicked again
      const existing = prev.find((f) => f.sourceVizId === sourceVizId && f.field === field);
      if (existing && existing.value === value) {
        return prev.filter((f) => !(f.sourceVizId === sourceVizId && f.field === field));
      }
      // Replace the filter from this source
      return [
        ...prev.filter((f) => f.sourceVizId !== sourceVizId),
        { sourceVizId, field, value },
      ];
    });
  }, []);

  const clearFilter = useCallback((sourceVizId: string) => {
    setCrossFilters((prev) => prev.filter((f) => f.sourceVizId !== sourceVizId));
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111827' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111827', padding: 24 }}>
        <Alert
          type="error"
          message="Dashboard Unavailable"
          description={error ?? 'Not found'}
          showIcon
          style={{ maxWidth: 400 }}
        />
      </div>
    );
  }

  const gridLayout = visualizations.map((v) => {
    const li = (dashboard.layout ?? []).find((l) => l.i === v.id) ?? { i: v.id, x: 0, y: Infinity, w: 6, h: 4 };
    return li;
  });

  return (
    <div style={{ minHeight: '100vh', background: '#111827', padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <Space>
          <BarChartOutlined style={{ fontSize: 20, color: '#6366f1' }} />
          <div>
            <Title level={3} style={{ margin: 0, color: '#e2e8f0' }}>{dashboard.name}</Title>
            {dashboard.description && (
              <Text style={{ color: '#94a3b8' }}>{dashboard.description}</Text>
            )}
          </div>
        </Space>
      </div>

      {/* Active cross-filter chips */}
      {crossFilters.length > 0 && (
        <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <FilterOutlined style={{ color: '#94a3b8', fontSize: 13 }} />
          {crossFilters.map((cf) => {
            const sourceViz = visualizations.find((v) => v.id === cf.sourceVizId);
            return (
              <Tag
                key={cf.sourceVizId}
                color="purple"
                icon={<CloseCircleOutlined onClick={() => clearFilter(cf.sourceVizId)} style={{ cursor: 'pointer' }} />}
                style={{ fontSize: 12 }}
              >
                {sourceViz?.title ?? 'Filter'}: {String(cf.value)}
              </Tag>
            );
          })}
          <Button
            size="small"
            type="text"
            style={{ fontSize: 12, color: '#94a3b8' }}
            onClick={() => setCrossFilters([])}
          >
            Clear all
          </Button>
        </div>
      )}

      {/* Grid */}
      <div ref={containerRef}>
        {visualizations.length === 0 ? (
          <Text style={{ color: '#94a3b8' }}>No charts in this dashboard.</Text>
        ) : gridMounted ? (
          <ResponsiveGridLayout
            width={gridWidth}
            className="layout"
            layouts={{ lg: gridLayout }}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
            cols={{ lg: 12, md: 10, sm: 6, xs: 4 }}
            rowHeight={60}
            margin={[12, 12]}
            containerPadding={[0, 0]}
            dragConfig={{ enabled: false }}
            resizeConfig={{ enabled: false }}
            onLayoutChange={(_layout: Layout) => {}}
          >
            {visualizations.map((viz) => (
              <div key={viz.id} style={{ overflow: 'hidden' }}>
                <Card
                  size="small"
                  style={{ height: '100%', background: '#1a1b2e', border: '1px solid #2d2e4a' }}
                  styles={{ body: { height: 'calc(100% - 48px)', padding: '8px 12px' } }}
                >
                  <VizCardPublic
                    viz={viz}
                    token={token!}
                    crossFilters={crossFilters}
                    onCrossFilter={handleCrossFilter}
                  />
                </Card>
              </div>
            ))}
          </ResponsiveGridLayout>
        ) : null}
      </div>
    </div>
  );
}
