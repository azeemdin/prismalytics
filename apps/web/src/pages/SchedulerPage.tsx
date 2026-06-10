import { useState } from 'react';
import {
  Typography,
  Card,
  Button,
  Table,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Popconfirm,
  Badge,
  Tooltip,
  App,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useAuthStore } from '../stores/auth.store';
import type { ScheduledJob, SavedQuery } from '../types';

const { Title, Text } = Typography;
const { Option } = Select;

function useScheduledJobs() {
  return useQuery<ScheduledJob[]>({
    queryKey: ['scheduled-jobs'],
    queryFn: async () => {
      const { data } = await api.get('/scheduler/jobs');
      const payload = data.data ?? data;
      return Array.isArray(payload) ? payload : [];
    },
  });
}

function useSavedQueries() {
  return useQuery<{ queries: SavedQuery[] }>({
    queryKey: ['saved-queries'],
    queryFn: async () => {
      const { data } = await api.get('/queries?limit=100');
      return data.data ?? data;
    },
  });
}

export default function SchedulerPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: jobs = [], isLoading } = useScheduledJobs();
  const isViewer = useAuthStore((s) => s.user?.role === 'viewer');
  const { data: savedQueriesData } = useSavedQueries();
  const savedQueries = savedQueriesData?.queries ?? [];

  const [showForm, setShowForm] = useState(false);
  const [editingJob, setEditingJob] = useState<ScheduledJob | undefined>();
  const [form] = Form.useForm();

  const createMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => api.post('/scheduler/jobs', values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scheduled-jobs'] });
      message.success('Job created');
      setShowForm(false);
      setEditingJob(undefined);
      form.resetFields();
    },
    onError: () => message.error('Failed to create job'),
  });

  const updateMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api.patch(`/scheduler/jobs/${editingJob?.id}`, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scheduled-jobs'] });
      message.success('Job updated');
      setShowForm(false);
      setEditingJob(undefined);
      form.resetFields();
    },
    onError: () => message.error('Failed to update job'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/scheduler/jobs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scheduled-jobs'] });
      message.success('Job deleted');
    },
  });

  const runNowMutation = useMutation({
    mutationFn: (id: string) => api.post(`/scheduler/jobs/${id}/run`),
    onSuccess: () => message.success('Job queued for immediate execution'),
    onError: () => message.error('Failed to trigger job'),
  });

  const openEdit = (job: ScheduledJob) => {
    setEditingJob(job);
    form.setFieldsValue({
      name: job.name,
      description: job.description ?? '',
      cronExpression: job.cronExpression,
      queryId: job.queryId,
      recipients: job.recipients.join(', '),
      enabled: job.enabled,
    });
    setShowForm(true);
  };

  const handleSubmit = (values: Record<string, unknown>) => {
    const payload = {
      ...values,
      recipients: String(values['recipients'] ?? '').split(',').map((e: string) => e.trim()).filter(Boolean),
    };
    if (editingJob) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      render: (name: string, row: ScheduledJob) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          {row.description && <Text type="secondary" style={{ fontSize: 12 }}>{row.description}</Text>}
        </Space>
      ),
    },
    {
      title: 'Schedule',
      dataIndex: 'cronExpression',
      render: (cron: string) => <Text code style={{ fontSize: 12 }}>{cron}</Text>,
    },
    {
      title: 'Status',
      render: (_: unknown, row: ScheduledJob) => (
        <Badge
          status={row.enabled ? 'success' : 'default'}
          text={row.enabled ? 'Active' : 'Paused'}
        />
      ),
    },
    {
      title: 'Last run',
      render: (_: unknown, row: ScheduledJob) => (
        <Space direction="vertical" size={0}>
          {row.lastRunAt ? (
            <>
              <Space size={4}>
                {row.lastRunStatus === 'success'
                  ? <CheckCircleOutlined style={{ color: '#22c55e' }} />
                  : row.lastRunStatus === 'failure'
                    ? <CloseCircleOutlined style={{ color: '#ef4444' }} />
                    : null
                }
                <Text style={{ fontSize: 12 }}>{new Date(row.lastRunAt).toLocaleString()}</Text>
              </Space>
              {row.lastRunStatus === 'failure' && row.lastError && (
                <Text type="danger" style={{ fontSize: 11 }}>{row.lastError.slice(0, 80)}</Text>
              )}
            </>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>Never</Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Recipients',
      render: (_: unknown, row: ScheduledJob) => (
        <Text type="secondary" style={{ fontSize: 12 }}>{row.recipients.join(', ') || '-'}</Text>
      ),
    },
    {
      title: 'Actions',
      render: (_: unknown, row: ScheduledJob) => (
        <Space>
          {!isViewer && (
            <>
              <Tooltip title="Run now">
                <Button
                  size="small"
                  icon={<PlayCircleOutlined />}
                  loading={runNowMutation.isPending}
                  onClick={() => runNowMutation.mutate(row.id)}
                />
              </Tooltip>
              <Tooltip title="Edit">
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
              </Tooltip>
              <Popconfirm
                title="Delete this scheduled job?"
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
          <Title level={3} style={{ margin: 0 }}>Scheduler</Title>
          <Text type="secondary">Automate queries and send email reports on a schedule</Text>
        </div>
        {!isViewer && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="large"
            onClick={() => { setEditingJob(undefined); form.resetFields(); setShowForm(true); }}
          >
            New Job
          </Button>
        )}
      </div>

      <Card>
        <Table
          dataSource={jobs}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <ClockCircleOutlined style={{ fontSize: 36, color: '#4a5568', marginBottom: 12, display: 'block' }} />
              <Text type="secondary">No scheduled jobs yet. Create one to automate your reports.</Text>
            </div>
          ) }}
        />
      </Card>

      <Modal
        title={editingJob ? 'Edit Scheduled Job' : 'New Scheduled Job'}
        open={showForm}
        onCancel={() => { setShowForm(false); setEditingJob(undefined); form.resetFields(); }}
        footer={null}
        width={560}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ enabled: true }}>
          <Form.Item name="name" label="Job name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Daily Revenue Report" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input placeholder="Optional description" />
          </Form.Item>
          <Form.Item
            name="cronExpression"
            label="Cron expression"
            rules={[{ required: true }]}
            extra="Examples: 0 8 * * 1-5 (Mon-Fri 8am), 0 * * * * (every hour)"
          >
            <Input placeholder="0 8 * * 1-5" />
          </Form.Item>
          <Form.Item name="queryId" label="Saved query" rules={[{ required: true }]}>
            <Select placeholder="Select a saved query" showSearch optionFilterProp="children">
              {savedQueries.map((q) => (
                <Option key={q.id} value={q.id}>{q.name}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="recipients"
            label="Recipients (comma-separated emails)"
            rules={[{ required: true }]}
          >
            <Input.TextArea placeholder="user@example.com, manager@example.com" rows={2} />
          </Form.Item>
          <Form.Item name="enabled" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => { setShowForm(false); setEditingJob(undefined); form.resetFields(); }}>Cancel</Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={createMutation.isPending || updateMutation.isPending}
            >
              {editingJob ? 'Update' : 'Create'} Job
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
