import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button,
  Typography,
  Space,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  AutoComplete,
  Card,
  Tooltip,
  Tag,
  Spin,
  App,
  Switch,
  Empty,
  DatePicker,
  Alert,
  Modal,
} from 'antd';
import dayjs from 'dayjs';
import {
  ArrowLeftOutlined,
  PlusOutlined,
  SaveOutlined,
  SettingOutlined,
  DeleteOutlined,
  DragOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  ReloadOutlined,
  FilterFilled,
  ShareAltOutlined,
  PrinterOutlined,
  CopyOutlined,
  LinkOutlined,
  StopOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  SyncOutlined,
  ClockCircleOutlined,
  LineChartOutlined,
  BarChartOutlined,
  AreaChartOutlined,
  PieChartOutlined,
  DotChartOutlined,
  FundOutlined,
  HeatMapOutlined,
  BlockOutlined,
  NumberOutlined,
  TableOutlined,
  BuildOutlined,
  AppstoreAddOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { ResponsiveGridLayout, useContainerWidth } from 'react-grid-layout';
import type { Layout, LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useAuthStore } from '../stores/auth.store';
import ChartRenderer from '../components/charts/ChartRenderer';
import type { Dashboard, Visualization, DashboardLayoutItem, ChartType, Datasource, QueryResult, SavedQuery, DashboardFilter } from '../types';

const { Title, Text } = Typography;
const { Option } = Select;

const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: 'line', label: 'Line Chart' },
  { value: 'bar', label: 'Bar Chart' },
  { value: 'area', label: 'Area Chart' },
  { value: 'pie', label: 'Pie Chart' },
  { value: 'scatter', label: 'Scatter Plot' },
  { value: 'funnel', label: 'Funnel Chart' },
  { value: 'gauge', label: 'Gauge' },
  { value: 'heatmap', label: 'Heatmap' },
  { value: 'treemap', label: 'Treemap' },
  { value: 'metric', label: 'Metric (Big Number)' },
  { value: 'table', label: 'Data Table' },
  { value: 'pivot', label: 'Pivot Table' },
];

// ─── Auto-refresh intervals ───────────────────────────────────────────────────

const REFRESH_INTERVALS = [
  { label: 'Off', value: 0 },
  { label: '5 seconds', value: 5 },
  { label: '30 seconds', value: 30 },
  { label: '1 minute', value: 60 },
  { label: '5 minutes', value: 300 },
  { label: '15 minutes', value: 900 },
  { label: '30 minutes', value: 1800 },
  { label: '1 hour', value: 3600 },
];

function refreshLabel(seconds: number | undefined): string {
  if (!seconds) return '';
  return REFRESH_INTERVALS.find((r) => r.value === seconds)?.label ?? `${seconds}s`;
}

// ─── Chart type visual selector ───────────────────────────────────────────────

const CHART_ICONS: Record<string, React.ReactNode> = {
  line: <LineChartOutlined />,
  bar: <BarChartOutlined />,
  area: <AreaChartOutlined />,
  pie: <PieChartOutlined />,
  scatter: <DotChartOutlined />,
  funnel: <FundOutlined />,
  gauge: <ClockCircleOutlined />,
  heatmap: <HeatMapOutlined />,
  treemap: <BlockOutlined />,
  metric: <NumberOutlined />,
  table: <TableOutlined />,
  pivot: <BuildOutlined />,
};

function ChartTypeGrid({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
      {CHART_TYPES.map((ct) => {
        const selected = value === ct.value;
        return (
          <div
            key={ct.value}
            onClick={() => onChange?.(ct.value)}
            style={{
              padding: '10px 6px',
              textAlign: 'center',
              border: `2px solid ${selected ? '#6366f1' : 'var(--color-border)'}`,
              borderRadius: 8,
              cursor: 'pointer',
              background: selected ? 'rgba(99,102,241,0.12)' : 'transparent',
              transition: '150ms ease',
              userSelect: 'none',
            }}
          >
            <div style={{ fontSize: 20, color: selected ? '#6366f1' : 'var(--color-text-secondary)', marginBottom: 4 }}>
              {CHART_ICONS[ct.value]}
            </div>
            <div style={{ fontSize: 11, color: selected ? '#6366f1' : 'var(--color-text-secondary)', lineHeight: 1.2 }}>
              {ct.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function extractSqlParams(sql: string): string[] {
  const matches = [...sql.matchAll(/:(\w+)/g)];
  return [...new Set(matches.map((m) => m[1]).filter((p): p is string => p !== undefined))];
}

// Chart types where clicking an element triggers cross-filter / drill-down
const CLICKABLE_CHART_TYPES: ChartType[] = ['line', 'bar', 'area', 'pie', 'scatter', 'funnel', 'treemap', 'heatmap'];

function useDashboard(id: string) {
  return useQuery<Dashboard>({
    queryKey: ['dashboard', id],
    queryFn: async () => {
      const { data } = await api.get(`/dashboards/${id}`);
      return data.data ?? data;
    },
  });
}

function useVisualizations(dashboardId: string) {
  return useQuery<Visualization[]>({
    queryKey: ['visualizations', dashboardId],
    queryFn: async () => {
      const { data } = await api.get(`/visualizations?dashboardId=${dashboardId}`);
      const payload = data.data ?? data;
      return Array.isArray(payload) ? payload : [];
    },
  });
}

function useDatasources() {
  return useQuery<Datasource[]>({
    queryKey: ['datasources'],
    queryFn: async () => {
      const { data } = await api.get('/datasources');
      const payload = data.data ?? data;
      return Array.isArray(payload) ? payload : (payload.datasources ?? []);
    },
  });
}

interface CrossFilter {
  sourceVizId: string;
  field: string;
  value: unknown;
}

interface VizCardProps {
  viz: Visualization;
  onEdit: (viz: Visualization) => void;
  onDelete: (id: string) => void;
  isEditing: boolean;
  refreshKey: number;
  filterValues: Record<string, unknown>;
  activeCrossFilters: CrossFilter[];
  onCrossFilter: (sourceVizId: string, field: string, value: unknown) => void;
}

function VizCard({
  viz,
  onEdit,
  onDelete,
  isEditing,
  refreshKey,
  filterValues,
  activeCrossFilters,
  onCrossFilter,
}: VizCardProps) {
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

  // Drill-down state: each item is one level clicked into
  const drillField = viz.chartConfig?.drillDownField as string | undefined;
  const [drillStack, setDrillStack] = useState<Array<{ label: string; value: unknown }>>([]);

  // Cross-filter values produced by other charts (exclude self-sourced)
  const crossFilterValues = useMemo(
    () =>
      activeCrossFilters
        .filter((cf) => cf.sourceVizId !== viz.id)
        .reduce<Record<string, unknown>>((acc, cf) => ({ ...acc, [cf.field]: cf.value }), {}),
    [activeCrossFilters, viz.id],
  );

  const drillParams = useMemo((): Record<string, unknown> => {
    if (!drillField || drillStack.length === 0) return {};
    const last = drillStack[drillStack.length - 1];
    return last ? { [drillField]: last.value } : {};
  }, [drillField, drillStack]);

  const runQuery = useCallback(async () => {
    if (!viz.queryId && !viz.inlineSql) return;
    setLoading(true);
    setExecError(null);
    try {
      const incoming: Record<string, unknown> = { ...filterValues, ...crossFilterValues, ...drillParams };
      const params: Record<string, unknown> = { ...(viz.defaultParameters ?? {}), ...incoming };
      // Apply explicit field→param mappings (e.g. givenDate ← Day)
      for (const [paramName, sourceField] of Object.entries(viz.parameterMappings ?? {})) {
        if (incoming[sourceField] !== undefined) {
          params[paramName] = incoming[sourceField];
        }
      }
      const { data } = viz.queryId
        ? await api.post(`/queries/${viz.queryId}/execute`, { parameters: params })
        : await api.post('/queries/execute', { sql: viz.inlineSql, datasourceId: '', parameters: params });
      setQueryData(data.data ?? data);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? (err as Error).message;
      setExecError(msg ?? 'Query failed');
    } finally {
      setLoading(false);
    }
  }, [viz, filterValues, crossFilterValues, drillParams]);

  useEffect(() => { runQuery(); }, [runQuery, refreshKey]);

  const handleElementClick = useCallback(
    (params: { field: string; value: unknown }) => {
      if (drillField) {
        // Drill-down: filter this chart into the clicked value
        setDrillStack((prev) => [...prev, { label: String(params.value), value: params.value }]);
      } else {
        // Cross-filter: clicking toggles a filter on all other charts
        onCrossFilter(viz.id, params.field, params.value);
      }
    },
    [drillField, onCrossFilter, viz.id],
  );

  const isCrossFilterSource = activeCrossFilters.some((cf) => cf.sourceVizId === viz.id);
  const isClickable = CLICKABLE_CHART_TYPES.includes(viz.chartType);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Card header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: drillStack.length > 0 ? 2 : 8 }}>
        <Space size={4}>
          <Text strong style={{ fontSize: 13 }}>{viz.title}</Text>
          {isCrossFilterSource && (
            <Tooltip title="This chart is filtering other charts. Click to clear.">
              <FilterFilled
                style={{ color: '#6366f1', fontSize: 11, cursor: 'pointer' }}
                onClick={() => onCrossFilter(viz.id, '', null as unknown)}
              />
            </Tooltip>
          )}
        </Space>
        {isEditing && (
          <Space size={4}>
            <Tooltip title="Edit chart">
              <Button size="small" icon={<SettingOutlined />} onClick={() => onEdit(viz)} />
            </Tooltip>
            <Tooltip title="Remove">
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(viz.id)} />
            </Tooltip>
          </Space>
        )}
      </div>

      {/* Drill breadcrumb */}
      {drillStack.length > 0 && (
        <div style={{ marginBottom: 6, lineHeight: 1.2 }}>
          <Text
            style={{ cursor: 'pointer', color: '#6366f1', fontSize: 11 }}
            onClick={() => setDrillStack([])}
          >
            All
          </Text>
          {drillStack.map((d, i) => (
            <span key={i}>
              <Text type="secondary" style={{ fontSize: 11 }}> › </Text>
              <Text
                style={{
                  cursor: i < drillStack.length - 1 ? 'pointer' : 'default',
                  color: i < drillStack.length - 1 ? '#6366f1' : '#e2e8f0',
                  fontSize: 11,
                }}
                onClick={() =>
                  i < drillStack.length - 1
                    ? setDrillStack((prev) => prev.slice(0, i + 1))
                    : undefined
                }
              >
                {d.label}
              </Text>
            </span>
          ))}
        </div>
      )}

      <div ref={chartContainerRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Spin size="small" />
          </div>
        ) : execError ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 12 }}>
            <Text type="secondary" style={{ fontSize: 11, color: '#ef4444', textAlign: 'center' }}>{execError}</Text>
          </div>
        ) : (
          <ChartRenderer
            chartType={viz.chartType}
            data={queryData ?? undefined}
            columnMapping={viz.columnMapping}
            chartConfig={viz.chartConfig}
            height={chartHeight}
            onElementClick={isClickable ? handleElementClick : undefined}
          />
        )}
      </div>
    </div>
  );
}

export default function DashboardBuilderPage() {
  const { message } = App.useApp();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();

  const { data: dashboard, isLoading: dashLoading } = useDashboard(id!);
  const { data: visualizations = [], isLoading: vizLoading } = useVisualizations(id!);
  const { data: datasources = [] } = useDatasources();

  const isViewer = useAuthStore((s) => s.user?.role === 'viewer');
  const [isEditing, setIsEditing] = useState(!isViewer && searchParams.get('mode') !== 'view');
  const canEdit = isEditing && !isViewer;
  const [layout, setLayout] = useState<DashboardLayoutItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingViz, setEditingViz] = useState<Visualization | null>(null);
  const [vizForm] = Form.useForm();
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [selectedDs, setSelectedDs] = useState<string>('');
  const [queryCols, setQueryCols] = useState<string[]>([]);
  const [colsLoading, setColsLoading] = useState(false);
  const [colsError, setColsError] = useState<string | null>(null);
  const [previewParams, setPreviewParams] = useState<Record<string, string>>({});
  const [previewParamTypes, setPreviewParamTypes] = useState<Record<string, 'text' | 'number' | 'date' | 'datetime'>>({});
  const [previewParamMappings, setPreviewParamMappings] = useState<Record<string, string>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, unknown>>({});
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summarySaving, setSummarySaving] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [localRefreshInterval, setLocalRefreshInterval] = useState(0);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [summaryData, setSummaryData] = useState<{ dashboardName: string; summary: string; insights: string[]; anomalies: string[]; generatedAt?: string; isFromSave?: boolean } | null>(null);

  const runGenerate = useCallback(async () => {
    if (!id) return;
    setSummaryLoading(true);
    try {
      const resp = await api.post('/ai/summarize-dashboard', { dashboardId: id }, { timeout: 300_000 });
      const payload = (resp.data?.data ?? resp.data) as { dashboardName: string; summary: string; insights: string[]; anomalies: string[] };
      setSummaryData({ ...payload, generatedAt: new Date().toISOString(), isFromSave: false });
    } catch (err) {
      void message.error((err as Error).message ?? 'Failed to generate summary');
    } finally {
      setSummaryLoading(false);
    }
  }, [id, message]);

  const handleSummarize = useCallback(() => {
    setSummaryOpen(true);
    // If a saved summary exists and nothing freshly generated is in state, show saved version immediately
    if (dashboard?.aiSummary && !summaryData) {
      setSummaryData({
        dashboardName: dashboard.name,
        summary: dashboard.aiSummary.summary,
        insights: dashboard.aiSummary.insights,
        anomalies: dashboard.aiSummary.anomalies,
        generatedAt: dashboard.aiSummary.generatedAt,
        isFromSave: true,
      });
    } else if (!dashboard?.aiSummary && !summaryData) {
      // No saved summary and nothing in state — auto-generate immediately
      void runGenerate();
    }
  }, [dashboard, summaryData, runGenerate]);

  const handleSaveSummary = useCallback(async () => {
    if (!id || !summaryData) return;
    setSummarySaving(true);
    try {
      await api.post('/ai/save-dashboard-summary', {
        dashboardId: id,
        summary: summaryData.summary,
        insights: summaryData.insights,
        anomalies: summaryData.anomalies,
      });
      void qc.invalidateQueries({ queryKey: ['dashboard', id] });
      void message.success('Summary saved to dashboard');
    } catch {
      void message.error('Failed to save summary');
    } finally {
      setSummarySaving(false);
    }
  }, [id, summaryData, message, qc]);
  const [crossFilters, setCrossFilters] = useState<CrossFilter[]>([]);
  const pageRef = useRef<HTMLDivElement>(null);
  const layoutChangeIsFromUser = useRef(false);
  const { width: gridWidth, containerRef, mounted: gridMounted } = useContainerWidth();

  const selectedQueryId = Form.useWatch('queryId', vizForm);
  const selectedChartType = Form.useWatch('chartType', vizForm) as ChartType | undefined;

  // Params detected in the currently selected query's SQL.
  // For MongoDB JSON pipelines, skip extractSqlParams entirely — the JSON may contain
  // colon-containing string values (e.g. "role:admin") that are falsely detected as
  // :paramName placeholders, which blocks the column-fetch until "filled in".
  const queryParams = useMemo(() => {
    const q = savedQueries.find((sq) => sq.id === selectedQueryId);
    if (!q) return [];
    const isMongo = q.datasource?.type === 'mongodb';
    return isMongo ? [] : extractSqlParams(q.sql);
  }, [selectedQueryId, savedQueries]);

  // Reset param values/types/mappings when the selected query changes
  useEffect(() => {
    setPreviewParams({});
    setPreviewParamTypes({});
    setPreviewParamMappings({});
  }, [selectedQueryId]);

  useEffect(() => {
    if (dashboard) setLayout(dashboard.layout ?? []);
  }, [dashboard]);

  useEffect(() => {
    if (!drawerOpen) return;
    api.get('/queries?limit=100').then(({ data }) => {
      const payload = data.data ?? data;
      setSavedQueries(payload.queries ?? []);
    }).catch(() => {});
  }, [drawerOpen]);

  useEffect(() => {
    if (!selectedQueryId || selectedDs || !savedQueries.length) return;
    const q = savedQueries.find((sq) => sq.id === selectedQueryId);
    if (q) setSelectedDs(q.datasourceId);
  }, [selectedQueryId, savedQueries, selectedDs]);

  useEffect(() => {
    if (!selectedQueryId) {
      setQueryCols([]);
      setColsError(null);
      return;
    }
    // Don't execute until all detected params have values
    const missingParams = queryParams.filter((p) => !previewParams[p]?.trim());
    if (missingParams.length > 0) {
      setQueryCols([]);
      setColsError(null);
      return;
    }
    let cancelled = false;
    setColsLoading(true);
    setColsError(null);
    const parameters = queryParams.length > 0
      ? Object.fromEntries(queryParams.map((p) => [p, previewParams[p] ?? '']))
      : undefined;
    api.post(`/queries/${selectedQueryId}/execute`, parameters ? { parameters } : {})
      .then(({ data }) => {
        if (cancelled) return;
        const result = data.data ?? data;
        setQueryCols((result.columns ?? []).map((c: { name: string }) => c.name));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setQueryCols([]);
        const msg =
          (err as { response?: { data?: { error?: { message?: string } } } })
            ?.response?.data?.error?.message ?? (err as Error).message;
        setColsError(msg ?? 'Failed to load columns');
      })
      .finally(() => { if (!cancelled) setColsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedQueryId, queryParams, previewParams]);

  // MongoDB-specific column inference: derive columns from the pipeline shape and
  // from the collection schema rather than relying solely on query execution results.
  // Runs in parallel with the execute-based fetch and merges whatever arrives first.
  useEffect(() => {
    if (!selectedQueryId) return;
    const q = savedQueries.find((sq) => sq.id === selectedQueryId);
    if (!q || q.datasource?.type !== 'mongodb') return;

    // 1. Parse pipeline to extract output field names without executing.
    const pipelineCols: string[] = [];
    try {
      const pipeline = JSON.parse(q.sql);
      if (Array.isArray(pipeline)) {
        for (const stage of pipeline as Record<string, unknown>[]) {
          if (stage.$group) {
            // $group output: _id + every alias defined in the stage
            pipelineCols.push(...Object.keys(stage.$group as Record<string, unknown>));
            break;
          }
          if (stage.$project) {
            // $project: take explicitly included fields (value !== 0 / false)
            const proj = stage.$project as Record<string, unknown>;
            const included = Object.entries(proj)
              .filter(([k, v]) => k !== '_id' && v !== 0 && v !== false)
              .map(([k]) => k);
            if (included.length > 0) { pipelineCols.push('_id', ...included); break; }
          }
        }
      }
    } catch { /* not JSON — ignore */ }

    if (pipelineCols.length > 0) {
      setQueryCols((prev) => [...new Set([...pipelineCols, ...prev])]);
    }

    // 2. Fetch datasource schema for the target collection as a supplementary source.
    if (!q.datasourceId || !q.targetCollection) return;
    let cancelled = false;
    api.get(`/datasources/${q.datasourceId}/schema`)
      .then(({ data }) => {
        if (cancelled) return;
        const schema = (data.data ?? data) as { tables?: { name: string; schema?: string; columns: { name: string }[] }[] };
        const table = (schema.tables ?? []).find((t) => t.name === q.targetCollection);
        if (table) {
          const schemaFields = table.columns.map((c) => c.name);
          setQueryCols((prev) => [...new Set([...prev, ...schemaFields])]);
        }
      })
      .catch(() => { /* best-effort — schema unavailable */ });
    return () => { cancelled = true; };
  }, [selectedQueryId, savedQueries]);

  useEffect(() => {
    if (!localRefreshInterval) return;
    const timer = setInterval(() => {
      setRefreshKey((k) => k + 1);
      setLastRefreshedAt(new Date());
    }, localRefreshInterval * 1000);
    return () => clearInterval(timer);
  }, [localRefreshInterval]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      pageRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleCrossFilter = useCallback((sourceVizId: string, field: string, value: unknown) => {
    if (value === null) {
      setCrossFilters((prev) => prev.filter((cf) => cf.sourceVizId !== sourceVizId));
      return;
    }
    setCrossFilters((prev) => {
      const existing = prev.find((cf) => cf.sourceVizId === sourceVizId);
      // Toggle off if clicking same value again
      if (existing && existing.value === value) {
        return prev.filter((cf) => cf.sourceVizId !== sourceVizId);
      }
      return [
        ...prev.filter((cf) => cf.sourceVizId !== sourceVizId),
        { sourceVizId, field, value },
      ];
    });
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setEditingViz(null);
    vizForm.resetFields();
    setSelectedDs('');
    setQueryCols([]);
    setColsError(null);
  }, [vizForm]);

  const saveMutation = useMutation({
    mutationFn: () => api.patch(`/dashboards/${id}`, { layout }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dashboard', id] });
      void qc.invalidateQueries({ queryKey: ['dashboards'] });
      message.success('Dashboard saved');
    },
    onError: () => message.error('Save failed'),
  });

  const createVizMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api.post('/visualizations', { ...values, dashboardId: id }),
    onSuccess: ({ data: resp }) => {
      const created = resp.data ?? resp;
      qc.invalidateQueries({ queryKey: ['visualizations', id] });
      closeDrawer();
      message.success('Chart added');
      setLayout((prev) => {
        const bottomY = prev.reduce((m, l) => Math.max(m, l.y + l.h), 0);
        return [...prev, { i: created.id, x: 0, y: bottomY, w: 12, h: 5 }];
      });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Failed to add chart';
      message.error(msg);
    },
  });

  const updateVizMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api.patch(`/visualizations/${editingViz?.id}`, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visualizations', id] });
      closeDrawer();
      message.success('Chart updated');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Failed to update chart';
      message.error(msg);
    },
  });

  const deleteVizMutation = useMutation({
    mutationFn: (vizId: string) => api.delete(`/visualizations/${vizId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visualizations', id] });
      message.success('Chart removed');
    },
  });

  const shareMutation = useMutation({
    mutationFn: () => api.post(`/dashboards/${id}/share`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard', id] }),
    onError: () => message.error('Failed to generate share link'),
  });

  const revokeMutation = useMutation({
    mutationFn: () => api.delete(`/dashboards/${id}/share`),
    onSuccess: () => {
      message.success('Share link revoked');
      qc.invalidateQueries({ queryKey: ['dashboard', id] });
    },
    onError: () => message.error('Failed to revoke share link'),
  });

  const handleAddChart = () => {
    setEditingViz(null);
    vizForm.resetFields();
    setPreviewParams({});
    setPreviewParamTypes({});
    setPreviewParamMappings({});
    setDrawerOpen(true);
  };

  const handleEditViz = (viz: Visualization) => {
    setEditingViz(viz);
    setPreviewParams(viz.defaultParameters ?? {});
    setPreviewParamTypes({});
    setPreviewParamMappings(viz.parameterMappings ?? {});
    vizForm.setFieldsValue({
      title: viz.title,
      chartType: viz.chartType,
      queryId: viz.queryId,
      // standard x/y axis
      xAxis: viz.columnMapping?.xAxis,
      yAxis: viz.columnMapping?.yAxis,
      // label + value for pie/funnel/treemap
      labelCol: viz.columnMapping?.label,
      valueCol: viz.columnMapping?.value,
      // heatmap value
      heatValueCol: viz.columnMapping?.value,
      // pivot
      rowField: viz.chartConfig?.rowField as string | undefined,
      colField: viz.chartConfig?.colField as string | undefined,
      pivotValueField: viz.chartConfig?.valueField as string | undefined,
      aggregation: (viz.chartConfig?.aggregation as string | undefined) ?? 'sum',
      // drill-down
      drillDownField: viz.chartConfig?.drillDownField as string | undefined,
    });
    setDrawerOpen(true);
  };

  const handleVizSubmit = (values: Record<string, unknown>) => {
    const ct = values['chartType'] as ChartType;

    let columnMapping: Record<string, unknown> = {};
    if (['line', 'bar', 'area', 'scatter'].includes(ct)) {
      columnMapping = { xAxis: values['xAxis'], yAxis: values['yAxis'] };
    } else if (ct === 'heatmap') {
      columnMapping = { xAxis: values['xAxis'], yAxis: values['yAxis'], value: values['heatValueCol'] };
    } else if (['pie', 'funnel', 'treemap'].includes(ct)) {
      columnMapping = { label: values['labelCol'], value: values['valueCol'] };
    } else if (['gauge', 'metric'].includes(ct)) {
      columnMapping = { value: values['valueCol'] };
    }

    const chartConfig: Record<string, unknown> = {};
    if (ct === 'pivot') {
      chartConfig.rowField = values['rowField'];
      chartConfig.colField = values['colField'];
      chartConfig.valueField = values['pivotValueField'];
      chartConfig.aggregation = values['aggregation'] ?? 'sum';
    }
    if (values['drillDownField']) {
      chartConfig.drillDownField = values['drillDownField'];
    }

    const payload = {
      title: values['title'],
      chartType: ct,
      queryId: values['queryId'] || undefined,
      columnMapping,
      chartConfig,
      defaultParameters: Object.keys(previewParams).length > 0 ? previewParams : undefined,
      parameterMappings: Object.values(previewParamMappings).some(Boolean)
        ? Object.fromEntries(Object.entries(previewParamMappings).filter(([, v]) => v.trim()))
        : undefined,
    };

    if (editingViz) {
      updateVizMutation.mutate(payload);
    } else {
      createVizMutation.mutate(payload);
    }
  };

  if (dashLoading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>;
  if (!dashboard) return <Text type="danger">Dashboard not found</Text>;

  const bottomY = layout.reduce((m, l) => Math.max(m, l.y + l.h), 0);
  const gridLayout = visualizations.map((v) => {
    return layout.find((l) => l.i === v.id) ?? { i: v.id, x: 0, y: bottomY, w: 12, h: 5 };
  });

  // Determine which column fields to show in the drawer based on chart type
  const isPivot = selectedChartType === 'pivot';
  const isTable = selectedChartType === 'table';
  const isGaugeOrMetric = selectedChartType === 'gauge' || selectedChartType === 'metric';
  const isLabelValue = ['pie', 'funnel', 'treemap'].includes(selectedChartType ?? '');
  const isHeatmap = selectedChartType === 'heatmap';
  const isXY = !isPivot && !isTable && !isGaugeOrMetric && !isLabelValue && !isHeatmap && !!selectedChartType;
  const supportsClickAction = CLICKABLE_CHART_TYPES.includes(selectedChartType ?? '' as ChartType);

  const colOptions = queryCols.map((c) => ({ value: c }));

  return (
    <div ref={pageRef} style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboards')} />
          <div>
            <Title level={4} style={{ margin: 0 }}>{dashboard.name}</Title>
            <Space size={4}>
              <Tag color={dashboard.status === 'published' ? 'green' : 'orange'}>{dashboard.status}</Tag>
              <Tag>{dashboard.visibility}</Tag>
              {localRefreshInterval > 0 && (
                <Tag color="blue" icon={<ClockCircleOutlined />}>
                  {refreshLabel(localRefreshInterval)}
                  {lastRefreshedAt && (
                    <span style={{ marginLeft: 4, opacity: 0.75 }}>
                      · {lastRefreshedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  )}
                </Tag>
              )}
            </Space>
          </div>
        </Space>

        <Space>
          <Tooltip title="Refresh all charts">
            <Button icon={<ReloadOutlined />} onClick={() => { setRefreshKey((k) => k + 1); setLastRefreshedAt(new Date()); }} />
          </Tooltip>
          {!isEditing && (
            <Select
              size="small"
              style={{ width: 120 }}
              value={localRefreshInterval}
              onChange={(v) => setLocalRefreshInterval(v)}
              options={REFRESH_INTERVALS.map((r) => ({ value: r.value, label: r.label }))}
            />
          )}
          <Tooltip title="Print / Save as PDF">
            <Button icon={<PrinterOutlined />} onClick={() => window.print()} />
          </Tooltip>
          <Tooltip title="AI Summary">
            <Button icon={<BulbOutlined />} onClick={handleSummarize} />
          </Tooltip>
          {!isViewer && (
            <Tooltip title="Share / Embed">
              <Button icon={<ShareAltOutlined />} onClick={() => setShareModalOpen(true)} />
            </Tooltip>
          )}
          <Tooltip title={isFullscreen ? 'Exit full screen' : 'Full screen'}>
            <Button
              icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={toggleFullscreen}
            />
          </Tooltip>
          {!isViewer && (
            <>
              <Switch
                checkedChildren="Edit"
                unCheckedChildren="View"
                checked={isEditing}
                onChange={setIsEditing}
              />
              {canEdit && (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setLibraryOpen(true)}>
                  Add Chart
                </Button>
              )}
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                Save
              </Button>
            </>
          )}
        </Space>
      </div>

      {/* Dashboard filter bar */}
      {(dashboard.filters?.length ?? 0) > 0 && (
        <Card size="small" style={{ marginBottom: 8 }} styles={{ body: { padding: '8px 12px' } }}>
          <Space wrap>
            {dashboard.filters!.map((f: DashboardFilter) => (
              <Space key={f.id} size={4}>
                <Text type="secondary" style={{ fontSize: 12 }}>{f.label}:</Text>
                {f.type === 'date_range' ? (
                  <DatePicker.RangePicker
                    size="small"
                    onChange={(_, dateStrings) => {
                      setFilterValues((prev) => ({
                        ...prev,
                        [`${f.id}_from`]: dateStrings[0] || undefined,
                        [`${f.id}_to`]: dateStrings[1] || undefined,
                      }));
                    }}
                  />
                ) : (
                  <Input
                    size="small"
                    style={{ width: 140 }}
                    placeholder={f.label}
                    defaultValue={f.defaultValue != null ? String(f.defaultValue) : undefined}
                    onPressEnter={(e) => {
                      const val = (e.target as HTMLInputElement).value;
                      setFilterValues((prev) => ({ ...prev, [f.id]: val || undefined }));
                    }}
                    onBlur={(e) => {
                      const val = e.target.value;
                      setFilterValues((prev) => ({ ...prev, [f.id]: val || undefined }));
                    }}
                  />
                )}
              </Space>
            ))}
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => setRefreshKey((k) => k + 1)}
            >
              Apply
            </Button>
          </Space>
        </Card>
      )}

      {/* Cross-filter indicator bar */}
      {crossFilters.length > 0 && (
        <Card size="small" style={{ marginBottom: 8 }} styles={{ body: { padding: '4px 12px' } }}>
          <Space size={4} wrap>
            <FilterFilled style={{ color: '#6366f1', fontSize: 12 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>Cross-filters:</Text>
            {crossFilters.map((cf) => (
              <Tag
                key={cf.sourceVizId}
                closable
                onClose={() => setCrossFilters((prev) => prev.filter((x) => x.sourceVizId !== cf.sourceVizId))}
                color="purple"
                style={{ fontSize: 11 }}
              >
                {cf.field} = {String(cf.value)}
              </Tag>
            ))}
            <Button type="text" size="small" style={{ fontSize: 11, color: '#6366f1', padding: '0 4px' }} onClick={() => setCrossFilters([])}>
              Clear all
            </Button>
          </Space>
        </Card>
      )}

      {/* Grid */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'auto' }}>
        {vizLoading && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        )}

        {!vizLoading && visualizations.length === 0 && (
          <Card style={{ textAlign: 'center', padding: 60 }}>
            <Empty description={<Text type="secondary">No charts yet.{canEdit ? ' Add your first chart.' : ''}</Text>}>
              {canEdit && (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setLibraryOpen(true)}>
                  Add Chart from Library
                </Button>
              )}
            </Empty>
          </Card>
        )}

        {visualizations.length > 0 && gridMounted && (
          <ResponsiveGridLayout
            width={gridWidth}
            className="layout"
            layouts={{ lg: gridLayout }}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
            cols={{ lg: 12, md: 10, sm: 6, xs: 4 }}
            rowHeight={60}
            margin={[12, 12]}
            containerPadding={[0, 0]}
            dragConfig={{ enabled: canEdit, handle: '.drag-handle' }}
            resizeConfig={{ enabled: canEdit }}
            onDragStart={() => { layoutChangeIsFromUser.current = true; }}
            onResizeStart={() => { layoutChangeIsFromUser.current = true; }}
            onLayoutChange={(newLayout: Layout) => {
              if (!layoutChangeIsFromUser.current) return;
              layoutChangeIsFromUser.current = false;
              setLayout([...newLayout].map((item: LayoutItem) => ({
                i: item.i,
                x: item.x,
                y: item.y,
                w: item.w,
                h: item.h,
              })));
            }}
          >
            {visualizations.map((viz) => (
              <div key={viz.id} style={{ overflow: 'hidden' }}>
                <Card
                  size="small"
                  style={{ height: '100%' }}
                  styles={{ body: { height: 'calc(100% - 48px)', padding: '8px 12px' } }}
                  extra={
                    canEdit && (
                      <DragOutlined className="drag-handle" style={{ cursor: 'grab', color: '#4a5568' }} />
                    )
                  }
                >
                  <VizCard
                    viz={viz}
                    onEdit={handleEditViz}
                    onDelete={(vizId) => deleteVizMutation.mutate(vizId)}
                    isEditing={canEdit}
                    refreshKey={refreshKey}
                    filterValues={filterValues}
                    activeCrossFilters={crossFilters}
                    onCrossFilter={handleCrossFilter}
                  />
                </Card>
              </div>
            ))}
          </ResponsiveGridLayout>
        )}
      </div>

      {/* Share / Embed Modal */}
      <Modal
        title="Share Dashboard"
        open={shareModalOpen}
        onCancel={() => setShareModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        {dashboard.shareToken ? (
          <Space direction="vertical" size={16} style={{ width: '100%', marginTop: 8 }}>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Public link</Text>
              <Input.Group compact style={{ marginTop: 4 }}>
                <Input
                  readOnly
                  value={`${window.location.origin}/public/dashboards/${dashboard.shareToken}`}
                  style={{ width: 'calc(100% - 40px)' }}
                />
                <Tooltip title="Copy link">
                  <Button
                    icon={<CopyOutlined />}
                    onClick={() => {
                      void navigator.clipboard.writeText(`${window.location.origin}/public/dashboards/${dashboard.shareToken}`);
                      message.success('Link copied');
                    }}
                  />
                </Tooltip>
              </Input.Group>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Embed code</Text>
              <Input.TextArea
                readOnly
                rows={3}
                style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 11 }}
                value={`<iframe src="${window.location.origin}/public/dashboards/${dashboard.shareToken}" width="100%" height="600" frameborder="0" allowfullscreen></iframe>`}
              />
              <Button
                size="small"
                icon={<CopyOutlined />}
                style={{ marginTop: 6 }}
                onClick={() => {
                  void navigator.clipboard.writeText(`<iframe src="${window.location.origin}/public/dashboards/${dashboard.shareToken}" width="100%" height="600" frameborder="0" allowfullscreen></iframe>`);
                  message.success('Embed code copied');
                }}
              >
                Copy embed code
              </Button>
            </div>
            <Button
              danger
              icon={<StopOutlined />}
              loading={revokeMutation.isPending}
              onClick={() => revokeMutation.mutate()}
            >
              Revoke link
            </Button>
          </Space>
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%', marginTop: 8 }}>
            <Space>
              <LinkOutlined style={{ color: '#6366f1', fontSize: 20 }} />
              <div>
                <Text strong>Generate a public link</Text>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Anyone with the link can view this dashboard without logging in.
                  </Text>
                </div>
              </div>
            </Space>
            <Button
              type="primary"
              icon={<ShareAltOutlined />}
              loading={shareMutation.isPending}
              onClick={() => shareMutation.mutate()}
            >
              Generate public link
            </Button>
          </Space>
        )}
      </Modal>

      {/* Chart Config Drawer */}
      <Drawer
        title={editingViz ? 'Edit Chart' : 'Add Chart'}
        open={drawerOpen}
        onClose={closeDrawer}
        width={520}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={closeDrawer}>Cancel</Button>
            <Button
              type="primary"
              loading={createVizMutation.isPending || updateVizMutation.isPending}
              onClick={() => vizForm.submit()}
            >
              {editingViz ? 'Update' : 'Add Chart'}
            </Button>
          </div>
        }
      >
        <Form form={vizForm} layout="vertical" onFinish={handleVizSubmit}>
          <Form.Item name="title" label="Chart title" rules={[{ required: true }]}>
            <Input placeholder="e.g. Monthly Revenue" />
          </Form.Item>

          <Form.Item name="chartType" label="Chart type" rules={[{ required: true }]}>
            <ChartTypeGrid />
          </Form.Item>

          <Form.Item label="Data source">
            <Select
              placeholder="Select data source"
              value={selectedDs || undefined}
              onChange={setSelectedDs}
            >
              {datasources.filter((d) => d.status === 'active').map((d) => (
                <Option key={d.id} value={d.id}>{d.name}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="queryId" label="Saved query">
            <Select placeholder="Select a saved query" allowClear>
              {savedQueries
                .filter((q) => !selectedDs || q.datasourceId === selectedDs)
                .map((q) => (
                  <Option key={q.id} value={q.id}>{q.name}</Option>
                ))}
            </Select>
          </Form.Item>

          {/* Inline column preview — shows available columns after a query is selected */}
          {selectedQueryId && (colsLoading || queryCols.length > 0 || colsError) && (
            <div style={{
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              padding: '10px 12px',
              marginBottom: 16,
            }}>
              {colsLoading ? (
                <Space size={6}>
                  <Spin size="small" />
                  <Text type="secondary" style={{ fontSize: 12 }}>Loading columns...</Text>
                </Space>
              ) : colsError ? (
                <Text type="danger" style={{ fontSize: 12 }}>{colsError}</Text>
              ) : (
                <>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
                    {queryCols.length} column{queryCols.length !== 1 ? 's' : ''} available — click to copy name
                  </Text>
                  <Space size={4} wrap>
                    {queryCols.map((col) => (
                      <Tag
                        key={col}
                        color="blue"
                        style={{ cursor: 'pointer', fontSize: 11, marginBottom: 2 }}
                        onClick={() => void navigator.clipboard.writeText(col).then(() => message.info(`Copied: ${col}`))}
                      >
                        {col}
                      </Tag>
                    ))}
                  </Space>
                </>
              )}
            </div>
          )}

          {queryParams.length > 0 && (
            <Form.Item label="Default parameter values" style={{ marginBottom: 12 }}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {queryParams.map((param) => {
                  const ptype = previewParamTypes[param] ?? 'text';
                  return (
                    <Space key={param} size={6} align="center" style={{ width: '100%' }}>
                      <Text style={{ fontSize: 12, color: '#a5b4fc', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>:{param}</Text>
                      <Select
                        size="small"
                        value={ptype}
                        style={{ width: 110 }}
                        onChange={(val: 'text' | 'number' | 'date' | 'datetime') =>
                          setPreviewParamTypes((prev) => ({ ...prev, [param]: val }))
                        }
                        options={[
                          { value: 'text', label: 'Text' },
                          { value: 'number', label: 'Number' },
                          { value: 'date', label: 'Date' },
                          { value: 'datetime', label: 'Date & Time' },
                        ]}
                      />
                      {ptype === 'text' && (
                        <Input
                          size="small"
                          style={{ flex: 1 }}
                          placeholder="value"
                          value={previewParams[param] ?? ''}
                          onChange={(e) => setPreviewParams((prev) => ({ ...prev, [param]: e.target.value }))}
                        />
                      )}
                      {ptype === 'number' && (
                        <InputNumber
                          size="small"
                          style={{ flex: 1 }}
                          placeholder="value"
                          value={previewParams[param] !== undefined && previewParams[param] !== '' ? Number(previewParams[param]) : undefined}
                          onChange={(val) => setPreviewParams((prev) => ({ ...prev, [param]: val !== null ? String(val) : '' }))}
                        />
                      )}
                      {ptype === 'date' && (
                        <DatePicker
                          size="small"
                          style={{ flex: 1 }}
                          value={previewParams[param] ? dayjs(previewParams[param]) : null}
                          onChange={(d) => setPreviewParams((prev) => ({ ...prev, [param]: d ? d.format('YYYY-MM-DD') : '' }))}
                        />
                      )}
                      {ptype === 'datetime' && (
                        <DatePicker
                          size="small"
                          showTime
                          style={{ flex: 1 }}
                          value={previewParams[param] ? dayjs(previewParams[param]) : null}
                          onChange={(d) => setPreviewParams((prev) => ({ ...prev, [param]: d ? d.toISOString() : '' }))}
                        />
                      )}
                      <Input
                        size="small"
                        style={{ width: 120 }}
                        placeholder="map from field"
                        value={previewParamMappings[param] ?? ''}
                        onChange={(e) => setPreviewParamMappings((prev) => ({ ...prev, [param]: e.target.value }))}
                      />
                    </Space>
                  );
                })}
              </Space>
              <Text type="secondary" style={{ fontSize: 11 }}>
                Default value: used when no incoming value. Map from field: name of the cross-filter or drill-down field whose value feeds this param (e.g. type <Text code style={{ fontSize: 11 }}>Day</Text> to map the "Day" click into <Text code style={{ fontSize: 11 }}>:givenDate</Text>).
              </Text>
            </Form.Item>
          )}


          {/* X/Y axis — line, bar, area, scatter */}
          {isXY && (
            <>
              <Form.Item name="xAxis" label="X-axis column">
                <AutoComplete
                  placeholder="column_name"
                  options={colOptions}
                  filterOption={(input, opt) => (opt?.value ?? '').toLowerCase().includes(input.toLowerCase())}
                  notFoundContent={colsLoading ? <Spin size="small" /> : null}
                />
              </Form.Item>
              <Form.Item name="yAxis" label="Y-axis column">
                <AutoComplete
                  placeholder="column_name"
                  options={colOptions}
                  filterOption={(input, opt) => (opt?.value ?? '').toLowerCase().includes(input.toLowerCase())}
                  notFoundContent={colsLoading ? <Spin size="small" /> : null}
                />
              </Form.Item>
            </>
          )}

          {/* Heatmap: X, Y, Value */}
          {isHeatmap && (
            <>
              <Form.Item name="xAxis" label="X-axis column">
                <AutoComplete placeholder="column_name" options={colOptions} filterOption={(i, o) => (o?.value ?? '').toLowerCase().includes(i.toLowerCase())} notFoundContent={colsLoading ? <Spin size="small" /> : null} />
              </Form.Item>
              <Form.Item name="yAxis" label="Y-axis column">
                <AutoComplete placeholder="column_name" options={colOptions} filterOption={(i, o) => (o?.value ?? '').toLowerCase().includes(i.toLowerCase())} notFoundContent={colsLoading ? <Spin size="small" /> : null} />
              </Form.Item>
              <Form.Item name="heatValueCol" label="Value column">
                <AutoComplete placeholder="column_name" options={colOptions} filterOption={(i, o) => (o?.value ?? '').toLowerCase().includes(i.toLowerCase())} notFoundContent={colsLoading ? <Spin size="small" /> : null} />
              </Form.Item>
            </>
          )}

          {/* Label + Value — pie, funnel, treemap */}
          {isLabelValue && (
            <>
              <Form.Item name="labelCol" label="Label column">
                <AutoComplete placeholder="column_name" options={colOptions} filterOption={(i, o) => (o?.value ?? '').toLowerCase().includes(i.toLowerCase())} notFoundContent={colsLoading ? <Spin size="small" /> : null} />
              </Form.Item>
              <Form.Item name="valueCol" label="Value column">
                <AutoComplete placeholder="column_name" options={colOptions} filterOption={(i, o) => (o?.value ?? '').toLowerCase().includes(i.toLowerCase())} notFoundContent={colsLoading ? <Spin size="small" /> : null} />
              </Form.Item>
            </>
          )}

          {/* Value only — gauge, metric */}
          {isGaugeOrMetric && (
            <Form.Item name="valueCol" label="Value column">
              <AutoComplete placeholder="column_name" options={colOptions} filterOption={(i, o) => (o?.value ?? '').toLowerCase().includes(i.toLowerCase())} notFoundContent={colsLoading ? <Spin size="small" /> : null} />
            </Form.Item>
          )}

          {/* Pivot Table fields */}
          {isPivot && (
            <>
              <Form.Item name="rowField" label="Row field" rules={[{ required: true, message: 'Row field is required' }]}>
                <AutoComplete placeholder="dimension column (rows)" options={colOptions} filterOption={(i, o) => (o?.value ?? '').toLowerCase().includes(i.toLowerCase())} notFoundContent={colsLoading ? <Spin size="small" /> : null} />
              </Form.Item>
              <Form.Item name="colField" label="Column field" rules={[{ required: true, message: 'Column field is required' }]}>
                <AutoComplete placeholder="dimension column (columns)" options={colOptions} filterOption={(i, o) => (o?.value ?? '').toLowerCase().includes(i.toLowerCase())} notFoundContent={colsLoading ? <Spin size="small" /> : null} />
              </Form.Item>
              <Form.Item name="pivotValueField" label="Value field" rules={[{ required: true, message: 'Value field is required' }]}>
                <AutoComplete placeholder="metric column" options={colOptions} filterOption={(i, o) => (o?.value ?? '').toLowerCase().includes(i.toLowerCase())} notFoundContent={colsLoading ? <Spin size="small" /> : null} />
              </Form.Item>
              <Form.Item name="aggregation" label="Aggregation" initialValue="sum">
                <Select>
                  <Option value="sum">Sum</Option>
                  <Option value="count">Count</Option>
                  <Option value="avg">Average</Option>
                  <Option value="min">Min</Option>
                  <Option value="max">Max</Option>
                </Select>
              </Form.Item>
            </>
          )}

          {/* Drill-down field — for charts that support element clicks */}
          {supportsClickAction && (
            <Form.Item
              name="drillDownField"
              label="Drill-down field (optional)"
              extra="Query parameter name injected when clicking a chart element. Leave empty to use cross-filtering instead."
            >
              <AutoComplete
                placeholder="e.g. category"
                options={colOptions}
                filterOption={(i, o) => (o?.value ?? '').toLowerCase().includes(i.toLowerCase())}
                notFoundContent={colsLoading ? <Spin size="small" /> : null}
              />
            </Form.Item>
          )}
        </Form>
      </Drawer>

      {/* AI Summary modal */}
      <Modal
        title={<Space><BulbOutlined style={{ color: '#722ed1' }} />AI Dashboard Summary</Space>}
        open={summaryOpen}
        onCancel={() => setSummaryOpen(false)}
        footer={
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Button
              icon={<SyncOutlined />}
              loading={summaryLoading}
              onClick={() => void runGenerate()}
              disabled={summaryLoading}
            >
              Regenerate
            </Button>
            <Space>
              {summaryData && !summaryLoading && !summaryData.isFromSave && (
                <Button
                  type="primary"
                  loading={summarySaving}
                  onClick={() => void handleSaveSummary()}
                >
                  Save to dashboard
                </Button>
              )}
              <Button onClick={() => setSummaryOpen(false)}>Close</Button>
            </Space>
          </Space>
        }
        width={680}
      >
        {summaryLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16, color: '#8c8c8c' }}>Analysing dashboard data...</div>
          </div>
        ) : summaryData ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {summaryData.generatedAt && (
              <Alert
                type={summaryData.isFromSave ? 'info' : 'success'}
                showIcon
                message={
                  summaryData.isFromSave
                    ? `Last saved summary — generated ${new Date(summaryData.generatedAt).toLocaleString()}`
                    : `Generated ${new Date(summaryData.generatedAt).toLocaleString()}`
                }
                description={summaryData.isFromSave ? 'Click Regenerate to produce a fresh one.' : undefined}
                style={{ marginBottom: 4 }}
              />
            )}
            <div>
              <Text strong>Executive Summary</Text>
              <div style={{ marginTop: 8 }}>{summaryData.summary}</div>
            </div>
            {summaryData.insights.length > 0 && (
              <div>
                <Text strong>Key Insights</Text>
                <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                  {summaryData.insights.map((insight, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>
                      <Space><CheckCircleOutlined style={{ color: '#52c41a' }} />{insight}</Space>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {summaryData.anomalies.length > 0 && (
              <Alert
                type="warning"
                icon={<WarningOutlined />}
                showIcon
                message="Anomalies & Notable Trends"
                description={
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {summaryData.anomalies.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                }
              />
            )}
            {!summaryData.isFromSave && (
              <Text type="secondary" style={{ fontSize: 12 }}>Generated by AI -- review before sharing</Text>
            )}
          </Space>
        ) : null}
      </Modal>

      {/* Chart Library modal */}
      <ChartLibraryModal
        open={libraryOpen}
        tenantId={dashboard.createdBy?.id ?? ''}
        onClose={() => setLibraryOpen(false)}
        onAdd={(viz) => {
          createVizMutation.mutate({
            title: viz.title,
            chartType: viz.chartType,
            queryId: viz.queryId,
            columnMapping: viz.columnMapping,
            chartConfig: viz.chartConfig,
            defaultParameters: viz.defaultParameters,
            parameterMappings: viz.parameterMappings,
          });
          setLibraryOpen(false);
        }}
      />
    </div>
  );
}

// ─── Chart Library Modal ──────────────────────────────────────────────────────

function ChartLibraryModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  tenantId: string;
  onClose: () => void;
  onAdd: (viz: Visualization) => void;
}) {
  const [search, setSearch] = useState('');

  const { data: library = [], isLoading } = useQuery<Visualization[]>({
    queryKey: ['chart-library'],
    queryFn: async () => {
      const { data } = await api.get('/visualizations/library');
      const payload = data.data ?? data;
      return Array.isArray(payload) ? payload : [];
    },
    enabled: open,
  });

  const filtered = search.trim()
    ? library.filter((v) => v.title.toLowerCase().includes(search.toLowerCase().trim()))
    : library;

  return (
    <Modal
      title={<Space><AppstoreAddOutlined />Chart Library</Space>}
      open={open}
      onCancel={() => { setSearch(''); onClose(); }}
      footer={null}
      width={700}
      afterClose={() => setSearch('')}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        Charts saved to the library can be reused across dashboards. Adding copies the configuration — changes to the copy do not affect the original.
      </Text>

      {library.length > 0 && (
        <Input
          prefix={<SearchOutlined style={{ color: 'var(--color-text-muted)' }} />}
          placeholder="Search charts by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ marginBottom: 16 }}
        />
      )}

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
      ) : library.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description='No charts in the library yet. Create a chart and check "Save to library" to add it here.'
        />
      ) : filtered.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No charts match your search." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {filtered.map((viz) => (
            <Card
              key={viz.id}
              size="small"
              hoverable
              actions={[
                <Button
                  key="add"
                  type="primary"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => onAdd(viz)}
                >
                  Add to dashboard
                </Button>,
              ]}
            >
              <Space>
                <span style={{ fontSize: 20, color: '#6366f1' }}>{CHART_ICONS[viz.chartType]}</span>
                <div>
                  <Text strong style={{ fontSize: 13 }}>{viz.title}</Text>
                  <div><Text type="secondary" style={{ fontSize: 11 }}>{viz.chartType}</Text></div>
                </div>
              </Space>
            </Card>
          ))}
        </div>
      )}
    </Modal>
  );
}
