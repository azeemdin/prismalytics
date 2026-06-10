import { useState, useEffect } from 'react';
import {
  Typography,
  Card,
  Tabs,
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Popconfirm,
  App,
  Spin,
  Table,
  Avatar,
  Badge,
  Modal,
  ColorPicker,
  Statistic,
  Row,
  Col,
  Divider,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  RobotOutlined,
  UserOutlined,
  SafetyOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  CheckCircleOutlined,
  UserAddOutlined,
  StopOutlined,
  CheckOutlined,
  StarFilled,
  StarOutlined,
  BarChartOutlined,
  BgColorsOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
  MailOutlined,
  GlobalOutlined,
  SendOutlined,
  ApiOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useAuthStore } from '../stores/auth.store';
import type { User } from '../types';

const { Title, Text } = Typography;
const { Option } = Select;

// â”€â”€â”€ AI Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PROVIDERS = [
  { value: 'gemini', label: 'Google Gemini (AI Studio)', hint: 'aistudio.google.com' },
  { value: 'gemini-vertex', label: 'Google Vertex AI (Enterprise)', hint: 'cloud.google.com/vertex-ai' },
  { value: 'claude', label: 'Anthropic Claude', hint: 'console.anthropic.com' },
  { value: 'openrouter', label: 'OpenRouter', hint: 'openrouter.ai' },
  { value: 'ollama', label: 'Ollama (self-hosted)', hint: 'localhost:11434' },
] as const;

type AiProvider = typeof PROVIDERS[number]['value'];

interface AiKey {
  id: string;
  provider: AiProvider;
  model: string | null;
  enabled: boolean;
  createdAt: string;
}

function AiSettings() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [showAdd, setShowAdd] = useState(false);
  const [editKey, setEditKey] = useState<AiKey | null>(null);
  const [addProvider, setAddProvider] = useState<AiProvider | null>(null);

  const { data: keys = [], isLoading } = useQuery<AiKey[]>({
    queryKey: ['ai-keys'],
    queryFn: async () => {
      const { data } = await api.get('/ai/keys');
      const payload = data.data ?? data;
      return Array.isArray(payload) ? payload : [];
    },
  });

  const { data: status } = useQuery({
    queryKey: ['ai-status'],
    queryFn: async () => {
      const { data } = await api.get('/ai/status');
      return data.data ?? data;
    },
  });

  const { data: tenant } = useQuery({
    queryKey: ['tenant-current'],
    queryFn: async () => {
      const { data } = await api.get('/tenants/current');
      return data.data ?? data;
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: (provider: string) =>
      api.patch('/tenants/current/settings', { settings: { preferredAiProvider: provider } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-current'] });
      qc.invalidateQueries({ queryKey: ['ai-status'] });
      message.success('Default provider updated');
    },
    onError: () => message.error('Failed to update default provider'),
  });

  const upsertMutation = useMutation({
    mutationFn: (values: { provider: string; apiKey: string; model?: string }) =>
      api.post('/ai/keys', values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-keys'] });
      qc.invalidateQueries({ queryKey: ['ai-status'] });
      message.success('API key saved');
      setShowAdd(false);
      form.resetFields();
    },
    onError: () => message.error('Failed to save key'),
  });

  const editMutation = useMutation({
    mutationFn: (values: { provider: string; apiKey?: string; model?: string }) =>
      api.post('/ai/keys', values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-keys'] });
      qc.invalidateQueries({ queryKey: ['ai-status'] });
      message.success('Configuration updated');
      setEditKey(null);
      editForm.resetFields();
    },
    onError: () => message.error('Failed to update configuration'),
  });

  const deleteMutation = useMutation({
    mutationFn: (provider: string) => api.delete(`/ai/keys/${provider}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-keys'] });
      qc.invalidateQueries({ queryKey: ['ai-status'] });
      message.success('Key removed');
    },
  });

  const providerLabel = (p: string) => PROVIDERS.find((x) => x.value === p)?.label ?? p;

  return (
    <div>
      {status?.configured ? (
        <Alert
          message={status.message}
          description="Priority: BYOK keys stored below override server-level env vars (GEMINI_API_KEY, CLAUDE_API_KEY, OPENROUTER_API_KEY)."
          type="success"
          showIcon
          icon={<CheckCircleOutlined />}
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Alert
          message="AI features not configured"
          description={
            <span>
              Add a BYOK key below, or set <Text code>GEMINI_API_KEY</Text> / <Text code>CLAUDE_API_KEY</Text> / <Text code>OPENROUTER_API_KEY</Text> in your environment.
              Model can also be set via <Text code>GEMINI_MODEL</Text> / <Text code>CLAUDE_MODEL</Text> / <Text code>OPENROUTER_MODEL</Text>.
            </span>
          }
          type="info"
          showIcon
          icon={<RobotOutlined />}
          style={{ marginBottom: 16 }}
        />
      )}

      {isLoading ? (
        <Spin />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }}>
          {keys.map((k) => {
            const isDefault = (tenant?.settings?.preferredAiProvider ?? null) === k.provider ||
              (!tenant?.settings?.preferredAiProvider && keys.length === 1);
            return (
              <Card
                key={k.id}
                size="small"
                style={{ borderColor: isDefault ? '#6366f1' : '#2d2e4a' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space wrap>
                    {isDefault ? (
                      <StarFilled style={{ color: '#f59e0b', fontSize: 14 }} />
                    ) : (
                      <Tooltip title="Set as default provider">
                        <StarOutlined
                          style={{ color: '#64748b', fontSize: 14, cursor: 'pointer' }}
                          onClick={() => setDefaultMutation.mutate(k.provider)}
                        />
                      </Tooltip>
                    )}
                    <Tag color="blue">{providerLabel(k.provider)}</Tag>
                    {k.model ? (
                      <Tag color="purple">{k.model}</Tag>
                    ) : (
                      <Tag color="default" style={{ fontStyle: 'italic' }}>env default model</Tag>
                    )}
                    {isDefault && <Tag color="gold">Default</Tag>}
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Added {new Date(k.createdAt).toLocaleDateString()}
                    </Text>
                  </Space>
                  <Space>
                    <Tooltip title="Edit model / rotate key">
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => {
                          setEditKey(k);
                          if (k.provider === 'gemini-vertex') {
                            const parts = (k.model ?? '').split(':');
                            editForm.setFieldsValue({ vtRegion: parts[0] ?? 'us-central1', vtModel: parts.slice(1).join(':') || 'gemini-1.5-flash-001' });
                          } else {
                            editForm.setFieldsValue({ model: k.model ?? '' });
                          }
                        }}
                      />
                    </Tooltip>
                    <Popconfirm
                      title="Remove this API key?"
                      onConfirm={() => deleteMutation.mutate(k.provider)}
                      okButtonProps={{ danger: true }}
                    >
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                </div>
              </Card>
            );
          })}

          {showAdd ? (
            <Card size="small" style={{ borderColor: '#6366f1' }}>
              <Form form={form} layout="vertical" onFinish={(v) => {
                if (v.provider === 'ollama') {
                  upsertMutation.mutate({ provider: v.provider, apiKey: v.baseUrl, model: v.model });
                } else if (v.provider === 'gemini-vertex') {
                  const model = `${v.vtRegion || 'us-central1'}:${v.vtModel || 'gemini-1.5-flash-001'}`;
                  upsertMutation.mutate({ provider: v.provider, apiKey: v.saJson, model });
                } else {
                  upsertMutation.mutate(v);
                }
              }}>
                <Form.Item name="provider" label="Provider" rules={[{ required: true }]}>
                  <Select placeholder="Select LLM provider" onChange={(v) => setAddProvider(v as AiProvider)}>
                    {PROVIDERS.filter((p) => !keys.some((k) => k.provider === p.value)).map((p) => (
                      <Option key={p.value} value={p.value}>
                        {p.label} <Text type="secondary" style={{ fontSize: 12 }}>{p.hint}</Text>
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
                {addProvider === 'ollama' ? (
                  <>
                    <Form.Item name="baseUrl" label="Ollama Base URL" rules={[{ required: true }]} extra="e.g. http://localhost:11434 must be accessible from the API server. No data leaves your network.">
                      <Input placeholder="http://localhost:11434" />
                    </Form.Item>
                    <Form.Item name="model" label="Model" extra="e.g. llama3.2, mistral, phi3">
                      <Input placeholder="llama3.2" />
                    </Form.Item>
                  </>
                ) : addProvider === 'gemini-vertex' ? (
                  <>
                    <Form.Item name="saJson" label="Service account JSON" rules={[{ required: true }]} extra="Paste the full contents of your GCP service account key JSON file. Must have the Vertex AI User role.">
                      <Input.TextArea rows={7} placeholder={'{\n  "type": "service_account",\n  "project_id": "my-project",\n  ...\n}'} />
                    </Form.Item>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item name="vtRegion" label="Region" extra="GCP region for Vertex AI endpoint.">
                          <Input placeholder="us-central1" />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="vtModel" label="Model" extra="Vertex AI model name.">
                          <Input placeholder="gemini-1.5-flash-001" />
                        </Form.Item>
                      </Col>
                    </Row>
                  </>
                ) : (
                  <>
                    <Form.Item name="apiKey" label="API Key" rules={[{ required: true }]}>
                      <Input.Password placeholder="Paste your API key here" />
                    </Form.Item>
                    <Form.Item
                      name="model"
                      label="Model"
                      extra="Leave blank to use the env-var default (GEMINI_MODEL / CLAUDE_MODEL / OPENROUTER_MODEL)."
                    >
                      <Input placeholder="e.g. gemini-2.0-flash, claude-sonnet-4-6, openai/gpt-4o" allowClear />
                    </Form.Item>
                  </>
                )}
                <Space>
                  <Button type="primary" htmlType="submit" loading={upsertMutation.isPending}>Save</Button>
                  <Button onClick={() => { setShowAdd(false); setAddProvider(null); form.resetFields(); }}>Cancel</Button>
                </Space>
              </Form>
            </Card>
          ) : (
            <Button
              icon={<PlusOutlined />}
              onClick={() => setShowAdd(true)}
              disabled={keys.length >= PROVIDERS.length}
            >
              Add API key
            </Button>
          )}
        </Space>
      )}

      <Modal
        title={
          <Space>
            Edit LLM configuration
            {editKey && <Tag color="blue">{providerLabel(editKey.provider)}</Tag>}
          </Space>
        }
        open={editKey !== null}
        onCancel={() => { setEditKey(null); editForm.resetFields(); }}
        footer={null}
        destroyOnHidden
      >
        {editKey?.provider === 'gemini-vertex' ? (
          <Form
            form={editForm}
            layout="vertical"
            onFinish={(v) => {
              if (!editKey) return;
              const model = `${v.vtRegion || 'us-central1'}:${v.vtModel || 'gemini-1.5-flash-001'}`;
              editMutation.mutate({ provider: editKey.provider, apiKey: v.saJson || undefined, model });
            }}
            style={{ marginTop: 8 }}
          >
            <Form.Item name="saJson" label="New service account JSON" extra="Leave blank to keep the existing key. Paste the full JSON to rotate.">
              <Input.TextArea rows={5} placeholder="Paste new service account JSON to rotate, or leave blank" />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="vtRegion" label="Region">
                  <Input placeholder="us-central1" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="vtModel" label="Model">
                  <Input placeholder="gemini-1.5-flash-001" />
                </Form.Item>
              </Col>
            </Row>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <Button onClick={() => { setEditKey(null); editForm.resetFields(); }}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={editMutation.isPending}>Save changes</Button>
            </div>
          </Form>
        ) : (
          <Form
            form={editForm}
            layout="vertical"
            onFinish={(v) => {
              if (!editKey) return;
              editMutation.mutate({ provider: editKey.provider, apiKey: v.apiKey || undefined, model: v.model || undefined });
            }}
            style={{ marginTop: 8 }}
          >
            <Form.Item
              name="apiKey"
              label={editKey?.provider === 'ollama' ? 'New Ollama Base URL' : 'New API key'}
              extra="Leave blank to keep the existing key."
            >
              <Input.Password placeholder="Paste new key to rotate, or leave blank" />
            </Form.Item>
            <Form.Item
              name="model"
              label="Model"
              extra="Leave blank to use the env-var default (GEMINI_MODEL / CLAUDE_MODEL / OPENROUTER_MODEL)."
            >
              <Input placeholder="e.g. gemini-2.0-flash, claude-sonnet-4-6, openai/gpt-4o" allowClear />
            </Form.Item>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <Button onClick={() => { setEditKey(null); editForm.resetFields(); }}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={editMutation.isPending}>Save changes</Button>
            </div>
          </Form>
        )}
      </Modal>

      <AiTimeoutSettings />
    </div>
  );
}

// â”€â”€â”€ AI Timeout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AiTimeoutSettings() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery<{ 'ai.timeout': string | null }>({
    queryKey: ['system-config-ai-timeout'],
    queryFn: async () => {
      const { data } = await api.get('/system-config?keys=ai.timeout');
      return data.data ?? data;
    },
  });

  useEffect(() => {
    form.setFieldsValue({ timeout: data?.['ai.timeout'] ? parseInt(data['ai.timeout'], 10) : 60 });
  }, [data, form]);

  const saveMutation = useMutation({
    mutationFn: (seconds: number) =>
      api.patch('/system-config', { config: { 'ai.timeout': String(seconds) } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system-config-ai-timeout'] });
      void message.success('Timeout saved');
    },
    onError: () => void message.error('Failed to save timeout'),
  });

  return (
    <Card
      title={<Space><ThunderboltOutlined />Request Timeout</Space>}
      size="small"
      style={{ marginTop: 16 }}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        Maximum time (in seconds) the server will wait for a response from any AI provider before aborting. Applies to all providers. Can also be set via the <Text code>AI_TIMEOUT</Text> environment variable; the value here takes precedence.
      </Text>
      {isLoading ? <Spin size="small" /> : (
        <Form form={form} layout="inline" onFinish={(v: { timeout: number }) => saveMutation.mutate(v.timeout)}>
          <Form.Item
            name="timeout"
            rules={[{ required: true, type: 'number', min: 10, max: 600, message: 'Must be between 10 and 600 seconds' }]}
          >
            <InputNumber min={10} max={600} addonAfter="seconds" style={{ width: 180 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saveMutation.isPending}>
              Save
            </Button>
          </Form.Item>
        </Form>
      )}
    </Card>
  );
}

// â”€â”€â”€ Users & Roles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ROLE_COLORS: Record<string, string> = {
  admin: 'red',
  editor: 'blue',
  viewer: 'default',
};

function UsersSettings() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === 'admin';

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm] = Form.useForm();

  const { data, isLoading } = useQuery<{ users: User[]; total: number }>({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get('/users?limit=100');
      return data.data ?? data;
    },
  });

  const users = data?.users ?? [];

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api.patch(`/users/${id}`, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      message.success('Role updated');
    },
    onError: () => message.error('Failed to update role'),
  });

  const toggleAiMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch(`/users/${id}/ai-enabled`, { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      message.success('AI access updated');
    },
    onError: () => message.error('Failed to update AI access'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      message.success('User deactivated');
    },
    onError: () => message.error('Failed to deactivate user'),
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/reactivate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      message.success('User reactivated');
    },
    onError: () => message.error('Failed to reactivate user'),
  });

  const inviteMutation = useMutation({
    mutationFn: (values: { name: string; email: string; role: string; password: string }) =>
      api.post('/users', values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      message.success('User invited successfully');
      setInviteOpen(false);
      inviteForm.resetFields();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      message.error(msg ?? 'Failed to invite user');
    },
  });

  const columns: ColumnsType<User> = [
    {
      title: 'User',
      key: 'user',
      render: (_, u) => (
        <Space>
          <Avatar size={32} style={{ backgroundColor: '#6366f1', fontSize: 13 }}>
            {u.name.charAt(0).toUpperCase()}
          </Avatar>
          <div>
            <div style={{ fontWeight: 500, lineHeight: 1.3 }}>{u.name}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>{u.email}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      width: 160,
      render: (role: string, u) =>
        isAdmin && u.id !== currentUser?.id ? (
          <Select
            size="small"
            value={role}
            style={{ width: 110 }}
            onChange={(val) => updateRoleMutation.mutate({ id: u.id, role: val })}
          >
            <Option value="admin">Admin</Option>
            <Option value="editor">Editor</Option>
            <Option value="viewer">Viewer</Option>
          </Select>
        ) : (
          <Tag color={ROLE_COLORS[role]}>{role}</Tag>
        ),
    },
    {
      title: 'Provider',
      dataIndex: 'provider',
      key: 'provider',
      width: 100,
      render: (p: string) => (
        <Tag color={p === 'keycloak' ? 'geekblue' : 'default'}>{p}</Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 90,
      render: (active: boolean) => (
        <Badge
          status={active ? 'success' : 'default'}
          text={<Text style={{ fontSize: 12 }}>{active ? 'Active' : 'Inactive'}</Text>}
        />
      ),
    },
    ...(isAdmin
      ? [
          {
            title: 'AI',
            dataIndex: 'aiEnabled',
            key: 'aiEnabled',
            width: 70,
            render: (enabled: boolean, u: User) =>
              u.id === currentUser?.id ? (
                <Tooltip title="Cannot change your own AI access">
                  <Switch size="small" checked={enabled !== false} disabled />
                </Tooltip>
              ) : (
                <Tooltip title={enabled !== false ? 'Disable AI for this user' : 'Enable AI for this user'}>
                  <Switch
                    size="small"
                    checked={enabled !== false}
                    loading={toggleAiMutation.isPending}
                    onChange={(val) => toggleAiMutation.mutate({ id: u.id, enabled: val })}
                  />
                </Tooltip>
              ),
          },
        ]
      : []),
    {
      title: 'Last login',
      dataIndex: 'lastLoginAt',
      key: 'lastLoginAt',
      width: 130,
      render: (d?: string) =>
        d ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {new Date(d).toLocaleDateString()}
          </Text>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>Never</Text>
        ),
    },
    ...(isAdmin
      ? [
          {
            title: '',
            key: 'actions',
            width: 80,
            render: (_: unknown, u: User) =>
              u.id === currentUser?.id ? null : u.isActive ? (
                <Popconfirm
                  title="Deactivate this user?"
                  description="They will lose access immediately."
                  onConfirm={() => deactivateMutation.mutate(u.id)}
                  okButtonProps={{ danger: true }}
                >
                  <Button size="small" icon={<StopOutlined />} danger>
                    Deactivate
                  </Button>
                </Popconfirm>
              ) : (
                <Button
                  size="small"
                  icon={<CheckOutlined />}
                  onClick={() => reactivateMutation.mutate(u.id)}
                >
                  Reactivate
                </Button>
              ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text type="secondary">
          {data?.total ?? 0} member{(data?.total ?? 0) !== 1 ? 's' : ''} in this workspace
        </Text>
        {isAdmin && (
          <Button type="primary" icon={<UserAddOutlined />} onClick={() => setInviteOpen(true)}>
            Invite user
          </Button>
        )}
      </div>

      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={isLoading}
        size="small"
        pagination={false}
        rowClassName={(u) => (!u.isActive ? 'ant-table-row-disabled' : '')}
      />

      <Modal
        title="Invite user"
        open={inviteOpen}
        onCancel={() => { setInviteOpen(false); inviteForm.resetFields(); }}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={inviteForm}
          layout="vertical"
          initialValues={{ role: 'viewer' }}
          onFinish={(v) => inviteMutation.mutate(v)}
          style={{ marginTop: 8 }}
        >
          <Form.Item name="name" label="Full name" rules={[{ required: true, min: 2 }]}>
            <Input placeholder="Jane Smith" />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, type: 'email' }]}
          >
            <Input placeholder="jane@company.com" />
          </Form.Item>
          <Form.Item name="role" label="Role">
            <Select>
              <Option value="viewer">Viewer can view dashboards and run saved queries</Option>
              <Option value="editor">Editor can create queries and dashboards</Option>
              <Option value="admin">Admin full access including user management</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="password"
            label="Temporary password"
            extra="The user should change this on first login."
            rules={[{ required: true, min: 8 }]}
          >
            <Input.Password placeholder="Min. 8 characters" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button onClick={() => { setInviteOpen(false); inviteForm.resetFields(); }}>
              Cancel
            </Button>
            <Button type="primary" htmlType="submit" loading={inviteMutation.isPending}>
              Send invite
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}

// â”€â”€â”€ Security & SSO tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function RegistrationToggle() {
  const { message } = App.useApp();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['sys-config-registration'],
    queryFn: async () => {
      const { data } = await api.get('/system-config', { params: { keys: 'auth.registration.enabled' } });
      const cfg = data.data ?? data;
      return cfg['auth.registration.enabled'] !== 'false';
    },
  });

  const mutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api.patch('/system-config', { config: { 'auth.registration.enabled': enabled ? 'true' : 'false' } }),
    onSuccess: (_data, enabled) => {
      qc.invalidateQueries({ queryKey: ['sys-config-registration'] });
      message.success(enabled ? 'Registration enabled' : 'Registration disabled');
    },
    onError: () => message.error('Failed to update registration setting'),
  });

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Text strong>Allow new user registration</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            When disabled, only admins can create accounts via the Users tab. The first admin account can always be created.
          </Text>
        </div>
        <Switch
          checked={data ?? true}
          loading={isLoading || mutation.isPending}
          onChange={(checked) => mutation.mutate(checked)}
        />
      </div>
    </Card>
  );
}

interface KeycloakConfig {
  url: string;
  realm: string;
  clientId: string;
  clientSecretSet: boolean;
  redirectUri: string;
  tlsSkipVerify: boolean;
}

function SsoSettings() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');

  const { data: cfg, isLoading } = useQuery<KeycloakConfig>({
    queryKey: ['keycloak-config'],
    queryFn: async () => {
      const { data } = await api.get('/auth/keycloak/config');
      return data.data ?? data;
    },
    enabled: isAdmin,
    retry: false,
  });

  useEffect(() => {
    if (cfg) {
      form.setFieldsValue({
        url:           cfg.url,
        realm:         cfg.realm,
        clientId:      cfg.clientId,
        redirectUri:   cfg.redirectUri,
        tlsSkipVerify: cfg.tlsSkipVerify,
        // client secret is not returned leave blank; only save if user types a new one
      });
    }
  }, [cfg, form]);

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api.put('/auth/keycloak/config', {
        url:           values['url'],
        realm:         values['realm'] || 'prismalytics',
        clientId:      values['clientId'] || 'prismalytics-app',
        clientSecret:  values['clientSecret'] || undefined,
        redirectUri:   values['redirectUri'],
        tlsSkipVerify: Boolean(values['tlsSkipVerify']),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['keycloak-config'] });
      message.success('Keycloak configuration saved');
      form.setFieldValue('clientSecret', '');
    },
    onError: () => message.error('Failed to save Keycloak configuration'),
  });

  if (!isAdmin) {
    return <Alert type="warning" showIcon message="Admin access required to configure SSO" />;
  }

  const isConfigured = !!cfg?.url;

  return (
    <div>
      <Alert
        type={isConfigured ? 'success' : 'info'}
        showIcon
        style={{ marginBottom: 20 }}
        message={isConfigured ? 'Keycloak SSO is active' : 'Keycloak SSO not configured'}
        description={
          isConfigured
            ? `Users can sign in via Keycloak (${cfg.url}/realms/${cfg.realm}).`
            : 'Fill in the fields below and save to enable Keycloak OIDC single sign-on on the login page.'
        }
      />

      <Spin spinning={isLoading}>
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => saveMutation.mutate(v as Record<string, string>)}
          initialValues={{ realm: 'prismalytics', clientId: 'prismalytics-app' }}
          style={{ maxWidth: 560 }}
        >
          <Form.Item
            name="url"
            label="Keycloak Base URL"
            rules={[{ required: true, message: 'Required' }]}
            help="e.g. https://auth.example.com"
          >
            <Input placeholder="https://auth.example.com" />
          </Form.Item>

          <Form.Item
            name="realm"
            label="Realm"
            rules={[{ required: true, message: 'Required' }]}
            help="Keycloak realm name"
          >
            <Input placeholder="prismalytics" />
          </Form.Item>

          <Form.Item
            name="clientId"
            label="Client ID"
            rules={[{ required: true, message: 'Required' }]}
          >
            <Input placeholder="prismalytics-app" />
          </Form.Item>

          <Form.Item
            name="clientSecret"
            label={
              <Space size={6}>
                Client Secret
                {cfg?.clientSecretSet && <Tag color="green" style={{ fontSize: 11 }}>Set</Tag>}
              </Space>
            }
            help={cfg?.clientSecretSet ? 'Leave blank to keep the existing secret' : undefined}
          >
            <Input.Password placeholder={cfg?.clientSecretSet ? 'â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢' : 'Enter client secret'} autoComplete="new-password" />
          </Form.Item>

          <Form.Item
            name="redirectUri"
            label="Redirect URI"
            rules={[{ required: true, message: 'Required' }]}
            help="Must match the redirect URI registered in Keycloak. e.g. https://prismalytics.example.com/auth/callback"
          >
            <Input placeholder="https://prismalytics.example.com/auth/callback" />
          </Form.Item>

          <Form.Item
            name="tlsSkipVerify"
            valuePropName="checked"
            label="Skip TLS verification"
            help={
              <Text type="warning" style={{ fontSize: 12 }}>
                Enable only when Keycloak uses a self-signed or internal CA certificate that the API server does not trust. Not recommended for production.
              </Text>
            }
          >
            <Switch checkedChildren="Skip" unCheckedChildren="Verify" />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={saveMutation.isPending}
              icon={<SaveOutlined />}
            >
              Save Keycloak Configuration
            </Button>
          </Form.Item>
        </Form>
      </Spin>
    </div>
  );
}

// â”€â”€â”€ Branding â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function BrandingSettings() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm();

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenant-current'],
    queryFn: async () => {
      const { data } = await api.get('/tenants/current');
      return data.data ?? data;
    },
  });

  const brandingMutation = useMutation({
    mutationFn: (values: { logoUrl?: string; logoText?: string; primaryColor?: string; faviconUrl?: string }) =>
      api.patch('/tenants/current/settings', { branding: values }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-current'] });
      message.success('Branding updated');
    },
    onError: () => message.error('Failed to update branding'),
  });

  if (isLoading) return <Spin />;

  const initial = {
    logoUrl: tenant?.branding?.logoUrl ?? '',
    logoText: tenant?.branding?.logoText ?? '',
    primaryColor: tenant?.branding?.primaryColor ?? '#6366f1',
    faviconUrl: tenant?.branding?.faviconUrl ?? '',
  };

  return (
    <div>
      <Alert
        type="info"
        showIcon
        message="Branding is applied per-tenant"
        description="Logo and favicon URLs must be publicly accessible. Primary color affects the accent color in embedding contexts."
        style={{ marginBottom: 16 }}
      />
      <Form
        form={form}
        layout="vertical"
        initialValues={initial}
        onFinish={(v) => {
          const color = typeof v.primaryColor === 'string'
            ? v.primaryColor
            : (v.primaryColor as { toHexString?: () => string })?.toHexString?.() ?? initial.primaryColor;
          brandingMutation.mutate({ logoUrl: v.logoUrl || undefined, logoText: v.logoText || undefined, primaryColor: color, faviconUrl: v.faviconUrl || undefined });
        }}
        style={{ maxWidth: 480 }}
      >
        <Form.Item name="logoUrl" label="Logo URL" extra="Recommended: SVG or PNG, min 120px wide.">
          <Input placeholder="https://your-domain.com/logo.png" />
        </Form.Item>
        <Form.Item
          name="logoText"
          label="Logo text"
          extra="Displayed next to the logo image in the sidebar. Leave blank to show only the logo image."
        >
          <Input placeholder="e.g. prismalytics" maxLength={40} />
        </Form.Item>
        <Form.Item name="faviconUrl" label="Favicon URL" extra="Recommended: 32Ã—32 PNG or ICO.">
          <Input placeholder="https://your-domain.com/favicon.ico" />
        </Form.Item>
        <Form.Item
          label="Primary accent color"
          extra="Changes the accent color across the entire application. Applied immediately after saving."
        >
          <Space align="center">
            <Form.Item name="primaryColor" noStyle>
              <ColorPicker showText format="hex" />
            </Form.Item>
            <Button
              size="small"
              onClick={() => form.setFieldsValue({ primaryColor: '#6366f1' })}
            >
              Reset to default
            </Button>
          </Space>
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={brandingMutation.isPending} icon={<BgColorsOutlined />}>
            Save branding
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}

// â”€â”€â”€ AI Usage Admin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface UsageRecord {
  id: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  provider: string;
  model: string;
  feature: string | null;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  success: boolean;
  createdAt: string;
}

const DAYS_OPTIONS = [
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 14 days', value: 14 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 60 days', value: 60 },
  { label: 'Last 90 days', value: 90 },
];

function computeStats(records: UsageRecord[]) {
  let totalCalls = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  const byProvider: Record<string, number> = {};

  for (const r of records) {
    totalCalls++;
    totalTokensIn += r.tokensIn;
    totalTokensOut += r.tokensOut;
    byProvider[r.provider] = (byProvider[r.provider] ?? 0) + 1;
  }
  return { totalCalls, totalTokensIn, totalTokensOut, byProvider };
}

function AiUsageSettings() {
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === 'admin';

  const [days, setDays] = useState(30);
  const [filterProvider, setFilterProvider] = useState<string | null>(null);
  const [filterFeature, setFilterFeature] = useState<string | null>(null);
  const [filterUserId, setFilterUserId] = useState<string | null>(null);
  const [filterSuccess, setFilterSuccess] = useState<boolean | null>(null);

  const { data: allRecords = [], isLoading } = useQuery<UsageRecord[]>({
    queryKey: ['ai-usage', days],
    queryFn: async () => {
      const { data } = await api.get(`/ai/admin/usage?days=${days}`);
      const payload = data.data ?? data;
      return Array.isArray(payload) ? payload : [];
    },
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return <Alert type="warning" showIcon message="Admin access required to view AI usage." />;
  }

  // Derived filter option lists from raw records
  const providers = [...new Set(allRecords.map((r) => r.provider))].sort();
  const features = [...new Set(allRecords.map((r) => r.feature).filter(Boolean) as string[])].sort();
  const users = [...new Map(
    allRecords
      .filter((r) => r.userId)
      .map((r) => [r.userId!, { id: r.userId!, name: r.userName ?? r.userEmail ?? r.userId! }])
  ).values()];

  // Apply filters
  const filtered = allRecords.filter((r) => {
    if (filterProvider && r.provider !== filterProvider) return false;
    if (filterFeature && r.feature !== filterFeature) return false;
    if (filterUserId && r.userId !== filterUserId) return false;
    if (filterSuccess !== null && r.success !== filterSuccess) return false;
    return true;
  });

  const stats = computeStats(filtered);
  const hasFilter = !!(filterProvider || filterFeature || filterUserId || filterSuccess !== null);

  const columns: ColumnsType<UsageRecord> = [
    {
      title: 'User', key: 'user', width: 160,
      render: (_: unknown, r: UsageRecord) => r.userName
        ? <Space direction="vertical" size={0}><Text style={{ fontSize: 13 }}>{r.userName}</Text><Text type="secondary" style={{ fontSize: 11 }}>{r.userEmail}</Text></Space>
        : <Text type="secondary">â€”</Text>,
    },
    { title: 'Provider', dataIndex: 'provider', key: 'provider', width: 110, render: (p: string) => <Tag color="blue">{p}</Tag> },
    { title: 'Model', dataIndex: 'model', key: 'model', width: 180, render: (m: string) => <Tag color="purple">{m}</Tag> },
    { title: 'Feature', dataIndex: 'feature', key: 'feature', width: 120, render: (f: string | null) => f ? <Tag>{f}</Tag> : <Text type="secondary">â€”</Text> },
    { title: 'Tokens in', dataIndex: 'tokensIn', key: 'tokensIn', width: 90, align: 'right' },
    { title: 'Tokens out', dataIndex: 'tokensOut', key: 'tokensOut', width: 95, align: 'right' },
    { title: 'Latency', dataIndex: 'latencyMs', key: 'latencyMs', width: 85, align: 'right', render: (ms: number) => `${ms}ms` },
    { title: 'Status', dataIndex: 'success', key: 'success', width: 80, render: (ok: boolean) => <Badge status={ok ? 'success' : 'error'} text={ok ? 'OK' : 'Error'} /> },
    {
      title: 'Time', dataIndex: 'createdAt', key: 'createdAt', width: 150,
      render: (d: string) => <Text type="secondary" style={{ fontSize: 12 }}>{new Date(d).toLocaleString()}</Text>,
    },
  ];

  return (
    <div>
      {/* Filter bar */}
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          value={days}
          onChange={setDays}
          style={{ width: 140 }}
          options={DAYS_OPTIONS}
        />
        <Select
          placeholder="All providers"
          allowClear
          style={{ width: 140 }}
          value={filterProvider ?? undefined}
          onChange={(v) => setFilterProvider(v ?? null)}
          options={providers.map((p) => ({ label: p, value: p }))}
        />
        <Select
          placeholder="All features"
          allowClear
          style={{ width: 160 }}
          value={filterFeature ?? undefined}
          onChange={(v) => setFilterFeature(v ?? null)}
          options={features.map((f) => ({ label: f, value: f }))}
        />
        <Select
          placeholder="All users"
          allowClear
          style={{ width: 180 }}
          showSearch
          optionFilterProp="label"
          value={filterUserId ?? undefined}
          onChange={(v) => setFilterUserId(v ?? null)}
          options={users.map((u) => ({ label: u.name, value: u.id }))}
        />
        <Select
          placeholder="All statuses"
          allowClear
          style={{ width: 140 }}
          value={filterSuccess !== null ? String(filterSuccess) : undefined}
          onChange={(v) => setFilterSuccess(v === undefined ? null : v === 'true')}
          options={[
            { label: 'Success only', value: 'true' },
            { label: 'Errors only', value: 'false' },
          ]}
        />
        {hasFilter && (
          <Button
            size="small"
            onClick={() => { setFilterProvider(null); setFilterFeature(null); setFilterUserId(null); setFilterSuccess(null); }}
          >
            Clear filters
          </Button>
        )}
      </Space>

      {isLoading ? <Spin /> : (
        <>
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title={hasFilter ? 'Calls (filtered)' : `Total calls (${days}d)`}
                  value={stats.totalCalls}
                />
                {hasFilter && <Text type="secondary" style={{ fontSize: 11 }}>{allRecords.length} total in period</Text>}
              </Card>
            </Col>
            <Col span={6}><Card size="small"><Statistic title="Tokens in" value={stats.totalTokensIn} /></Card></Col>
            <Col span={6}><Card size="small"><Statistic title="Tokens out" value={stats.totalTokensOut} /></Card></Col>
            <Col span={6}>
              <Card size="small">
                <div style={{ fontSize: 12, color: '#8b8fa8', marginBottom: 4 }}>By provider</div>
                {Object.entries(stats.byProvider).map(([p, count]) => (
                  <div key={p}><Tag color="blue">{p}</Tag> {count} calls</div>
                ))}
                {Object.keys(stats.byProvider).length === 0 && <Text type="secondary" style={{ fontSize: 12 }}>â€”</Text>}
              </Card>
            </Col>
          </Row>
          <Divider orientation="left" plain style={{ fontSize: 12 }}>
            {hasFilter ? `${filtered.length} of ${allRecords.length} calls` : `${allRecords.length} calls`}
          </Divider>
          <Table
            columns={columns}
            dataSource={filtered}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'] }}
            scroll={{ x: 1100 }}
          />
        </>
      )}
    </div>
  );
}

// â”€â”€â”€ Performance (Cache) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const CACHE_KEYS = 'cache.enabled,cache.redis.host,cache.redis.port,cache.redis.password,cache.ttl';

function PerformanceSettings() {
  const { message } = App.useApp();
  const currentUser = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [cacheEnabled, setCacheEnabled] = useState(false);
  const isAdmin = currentUser?.role === 'admin';

  const { data: cfg, isLoading } = useQuery({
    queryKey: ['system-config-cache'],
    queryFn: async () => {
      const { data } = await api.get(`/system-config?keys=${CACHE_KEYS}`);
      return (data.data ?? data) as Record<string, string | null>;
    },
    enabled: isAdmin,
  });

  useEffect(() => {
    if (!cfg) return;
    const enabled = cfg['cache.enabled'] === 'true';
    setCacheEnabled(enabled);
    form.setFieldsValue({
      enabled,
      host: cfg['cache.redis.host'] ?? '',
      port: cfg['cache.redis.port'] ? parseInt(cfg['cache.redis.port']!, 10) : 6379,
      password: cfg['cache.redis.password'] ?? '',
      ttl: cfg['cache.ttl'] ? parseInt(cfg['cache.ttl']!, 10) : 300,
    });
  }, [cfg, form]);

  const saveMutation = useMutation({
    mutationFn: (values: { enabled: boolean; host: string; port: number; password: string; ttl: number }) =>
      api.patch('/system-config', {
        config: {
          'cache.enabled': String(values.enabled),
          'cache.redis.host': values.host || null,
          'cache.redis.port': String(values.port),
          'cache.redis.password': values.password || null,
          'cache.ttl': String(values.ttl),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system-config-cache'] });
      message.success('Settings saved');
    },
    onError: () => message.error('Failed to save settings'),
  });

  const reloadMutation = useMutation({
    mutationFn: async (values: { enabled: boolean; host: string; port: number; password: string; ttl: number }) => {
      await api.patch('/system-config', {
        config: {
          'cache.enabled': String(values.enabled),
          'cache.redis.host': values.host || null,
          'cache.redis.port': String(values.port),
          'cache.redis.password': values.password || null,
          'cache.ttl': String(values.ttl),
        },
      });
      const { data } = await api.post('/cache/reload');
      return (data.data ?? data) as { enabled: boolean; message: string };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['system-config-cache'] });
      if (result.enabled) {
        message.success(`Cache connected: ${result.message}`);
      } else {
        message.warning(`Cache not connected: ${result.message}`);
      }
    },
    onError: () => message.error('Failed to apply cache settings'),
  });

  if (!isAdmin) {
    return <Alert type="warning" showIcon message="Admin access required to configure performance settings." />;
  }

  if (isLoading) return <Spin />;

  return (
    <div>
      <Alert
        type="info"
        showIcon
        message="Query result cache"
        description="When enabled, repeated identical queries return cached results from Redis. Only admin users can configure this. Redis must be reachable from the API server."
        style={{ marginBottom: 16 }}
      />

      <Form
        form={form}
        layout="vertical"
        onFinish={(v) => saveMutation.mutate(v)}
        style={{ maxWidth: 480 }}
      >
        <Form.Item name="enabled" label="Enable query result cache" valuePropName="checked">
          <Switch onChange={(v) => setCacheEnabled(v)} />
        </Form.Item>

        <Form.Item
          name="host"
          label="Redis host"
          extra="Leave blank to use the REDIS_HOST environment variable (set automatically when Redis is enabled in the Helm chart)."
        >
          <Input placeholder="e.g. prismalytics-redis-master" disabled={!cacheEnabled} />
        </Form.Item>

        <Form.Item
          name="port"
          label="Redis port"
          rules={cacheEnabled ? [{ required: true }] : []}
        >
          <InputNumber min={1} max={65535} style={{ width: '100%' }} disabled={!cacheEnabled} />
        </Form.Item>

        <Form.Item name="password" label="Redis password" extra="Leave blank if no password is set.">
          <Input.Password placeholder="(none)" disabled={!cacheEnabled} />
        </Form.Item>

        <Form.Item name="ttl" label="Cache TTL (seconds)" extra="How long query results are cached. Default: 300 (5 min).">
          <InputNumber min={10} max={86400} style={{ width: '100%' }} disabled={!cacheEnabled} />
        </Form.Item>

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={saveMutation.isPending} icon={<ThunderboltOutlined />}>
              Save settings
            </Button>
            <Button
              onClick={() => {
                form.validateFields().then((values) => reloadMutation.mutate(values)).catch(() => {});
              }}
              loading={reloadMutation.isPending}
            >
              Test & Apply
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </div>
  );
}

// â”€â”€â”€ AI Prompt Templates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PROMPT_FEATURES = [
  { key: 'nl_to_sql', label: 'Natural Language to SQL', description: 'System prompt used when converting natural language descriptions into SQL queries.' },
  { key: 'report_gen', label: 'Report Generation', description: 'System prompt used when generating BI reports from query results.' },
  { key: 'dashboard_summary', label: 'Dashboard Summary', description: 'System prompt used when summarizing dashboard data.' },
  { key: 'query_optimize', label: 'Query Optimization', description: 'System prompt used when analysing SQL queries for performance improvements.' },
  { key: 'alert_rule_gen', label: 'Alert Rule Generation', description: 'System prompt used when generating alert rules from natural language descriptions.' },
  { key: 'chat_system', label: 'AI Assistant (Chat)', description: 'System prompt for the AI analytics chat assistant.' },
] as const;

interface PromptTemplate {
  id: string;
  feature: string;
  template: string;
  isActive: boolean;
}

function AiPromptsSettings() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === 'admin';
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data: templates = [], isLoading } = useQuery<PromptTemplate[]>({
    queryKey: ['ai-prompt-templates'],
    queryFn: async () => {
      const { data } = await api.get('/ai/prompt-templates');
      const payload = data.data ?? data;
      return Array.isArray(payload) ? payload : [];
    },
    enabled: isAdmin,
  });

  const upsertMutation = useMutation({
    mutationFn: ({ feature, template }: { feature: string; template: string }) =>
      api.put(`/ai/prompt-templates/${feature}`, { template }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-prompt-templates'] });
      void message.success('Prompt template saved');
    },
    onError: () => void message.error('Failed to save template'),
  });

  const deleteMutation = useMutation({
    mutationFn: (feature: string) => api.delete(`/ai/prompt-templates/${feature}`),
    onSuccess: (_, feature) => {
      qc.invalidateQueries({ queryKey: ['ai-prompt-templates'] });
      setDrafts((prev) => { const next = { ...prev }; delete next[feature]; return next; });
      void message.success('Template reset to default');
    },
    onError: () => void message.error('Failed to reset template'),
  });

  if (!isAdmin) {
    return <Alert type="warning" showIcon message="Admin access required to manage AI prompt templates." />;
  }

  if (isLoading) return <Spin />;

  return (
    <div>
      <Alert
        type="info"
        showIcon
        message="Custom AI Prompts"
        description="Override the default system prompts used by each AI feature. Leave a feature's template empty (or reset it) to use the built-in default."
        style={{ marginBottom: 16 }}
      />
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {PROMPT_FEATURES.map((feat) => {
          const existing = templates.find((t) => t.feature === feat.key);
          const value = drafts[feat.key] ?? existing?.template ?? '';
          return (
            <Card
              key={feat.key}
              size="small"
              title={<Space><FileTextOutlined />{feat.label}</Space>}
              extra={
                existing ? (
                  <Popconfirm
                    title="Reset to default prompt?"
                    onConfirm={() => deleteMutation.mutate(feat.key)}
                    okButtonProps={{ danger: true }}
                  >
                    <Button size="small" danger>Reset to default</Button>
                  </Popconfirm>
                ) : <Tag>Using default</Tag>
              }
            >
              <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>{feat.description}</Text>
              <Input.TextArea
                rows={6}
                placeholder="Enter custom system prompt..."
                value={value}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [feat.key]: e.target.value }))}
                style={{ marginBottom: 8 }}
              />
              <Button
                type="primary"
                size="small"
                loading={upsertMutation.isPending}
                disabled={!value.trim()}
                onClick={() => upsertMutation.mutate({ feature: feat.key, template: value })}
              >
                Save
              </Button>
            </Card>
          );
        })}
      </Space>
    </div>
  );
}

// â”€â”€â”€ SMTP Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SmtpSettings() {
  const { message } = App.useApp();
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === 'admin';
  const [form] = Form.useForm();
  const [testLoading, setTestLoading] = useState(false);

  const { data: smtp, isLoading } = useQuery<{
    host: string; port: number; secure: boolean; user: string; from: string; hasPassword: boolean;
  }>({
    queryKey: ['smtp-config'],
    queryFn: async () => {
      const { data } = await api.get('/system-config/smtp');
      return data.data ?? data;
    },
    enabled: isAdmin,
  });

  const saveMutation = useMutation({
    mutationFn: (values: { host: string; port: number; secure: boolean; user: string; pass?: string; from: string }) =>
      api.patch('/system-config/smtp', values),
    onSuccess: () => void message.success('SMTP settings saved and transporter reinitialized'),
    onError: () => void message.error('Failed to save SMTP settings'),
  });

  const handleTest = async () => {
    setTestLoading(true);
    try {
      const { data } = await api.post('/system-config/smtp/test');
      const result = data.data ?? data;
      if (result.success) {
        void message.success(result.message as string);
      } else {
        void message.error(result.message as string);
      }
    } catch (err) {
      void message.error((err as Error).message ?? 'Test failed');
    } finally {
      setTestLoading(false);
    }
  };

  if (!isAdmin) return <Alert type="warning" showIcon message="Admin access required." />;
  if (isLoading) return <Spin />;

  return (
    <div>
      <Alert
        type="info"
        showIcon
        message="SMTP configuration"
        description="These settings override SMTP_* environment variables. The transporter is reinitialized immediately on save. Use the test button to verify connectivity."
        style={{ marginBottom: 16 }}
      />
      <Form
        form={form}
        layout="vertical"
        initialValues={{ host: smtp?.host ?? '', port: smtp?.port ?? 587, secure: smtp?.secure ?? false, user: smtp?.user ?? '', from: smtp?.from ?? '' }}
        onFinish={(v) => saveMutation.mutate(v)}
        style={{ maxWidth: 480 }}
      >
        <Form.Item name="host" label="SMTP host" rules={[{ required: true, message: 'Host is required' }]}>
          <Input placeholder="smtp.example.com" />
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="port" label="Port" rules={[{ required: true }]}>
              <InputNumber min={1} max={65535} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="secure" label="TLS / SSL" valuePropName="checked" extra="Enable for port 465">
              <Switch />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="user" label="Username">
          <Input placeholder="notifications@example.com" autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="pass"
          label="Password"
          extra={smtp?.hasPassword ? 'Leave blank to keep the current password.' : undefined}
        >
          <Input.Password placeholder={smtp?.hasPassword ? '(saved leave blank to keep)' : 'SMTP password'} autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="from" label="From address">
          <Input placeholder="prismalytics <noreply@example.com>" />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={saveMutation.isPending} icon={<MailOutlined />}>
              Save settings
            </Button>
            <Button icon={<SendOutlined />} loading={testLoading} onClick={() => void handleTest()}>
              Send test email
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </div>
  );
}

// â”€â”€â”€ CORS Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CorsSettings() {
  const { message } = App.useApp();
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === 'admin';
  const [form] = Form.useForm();

  const { data: cors, isLoading } = useQuery<{ origins: string }>({
    queryKey: ['cors-config'],
    queryFn: async () => {
      const { data } = await api.get('/system-config/cors');
      return data.data ?? data;
    },
    enabled: isAdmin,
  });

  const saveMutation = useMutation({
    mutationFn: (values: { origins: string }) => api.patch('/system-config/cors', values),
    onSuccess: () => void message.success('CORS origins saved effective immediately for new requests'),
    onError: () => void message.error('Failed to save CORS settings'),
  });

  if (!isAdmin) return <Alert type="warning" showIcon message="Admin access required." />;
  if (isLoading) return <Spin />;

  return (
    <div>
      <Alert
        type="info"
        showIcon
        message="CORS allowed origins"
        description="Controls which frontend URLs are permitted to make requests to the API. Changes take effect within 30 seconds for new requests no restart required."
        style={{ marginBottom: 16 }}
      />
      <Form
        form={form}
        layout="vertical"
        initialValues={{ origins: cors?.origins ?? '' }}
        onFinish={(v) => saveMutation.mutate(v)}
        style={{ maxWidth: 480 }}
      >
        <Form.Item
          name="origins"
          label="Allowed origins"
          rules={[{ required: true, message: 'Enter at least one origin' }]}
          extra="Comma-separated list, e.g. https://app.example.com, https://staging.example.com or * to allow all origins (not recommended for production)."
        >
          <Input.TextArea
            rows={3}
            placeholder="https://app.example.com, https://staging.example.com"
          />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={saveMutation.isPending} icon={<GlobalOutlined />}>
            Save origins
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}

// â”€â”€â”€ Proxy Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ProxySettings() {
  const { message } = App.useApp();
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === 'admin';
  const [form] = Form.useForm();
  const [proxyEnabled, setProxyEnabled] = useState(false);

  const { data: proxy, isLoading } = useQuery<{ enabled: boolean; url: string; noProxy: string }>({
    queryKey: ['proxy-config'],
    queryFn: async () => {
      const { data } = await api.get('/system-config/proxy');
      return data.data ?? data;
    },
    enabled: isAdmin,
  });

  useEffect(() => {
    if (!proxy) return;
    setProxyEnabled(proxy.enabled);
    form.setFieldsValue({ enabled: proxy.enabled, url: proxy.url ?? '', noProxy: proxy.noProxy ?? '' });
  }, [proxy, form]);

  const saveMutation = useMutation({
    mutationFn: (values: { enabled: boolean; url?: string; noProxy?: string }) =>
      api.patch('/system-config/proxy', values),
    onSuccess: () => void message.success('Proxy settings saved effective immediately'),
    onError: () => void message.error('Failed to save proxy settings'),
  });

  if (!isAdmin) return <Alert type="warning" showIcon message="Admin access required." />;
  if (isLoading) return <Spin />;

  return (
    <div>
      <Alert
        type="info"
        showIcon
        message="Outbound proxy"
        description="Routes all LLM API calls (Gemini, Claude, OpenRouter, Ollama) through the configured proxy. Useful when the API server has restricted internet access. Changes take effect immediately without a restart."
        style={{ marginBottom: 16 }}
      />
      <Form
        form={form}
        layout="vertical"
        initialValues={{ enabled: proxy?.enabled ?? false, url: proxy?.url ?? '', noProxy: proxy?.noProxy ?? '' }}
        onFinish={(v) => saveMutation.mutate(v)}
        style={{ maxWidth: 480 }}
      >
        <Form.Item name="enabled" label="Enable outbound proxy" valuePropName="checked">
          <Switch onChange={(v) => setProxyEnabled(v)} />
        </Form.Item>
        <Form.Item
          name="url"
          label="Proxy URL"
          rules={proxyEnabled ? [{ required: true, message: 'Proxy URL is required when enabled' }] : []}
          extra="e.g. http://proxy.internal:3128 or http://user:pass@proxy.internal:3128"
        >
          <Input placeholder="http://proxy.internal:3128" disabled={!proxyEnabled} />
        </Form.Item>
        <Form.Item
          name="noProxy"
          label="No-proxy hosts"
          extra="Comma-separated list of hostnames/CIDRs to bypass the proxy, e.g. localhost,127.0.0.1,.internal.svc"
        >
          <Input.TextArea
            rows={2}
            placeholder="localhost,127.0.0.1,.internal.svc"
            disabled={!proxyEnabled}
          />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={saveMutation.isPending} icon={<ApiOutlined />}>
            Save proxy settings
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}

// â”€â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function SettingsPage() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>Settings</Title>
        <Text type="secondary">Manage platform configuration</Text>
      </div>

      <Card>
        <Tabs
          items={[
            {
              key: 'branding',
              label: <span><BgColorsOutlined /> Branding</span>,
              children: <BrandingSettings />,
            },
            {
              key: 'ai',
              label: <span><RobotOutlined /> AI / LLM</span>,
              children: <AiSettings />,
            },
            {
              key: 'ai-usage',
              label: <span><BarChartOutlined /> AI Usage</span>,
              children: <AiUsageSettings />,
            },
            {
              key: 'ai-prompts',
              label: <span><FileTextOutlined /> AI Prompts</span>,
              children: <AiPromptsSettings />,
            },
            {
              key: 'smtp',
              label: <span><MailOutlined /> SMTP</span>,
              children: <SmtpSettings />,
            },
            {
              key: 'cors',
              label: <span><GlobalOutlined /> CORS</span>,
              children: <CorsSettings />,
            },
            {
              key: 'proxy',
              label: <span><ApiOutlined /> Proxy</span>,
              children: <ProxySettings />,
            },
            {
              key: 'performance',
              label: <span><ThunderboltOutlined /> Performance</span>,
              children: <PerformanceSettings />,
            },
            {
              key: 'users',
              label: <span><UserOutlined /> Users & Roles</span>,
              children: <UsersSettings />,
            },
            {
              key: 'security',
              label: <span><SafetyOutlined /> Security & SSO</span>,
              children: (
                <>
                  <RegistrationToggle />
                  <SsoSettings />
                </>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
