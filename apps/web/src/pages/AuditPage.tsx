import { useState } from 'react';
import {
  Typography,
  Card,
  Table,
  Tag,
  Space,
  DatePicker,
  Select,
  Button,
  Tooltip,
} from 'antd';
import { AuditOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

interface AuditLog {
  id: string;
  userId?: string;
  userName?: string;
  action: string;
  resource: string;
  resourceId?: string;
  resourceName?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface AuditResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

const ACTION_COLORS: Record<string, string> = {
  create: 'green',
  update: 'blue',
  delete: 'red',
  login: 'purple',
  logout: 'default',
  execute: 'cyan',
  share: 'gold',
  export: 'orange',
};

const RESOURCE_LABELS: Record<string, string> = {
  user: 'User',
  dashboard: 'Dashboard',
  query: 'Query',
  datasource: 'Data Source',
  scheduler: 'Scheduler',
};

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<string | undefined>();
  const [resource, setResource] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);

  const { data, isLoading, refetch } = useQuery<AuditResponse>({
    queryKey: ['audit', page, action, resource, dateRange],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (action) params.set('action', action);
      if (resource) params.set('resource', resource);
      if (dateRange) {
        params.set('from', dateRange[0]);
        params.set('to', dateRange[1]);
      }
      const { data } = await api.get(`/audit?${params}`);
      return data.data ?? data;
    },
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;

  const columns = [
    {
      title: 'Time',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (d: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {dayjs(d).format('YYYY-MM-DD HH:mm:ss')}
        </Text>
      ),
    },
    {
      title: 'User',
      dataIndex: 'userName',
      key: 'userName',
      width: 160,
      render: (name: string | undefined, record: AuditLog) => (
        <Text style={{ fontSize: 12 }}>{name ?? record.userId ?? 'System'}</Text>
      ),
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      width: 100,
      render: (act: string) => (
        <Tag color={ACTION_COLORS[act] ?? 'default'} style={{ fontSize: 11 }}>
          {act.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Resource',
      dataIndex: 'resource',
      key: 'resource',
      width: 120,
      render: (res: string) => (
        <Text style={{ fontSize: 12 }}>{RESOURCE_LABELS[res] ?? res}</Text>
      ),
    },
    {
      title: 'Name / ID',
      key: 'resourceName',
      render: (_: unknown, record: AuditLog) => (
        <Text style={{ fontSize: 12 }}>
          {record.resourceName ?? record.resourceId ?? '-'}
        </Text>
      ),
    },
    {
      title: 'Details',
      dataIndex: 'metadata',
      key: 'metadata',
      render: (meta: Record<string, unknown> | undefined) =>
        meta && Object.keys(meta).length > 0 ? (
          <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
            {JSON.stringify(meta).slice(0, 80)}
          </Text>
        ) : null,
    },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Space>
          <AuditOutlined style={{ fontSize: 24, color: '#6366f1' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Audit Log</Title>
            <Text type="secondary">{total} event{total !== 1 ? 's' : ''} recorded</Text>
          </div>
        </Space>
        <Tooltip title="Refresh">
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
        </Tooltip>
      </div>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }} styles={{ body: { padding: '10px 16px' } }}>
        <Space wrap>
          <Select
            placeholder="All actions"
            allowClear
            style={{ width: 140 }}
            value={action}
            onChange={(v) => { setAction(v); setPage(1); }}
          >
            {Object.keys(ACTION_COLORS).map((a) => (
              <Option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</Option>
            ))}
          </Select>
          <Select
            placeholder="All resources"
            allowClear
            style={{ width: 160 }}
            value={resource}
            onChange={(v) => { setResource(v); setPage(1); }}
          >
            {Object.entries(RESOURCE_LABELS).map(([k, v]) => (
              <Option key={k} value={k}>{v}</Option>
            ))}
          </Select>
          <RangePicker
            showTime
            onChange={(_, strs) => {
              setDateRange(strs[0] && strs[1] ? [strs[0], strs[1]] : null);
              setPage(1);
            }}
          />
          <Button
            onClick={() => {
              setAction(undefined);
              setResource(undefined);
              setDateRange(null);
              setPage(1);
            }}
          >
            Clear
          </Button>
        </Space>
      </Card>

      <Card bodyStyle={{ padding: 0 }}>
        <Table
          dataSource={logs}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          size="small"
          pagination={{
            current: page,
            total,
            pageSize: 50,
            onChange: setPage,
            showTotal: (t) => `${t} events`,
          }}
        />
      </Card>
    </div>
  );
}
