import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Row,
  Col,
  Card,
  Statistic,
  Empty,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Tag,
  Tooltip,
  App,
  Spin,
  List,
  Avatar,
  Upload,
} from 'antd';
import {
  DashboardOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  EyeOutlined,
  SettingOutlined,
  MinusCircleOutlined,
  ShareAltOutlined,
  UserOutlined,
  ThunderboltOutlined,
  DownloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import type { Dashboard, DashboardSharee, QueryFolder, User } from '../types';
import { useAuthStore } from '../stores/auth.store';
import AutoDashboardWizard from '../components/ai/AutoDashboardWizard';

const { Title, Text } = Typography;
const { Option } = Select;

function useDashboards() {
  return useQuery<{ dashboards: Dashboard[]; total: number }>({
    queryKey: ['dashboards'],
    queryFn: async () => {
      const { data } = await api.get('/dashboards?limit=50');
      return data.data ?? data;
    },
  });
}

const VISIBILITY_COLORS: Record<string, string> = {
  private: 'default',
  team: 'blue',
  public: 'green',
};

export default function DashboardsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useDashboards();
  const dashboards = data?.dashboards ?? [];
  const isViewer = useAuthStore((s) => s.user?.role === 'viewer');
  const currentUser = useAuthStore((s) => s.user);

  const [showCreate, setShowCreate] = useState(false);
  const [showAutoDashboard, setShowAutoDashboard] = useState(false);
  const [form] = Form.useForm();

  const [editingDashboard, setEditingDashboard] = useState<Dashboard | null>(null);
  const [editForm] = Form.useForm();

  const [sharingDashboard, setSharingDashboard] = useState<Dashboard | null>(null);
  const [shareUserId, setShareUserId] = useState<string | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<{ dashboard: Dashboard; autoFolderId: string | null } | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  const { data: sharees = [], isFetching: shareesLoading } = useQuery<DashboardSharee[]>({
    queryKey: ['dashboard-sharees', sharingDashboard?.id],
    queryFn: async () => {
      const { data } = await api.get(`/dashboards/${sharingDashboard!.id}/sharees`);
      return data.data ?? data;
    },
    enabled: !!sharingDashboard,
  });

  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ['users-list'],
    queryFn: async () => {
      const { data } = await api.get('/users?limit=200');
      const payload = data.data ?? data;
      return payload.users ?? payload;
    },
    enabled: !!sharingDashboard,
  });

  const addShareeMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post(`/dashboards/${sharingDashboard!.id}/sharees`, { userId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard-sharees', sharingDashboard?.id] });
      setShareUserId(undefined);
      message.success('Access granted');
    },
    onError: () => message.error('Failed to share dashboard'),
  });

  const removeShareeMutation = useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/dashboards/${sharingDashboard!.id}/sharees/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard-sharees', sharingDashboard?.id] });
      message.success('Access removed');
    },
    onError: () => message.error('Failed to remove access'),
  });

  const updateMutation = useMutation({
    mutationFn: (values: { name: string; description?: string; visibility: string; status: string; refreshIntervalSeconds?: number }) =>
      api.patch(`/dashboards/${editingDashboard?.id}`, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboards'] });
      message.success('Dashboard updated');
      setEditingDashboard(null);
      editForm.resetFields();
    },
    onError: () => message.error('Failed to update dashboard'),
  });

  const openEditModal = (d: Dashboard) => {
    setEditingDashboard(d);
    editForm.setFieldsValue({
      name: d.name,
      description: d.description ?? '',
      visibility: d.visibility,
      status: d.status,
      refreshIntervalSeconds: d.refreshIntervalSeconds ?? null,
      filters: d.filters ?? [],
    });
  };

  const createMutation = useMutation({
    mutationFn: (values: { name: string; description?: string; visibility: string }) =>
      api.post('/dashboards', values),
    onSuccess: ({ data: res }) => {
      qc.invalidateQueries({ queryKey: ['dashboards'] });
      message.success('Dashboard created');
      setShowCreate(false);
      form.resetFields();
      const created = res.data ?? res;
      navigate(`/dashboards/${created.id}`);
    },
    onError: () => message.error('Failed to create dashboard'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/dashboards/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboards'] });
      qc.invalidateQueries({ queryKey: ['query-folders'] });
      qc.invalidateQueries({ queryKey: ['queries'] });
      setDeleteTarget(null);
      message.success('Dashboard deleted');
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/query-folders/${id}`),
  });

  const handleDeleteDashboard = useCallback(async (dashboard: Dashboard) => {
    let autoFolderId: string | null = null;
    try {
      const { data } = await api.get('/query-folders');
      const folders: QueryFolder[] = Array.isArray(data.data ?? data) ? (data.data ?? data) : [];
      autoFolderId = folders.find((f) => f.name === dashboard.name)?.id ?? null;
    } catch {
      // non-fatal
    }
    setDeleteTarget({ dashboard, autoFolderId });
  }, []);

  const handleExport = useCallback(async (dashboard: Dashboard) => {
    try {
      const { data } = await api.get(`/dashboards/${dashboard.id}/export`);
      const bundle = data.data ?? data;
      const json = JSON.stringify(bundle, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dashboard-${dashboard.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      message.error('Export failed');
    }
  }, [message]);

  const handleImport = useCallback(async (file: File) => {
    setImportLoading(true);
    try {
      const text = await file.text();
      const bundle = JSON.parse(text) as unknown;
      const { data } = await api.post('/dashboards/import', bundle);
      const result = (data.data ?? data) as { dashboard: { id: string; name: string }; newDatasourceIds: string[] };
      qc.invalidateQueries({ queryKey: ['dashboards'] });
      if (result.newDatasourceIds?.length) {
        message.success(`Dashboard "${result.dashboard.name}" imported. ${result.newDatasourceIds.length} new datasource(s) created — please add credentials in Settings.`);
      } else {
        message.success(`Dashboard "${result.dashboard.name}" imported.`);
      }
    } catch {
      message.error('Import failed — invalid bundle file');
    } finally {
      setImportLoading(false);
    }
    return false; // prevent default upload behaviour
  }, [message, qc]);

    const duplicateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/dashboards/${id}/duplicate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboards'] });
      message.success('Dashboard duplicated');
    },
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Dashboards</Title>
          <Text type="secondary">Create and manage interactive dashboards</Text>
        </div>
        {!isViewer && (
          <Space>
            {currentUser?.aiEnabled !== false && (
              <Tooltip title="Let AI analyze a datasource and generate a dashboard automatically">
                <Button
                  icon={<ThunderboltOutlined />}
                  size="large"
                  onClick={() => setShowAutoDashboard(true)}
                >
                  Auto Dashboard
                </Button>
              </Tooltip>
            )}
            <Upload
              accept=".json"
              showUploadList={false}
              beforeUpload={(file) => { void handleImport(file); return false; }}
            >
              <Button icon={<UploadOutlined />} size="large" loading={importLoading}>
                Import
              </Button>
            </Upload>
            <Button type="primary" icon={<PlusOutlined />} size="large" onClick={() => setShowCreate(true)}>
              New Dashboard
            </Button>
          </Space>
        )}
      </div>

      {/* Stats row — hidden entirely for viewers (they only see what's shared/published) */}
      {!isViewer && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Total Dashboards"
                value={data?.total ?? 0}
                prefix={<DashboardOutlined style={{ color: '#6366f1' }} />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Published"
                value={dashboards.filter((d) => d.status === 'published').length}
                prefix={<EyeOutlined style={{ color: '#22c55e' }} />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Drafts"
                value={dashboards.filter((d) => d.status === 'draft').length}
                prefix={<EditOutlined style={{ color: '#f59e0b' }} />}
              />
            </Card>
          </Col>
        </Row>
      )}

      {isLoading && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      )}

      {!isLoading && dashboards.length === 0 && (
        <Card style={{ textAlign: 'center', padding: 48 }}>
          <Empty description={<Text type="secondary">No dashboards yet.{isViewer ? '' : ' Create your first one.'}</Text>}>
            {!isViewer && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowCreate(true)}>
                Create Dashboard
              </Button>
            )}
          </Empty>
        </Card>
      )}

      {dashboards.length > 0 && (
        <Row gutter={[16, 16]}>
          {dashboards.map((d) => (
            <Col xs={24} sm={12} lg={8} xl={6} key={d.id}>
              <Card
                hoverable
                style={{ cursor: 'default' }}
                actions={[
                  <Tooltip key="view" title="View"><EyeOutlined onClick={() => navigate(`/dashboards/${d.id}?mode=view`)} /></Tooltip>,
                  ...(!isViewer ? [
                    <Tooltip key="edit" title="Edit"><EditOutlined onClick={() => navigate(`/dashboards/${d.id}`)} /></Tooltip>,
                    <Tooltip key="settings" title="Settings"><SettingOutlined onClick={() => openEditModal(d)} /></Tooltip>,
                    <Tooltip key="share" title="Manage access"><ShareAltOutlined onClick={() => setSharingDashboard(d)} /></Tooltip>,
                    <Tooltip key="dup" title="Duplicate"><CopyOutlined onClick={() => duplicateMutation.mutate(d.id)} /></Tooltip>,
                    <Tooltip key="export" title="Export dashboard"><DownloadOutlined onClick={() => void handleExport(d)} /></Tooltip>,
                    <Tooltip key="del" title="Delete dashboard">
                      <DeleteOutlined style={{ color: '#ef4444', cursor: 'pointer' }} onClick={() => handleDeleteDashboard(d)} />
                    </Tooltip>,
                  ] : []),
                ]}
              >
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text strong style={{ fontSize: 15 }}>{d.name}</Text>
                    <Space size={4}>
                      <Tag color={d.status === 'published' ? 'green' : 'orange'}>{d.status}</Tag>
                      <Tag color={VISIBILITY_COLORS[d.visibility]}>{d.visibility}</Tag>
                    </Space>
                  </div>
                  {d.description && (
                    <Text type="secondary" style={{ fontSize: 12 }}>{d.description}</Text>
                  )}
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {new Date(d.updatedAt).toLocaleDateString()}
                  </Text>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Modal
        title="Dashboard Settings"
        open={!!editingDashboard}
        onCancel={() => { setEditingDashboard(null); editForm.resetFields(); }}
        footer={null}
        width={640}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={(v) => updateMutation.mutate(v)}>
          <Form.Item name="name" label="Dashboard name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input />
          </Form.Item>
          <Form.Item name="visibility" label="Visibility">
            <Select>
              <Option value="private">Private (only me)</Option>
              <Option value="team">Team (all members)</Option>
              <Option value="public">Public</Option>
            </Select>
          </Form.Item>
          <Form.Item name="status" label="Status">
            <Select>
              <Option value="draft">Draft</Option>
              <Option value="published">Published</Option>
            </Select>
          </Form.Item>
          <Form.Item name="refreshIntervalSeconds" label="Auto-refresh interval (seconds)" extra="Leave empty to disable auto-refresh.">
            <InputNumber min={10} step={10} style={{ width: '100%' }} placeholder="e.g. 60" />
          </Form.Item>

          <Form.List name="filters">
            {(fields, { add, remove }) => (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text strong style={{ fontSize: 13 }}>Filters</Text>
                  <Button size="small" icon={<PlusOutlined />} onClick={() => add({ type: 'text' })}>Add filter</Button>
                </div>
                {fields.map(({ key, name, ...restField }) => (
                  <div key={key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                    <Form.Item {...restField} name={[name, 'id']} rules={[{ required: true, message: 'ID required' }]} style={{ margin: 0 }}>
                      <Input placeholder="Filter ID (e.g. date_from)" size="small" />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'label']} rules={[{ required: true, message: 'Label required' }]} style={{ margin: 0 }}>
                      <Input placeholder="Label" size="small" />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'type']} style={{ margin: 0 }}>
                      <Select size="small">
                        <Option value="text">Text</Option>
                        <Option value="date_range">Date Range</Option>
                        <Option value="select">Select</Option>
                      </Select>
                    </Form.Item>
                    <MinusCircleOutlined style={{ color: '#ef4444', marginTop: 6, cursor: 'pointer' }} onClick={() => remove(name)} />
                  </div>
                ))}
                {fields.length === 0 && (
                  <Text type="secondary" style={{ fontSize: 12 }}>No filters configured. Add one to enable filter controls on the dashboard.</Text>
                )}
              </div>
            )}
          </Form.List>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={() => { setEditingDashboard(null); editForm.resetFields(); }}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={updateMutation.isPending}>Save</Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title="New Dashboard"
        open={showCreate}
        onCancel={() => { setShowCreate(false); form.resetFields(); }}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ visibility: 'private' }}
          onFinish={(v) => createMutation.mutate(v)}
        >
          <Form.Item name="name" label="Dashboard name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Sales Overview" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input placeholder="Optional description" />
          </Form.Item>
          <Form.Item name="visibility" label="Visibility">
            <Select>
              <Option value="private">Private (only me)</Option>
              <Option value="team">Team (all members)</Option>
              <Option value="public">Public</Option>
            </Select>
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => { setShowCreate(false); form.resetFields(); }}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={createMutation.isPending}>
              Create
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title={`Manage Access — ${sharingDashboard?.name}`}
        open={!!sharingDashboard}
        onCancel={() => { setSharingDashboard(null); setShareUserId(undefined); }}
        footer={null}
        width={520}
        destroyOnHidden
      >
        {sharingDashboard?.visibility === 'public' && (
          <Card size="small" style={{ marginBottom: 16, background: 'var(--color-bg-elevated)' }}>
            <Text type="secondary">
              This dashboard is <strong>public</strong> — it is already accessible to everyone via its share link. Per-user access grants are ignored for public dashboards.
            </Text>
          </Card>
        )}

        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>Share with a user</Text>
          <Space.Compact style={{ width: '100%' }}>
            <Select
              showSearch
              placeholder="Select a user..."
              style={{ flex: 1 }}
              value={shareUserId}
              onChange={setShareUserId}
              filterOption={(input, option) =>
                (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={allUsers
                .filter((u) => !sharees.some((s) => s.userId === u.id))
                .map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))}
            />
            <Button
              type="primary"
              disabled={!shareUserId}
              loading={addShareeMutation.isPending}
              onClick={() => shareUserId && addShareeMutation.mutate(shareUserId)}
            >
              Grant access
            </Button>
          </Space.Compact>
        </div>

        <Text strong style={{ display: 'block', marginBottom: 8 }}>Users with access</Text>
        <List
          loading={shareesLoading}
          locale={{ emptyText: 'No users have been granted explicit access yet.' }}
          dataSource={sharees}
          renderItem={(s) => (
            <List.Item
              actions={[
                <Button
                  key="remove"
                  type="text"
                  danger
                  size="small"
                  loading={removeShareeMutation.isPending}
                  onClick={() => removeShareeMutation.mutate(s.userId)}
                >
                  Remove
                </Button>,
              ]}
            >
              <List.Item.Meta
                avatar={<Avatar icon={<UserOutlined />} size="small" />}
                title={s.user?.name}
                description={s.user?.email}
              />
            </List.Item>
          )}
        />
      </Modal>

      <AutoDashboardWizard open={showAutoDashboard} onClose={() => setShowAutoDashboard(false)} />

      {/* Delete dashboard confirmation — handles both plain and auto-generated content */}
      <Modal
        open={!!deleteTarget}
        title="Delete dashboard?"
        onCancel={() => setDeleteTarget(null)}
        width={540}
        footer={
          deleteTarget?.autoFolderId ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button
                danger
                onClick={() => deleteMutation.mutate(deleteTarget.dashboard.id)}
                loading={deleteMutation.isPending}
              >
                Delete Dashboard Only
              </Button>
              <Button
                danger
                type="primary"
                loading={deleteFolderMutation.isPending || deleteMutation.isPending}
                onClick={async () => {
                  await deleteFolderMutation.mutateAsync(deleteTarget.autoFolderId!);
                  deleteMutation.mutate(deleteTarget.dashboard.id);
                }}
              >
                Delete Dashboard + Auto-generated Content
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button
                danger
                type="primary"
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.dashboard.id)}
                loading={deleteMutation.isPending}
              >
                Delete
              </Button>
            </div>
          )
        }
      >
        {deleteTarget?.autoFolderId ? (
          <div>
            <p>
              An auto-generated query folder "<strong>{deleteTarget.dashboard.name}</strong>" was found.
              Do you also want to delete its queries and charts?
            </p>
            <p style={{ color: '#6b7280', fontSize: 12, marginTop: 8 }}>
              Choosing "Delete Dashboard + Auto-generated Content" will permanently remove the folder, all its queries, and their charts.
            </p>
          </div>
        ) : (
          <p>This cannot be undone.</p>
        )}
      </Modal>
    </div>
  );
}
