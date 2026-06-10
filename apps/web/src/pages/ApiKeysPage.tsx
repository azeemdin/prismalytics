import { useState } from 'react';
import {
  Typography,
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Tag,
  Space,
  Popconfirm,
  message,
  Alert,
} from 'antd';
import { KeyOutlined, PlusOutlined, CopyOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;

interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

const EXPIRY_OPTIONS = [
  { label: 'No expiry', value: 0 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '1 year', value: 365 },
];

export default function ApiKeysPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data: keys = [], isLoading } = useQuery<ApiKeyRecord[]>({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const res = await api.get('/api-keys');
      const payload = res.data?.data ?? res.data;
      return Array.isArray(payload) ? payload : [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: { name: string; expiresInDays: number }) => {
      const res = await api.post('/api-keys', {
        name: values.name,
        expiresInDays: values.expiresInDays || undefined,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setCreateOpen(false);
      form.resetFields();
      setRevealedKey(data.rawKey);
    },
    onError: () => message.error('Failed to create API key'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api-keys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      message.success('API key deleted');
    },
    onError: () => message.error('Failed to delete API key'),
  });

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Key Prefix',
      dataIndex: 'keyPrefix',
      key: 'keyPrefix',
      render: (prefix: string) => (
        <Text code style={{ fontFamily: 'monospace' }}>
          {prefix}...
        </Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'red'}>{active ? 'Active' : 'Revoked'}</Tag>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => dayjs(v).format('MMM D, YYYY'),
    },
    {
      title: 'Last Used',
      dataIndex: 'lastUsedAt',
      key: 'lastUsedAt',
      render: (v: string | null) => (v ? dayjs(v).format('MMM D, YYYY HH:mm') : 'Never'),
    },
    {
      title: 'Expires',
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      render: (v: string | null) => (v ? dayjs(v).format('MMM D, YYYY') : 'Never'),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: ApiKeyRecord) => (
        <Popconfirm
          title="Delete this API key?"
          description="This will permanently remove the key. Any integrations using it will stop working."
          onConfirm={() => deleteMutation.mutate(record.id)}
          okText="Delete"
          okButtonProps={{ danger: true }}
        >
          <Button danger size="small" loading={deleteMutation.isPending}>
            Delete
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <KeyOutlined style={{ marginRight: 8 }} />
            API Keys
          </Title>
          <Text type="secondary">
            Use API keys to access prismalytics programmatically. Keys inherit your account permissions.
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          Create API Key
        </Button>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={keys}
          rowKey="id"
          loading={isLoading}
          pagination={false}
          locale={{ emptyText: 'No API keys yet. Create one to get started.' }}
        />
      </Card>

      {/* Create modal */}
      <Modal
        title="Create API Key"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
        okText="Create"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => createMutation.mutate(values)}
          initialValues={{ expiresInDays: 0 }}
          style={{ marginTop: 16 }}
        >
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Enter a name for this key' }]}>
            <Input placeholder="e.g. Production Dashboard Embed" />
          </Form.Item>
          <Form.Item name="expiresInDays" label="Expiry">
            <Select options={EXPIRY_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Revealed key modal (shown once after creation) */}
      <Modal
        title="API Key Created"
        open={!!revealedKey}
        onCancel={() => setRevealedKey(null)}
        footer={
          <Button type="primary" onClick={() => setRevealedKey(null)}>
            Done
          </Button>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="warning"
            message="Copy this key now it will not be shown again."
            showIcon
          />
          <Input.Password
            value={revealedKey ?? ''}
            readOnly
            visibilityToggle
            style={{ fontFamily: 'monospace' }}
          />
          <Button
            icon={<CopyOutlined />}
            block
            onClick={() => {
              void navigator.clipboard.writeText(revealedKey ?? '');
              message.success('Copied to clipboard');
            }}
          >
            Copy to Clipboard
          </Button>
        </Space>
      </Modal>
    </div>
  );
}
