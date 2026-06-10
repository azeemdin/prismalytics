import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Modal,
  Steps,
  Select,
  Checkbox,
  Form,
  Input,
  Button,
  Space,
  Tag,
  Typography,
  Spin,
  Alert,
  Result,
  Divider,
  Row,
  Col,
  Card,
  Tooltip,
  App,
} from 'antd';
import {
  ThunderboltOutlined,
  BarChartOutlined,
  TableOutlined,
  DashboardOutlined,
  CheckCircleOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import type { Datasource, AutoDashboardProposal, AutoDashboardAnalysis, AutoDashboardGenerateResult } from '../../types';

const { Text, Paragraph } = Typography;
const { Option } = Select;

const CHART_TYPE_COLOR: Record<string, string> = {
  metric: 'purple',
  line: 'blue',
  bar: 'blue',
  area: 'cyan',
  pie: 'orange',
  scatter: 'geekblue',
  funnel: 'volcano',
  table: 'default',
};

const CATEGORY_ICON: Record<string, React.ReactNode> = {
  metric: <ThunderboltOutlined />,
  chart: <BarChartOutlined />,
  table: <TableOutlined />,
};

interface SchemaTable {
  name: string;
  schema?: string;
  columns: { name: string; type: string }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AutoDashboardWizard({ open, onClose }: Props) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // wizard state
  const [step, setStep] = useState(0);
  const [selectedDatasourceId, setSelectedDatasourceId] = useState('');
  const [selectedSchema, setSelectedSchema] = useState('');
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<AutoDashboardAnalysis | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sqlExpanded, setSqlExpanded] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<AutoDashboardGenerateResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const [form] = Form.useForm<{ dashboardName: string; description?: string; visibility: string }>();

  const reset = () => {
    setStep(0);
    setSelectedDatasourceId('');
    setSelectedSchema('');
    setSelectedTables([]);
    setAnalysis(null);
    setSelectedIds(new Set());
    setSqlExpanded(new Set());
    setResult(null);
    setAnalyzeError(null);
    form.resetFields();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // ─── Data ──────────────────────────────────────────────────────────────────

  const { data: allDatasources = [] } = useQuery<Datasource[]>({
    queryKey: ['datasources'],
    queryFn: async () => {
      const { data } = await api.get('/datasources');
      const payload = data.data ?? data;
      return Array.isArray(payload) ? payload : (payload.datasources ?? []);
    },
    enabled: open,
  });

  const sqlDatasources = allDatasources.filter((d) =>
    ['postgresql', 'mysql', 'mssql', 'sqlite', 'oracle'].includes(d.type),
  );

  // Schema/database list — same endpoint as Query Editor
  const { data: databases = [], isFetching: dbsFetching } = useQuery<string[]>({
    queryKey: ['datasource-databases', selectedDatasourceId],
    queryFn: async () => {
      const { data } = await api.get(`/datasources/${selectedDatasourceId}/databases`);
      const payload = data.data ?? data;
      return Array.isArray(payload) ? payload : [];
    },
    enabled: !!selectedDatasourceId,
  });

  const hasSchemas = databases.length > 0;

  // Full table+column schema for the table picker — scoped to the selected schema when available.
  // Only fetch once a schema is chosen (or when the datasource has no named schemas).
  const { data: schemaData, isFetching: schemaFetching } = useQuery<{ tables: SchemaTable[] }>({
    queryKey: ['datasource-schema', selectedDatasourceId, selectedSchema],
    queryFn: async () => {
      const url = selectedSchema
        ? `/datasources/${selectedDatasourceId}/schema?schema=${encodeURIComponent(selectedSchema)}`
        : `/datasources/${selectedDatasourceId}/schema`;
      const { data } = await api.get(url);
      return data.data ?? data;
    },
    enabled: !!selectedDatasourceId && (!hasSchemas || !!selectedSchema),
  });

  const allTables = schemaData?.tables ?? [];
  const filteredTables = allTables;

  // Auto-select the only schema when exactly one is available
  useEffect(() => {
    if (databases.length === 1 && databases[0] && !selectedSchema) {
      setSelectedSchema(databases[0]);
    }
  }, [databases]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill dashboard name when datasource is selected; reset schema + tables
  useEffect(() => {
    if (!selectedDatasourceId) return;
    setSelectedSchema('');
    setSelectedTables([]);
    const ds = sqlDatasources.find((d) => d.id === selectedDatasourceId);
    if (ds) form.setFieldValue('dashboardName', `${ds.name} Dashboard`);
  }, [selectedDatasourceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset tables when schema changes
  useEffect(() => {
    setSelectedTables([]);
  }, [selectedSchema]);

  // ─── Mutations ─────────────────────────────────────────────────────────────

  const analyzeMutation = useMutation({
    mutationFn: async (params: { datasourceId: string; selectedTables: string[]; selectedSchema?: string }) => {
      const { data } = await api.post('/ai/auto-dashboard/analyze', params);
      return (data.data ?? data) as AutoDashboardAnalysis;
    },
    onSuccess: (data) => {
      setAnalysis(data);
      setSelectedIds(new Set(data.proposals.map((p) => p.id)));
      setStep(2);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'AI analysis failed';
      setAnalyzeError(msg);
      message.error(msg);
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (params: {
      dashboardName: string;
      description?: string;
      visibility: string;
      datasourceId: string;
      proposals: AutoDashboardProposal[];
    }) => {
      const { data } = await api.post('/ai/auto-dashboard/generate', params);
      return (data.data ?? data) as AutoDashboardGenerateResult;
    },
    onSuccess: (data) => {
      setResult(data);
      setStep(3);
      void qc.invalidateQueries({ queryKey: ['dashboards'] });
      void qc.invalidateQueries({ queryKey: ['queries'] });
      void qc.invalidateQueries({ queryKey: ['query-folders'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Generation failed';
      message.error(msg);
    },
  });

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleAnalyze = () => {
    if (!selectedTables.length) return;
    setAnalyzeError(null);
    setStep(2);
    analyzeMutation.mutate({
      datasourceId: selectedDatasourceId,
      selectedTables,
      ...(selectedSchema ? { selectedSchema } : {}),
    });
  };

  const handleGenerate = async () => {
    try {
      const values = await form.validateFields();
      const chosen = (analysis?.proposals ?? []).filter((p) => selectedIds.has(p.id));
      if (!chosen.length) { message.warning('Select at least one item to include'); return; }
      generateMutation.mutate({
        dashboardName: values.dashboardName,
        description: values.description,
        visibility: values.visibility ?? 'private',
        datasourceId: selectedDatasourceId,
        proposals: chosen,
      });
    } catch {
      // form validation failed — antd already shows inline errors
    }
  };

  const toggleProposal = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSql = (id: string) => {
    setSqlExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ─── Grouped proposals ─────────────────────────────────────────────────────

  const grouped = analysis
    ? {
        metric: analysis.proposals.filter((p) => p.category === 'metric'),
        chart: analysis.proposals.filter((p) => p.category === 'chart'),
        table: analysis.proposals.filter((p) => p.category === 'table'),
      }
    : null;

  const selectedCount = selectedIds.size;

  // ─── Render helpers ────────────────────────────────────────────────────────

  const renderProposalGroup = (label: string, items: AutoDashboardProposal[]) => {
    if (!items.length) return null;
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ color: '#6366f1' }}>
            {CATEGORY_ICON[label === 'Metrics' ? 'metric' : label === 'Charts' ? 'chart' : 'table']}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: '#6366f1' }}>
            {label}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((p) => {
            const selected = selectedIds.has(p.id);
            return (
            <Card
              key={p.id}
              size="small"
              style={{
                borderColor: selected ? '#6366f1' : '#d9d9d9',
                borderWidth: selected ? 2 : 1,
                background: selected ? '#f5f3ff' : '#fff',
                cursor: 'pointer',
              }}
              onClick={() => toggleProposal(p.id)}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <Checkbox
                  checked={selected}
                  onChange={() => toggleProposal(p.id)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ marginTop: 2, flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{p.title}</span>
                    <Tag color={CHART_TYPE_COLOR[p.chartType] ?? 'default'} style={{ fontSize: 11 }}>
                      {p.chartType}
                    </Tag>
                  </div>
                  <p style={{ fontSize: 12, color: '#4b5563', margin: '4px 0 0', lineHeight: 1.5 }}>
                    {p.description}
                  </p>
                  <div style={{ marginTop: 6 }}>
                    <Tooltip title={sqlExpanded.has(p.id) ? 'Hide SQL' : 'Show SQL'}>
                      <Button
                        size="small"
                        type="text"
                        icon={<CodeOutlined />}
                        style={{ fontSize: 11, padding: '0 4px', height: 20, color: '#6b7280' }}
                        onClick={(e) => { e.stopPropagation(); toggleSql(p.id); }}
                      >
                        SQL
                      </Button>
                    </Tooltip>
                    {sqlExpanded.has(p.id) && (
                      <pre
                        style={{
                          marginTop: 6,
                          padding: '6px 10px',
                          background: '#f3f4f6',
                          border: '1px solid #e5e7eb',
                          borderRadius: 4,
                          fontSize: 11,
                          color: '#1f2937',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                          maxHeight: 120,
                          overflowY: 'auto',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {p.sql}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
          })}
        </div>
      </div>
    );
  };

  // ─── Step content ──────────────────────────────────────────────────────────

  const renderStep0 = () => {
    const loadingSchemas = !!selectedDatasourceId && dbsFetching;
    const schemaRequired = hasSchemas && databases.length > 1;
    const nextDisabled =
      !selectedDatasourceId ||
      loadingSchemas ||
      (schemaRequired && !selectedSchema);

    return (
      <div>
        <Paragraph type="secondary" style={{ marginBottom: 20 }}>
          Select a SQL datasource and schema. The AI will inspect the selected tables and propose
          charts, metrics, and a ready-to-use dashboard.
        </Paragraph>
        <Form layout="vertical">
          <Form.Item label="Datasource" required>
            <Select
              showSearch
              placeholder="Select a datasource"
              value={selectedDatasourceId || undefined}
              onChange={setSelectedDatasourceId}
              style={{ width: '100%' }}
              optionFilterProp="children"
            >
              {sqlDatasources.map((ds) => (
                <Option key={ds.id} value={ds.id}>
                  {ds.name}
                  <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                    ({ds.type})
                  </Text>
                </Option>
              ))}
            </Select>
          </Form.Item>

          {allDatasources.length > 0 && sqlDatasources.length === 0 && (
            <Alert
              type="info"
              message="No SQL datasources found. Add a PostgreSQL, MySQL, MSSQL, SQLite, or Oracle connection first."
              style={{ marginBottom: 12 }}
            />
          )}

          {selectedDatasourceId && (
            <Form.Item
              label={
                <Space size={4}>
                  Schema / Collection
                  {loadingSchemas && <Spin size="small" />}
                </Space>
              }
            >
              {loadingSchemas ? (
                <Select disabled placeholder="Loading schemas..." style={{ width: '100%' }} />
              ) : !hasSchemas ? (
                <Alert
                  type="info"
                  showIcon
                  message="No named schemas detected — all tables will be available in the next step."
                  style={{ padding: '4px 10px' }}
                />
              ) : databases.length === 1 ? (
                <Select value={selectedSchema} disabled style={{ width: '100%' }}>
                  <Option value={databases[0]!}>{databases[0]}</Option>
                </Select>
              ) : (
                <Select
                  showSearch
                  placeholder="Select a schema"
                  value={selectedSchema || undefined}
                  onChange={setSelectedSchema}
                  style={{ width: '100%' }}
                  optionFilterProp="children"
                >
                  {databases.map((s) => (
                    <Option key={s} value={s}>{s}</Option>
                  ))}
                </Select>
              )}
            </Form.Item>
          )}
        </Form>

        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            type="primary"
            disabled={nextDisabled}
            onClick={() => setStep(1)}
          >
            Next: Select Tables
          </Button>
        </div>
      </div>
    );
  };

  const renderStep1 = () => (
    <div>
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Choose the tables to analyze. Select up to 10 for best results.
        </Text>
        {selectedSchema && (
          <Tag color="blue" style={{ margin: 0 }}>schema: {selectedSchema}</Tag>
        )}
      </div>
      {schemaFetching ? (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spin tip="Loading tables..." />
        </div>
      ) : filteredTables.length === 0 ? (
        <Alert type="warning" message="No tables found in the selected schema." />
      ) : (
        <>
          <div style={{ marginBottom: 10, display: 'flex', gap: 8 }}>
            <Button
              size="small"
              onClick={() => setSelectedTables(filteredTables.map((t) => t.name).slice(0, 10))}
            >
              Select All
            </Button>
            <Button size="small" onClick={() => setSelectedTables([])}>
              Clear
            </Button>
            <Text type="secondary" style={{ fontSize: 12, alignSelf: 'center' }}>
              {selectedTables.length} / {filteredTables.length} selected
            </Text>
          </div>
          <div
            style={{
              maxHeight: 320,
              overflowY: 'auto',
              border: '1px solid #f0f0f0',
              borderRadius: 6,
              padding: '8px 12px',
            }}
          >
            <Checkbox.Group
              value={selectedTables}
              onChange={(vals) => setSelectedTables(vals as string[])}
              style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              {filteredTables.map((t) => (
                <Checkbox
                  key={t.name}
                  value={t.name}
                  disabled={!selectedTables.includes(t.name) && selectedTables.length >= 10}
                >
                  <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{t.name}</span>
                  <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>
                    ({t.columns.length} columns)
                  </Text>
                </Checkbox>
              ))}
            </Checkbox.Group>
          </div>
        </>
      )}
      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between' }}>
        <Button onClick={() => setStep(0)}>Back</Button>
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          loading={analyzeMutation.isPending}
          disabled={selectedTables.length === 0 || schemaFetching}
          onClick={handleAnalyze}
        >
          Analyze with AI
        </Button>
      </div>
    </div>
  );

  const renderStep2 = () => {
    if (analyzeMutation.isPending) {
      return (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">
              Analyzing {selectedTables.length} table{selectedTables.length !== 1 ? 's' : ''} and generating proposals...
            </Text>
          </div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
            This usually takes 10–30 seconds.
          </Text>
        </div>
      );
    }

    if (analyzeMutation.isError || !analysis) {
      return (
        <div>
          <Alert
            type="error"
            message="Analysis failed"
            description={analyzeError ?? 'The AI could not analyze the schema. Check that AI is configured in Settings and try again.'}
            style={{ marginBottom: 16 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button onClick={() => setStep(1)}>Back</Button>
            <Button type="primary" onClick={handleAnalyze}>Retry</Button>
          </div>
        </div>
      );
    }

    return (
      <div>
        <Alert
          type="success"
          message={`${analysis.proposals.length} proposals generated for ${selectedTables.length} table${selectedTables.length !== 1 ? 's' : ''}`}
          description="Select the items to include, adjust the dashboard settings below, then click Generate."
          style={{ marginBottom: 16 }}
        />

        {/* Dashboard settings */}
        <Form form={form} layout="vertical" style={{ marginBottom: 8 }}>
          <Row gutter={16}>
            <Col xs={24} md={14}>
              <Form.Item
                name="dashboardName"
                label="Dashboard Name"
                rules={[{ required: true, message: 'Required' }]}
              >
                <Input placeholder="My New Dashboard" maxLength={100} />
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Form.Item name="visibility" label="Visibility" initialValue="private">
                <Select>
                  <Option value="private">Private</Option>
                  <Option value="team">Team</Option>
                  <Option value="public">Public</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} placeholder="Optional description" maxLength={500} />
          </Form.Item>
        </Form>

        <Divider style={{ margin: '12px 0' }}>
          <Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {selectedCount} of {analysis.proposals.length} selected
            </Text>
            <Button
              size="small"
              type="link"
              style={{ padding: 0, fontSize: 12 }}
              onClick={() => setSelectedIds(new Set(analysis.proposals.map((p) => p.id)))}
            >
              All
            </Button>
            <Button
              size="small"
              type="link"
              style={{ padding: 0, fontSize: 12 }}
              onClick={() => setSelectedIds(new Set())}
            >
              None
            </Button>
          </Space>
        </Divider>

        <div style={{ maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
          {grouped && renderProposalGroup('Metrics', grouped.metric)}
          {grouped && renderProposalGroup('Charts', grouped.chart)}
          {grouped && renderProposalGroup('Tables', grouped.table)}
        </div>

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between' }}>
          <Button onClick={() => setStep(1)}>Back</Button>
          <Button
            type="primary"
            icon={<DashboardOutlined />}
            loading={generateMutation.isPending}
            disabled={selectedCount === 0}
            onClick={() => void handleGenerate()}
          >
            {generateMutation.isPending ? 'Generating...' : `Generate Dashboard (${selectedCount} items)`}
          </Button>
        </div>
      </div>
    );
  };

  const renderStep3 = () => (
    <Result
      icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
      title="Dashboard created"
      subTitle={
        result
          ? `${result.queriesCreated} queries and ${result.chartsCreated} charts saved in folder "${result.folderName}"`
          : ''
      }
      extra={[
        <Button
          key="open"
          type="primary"
          icon={<DashboardOutlined />}
          onClick={() => { handleClose(); if (result) navigate(`/dashboards/${result.dashboardId}`); }}
        >
          Open Dashboard
        </Button>,
        <Button key="another" onClick={reset}>
          Create Another
        </Button>,
      ]}
    />
  );

  // ─── Main render ───────────────────────────────────────────────────────────

  const STEP_ITEMS = [
    { title: 'Datasource & Schema' },
    { title: 'Tables' },
    { title: 'Proposals' },
    { title: 'Done' },
  ];

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      title={
        <Space>
          <ThunderboltOutlined style={{ color: '#6366f1' }} />
          Auto Dashboard
        </Space>
      }
      width={760}
      footer={null}
      destroyOnClose
    >
      <Steps
        current={step}
        items={STEP_ITEMS}
        size="small"
        style={{ marginBottom: 28 }}
      />

      {step === 0 && renderStep0()}
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
    </Modal>
  );
}
