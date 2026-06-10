import { useState } from 'react';
import {
  Typography,
  Card,
  Table,
  Tag,
  Space,
  Button,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Switch,
  Drawer,
  Popconfirm,
  App,
  Tooltip,
  Tabs,
  Badge,
  Alert,
} from 'antd';
import {
  BellOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  HistoryOutlined,
  MinusCircleOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  SendOutlined,
  CloseCircleOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useAuthStore } from '../stores/auth.store';
import type { Datasource } from '../types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlertChannel {
  type: 'email' | 'slack' | 'webhook';
  target: string;
  autoApprove?: boolean;
}

interface AlertRule {
  id: string;
  name: string;
  datasourceId: string;
  sql: string;
  condition: string;
  threshold: number;
  columnName: string;
  schedule: string;
  channels: AlertChannel[];
  isActive: boolean;
  notificationsEnabled: boolean;
  lastEvaluatedAt?: string;
  lastStatus?: string;
  createdAt: string;
}

interface AlertEvaluation {
  id: string;
  alertRuleId: string;
  evaluatedAt: string;
  value?: number;
  status: string;
  error?: string;
}

interface AlertNotification {
  id: string;
  alertRuleId: string;
  name: string;
  channels: AlertChannel[];
  detectedValue?: number;
  threshold: number;
  condition: string;
  message: string;
  status: 'pending' | 'sent' | 'dismissed';
  createdAt: string;
  sentAt?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCronField(field: string, min: number, max: number): number[] {
  const values = new Set<number>();
  for (const part of field.split(',')) {
    if (part === '*') {
      for (let i = min; i <= max; i++) values.add(i);
    } else if (part.startsWith('*/')) {
      const step = parseInt(part.slice(2), 10);
      if (step > 0) for (let i = min; i <= max; i++) if ((i - min) % step === 0) values.add(i);
    } else if (part.includes('-')) {
      const [s, e] = part.split('-').map(Number);
      for (let i = s ?? min; i <= (e ?? max); i++) values.add(i);
    } else {
      const n = parseInt(part, 10);
      if (!isNaN(n)) values.add(n);
    }
  }
  return [...values].sort((a, b) => a - b);
}

function getNextCronRun(expression: string): Date | null {
  try {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) return null;
    const [mF, hF, domF, monF, dowF] = parts;
    const mins   = parseCronField(mF!,   0,  59);
    const hours  = parseCronField(hF!,   0,  23);
    const doms   = parseCronField(domF!, 1,  31);
    const months = parseCronField(monF!, 1,  12);
    const dows   = parseCronField(dowF!, 0,   6);
    const candidate = new Date();
    candidate.setSeconds(0, 0);
    candidate.setMinutes(candidate.getMinutes() + 1);
    // Iterate up to 1 year minute-by-minute; common schedules resolve in <60 iterations
    for (let i = 0; i < 525_600; i++) {
      if (
        months.includes(candidate.getMonth() + 1) &&
        doms.includes(candidate.getDate()) &&
        dows.includes(candidate.getDay()) &&
        hours.includes(candidate.getHours()) &&
        mins.includes(candidate.getMinutes())
      ) return new Date(candidate);
      candidate.setMinutes(candidate.getMinutes() + 1);
    }
    return null;
  } catch {
    return null;
  }
}

function formatNextRun(next: Date | null): string {
  if (!next) return 'Unknown';
  const diffMs = next.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1)  return 'in < 1 min';
  if (diffMin < 60) return `in ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  const remMin = diffMin % 60;
  if (diffH < 24)   return remMin > 0 ? `in ${diffH}h ${remMin}m` : `in ${diffH}h`;
  return dayjs(next).format('MMM D HH:mm');
}

const STATUS_COLOR: Record<string, string> = { ok: 'green', firing: 'red', error: 'orange' };
const NOTIF_STATUS_COLOR: Record<string, string> = { pending: 'orange', sent: 'green', dismissed: 'default' };

const CONDITION_LABEL: Record<string, string> = { gt: '>', lt: '<', eq: '=', gte: '>=', lte: '<=' };

function channelPlaceholder(type: string): string {
  if (type === 'email') return 'alerts@example.com';
  if (type === 'slack') return 'https://hooks.slack.com/services/…';
  return 'https://example.com/webhook';
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useAlerts(page: number) {
  return useQuery<{ rules: AlertRule[]; total: number }>({
    queryKey: ['alerts', page],
    queryFn: async () => {
      const { data } = await api.get(`/alerts?page=${page}&limit=50`);
      return data.data ?? data;
    },
  });
}

function useDatasources() {
  return useQuery<Datasource[]>({
    queryKey: ['datasources-list'],
    queryFn: async () => {
      const { data } = await api.get('/datasources');
      const payload = data.data ?? data;
      return Array.isArray(payload) ? payload : [];
    },
  });
}

function useEvaluations(ruleId: string | null) {
  return useQuery<{ evaluations: AlertEvaluation[]; total: number }>({
    queryKey: ['alert-evaluations', ruleId],
    queryFn: async () => {
      const { data } = await api.get(`/alerts/${ruleId}/evaluations?limit=50`);
      return data.data ?? data;
    },
    enabled: ruleId !== null,
  });
}

function usePendingNotifications(isAdmin: boolean) {
  return useQuery<{ notifications: AlertNotification[]; total: number }>({
    queryKey: ['alert-notifications-pending'],
    queryFn: async () => {
      const { data } = await api.get('/alerts/notifications/pending');
      return data.data ?? data;
    },
    enabled: isAdmin,
    refetchInterval: 30_000,
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'admin';
  const canEdit = role === 'admin' || role === 'editor';

  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | undefined>();
  const [historyRuleId, setHistoryRuleId] = useState<string | null>(null);
  const [nlOpen, setNlOpen] = useState(false);
  const [nlText, setNlText] = useState('');
  const [nlDatasourceId, setNlDatasourceId] = useState<string | undefined>();
  const [nlLoading, setNlLoading] = useState(false);
  const [nlReasoning, setNlReasoning] = useState<string | undefined>();
  const [form] = Form.useForm();

  const { data, isLoading } = useAlerts(page);
  const { data: datasources = [] } = useDatasources();
  const { data: evalData, isLoading: evalLoading } = useEvaluations(historyRuleId);
  const { data: notifData } = usePendingNotifications(isAdmin);

  const rules = data?.rules ?? [];
  const total = data?.total ?? 0;
  const pendingNotifications = notifData?.notifications ?? [];
  const pendingCount = notifData?.total ?? 0;

  // ─── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/alerts', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      message.success('Alert rule created (inactive — activate when ready)');
      closeModal();
    },
    onError: () => message.error('Failed to create alert rule'),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.put(`/alerts/${editingRule?.id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      message.success('Alert rule updated');
      closeModal();
    },
    onError: () => message.error('Failed to update alert rule'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/alerts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      message.success('Alert rule deleted');
    },
    onError: () => message.error('Failed to delete'),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/alerts/${id}/activate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      message.success('Alert rule activated — evaluations will begin on schedule');
    },
    onError: () => message.error('Failed to activate'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/alerts/${id}/deactivate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      message.success('Alert rule deactivated');
    },
    onError: () => message.error('Failed to deactivate'),
  });

  const sendNotifMutation = useMutation({
    mutationFn: (id: string) => api.post(`/alerts/notifications/${id}/send`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alert-notifications-pending'] });
      message.success('Notification sent');
    },
    onError: () => message.error('Failed to send notification'),
  });

  const dismissNotifMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/alerts/notifications/${id}/dismiss`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alert-notifications-pending'] });
      message.info('Notification dismissed');
    },
    onError: () => message.error('Failed to dismiss'),
  });

  // ─── NL Alert Rule Generation ────────────────────────────────────────────────

  async function handleGenerateRule() {
    if (!nlText.trim()) return;
    setNlLoading(true);
    try {
      const { data: res } = await api.post('/ai/generate-alert-rule', {
        description: nlText,
        datasourceId: nlDatasourceId,
      });
      const draft = res.data ?? res;
      form.setFieldsValue({
        name: draft.name,
        sql: draft.sql,
        condition: draft.condition,
        threshold: draft.threshold,
        columnName: draft.columnName,
        schedule: draft.schedule,
      });
      setNlReasoning(draft.reasoning);
      setNlOpen(false);
      setNlText('');
    } catch {
      message.error('Failed to generate alert rule draft');
    } finally {
      setNlLoading(false);
    }
  }

  // ─── Handlers ───────────────────────────────────────────────────────────────

  function openCreate() {
    setEditingRule(undefined);
    setNlReasoning(undefined);
    form.resetFields();
    form.setFieldsValue({ schedule: '*/15 * * * *', channels: [], notificationsEnabled: false });
    setModalOpen(true);
  }

  function openEdit(rule: AlertRule) {
    setEditingRule(rule);
    setNlReasoning(undefined);
    form.setFieldsValue({
      name: rule.name,
      datasourceId: rule.datasourceId,
      sql: rule.sql,
      columnName: rule.columnName,
      condition: rule.condition,
      threshold: rule.threshold,
      schedule: rule.schedule,
      channels: rule.channels,
      notificationsEnabled: rule.notificationsEnabled,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingRule(undefined);
    setNlReasoning(undefined);
    form.resetFields();
  }

  function handleSubmit(values: Record<string, unknown>) {
    const payload = {
      ...values,
      channels: (values['channels'] as AlertChannel[] | undefined) ?? [],
      notificationsEnabled: Boolean(values['notificationsEnabled']),
    };
    if (editingRule) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  }

  // ─── Rules table columns ─────────────────────────────────────────────────────

  const ruleColumns = [
    {
      title: 'Name',
      dataIndex: 'name',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Active',
      dataIndex: 'isActive',
      width: 80,
      render: (active: boolean) => (
        <Tag color={active ? 'blue' : 'default'}>{active ? 'Active' : 'Inactive'}</Tag>
      ),
    },
    {
      title: 'Notify',
      dataIndex: 'notificationsEnabled',
      width: 80,
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'purple' : 'default'}>{enabled ? 'On' : 'Off'}</Tag>
      ),
    },
    {
      title: 'Last Status',
      dataIndex: 'lastStatus',
      width: 110,
      render: (status: string | undefined) => (
        <Tag color={status ? STATUS_COLOR[status] ?? 'default' : 'default'}>
          {status ? status.toUpperCase() : 'PENDING'}
        </Tag>
      ),
    },
    {
      title: 'Last Evaluated',
      dataIndex: 'lastEvaluatedAt',
      width: 170,
      render: (d: string | undefined) =>
        d ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {dayjs(d).format('YYYY-MM-DD HH:mm')}
          </Text>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>Never</Text>
        ),
    },
    {
      title: 'Next Evaluation',
      dataIndex: 'schedule',
      width: 150,
      render: (schedule: string, rule: AlertRule) => {
        if (!rule.isActive) {
          return <Text type="secondary" style={{ fontSize: 12 }}>Not scheduled</Text>;
        }
        const next = getNextCronRun(schedule);
        return (
          <Tooltip title={next ? dayjs(next).format('YYYY-MM-DD HH:mm:ss') : 'Unable to parse schedule'}>
            <Text style={{ fontSize: 12, color: '#6366f1', cursor: 'default' }}>
              {formatNextRun(next)}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      title: 'Schedule',
      dataIndex: 'schedule',
      width: 140,
      render: (s: string) => (
        <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>{s}</Text>
      ),
    },
    {
      title: 'Actions',
      width: 240,
      render: (_: unknown, rule: AlertRule) => (
        <Space>
          <Tooltip title="Evaluation history">
            <Button size="small" icon={<HistoryOutlined />} onClick={() => setHistoryRuleId(rule.id)} />
          </Tooltip>
          {canEdit && (
            <Tooltip title={rule.isActive ? 'Deactivate' : 'Activate'}>
              {rule.isActive ? (
                <Popconfirm
                  title="Deactivate this rule?"
                  description="Scheduled evaluations will stop."
                  onConfirm={() => deactivateMutation.mutate(rule.id)}
                  okButtonProps={{ danger: true }}
                  okText="Deactivate"
                >
                  <Button size="small" icon={<PauseCircleOutlined />} />
                </Popconfirm>
              ) : (
                <Popconfirm
                  title="Activate this rule?"
                  description="Evaluations will run on the configured schedule."
                  onConfirm={() => activateMutation.mutate(rule.id)}
                  okText="Activate"
                >
                  <Button size="small" icon={<PlayCircleOutlined />} type="primary" ghost />
                </Popconfirm>
              )}
            </Tooltip>
          )}
          {canEdit && (
            <>
              <Tooltip title="Edit">
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(rule)} />
              </Tooltip>
              <Popconfirm
                title="Delete this alert rule?"
                onConfirm={() => deleteMutation.mutate(rule.id)}
                okButtonProps={{ danger: true }}
                okText="Delete"
              >
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  // ─── Evaluation history columns ───────────────────────────────────────────────

  const evalColumns = [
    {
      title: 'Time',
      dataIndex: 'evaluatedAt',
      width: 170,
      render: (d: string) => (
        <Text style={{ fontSize: 12 }}>{dayjs(d).format('YYYY-MM-DD HH:mm:ss')}</Text>
      ),
    },
    {
      title: 'Value',
      dataIndex: 'value',
      width: 90,
      render: (v: number | undefined) => (
        <Text style={{ fontSize: 12 }}>{v !== undefined && v !== null ? v : '-'}</Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 90,
      render: (s: string) => (
        <Tag color={STATUS_COLOR[s] ?? 'default'} style={{ fontSize: 11 }}>{s.toUpperCase()}</Tag>
      ),
    },
    {
      title: 'Error',
      dataIndex: 'error',
      render: (e: string | undefined) =>
        e ? <Text type="danger" style={{ fontSize: 11, fontFamily: 'monospace' }}>{e}</Text> : null,
    },
  ];

  // ─── Pending notifications columns ────────────────────────────────────────────

  const notifColumns = [
    {
      title: 'Alert',
      dataIndex: 'name',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Detection',
      render: (_: unknown, n: AlertNotification) => (
        <Text style={{ fontSize: 12 }}>
          Value <strong>{n.detectedValue ?? '-'}</strong> {CONDITION_LABEL[n.condition] ?? n.condition} {n.threshold}
        </Text>
      ),
    },
    {
      title: 'Channels',
      dataIndex: 'channels',
      width: 100,
      render: (ch: AlertChannel[]) => <Tag>{ch?.length ?? 0} channel{ch?.length !== 1 ? 's' : ''}</Tag>,
    },
    {
      title: 'Detected at',
      dataIndex: 'createdAt',
      width: 160,
      render: (d: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(d).format('YYYY-MM-DD HH:mm')}</Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 100,
      render: (s: string) => (
        <Tag color={NOTIF_STATUS_COLOR[s] ?? 'default'}>{s.toUpperCase()}</Tag>
      ),
    },
    {
      title: 'Actions',
      width: 180,
      render: (_: unknown, n: AlertNotification) =>
        n.status === 'pending' ? (
          <Space>
            <Popconfirm
              title="Send notification?"
              description="This will dispatch emails/webhooks to all configured channels."
              onConfirm={() => sendNotifMutation.mutate(n.id)}
              okText="Send"
              okButtonProps={{ type: 'primary' }}
            >
              <Button
                size="small"
                type="primary"
                icon={<SendOutlined />}
                loading={sendNotifMutation.isPending}
              >
                Send
              </Button>
            </Popconfirm>
            <Popconfirm
              title="Dismiss without sending?"
              onConfirm={() => dismissNotifMutation.mutate(n.id)}
              okText="Dismiss"
              okButtonProps={{ danger: true }}
            >
              <Button
                size="small"
                danger
                icon={<CloseCircleOutlined />}
                loading={dismissNotifMutation.isPending}
              >
                Dismiss
              </Button>
            </Popconfirm>
          </Space>
        ) : null,
    },
  ];

  const historyRule = rules.find((r) => r.id === historyRuleId);

  const tabItems = [
    {
      key: 'rules',
      label: `Rules (${total})`,
      children: (
        <Table
          dataSource={rules}
          columns={ruleColumns}
          rowKey="id"
          loading={isLoading}
          size="small"
          pagination={{
            current: page,
            total,
            pageSize: 50,
            onChange: setPage,
            showTotal: (t) => `${t} rules`,
          }}
        />
      ),
    },
    ...(isAdmin
      ? [
          {
            key: 'notifications',
            label: (
              <Badge count={pendingCount} offset={[8, 0]} size="small">
                Pending Notifications
              </Badge>
            ),
            children: (
              <div>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="Notifications require admin confirmation"
                  description="When an alert fires and notifications are enabled, a pending entry appears here. No emails or webhooks are dispatched until you explicitly click Send."
                />
                <Table
                  dataSource={pendingNotifications}
                  columns={notifColumns}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 50, showTotal: (t) => `${t} notifications` }}
                  locale={{ emptyText: 'No pending notifications' }}
                />
              </div>
            ),
          },
        ]
      : []),
  ];

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Space>
          <BellOutlined style={{ fontSize: 24, color: '#6366f1' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Alerts</Title>
            <Text type="secondary">
              Rules start inactive. Activate explicitly. Notifications require admin confirmation before sending.
            </Text>
          </div>
        </Space>
        {canEdit && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Create Alert
          </Button>
        )}
      </div>

      <Card bodyStyle={{ padding: 0 }}>
        <Tabs items={tabItems} style={{ padding: '0 16px' }} />
      </Card>

      {/* Create / Edit Modal */}
      <Modal
        title={editingRule ? 'Edit Alert Rule' : 'Create Alert Rule'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        width={660}
        destroyOnClose
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Rules are created inactive and with notifications off"
          description="After saving, use the Activate button to start evaluations. Enable notifications separately when ready — nothing will send automatically."
        />

        {/* NL generation trigger */}
        {!editingRule && (
          <div style={{ marginBottom: 16, textAlign: 'right' }}>
            <Button
              size="small"
              icon={<RobotOutlined />}
              onClick={() => setNlOpen(true)}
            >
              Describe in natural language
            </Button>
          </div>
        )}

        {nlReasoning && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="AI-generated draft — review all fields before saving"
            description={nlReasoning}
          />
        )}

        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => handleSubmit(values as Record<string, unknown>)}
          initialValues={{ schedule: '*/15 * * * *', channels: [], notificationsEnabled: false }}
        >
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="High error rate" />
          </Form.Item>

          <Form.Item name="datasourceId" label="Datasource" rules={[{ required: true }]}>
            <Select placeholder="Select a datasource">
              {datasources.map((ds) => (
                <Option key={ds.id} value={ds.id}>{ds.name}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="sql" label="SQL (must return a single numeric value)" rules={[{ required: true }]}>
            <TextArea
              rows={3}
              placeholder="SELECT count(*) AS error_count FROM events WHERE status = 'error'"
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </Form.Item>

          <Form.Item
            name="columnName"
            label="Column to evaluate"
            rules={[{ required: true }]}
            help="Column name from the query result"
          >
            <Input placeholder="error_count" />
          </Form.Item>

          <Space style={{ width: '100%' }} align="start">
            <Form.Item name="condition" label="Condition" rules={[{ required: true }]}>
              <Select style={{ width: 120 }}>
                <Option value="gt">&gt; (greater than)</Option>
                <Option value="lt">&lt; (less than)</Option>
                <Option value="eq">= (equal to)</Option>
                <Option value="gte">&gt;= (at least)</Option>
                <Option value="lte">&lt;= (at most)</Option>
              </Select>
            </Form.Item>
            <Form.Item name="threshold" label="Threshold" rules={[{ required: true }]}>
              <InputNumber style={{ width: 140 }} placeholder="100" />
            </Form.Item>
          </Space>

          <Form.Item
            name="schedule"
            label="Evaluation schedule"
            rules={[{ required: true }]}
            help="Cron expression — only runs when rule is active"
          >
            <Input placeholder="*/15 * * * *" style={{ fontFamily: 'monospace' }} />
          </Form.Item>

          <Form.Item
            name="notificationsEnabled"
            label="Notifications"
            valuePropName="checked"
            help="When enabled and the rule is active, firing alerts create a pending notification for admin review. Still requires manual confirmation to send."
          >
            <Switch checkedChildren="Enabled" unCheckedChildren="Disabled" />
          </Form.Item>

          <Form.List name="channels">
            {(fields, { add, remove }) => (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text strong>Notification Channels</Text>
                  <Button size="small" icon={<PlusOutlined />} onClick={() => add({ type: 'email', target: '' })}>
                    Add Channel
                  </Button>
                </div>
                {fields.map(({ key, name }) => (
                  <Space key={key} align="start" style={{ display: 'flex', marginBottom: 8, flexWrap: 'wrap' }}>
                    <Form.Item name={[name, 'type']} noStyle rules={[{ required: true }]}>
                      <Select style={{ width: 110 }}>
                        <Option value="email">Email</Option>
                        <Option value="slack">Slack</Option>
                        <Option value="webhook">Webhook</Option>
                      </Select>
                    </Form.Item>
                    <Form.Item
                      noStyle
                      shouldUpdate={(prev, curr) =>
                        prev.channels?.[name]?.type !== curr.channels?.[name]?.type
                      }
                    >
                      {({ getFieldValue }) => {
                        const type = getFieldValue(['channels', name, 'type']) ?? 'email';
                        return (
                          <Form.Item name={[name, 'target']} noStyle rules={[{ required: true }]}>
                            <Input style={{ width: 280 }} placeholder={channelPlaceholder(type)} />
                          </Form.Item>
                        );
                      }}
                    </Form.Item>
                    <Tooltip title="When enabled, this channel fires immediately without admin confirmation">
                      <Form.Item name={[name, 'autoApprove']} noStyle valuePropName="checked">
                        <Switch
                          size="small"
                          checkedChildren="Auto"
                          unCheckedChildren="Manual"
                        />
                      </Form.Item>
                    </Tooltip>
                    <MinusCircleOutlined
                      style={{ marginTop: 8, color: '#ff4d4f', cursor: 'pointer' }}
                      onClick={() => remove(name)}
                    />
                  </Space>
                ))}
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>

      {/* NL Rule Generation Modal */}
      <Modal
        title="Generate alert rule from description"
        open={nlOpen}
        onCancel={() => { setNlOpen(false); setNlText(''); }}
        onOk={handleGenerateRule}
        confirmLoading={nlLoading}
        okText="Generate draft"
        width={520}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="AI will generate a draft — all fields are editable before saving"
        />
        <Form layout="vertical">
          <Form.Item label="Datasource (optional — helps AI write accurate SQL)">
            <Select
              allowClear
              placeholder="Select a datasource"
              value={nlDatasourceId}
              onChange={setNlDatasourceId}
            >
              {datasources.map((ds) => (
                <Option key={ds.id} value={ds.id}>{ds.name}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="Describe the alert condition">
            <TextArea
              rows={4}
              value={nlText}
              onChange={(e) => setNlText(e.target.value)}
              placeholder="e.g. Alert me when daily order count drops below 50"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Evaluation History Drawer */}
      <Drawer
        title={historyRule ? `History: ${historyRule.name}` : 'Evaluation History'}
        open={historyRuleId !== null}
        onClose={() => setHistoryRuleId(null)}
        width={680}
        destroyOnClose
      >
        <Table
          dataSource={evalData?.evaluations ?? []}
          columns={evalColumns}
          rowKey="id"
          loading={evalLoading}
          size="small"
          pagination={{ pageSize: 50, showTotal: (t) => `${t} evaluations` }}
        />
      </Drawer>
    </div>
  );
}
