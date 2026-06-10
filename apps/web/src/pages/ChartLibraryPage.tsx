import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Typography, Card, Button, Empty, Modal, Input, Select, Space, App,
  Popconfirm, Tag, Spin, Alert, Divider, Tabs, Table, Switch, Tooltip,
  Badge,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, PlayCircleOutlined,
  LineChartOutlined, BarChartOutlined, AreaChartOutlined, PieChartOutlined,
  DotChartOutlined, FundOutlined, ClockCircleOutlined, HeatMapOutlined,
  BlockOutlined, NumberOutlined, TableOutlined, BuildOutlined,
  CheckOutlined, InfoCircleOutlined, SearchOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import ChartRenderer from '../components/charts/ChartRenderer';
import type { Visualization, SavedQuery, Datasource, QueryResult, ChartType } from '../types';

const { Title, Text } = Typography;
const { Option } = Select;

// ─── Constants ────────────────────────────────────────────────────────────────

const CHART_TYPES: { value: ChartType; label: string; group: string }[] = [
  { value: 'line',    label: 'Line',    group: 'Trend' },
  { value: 'bar',     label: 'Bar',     group: 'Trend' },
  { value: 'area',    label: 'Area',    group: 'Trend' },
  { value: 'scatter', label: 'Scatter', group: 'Trend' },
  { value: 'pie',     label: 'Pie',     group: 'Part-of-Whole' },
  { value: 'funnel',  label: 'Funnel',  group: 'Part-of-Whole' },
  { value: 'treemap', label: 'Treemap', group: 'Part-of-Whole' },
  { value: 'gauge',   label: 'Gauge',   group: 'Single Value' },
  { value: 'metric',  label: 'Metric',  group: 'Single Value' },
  { value: 'heatmap', label: 'Heatmap', group: 'Matrix' },
  { value: 'table',   label: 'Table',   group: 'Tabular' },
  { value: 'pivot',   label: 'Pivot',   group: 'Tabular' },
];

const CHART_ICONS: Record<string, React.ReactNode> = {
  line: <LineChartOutlined />, bar: <BarChartOutlined />, area: <AreaChartOutlined />,
  scatter: <DotChartOutlined />, pie: <PieChartOutlined />, funnel: <FundOutlined />,
  treemap: <BlockOutlined />, gauge: <ClockCircleOutlined />, metric: <NumberOutlined />,
  heatmap: <HeatMapOutlined />, table: <TableOutlined />, pivot: <BuildOutlined />,
};

const CHART_GROUPS = ['Trend', 'Part-of-Whole', 'Single Value', 'Matrix', 'Tabular'];

// ─── ChartTypeGrid ────────────────────────────────────────────────────────────

function ChartTypeGrid({ value, onChange }: { value?: ChartType; onChange?: (v: ChartType) => void }) {
  return (
    <div>
      {CHART_GROUPS.map((group) => {
        const types = CHART_TYPES.filter((ct) => ct.group === group);
        return (
          <div key={group} style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
              {group}
            </Text>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {types.map((ct) => {
                const selected = value === ct.value;
                return (
                  <div
                    key={ct.value}
                    onClick={() => onChange?.(ct.value)}
                    style={{
                      padding: '8px 4px',
                      textAlign: 'center',
                      border: `2px solid ${selected ? '#6366f1' : 'var(--color-border)'}`,
                      borderRadius: 8,
                      cursor: 'pointer',
                      background: selected ? 'rgba(99,102,241,0.12)' : 'transparent',
                      transition: '150ms ease',
                      userSelect: 'none',
                    }}
                  >
                    <div style={{ fontSize: 18, color: selected ? '#6366f1' : 'var(--color-text-secondary)', marginBottom: 2 }}>
                      {CHART_ICONS[ct.value]}
                    </div>
                    <div style={{ fontSize: 10, color: selected ? '#6366f1' : 'var(--color-text-secondary)' }}>
                      {ct.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── ColumnSelect ─────────────────────────────────────────────────────────────

function ColumnSelect({
  value, onChange, columns, placeholder, multi,
}: {
  value?: string | string[];
  onChange?: (v: string | string[]) => void;
  columns: { name: string; type: string }[];
  placeholder?: string;
  multi?: boolean;
}) {
  if (multi) {
    return (
      <Select
        mode="multiple"
        style={{ width: '100%' }}
        placeholder={placeholder ?? 'Select columns'}
        value={Array.isArray(value) ? value : value ? [value] : []}
        onChange={onChange as (v: string[]) => void}
        allowClear
        showSearch
        optionFilterProp="label"
        options={columns.map((c) => ({ label: c.name, value: c.name, desc: c.type }))}
        optionRender={(opt) => (
          <Space>
            <Text>{opt.data.label}</Text>
            <Text type="secondary" style={{ fontSize: 11 }}>{opt.data.desc}</Text>
          </Space>
        )}
      />
    );
  }
  return (
    <Select
      style={{ width: '100%' }}
      placeholder={placeholder ?? 'Select column'}
      value={typeof value === 'string' ? value : undefined}
      onChange={onChange as (v: string) => void}
      allowClear
      showSearch
      optionFilterProp="label"
      options={columns.map((c) => ({ label: c.name, value: c.name, desc: c.type }))}
      optionRender={(opt) => (
        <Space>
          <Text>{opt.data.label}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{opt.data.desc}</Text>
        </Space>
      )}
    />
  );
}

// ─── ColumnMappingSection ─────────────────────────────────────────────────────

function ColumnMappingSection({
  chartType, columns, mapping, onChange,
}: {
  chartType: ChartType | null;
  columns: { name: string; type: string }[];
  mapping: Record<string, string | string[]>;
  onChange: (key: string, val: string | string[] | undefined) => void;
}) {
  if (!chartType || columns.length === 0) {
    return (
      <Alert
        type="info"
        showIcon
        message="Select a chart type and run your query to configure column mappings."
        style={{ marginBottom: 0 }}
      />
    );
  }

  const f = (key: string) => ({
    value: mapping[key],
    onChange: (v: string | string[]) => onChange(key, v || undefined),
    columns,
  });

  const isXY = ['line', 'bar', 'area', 'scatter'].includes(chartType);
  const isLabelValue = ['pie', 'funnel', 'treemap'].includes(chartType);
  const isGaugeMetric = ['gauge', 'metric'].includes(chartType);
  const isHeatmap = chartType === 'heatmap';
  const isPivot = chartType === 'pivot';
  const isTable = chartType === 'table';

  if (isTable) {
    return <Alert type="info" showIcon message="Table chart shows all query columns automatically — no mapping needed." />;
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      {isXY && (
        <>
          <div>
            <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>X-axis column <Text type="secondary">(category / time)</Text></Text>
            <ColumnSelect placeholder="e.g. date, category" {...f('xAxis')} />
          </div>
          <div>
            <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Y-axis column(s) <Text type="secondary">(numeric — multi-select for grouped series)</Text></Text>
            <ColumnSelect placeholder="e.g. revenue, count" multi {...f('yAxis')} />
          </div>
          <div>
            <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Series column <Text type="secondary">(optional — splits into multiple lines/bars)</Text></Text>
            <ColumnSelect placeholder="e.g. region (optional)" {...f('series')} />
          </div>
        </>
      )}
      {isLabelValue && (
        <>
          <div>
            <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Label column <Text type="secondary">(segment name)</Text></Text>
            <ColumnSelect placeholder="e.g. category" {...f('label')} />
          </div>
          <div>
            <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Value column <Text type="secondary">(numeric)</Text></Text>
            <ColumnSelect placeholder="e.g. total" {...f('value')} />
          </div>
        </>
      )}
      {isGaugeMetric && (
        <div>
          <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Value column <Text type="secondary">(single numeric value from first row)</Text></Text>
          <ColumnSelect placeholder="e.g. count" {...f('value')} />
        </div>
      )}
      {isHeatmap && (
        <>
          <div>
            <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>X-axis column</Text>
            <ColumnSelect placeholder="e.g. hour" {...f('xAxis')} />
          </div>
          <div>
            <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Y-axis column</Text>
            <ColumnSelect placeholder="e.g. day" {...f('yAxis')} />
          </div>
          <div>
            <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Value column <Text type="secondary">(cell intensity)</Text></Text>
            <ColumnSelect placeholder="e.g. count" {...f('value')} />
          </div>
        </>
      )}
      {isPivot && (
        <>
          <div>
            <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Row dimension</Text>
            <ColumnSelect placeholder="e.g. product" {...f('rowField')} />
          </div>
          <div>
            <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Column dimension</Text>
            <ColumnSelect placeholder="e.g. region" {...f('colField')} />
          </div>
          <div>
            <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Value</Text>
            <ColumnSelect placeholder="e.g. revenue" {...f('valueField')} />
          </div>
        </>
      )}
    </Space>
  );
}

// ─── AdvancedConfigSection ────────────────────────────────────────────────────

function AdvancedConfigSection({
  chartType, config, onChange,
}: {
  chartType: ChartType | null;
  config: Record<string, unknown>;
  onChange: (key: string, val: unknown) => void;
}) {
  if (!chartType || ['table', 'metric', 'gauge', 'heatmap', 'scatter', 'treemap', 'pivot'].includes(chartType)) return null;
  return (
    <Space direction="vertical" style={{ width: '100%' }} size={8}>
      {['bar', 'area'].includes(chartType) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 12 }}>Stacked</Text>
          <Switch
            size="small"
            checked={Boolean(config.stacked)}
            onChange={(v) => onChange('stacked', v)}
          />
        </div>
      )}
      {chartType === 'bar' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 12 }}>Horizontal bars</Text>
          <Switch
            size="small"
            checked={Boolean(config.horizontal)}
            onChange={(v) => onChange('horizontal', v)}
          />
        </div>
      )}
      {['line', 'area'].includes(chartType) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 12 }}>Smooth curves</Text>
          <Switch
            size="small"
            checked={config.smooth !== false}
            onChange={(v) => onChange('smooth', v)}
          />
        </div>
      )}
      {chartType === 'pie' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 12 }}>Donut style</Text>
          <Switch
            size="small"
            checked={Boolean(config.donut)}
            onChange={(v) => onChange('donut', v)}
          />
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 12 }}>Show legend</Text>
        <Switch
          size="small"
          checked={config.legend !== false}
          onChange={(v) => onChange('legend', v)}
        />
      </div>
    </Space>
  );
}

// ─── DataPreviewTable ─────────────────────────────────────────────────────────

function DataPreviewTable({ result }: { result: QueryResult }) {
  const cols: ColumnsType<Record<string, unknown>> = result.columns.map((c) => ({
    title: (
      <Space size={4}>
        <span>{c.name}</span>
        <Text type="secondary" style={{ fontSize: 10, fontWeight: 'normal' }}>{c.type}</Text>
      </Space>
    ),
    dataIndex: c.name,
    key: c.name,
    width: 140,
    ellipsis: true,
    render: (v: unknown) => {
      if (v === null || v === undefined) return <Text type="secondary" style={{ fontSize: 12 }}>null</Text>;
      return <span style={{ fontSize: 12 }}>{String(v)}</span>;
    },
  }));

  return (
    <Table
      dataSource={result.rows.slice(0, 50).map((r, i) => ({ ...r, _key: i }))}
      columns={cols}
      rowKey="_key"
      size="small"
      pagination={false}
      scroll={{ x: true, y: 300 }}
      style={{ fontSize: 12 }}
    />
  );
}

// ─── ChartBuilderModal ────────────────────────────────────────────────────────

interface BuilderState {
  title: string;
  chartType: ChartType | null;
  selectedDs: string;
  selectedQueryId: string;
  columnMapping: Record<string, string | string[]>;
  chartConfig: Record<string, unknown>;
}

function ChartBuilderModal({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: Visualization | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const qc = useQueryClient();

  const [state, setState] = useState<BuilderState>({
    title: '',
    chartType: null,
    selectedDs: '',
    selectedQueryId: '',
    columnMapping: {},
    chartConfig: {},
  });
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<'data' | 'chart'>('data');

  const set = (patch: Partial<BuilderState>) => setState((s) => ({ ...s, ...patch }));
  const setMapping = (key: string, val: string | string[] | undefined) =>
    setState((s) => {
      const next = { ...s.columnMapping };
      if (val === undefined) { delete next[key]; } else { next[key] = val; }
      return { ...s, columnMapping: next };
    });
  const setConfig = (key: string, val: unknown) =>
    setState((s) => ({ ...s, chartConfig: { ...s.chartConfig, [key]: val } }));

  // Reset when modal opens/closes
  useEffect(() => {
    if (!open) { setQueryResult(null); setQueryError(null); return; }
    if (editing) {
      setState({
        title: editing.title,
        chartType: editing.chartType,
        selectedDs: editing.query?.datasourceId ?? '',
        selectedQueryId: editing.queryId ?? '',
        columnMapping: (editing.columnMapping as Record<string, string | string[]>) ?? {},
        chartConfig: editing.chartConfig ?? {},
      });
    } else {
      setState({ title: '', chartType: null, selectedDs: '', selectedQueryId: '', columnMapping: {}, chartConfig: {} });
    }
  }, [open, editing]);

  const { data: datasources = [] } = useQuery<Datasource[]>({
    queryKey: ['datasources'],
    queryFn: async () => {
      const { data } = await api.get('/datasources');
      const p = data.data ?? data;
      return Array.isArray(p) ? p : (p.datasources ?? []);
    },
    enabled: open,
  });

  const { data: queries = [] } = useQuery<SavedQuery[]>({
    queryKey: ['queries-list'],
    queryFn: async () => {
      const { data } = await api.get('/queries?limit=200');
      const p = data.data ?? data;
      return p.queries ?? [];
    },
    enabled: open,
  });

  const filteredQueries = state.selectedDs
    ? queries.filter((q) => q.datasourceId === state.selectedDs)
    : queries;

  const runQuery = useCallback(async () => {
    if (!state.selectedQueryId) return;
    setQueryLoading(true);
    setQueryError(null);
    setQueryResult(null);
    try {
      const { data } = await api.post(`/queries/${state.selectedQueryId}/execute`, {}, { timeout: 30_000 });
      const result = data.data ?? data;
      setQueryResult(result as QueryResult);
      setPreviewTab('data');
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? (err as Error).message ?? 'Query failed';
      setQueryError(msg);
    } finally {
      setQueryLoading(false);
    }
  }, [state.selectedQueryId]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const cm: Record<string, unknown> = {};
      if (state.columnMapping.xAxis)    cm.xAxis    = state.columnMapping.xAxis;
      if (state.columnMapping.yAxis)    cm.yAxis    = state.columnMapping.yAxis;
      if (state.columnMapping.series)   cm.series   = state.columnMapping.series;
      if (state.columnMapping.label)    cm.label    = state.columnMapping.label;
      if (state.columnMapping.value)    cm.value    = state.columnMapping.value;
      if (state.columnMapping.rowField) cm.rowField = state.columnMapping.rowField;
      if (state.columnMapping.colField) cm.colField = state.columnMapping.colField;
      if (state.columnMapping.valueField) cm.valueField = state.columnMapping.valueField;

      const body = {
        title: state.title,
        chartType: state.chartType,
        queryId: state.selectedQueryId || undefined,
        columnMapping: cm,
        chartConfig: state.chartConfig,
        // no dashboardId → goes to library
      };
      return editing
        ? api.patch(`/visualizations/${editing.id}`, body)
        : api.post('/visualizations', body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['chart-library'] });
      message.success(editing ? 'Chart updated' : 'Chart saved to library');
      onSaved();
      onClose();
    },
    onError: () => message.error('Failed to save chart'),
  });

  const queryCols = queryResult?.columns ?? [];
  const canSave = !!state.title && !!state.chartType;

  // Build column mapping for ChartRenderer from current state
  const previewMapping = {
    xAxis: state.columnMapping.xAxis as string | undefined,
    yAxis: state.columnMapping.yAxis as string | string[] | undefined,
    series: state.columnMapping.series as string | undefined,
    label: state.columnMapping.label as string | undefined,
    value: state.columnMapping.value as string | undefined,
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width="min(95vw, 1240px)"
      style={{ top: 16, padding: 0 }}
      styles={{ body: { padding: 0 }, content: { padding: 0 } }}
      title={
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--color-border)' }}>
          <Space>
            <Text strong style={{ fontSize: 16 }}>{editing ? 'Edit Chart' : 'New Chart'}</Text>
            {state.chartType && <Tag icon={CHART_ICONS[state.chartType]}>{state.chartType}</Tag>}
          </Space>
        </div>
      }
      destroyOnHidden
    >
      <div style={{ display: 'flex', height: 'calc(90vh - 100px)', overflow: 'hidden' }}>

        {/* ── Left: Config Panel ───────────────────────────── */}
        <div style={{
          width: 400,
          minWidth: 360,
          flexShrink: 0,
          overflowY: 'auto',
          padding: '20px 24px',
          borderRight: '1px solid var(--color-border)',
        }}>

          {/* Title */}
          <div style={{ marginBottom: 20 }}>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>Chart title</Text>
            <Input
              value={state.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="e.g. Monthly Revenue"
              size="large"
            />
          </div>

          <Divider style={{ margin: '16px 0' }} />

          {/* Data source */}
          <div style={{ marginBottom: 12 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Data</Text>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <div>
                <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Data source</Text>
                <Select
                  style={{ width: '100%' }}
                  placeholder="Filter by data source (optional)"
                  value={state.selectedDs || undefined}
                  onChange={(v) => set({ selectedDs: v ?? '', selectedQueryId: '' })}
                  allowClear
                  showSearch
                  optionFilterProp="children"
                >
                  {datasources.filter((d) => d.status === 'active').map((d) => (
                    <Option key={d.id} value={d.id}>
                      <Space size={4}>
                        <Badge status="success" />
                        {d.name}
                        <Text type="secondary" style={{ fontSize: 11 }}>({d.type})</Text>
                      </Space>
                    </Option>
                  ))}
                </Select>
              </div>
              <div>
                <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Saved query</Text>
                <Space.Compact style={{ width: '100%' }}>
                  <Select
                    style={{ flex: 1 }}
                    placeholder="Select a query"
                    value={state.selectedQueryId || undefined}
                    onChange={(v) => { set({ selectedQueryId: v ?? '' }); setQueryResult(null); setQueryError(null); }}
                    allowClear
                    showSearch
                    optionFilterProp="children"
                  >
                    {filteredQueries.map((q) => (
                      <Option key={q.id} value={q.id}>
                        <Space size={4}>
                          {q.name}
                          {q.datasource && <Text type="secondary" style={{ fontSize: 11 }}>· {q.datasource.name}</Text>}
                        </Space>
                      </Option>
                    ))}
                  </Select>
                  <Tooltip title="Run query to load columns and preview">
                    <Button
                      icon={<PlayCircleOutlined />}
                      disabled={!state.selectedQueryId}
                      loading={queryLoading}
                      onClick={runQuery}
                    >
                      Run
                    </Button>
                  </Tooltip>
                </Space.Compact>
              </div>
              {queryError && <Alert type="error" showIcon message={queryError} style={{ fontSize: 12 }} />}
              {queryResult && (
                <Alert
                  type="success"
                  showIcon
                  icon={<CheckOutlined />}
                  message={`${queryResult.rowCount} rows · ${queryResult.columns.length} columns · ${queryResult.durationMs}ms`}
                  style={{ fontSize: 12 }}
                />
              )}
            </Space>
          </div>

          <Divider style={{ margin: '16px 0' }} />

          {/* Chart type */}
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Chart type</Text>
            <ChartTypeGrid value={state.chartType ?? undefined} onChange={(v) => set({ chartType: v, columnMapping: {} })} />
          </div>

          <Divider style={{ margin: '16px 0' }} />

          {/* Column mapping */}
          <div style={{ marginBottom: 16 }}>
            <Space style={{ marginBottom: 8 }}>
              <Text strong>Column mapping</Text>
              {queryCols.length > 0 && (
                <Tooltip title="Available columns from your query">
                  <Tag icon={<InfoCircleOutlined />} style={{ cursor: 'default' }}>
                    {queryCols.length} col{queryCols.length !== 1 ? 's' : ''}
                  </Tag>
                </Tooltip>
              )}
            </Space>
            <ColumnMappingSection
              chartType={state.chartType}
              columns={queryCols}
              mapping={state.columnMapping}
              onChange={setMapping}
            />
          </div>

          {/* Advanced config */}
          {state.chartType && !['table', 'metric', 'gauge', 'scatter', 'treemap', 'pivot', 'heatmap'].includes(state.chartType) && (
            <>
              <Divider style={{ margin: '16px 0' }} />
              <div style={{ marginBottom: 16 }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>Advanced options</Text>
                <AdvancedConfigSection
                  chartType={state.chartType}
                  config={state.chartConfig}
                  onChange={setConfig}
                />
              </div>
            </>
          )}

          {/* Save button */}
          <div style={{ paddingTop: 8, borderTop: '1px solid var(--color-border)', marginTop: 8 }}>
            <Button
              type="primary"
              size="large"
              style={{ width: '100%' }}
              disabled={!canSave}
              loading={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {editing ? 'Update chart' : 'Save to library'}
            </Button>
            {!canSave && (
              <Text type="secondary" style={{ fontSize: 11, display: 'block', textAlign: 'center', marginTop: 4 }}>
                {!state.title ? 'Add a title' : 'Select a chart type'} to save
              </Text>
            )}
          </div>
        </div>

        {/* ── Right: Preview Panel ─────────────────────────── */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text strong>Preview</Text>
            <Space size={4}>
              <Button
                size="small"
                type={previewTab === 'data' ? 'primary' : 'default'}
                onClick={() => setPreviewTab('data')}
                disabled={!queryResult}
              >
                Data
              </Button>
              <Button
                size="small"
                type={previewTab === 'chart' ? 'primary' : 'default'}
                onClick={() => setPreviewTab('chart')}
                disabled={!queryResult || !state.chartType}
              >
                Chart
              </Button>
            </Space>
          </div>

          {!queryResult && !queryLoading && (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px dashed var(--color-border)',
              borderRadius: 8,
              flexDirection: 'column',
              gap: 12,
              color: 'var(--color-text-secondary)',
            }}>
              <PlayCircleOutlined style={{ fontSize: 40 }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>No data yet</div>
                <div style={{ fontSize: 13 }}>Select a query and click Run to see your data here</div>
              </div>
            </div>
          )}

          {queryLoading && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Space direction="vertical" align="center">
                <Spin size="large" />
                <Text type="secondary">Running query...</Text>
              </Space>
            </div>
          )}

          {queryResult && !queryLoading && (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {previewTab === 'data' && (
                <div style={{ flex: 1, overflow: 'auto' }}>
                  <div style={{ marginBottom: 8 }}>
                    <Space wrap size={4}>
                      {queryResult.columns.map((c) => (
                        <Tag key={c.name} color="blue" style={{ fontSize: 11, cursor: 'default' }}>
                          {c.name}
                          <Text style={{ fontSize: 10, marginLeft: 4, color: 'rgba(255,255,255,0.7)' }}>{c.type}</Text>
                        </Tag>
                      ))}
                    </Space>
                  </div>
                  <DataPreviewTable result={queryResult} />
                  {queryResult.truncated && (
                    <Text type="secondary" style={{ fontSize: 11, marginTop: 6, display: 'block' }}>
                      Results truncated — showing first rows only
                    </Text>
                  )}
                </div>
              )}

              {previewTab === 'chart' && state.chartType && (
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  {state.chartType !== 'table' && (!previewMapping.xAxis && !previewMapping.label && !previewMapping.value && !previewMapping.yAxis) ? (
                    <div style={{
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px dashed var(--color-border)',
                      borderRadius: 8,
                      flexDirection: 'column',
                      gap: 8,
                      color: 'var(--color-text-secondary)',
                    }}>
                      <div style={{ fontSize: 24 }}>{CHART_ICONS[state.chartType]}</div>
                      <Text type="secondary">Map at least one column on the left to see the chart</Text>
                    </div>
                  ) : (
                    <ChartRenderer
                      chartType={state.chartType}
                      data={queryResult}
                      columnMapping={previewMapping}
                      chartConfig={state.chartConfig}
                      height={Math.max(320, window.innerHeight * 0.5)}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ─── ChartLibraryPage ─────────────────────────────────────────────────────────

export default function ChartLibraryPage() {
  const qc = useQueryClient();
  const { message, modal } = App.useApp();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingChart, setEditingChart] = useState<Visualization | null>(null);
  const [searchText, setSearchText] = useState('');
  const [filterDatasource, setFilterDatasource] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: library = [], isLoading } = useQuery<Visualization[]>({
    queryKey: ['chart-library'],
    queryFn: async () => {
      const { data } = await api.get('/visualizations/library');
      const payload = data.data ?? data;
      return Array.isArray(payload) ? payload : [];
    },
  });

  const datasourceOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const viz of library) {
      const ds = viz.query?.datasource;
      if (ds?.id && !seen.has(ds.id)) seen.set(ds.id, ds.name);
    }
    return [...seen.entries()].map(([id, name]) => ({ value: id, label: name }));
  }, [library]);

  const filteredLibrary = useMemo(() => {
    let items = library;
    if (searchText.trim()) {
      const lower = searchText.toLowerCase();
      items = items.filter((v) => v.title.toLowerCase().includes(lower));
    }
    if (filterDatasource) {
      items = items.filter((v) => v.query?.datasource?.id === filterDatasource);
    }
    return items;
  }, [library, searchText, filterDatasource]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/visualizations/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['chart-library'] });
      message.success('Chart deleted');
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => api.delete(`/visualizations/${id}`))),
    onSuccess: (_data, ids) => {
      void qc.invalidateQueries({ queryKey: ['chart-library'] });
      setSelectedIds(new Set());
      message.success(`${ids.length} chart${ids.length !== 1 ? 's' : ''} deleted`);
    },
    onError: () => message.error('Failed to delete some charts'),
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(filteredLibrary.map((v) => v.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const confirmBulkDelete = () => {
    const ids = [...selectedIds];
    const hasDashboard = ids.some((id) => library.find((v) => v.id === id)?.dashboardId);
    modal.confirm({
      title: `Delete ${ids.length} chart${ids.length !== 1 ? 's' : ''}?`,
      content: hasDashboard
        ? 'Some selected charts are part of a dashboard and will be removed from it.'
        : 'This cannot be undone.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: () => bulkDeleteMutation.mutate(ids),
    });
  };

  const openEdit = (viz: Visualization) => { setEditingChart(viz); setBuilderOpen(true); };
  const openNew = () => { setEditingChart(null); setBuilderOpen(true); };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Chart Library</Title>
          <Text type="secondary">Build reusable chart configurations. Add them to any dashboard with one click.</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} size="large" onClick={openNew}>
          New Chart
        </Button>
      </div>

      {library.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: 'var(--color-text-secondary)' }} />}
            placeholder="Search by name..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            style={{ width: 240 }}
          />
          <Select
            placeholder="Filter by datasource"
            value={filterDatasource || undefined}
            onChange={(v) => setFilterDatasource(v ?? '')}
            allowClear
            style={{ width: 220 }}
            options={datasourceOptions}
          />
          <Button size="small" onClick={selectedIds.size === filteredLibrary.length ? clearSelection : selectAll}>
            {selectedIds.size === filteredLibrary.length && filteredLibrary.length > 0 ? 'Deselect All' : 'Select All'}
          </Button>
          {selectedIds.size > 0 && (
            <>
              <Text type="secondary" style={{ fontSize: 12 }}>{selectedIds.size} selected</Text>
              <Button size="small" danger icon={<DeleteOutlined />} onClick={confirmBulkDelete} loading={bulkDeleteMutation.isPending}>
                Delete Selected
              </Button>
              <Button size="small" onClick={clearSelection}>Clear</Button>
            </>
          )}
          {(searchText || filterDatasource) && selectedIds.size === 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {filteredLibrary.length} of {library.length} chart{library.length !== 1 ? 's' : ''}
            </Text>
          )}
        </div>
      )}

      {library.length === 0 && !isLoading ? (
        <Card style={{ textAlign: 'center', padding: 60 }}>
          <Empty
            description={
              <Space direction="vertical" size={4}>
                <Text strong style={{ fontSize: 16 }}>No charts in the library yet</Text>
                <Text type="secondary">
                  Create charts here with full data preview and live chart rendering.
                  Add them to any dashboard from the dashboard editor.
                </Text>
              </Space>
            }
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>
              Create your first chart
            </Button>
          </Empty>
        </Card>
      ) : filteredLibrary.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 40 }}>
          <Text type="secondary">No charts match your filters.</Text>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {filteredLibrary.map((viz) => {
            const isSelected = selectedIds.has(viz.id);
            return (
            <Card
              key={viz.id}
              size="small"
              hoverable
              style={{ borderColor: isSelected ? '#6366f1' : undefined, borderWidth: isSelected ? 2 : 1 }}
              actions={[
                <Button key="edit" size="small" icon={<EditOutlined />} onClick={() => openEdit(viz)}>Edit</Button>,
                <Popconfirm
                  key="delete"
                  title="Delete this chart?"
                  description={
                    viz.dashboardId
                      ? 'This chart is part of a dashboard. Deleting it will remove it from that dashboard too.'
                      : 'This will permanently delete the chart.'
                  }
                  onConfirm={() => deleteMutation.mutate(viz.id)}
                  okButtonProps={{ danger: true }}
                >
                  <Button size="small" danger icon={<DeleteOutlined />}>Delete</Button>
                </Popconfirm>,
              ]}
            >
              <div style={{ position: 'relative' }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(viz.id)}
                  style={{ position: 'absolute', top: 0, right: 0, width: 16, height: 16, cursor: 'pointer', accentColor: '#6366f1' }}
                />
              </div>
              <Space align="start" style={{ width: '100%' }}>
                <span style={{ fontSize: 30, color: 'var(--color-accent)', lineHeight: 1.2, marginTop: 2 }}>
                  {CHART_ICONS[viz.chartType]}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text strong style={{ display: 'block', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {viz.title}
                  </Text>
                  <Space size={4} style={{ marginTop: 4 }} wrap>
                    <Tag style={{ fontSize: 11 }}>{viz.chartType}</Tag>
                    {viz.dashboardId && (
                      <Tag color="purple" style={{ fontSize: 11 }}>Dashboard</Tag>
                    )}
                    {viz.query?.name && (
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {viz.query.name}
                      </Text>
                    )}
                  </Space>
                  {viz.columnMapping && (
                    <div style={{ marginTop: 6 }}>
                      {Object.entries(viz.columnMapping)
                        .filter(([, v]) => v)
                        .slice(0, 3)
                        .map(([k, v]) => (
                          <Text key={k} type="secondary" style={{ fontSize: 10, display: 'block' }}>
                            {k}: {Array.isArray(v) ? v.join(', ') : String(v)}
                          </Text>
                        ))}
                    </div>
                  )}
                </div>
              </Space>
            </Card>
          );
          })}
        </div>
      )}

      <ChartBuilderModal
        open={builderOpen}
        editing={editingChart}
        onClose={() => { setBuilderOpen(false); setEditingChart(null); }}
        onSaved={() => {
          void qc.invalidateQueries({ queryKey: ['chart-library'] });
        }}
      />
    </div>
  );
}
