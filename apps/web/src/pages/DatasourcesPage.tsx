import { useState } from 'react';
import {
  Typography,
  Card,
  Button,
  Empty,
  Table,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Switch,
  Tooltip,
  Popconfirm,
  Badge,
  App,
  Radio,
} from 'antd';
import {
  DatabaseOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ThunderboltOutlined,
  TableOutlined,
  UploadOutlined,
  LockOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useAuthStore } from '../stores/auth.store';
import type { Datasource, DatasourceType } from '../types';

const { Title, Text } = Typography;
const { Option } = Select;

const DS_TYPE_LABELS: Record<DatasourceType, string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mssql: 'SQL Server (MSSQL)',
  sqlite: 'SQLite',
  mongodb: 'MongoDB',
  rest_api: 'REST API',
  elasticsearch: 'Elasticsearch',
  csv: 'CSV / Excel (upload)',
  oracle: 'Oracle Database',
};

const DS_TYPE_DEFAULTS: Partial<Record<DatasourceType, { port: number }>> = {
  postgresql: { port: 5432 },
  mysql: { port: 3306 },
  mssql: { port: 1433 },
  mongodb: { port: 27017 },
  elasticsearch: { port: 9200 },
  oracle: { port: 1521 },
};

const SQL_TYPES: DatasourceType[] = ['postgresql', 'mysql', 'mssql'];
const CUSTOM_TYPES: DatasourceType[] = ['mongodb', 'rest_api', 'elasticsearch', 'sqlite', 'csv', 'oracle'];

const statusBadge: Record<string, 'success' | 'error' | 'default'> = {
  active: 'success',
  error: 'error',
  inactive: 'default',
};

function useDatasources() {
  return useQuery({
    queryKey: ['datasources'],
    queryFn: async () => {
      const { data } = await api.get('/datasources');
      const payload = data.data ?? data;
      return Array.isArray(payload) ? payload : (payload.datasources ?? []);
    },
  });
}

function buildConfig(values: Record<string, unknown>, type: DatasourceType, useConnectionString: boolean): Record<string, unknown> {
  switch (type) {
    case 'mongodb':
      if (useConnectionString) {
        return { connectionStringMode: true, password: values['connectionString'], database: values['database'] };
      }
      return { host: values['host'], port: values['port'], database: values['database'], username: values['username'], ssl: Boolean(values['ssl']), password: values['password'] };
    case 'sqlite':
      return { database: values['database'] };
    case 'rest_api':
      return { baseUrl: values['baseUrl'], password: values['apiKey'] || undefined };
    case 'elasticsearch':
      return { host: values['host'], port: values['port'], index: values['index'] || undefined, ssl: Boolean(values['ssl']), password: values['apiKey'] || undefined };
    case 'oracle':
      return { host: values['host'], port: values['port'], serviceName: values['serviceName'], username: values['username'], ssl: Boolean(values['ssl']), password: values['password'] };
    default:
      return { host: values['host'], port: values['port'], database: values['database'], username: values['username'], ssl: Boolean(values['ssl']), password: values['password'] };
  }
}

function DatasourceForm({
  initialValues,
  onSuccess,
  onCancel,
}: {
  initialValues?: Partial<Datasource>;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const isEdit = Boolean(initialValues?.id);
  const [useConnectionString, setUseConnectionString] = useState(
    Boolean(initialValues?.config?.connectionStringMode),
  );

  const mutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { name, description, type, visibility } = values as {
        name: string;
        description?: string;
        type: DatasourceType;
        visibility: 'private' | 'shared';
      };
      const config = buildConfig(values, type, useConnectionString);
      if (isEdit && initialValues?.id) {
        return api.patch(`/datasources/${initialValues.id}`, { name, description, visibility, config });
      }
      return api.post('/datasources', { name, description, type, visibility, config });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['datasources'] });
      message.success(isEdit ? 'Datasource updated' : 'Datasource created');
      onSuccess();
    },
    onError: () => message.error('Failed to save datasource'),
  });

  const dsType: DatasourceType = Form.useWatch('type', form) ?? initialValues?.type ?? 'postgresql';
  const isSql = SQL_TYPES.includes(dsType);
  const isMongo = dsType === 'mongodb';
  const isRestApi = dsType === 'rest_api';
  const isElastic = dsType === 'elasticsearch';
  const isSqlite = dsType === 'sqlite';
  const isOracle = dsType === 'oracle';

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        type: 'postgresql',
        port: 5432,
        ssl: false,
        visibility: 'private',
        ...initialValues,
        ...initialValues?.config,
        serviceName: initialValues?.config?.serviceName,
      }}
      onFinish={(v) => mutation.mutate(v as Record<string, unknown>)}
    >
      <Form.Item name="name" label="Name" rules={[{ required: true }]}>
        <Input placeholder="e.g. Production Analytics DB" />
      </Form.Item>

      <Form.Item name="description" label="Description">
        <Input placeholder="Optional description" />
      </Form.Item>

      <Form.Item name="type" label="Type" rules={[{ required: true }]}>
        <Select
          disabled={isEdit}
          onChange={(v: DatasourceType) => {
            form.setFieldsValue({ port: DS_TYPE_DEFAULTS[v]?.port ?? undefined });
            if (v !== 'mongodb') setUseConnectionString(false);
          }}
        >
          {(Object.entries(DS_TYPE_LABELS) as [DatasourceType, string][])
            .filter(([k]) => k !== 'csv')
            .map(([k, v]) => (
              <Option key={k} value={k}>{v}</Option>
            ))}
        </Select>
      </Form.Item>

      <Form.Item
        name="visibility"
        label="Visibility"
        extra={
          <Text type="secondary" style={{ fontSize: 12 }}>
            Private: only you can see and use this datasource. Shared: other editors can see the name, type, status, and schema, but not credentials.
          </Text>
        }
      >
        <Radio.Group>
          <Radio value="private"><LockOutlined style={{ marginRight: 4 }} />Private</Radio>
          <Radio value="shared"><TeamOutlined style={{ marginRight: 4 }} />Shared with editors</Radio>
        </Radio.Group>
      </Form.Item>

      {/* Standard SQL: PostgreSQL, MySQL, MSSQL */}
      {isSql && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
            <Form.Item name="host" label="Host" rules={[{ required: true }]}>
              <Input placeholder="localhost" />
            </Form.Item>
            <Form.Item name="port" label="Port">
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="database" label="Database name" rules={[{ required: true }]}>
            <Input placeholder="my_database" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="username" label="Username">
              <Input placeholder="db_user" />
            </Form.Item>
            <Form.Item name="password" label="Password">
              <Input.Password placeholder="••••••••" />
            </Form.Item>
          </div>
          <Form.Item name="ssl" label="Use SSL" valuePropName="checked">
            <Switch />
          </Form.Item>
        </>
      )}

      {/* MongoDB */}
      {isMongo && (
        <Form.Item label="Connection mode">
          <Switch
            checked={useConnectionString}
            onChange={setUseConnectionString}
            checkedChildren="Connection string"
            unCheckedChildren="Individual fields"
          />
        </Form.Item>
      )}
      {isMongo && useConnectionString && (
        <>
          <Form.Item
            name="connectionString"
            label="Connection string"
            rules={[{ required: true }]}
            extra="e.g. mongodb://user:password@host:27017/dbname  or  mongodb+srv://..."
          >
            <Input.Password placeholder="mongodb://user:password@host:27017/dbname" />
          </Form.Item>
          <Form.Item name="database" label="Authentication database (optional)" extra="Used for auth and as the default query target.">
            <Input placeholder="e.g. mydb" />
          </Form.Item>
        </>
      )}
      {isMongo && !useConnectionString && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
            <Form.Item name="host" label="Host" rules={[{ required: true }]}>
              <Input placeholder="localhost" />
            </Form.Item>
            <Form.Item name="port" label="Port">
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="database" label="Authentication database" extra="Leave empty to use 'admin'.">
            <Input placeholder="e.g. mydb (optional)" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="username" label="Username">
              <Input placeholder="db_user" />
            </Form.Item>
            <Form.Item name="password" label="Password">
              <Input.Password placeholder="••••••••" />
            </Form.Item>
          </div>
          <Form.Item name="ssl" label="Use SSL" valuePropName="checked">
            <Switch />
          </Form.Item>
        </>
      )}

      {/* SQLite */}
      {isSqlite && (
        <Form.Item name="database" label="Database file path" rules={[{ required: true }]} extra="Absolute path on the API server, e.g. /data/my.db">
          <Input placeholder="/data/analytics.db" />
        </Form.Item>
      )}

      {/* REST API */}
      {isRestApi && (
        <>
          <Form.Item name="baseUrl" label="Base URL" rules={[{ required: true }, { type: 'url' }]}>
            <Input placeholder="https://api.example.com" />
          </Form.Item>
          <Form.Item name="apiKey" label="API key / Bearer token" extra="Sent as Authorization: Bearer <key>. Leave blank for public APIs.">
            <Input.Password placeholder="Optional" />
          </Form.Item>
        </>
      )}

      {/* Elasticsearch */}
      {isElastic && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
            <Form.Item name="host" label="Host" rules={[{ required: true }]}>
              <Input placeholder="localhost" />
            </Form.Item>
            <Form.Item name="port" label="Port">
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="index" label="Default index (optional)" extra="Used as the default target when no index is specified in a query.">
            <Input placeholder="my-index-*" />
          </Form.Item>
          <Form.Item name="apiKey" label="API key" extra="Sent as Authorization: ApiKey <key>. Leave blank for unauthenticated clusters.">
            <Input.Password placeholder="Optional" />
          </Form.Item>
          <Form.Item name="ssl" label="Use HTTPS" valuePropName="checked">
            <Switch />
          </Form.Item>
        </>
      )}

      {/* Oracle Database */}
      {isOracle && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
            <Form.Item name="host" label="Host" rules={[{ required: true }]}>
              <Input placeholder="localhost" />
            </Form.Item>
            <Form.Item name="port" label="Port">
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="serviceName" label="Service name" rules={[{ required: true }]} extra="The Oracle service name (e.g. ORCL, XEPDB1). Used in the connect string: host:port/serviceName.">
            <Input placeholder="ORCL" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="username" label="Username" rules={[{ required: true }]}>
              <Input placeholder="system" />
            </Form.Item>
            <Form.Item name="password" label="Password">
              <Input.Password placeholder="••••••••" />
            </Form.Item>
          </div>
          <Form.Item name="ssl" label="Use SSL" valuePropName="checked">
            <Switch />
          </Form.Item>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="primary" htmlType="submit" loading={mutation.isPending}>
          {isEdit ? 'Update' : 'Create'} datasource
        </Button>
      </div>
    </Form>
  );
}

export default function DatasourcesPage() {
  const { message } = App.useApp();
  const { data: datasources = [], isLoading } = useDatasources();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isViewer = user?.role === 'viewer';
  const isAdmin = user?.role === 'admin';
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Datasource | undefined>();
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [schemaModal, setSchemaModal] = useState<{ id: string; name: string } | null>(null);
  const [schema, setSchema] = useState<{ tables: { name: string; schema?: string; columns: { name: string; type: string; isPrimary?: boolean }[] }[] } | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);

  const isOwner = (row: Datasource) => isAdmin || row.createdById === user?.id;

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.post('/datasources/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['datasources'] });
      message.success('File uploaded and datasource created');
      setShowUpload(false);
      setUploadFile(null);
    },
    onError: () => message.error('Upload failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/datasources/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['datasources'] });
      message.success('Datasource deleted');
    },
    onError: () => message.error('Delete failed'),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => api.post(`/datasources/${id}/test`),
    onSuccess: ({ data }) => {
      const result = data.data ?? data;
      if (result.success) message.success('Connection successful!');
      else message.error(`Connection failed: ${result.message}`);
      qc.invalidateQueries({ queryKey: ['datasources'] });
    },
    onError: () => message.error('Connection test failed'),
  });

  const handleViewSchema = async (id: string, name: string) => {
    setSchemaModal({ id, name });
    setSchemaLoading(true);
    try {
      const { data } = await api.get(`/datasources/${id}/schema`);
      setSchema(data.data ?? data);
    } catch {
      message.error('Failed to load schema');
      setSchemaModal(null);
    } finally {
      setSchemaLoading(false);
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      render: (name: string, row: Datasource) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          {row.description && <Text type="secondary" style={{ fontSize: 12 }}>{row.description}</Text>}
        </Space>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      render: (t: DatasourceType) => <Tag>{DS_TYPE_LABELS[t] ?? t}</Tag>,
    },
    {
      title: 'Visibility',
      dataIndex: 'visibility',
      render: (v: string, row: Datasource) => (
        <Space size={4}>
          {v === 'shared'
            ? <Tag icon={<TeamOutlined />} color="blue">Shared</Tag>
            : <Tag icon={<LockOutlined />}>Private</Tag>}
          {!isOwner(row) && <Tag color="default" style={{ fontSize: 11 }}>read-only</Tag>}
        </Space>
      ),
    },
    {
      title: 'Host',
      render: (_: unknown, row: Datasource) =>
        isOwner(row) && row.config.host ? `${row.config.host}:${row.config.port}` : '-',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (s: string) => (
        <Badge status={statusBadge[s] ?? 'default'} text={s} />
      ),
    },
    {
      title: 'Last tested',
      dataIndex: 'lastTestedAt',
      render: (d: string, row: Datasource) =>
        isOwner(row) ? (d ? new Date(d).toLocaleString() : '-') : '-',
    },
    {
      title: 'Actions',
      render: (_: unknown, row: Datasource) => (
        <Space>
          {isOwner(row) && (
            <Tooltip title="Test connection">
              <Button
                size="small"
                icon={<ThunderboltOutlined />}
                loading={testMutation.isPending}
                onClick={() => testMutation.mutate(row.id)}
              />
            </Tooltip>
          )}
          <Tooltip title="Browse schema">
            <Button
              size="small"
              icon={<TableOutlined />}
              onClick={() => handleViewSchema(row.id, row.name)}
            />
          </Tooltip>
          {isOwner(row) && !isViewer && (
            <>
              <Tooltip title="Edit">
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => { setEditing(row); setShowForm(true); }}
                />
              </Tooltip>
              <Popconfirm
                title="Delete this datasource?"
                description="All queries using it may break."
                onConfirm={() => deleteMutation.mutate(row.id)}
                okButtonProps={{ danger: true }}
              >
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Data Sources</Title>
          <Text type="secondary">Connect to databases, APIs, and file sources</Text>
        </div>
        {!isViewer && (
          <Space>
            <Button
              icon={<UploadOutlined />}
              size="large"
              onClick={() => { setUploadFile(null); setShowUpload(true); }}
            >
              Upload CSV / Excel
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              size="large"
              onClick={() => { setEditing(undefined); setShowForm(true); }}
            >
              Add Connection
            </Button>
          </Space>
        )}
      </div>

      {datasources.length === 0 && !isLoading ? (
        <Card style={{ textAlign: 'center', padding: 48 }}>
          <Empty
            image={<DatabaseOutlined style={{ fontSize: 48, color: '#6366f1' }} />}
            description={
              <Text type="secondary" style={{ fontSize: 16 }}>
                No data sources connected yet.
              </Text>
            }
          >
            {!isViewer && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowForm(true)}>
                Add Data Source
              </Button>
            )}
          </Empty>
        </Card>
      ) : (
        <Card>
          <Table
            dataSource={datasources}
            columns={columns}
            rowKey="id"
            loading={isLoading}
            pagination={{ pageSize: 20 }}
          />
        </Card>
      )}

      <Modal
        title={editing ? 'Edit Datasource' : 'New Datasource'}
        open={showForm}
        onCancel={() => { setShowForm(false); setEditing(undefined); }}
        footer={null}
        width={600}
        destroyOnHidden
      >
        <DatasourceForm
          initialValues={editing}
          onSuccess={() => { setShowForm(false); setEditing(undefined); }}
          onCancel={() => { setShowForm(false); setEditing(undefined); }}
        />
      </Modal>

      <Modal
        title="Upload CSV / Excel file"
        open={showUpload}
        onCancel={() => { setShowUpload(false); setUploadFile(null); }}
        footer={null}
        destroyOnHidden
      >
        <div style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            Supported formats: .csv, .xlsx, .xls. Max file size: 50 MB. The first row must be the header row. The file becomes a queryable datasource — rows are stored in the platform database.
          </Text>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: 'block', marginBottom: 16 }}
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
          />
          {uploadFile && (
            <Text style={{ display: 'block', marginBottom: 16 }}>
              Selected: <strong>{uploadFile.name}</strong> ({(uploadFile.size / 1024).toFixed(1)} KB)
            </Text>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => { setShowUpload(false); setUploadFile(null); }}>Cancel</Button>
            <Button
              type="primary"
              icon={<UploadOutlined />}
              disabled={!uploadFile}
              loading={uploadMutation.isPending}
              onClick={() => uploadFile && uploadMutation.mutate(uploadFile)}
            >
              Upload
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        title={`Schema: ${schemaModal?.name}`}
        open={Boolean(schemaModal)}
        onCancel={() => { setSchemaModal(null); setSchema(null); }}
        footer={null}
        width={700}
      >
        {schemaLoading && <Text>Loading schema...</Text>}
        {schema && (() => {
          const grouped = schema.tables.reduce<Record<string, typeof schema.tables>>((acc, t) => {
            const key = t.schema ?? '';
            (acc[key] ??= []).push(t);
            return acc;
          }, {});
          const groups = Object.entries(grouped);
          const hasGroups = groups.some(([key]) => key !== '');
          return (
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {groups.map(([dbName, tables]) => (
                <div key={dbName || '_root'}>
                  {hasGroups && dbName && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0 4px', borderBottom: '1px solid #2d2e4a', marginBottom: 8 }}>
                      <DatabaseOutlined style={{ color: '#6366f1', fontSize: 13 }} />
                      <Text strong style={{ fontSize: 13, color: '#a5b4fc' }}>{dbName}</Text>
                    </div>
                  )}
                  {tables.map((t) => (
                    <div key={`${dbName}.${t.name}`} style={{ marginBottom: 12, paddingLeft: hasGroups ? 12 : 0 }}>
                      <Text strong style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
                        <TableOutlined style={{ marginRight: 6 }} />
                        {t.name}
                      </Text>
                      <div style={{ paddingLeft: 20 }}>
                        {t.columns.map((c) => (
                          <div key={c.name} style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
                            <Text style={{ minWidth: 160, fontSize: 12 }}>{c.name}</Text>
                            <Tag color={c.isPrimary ? 'gold' : 'blue'} style={{ fontSize: 11 }}>{c.type}</Tag>
                          </div>
                        ))}
                        {t.columns.length === 0 && (
                          <Text type="secondary" style={{ fontSize: 12 }}>No documents sampled</Text>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              {schema.tables.length === 0 && (
                <Text type="secondary">No collections found. Make sure the connection has read access.</Text>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
