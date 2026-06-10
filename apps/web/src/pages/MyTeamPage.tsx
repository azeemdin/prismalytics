import { useState } from 'react';
import {
  Card, Table, Button, Select, Avatar, Typography, Space, App, Popconfirm, Tag, Empty,
} from 'antd';
import { UserAddOutlined, DeleteOutlined, UserOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import type { TeamMember, User } from '../types';

const { Text } = Typography;
const { Option } = Select;

export default function MyTeamPage() {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>();

  const { data: members = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ['team-members'],
    queryFn: async () => {
      const { data } = await api.get('/team/members');
      const payload = data.data ?? data;
      return Array.isArray(payload) ? payload : [];
    },
  });

  const { data: available = [], isFetching: availableFetching } = useQuery<User[]>({
    queryKey: ['team-available'],
    queryFn: async () => {
      const { data } = await api.get('/team/available');
      const payload = data.data ?? data;
      return Array.isArray(payload) ? payload : [];
    },
  });

  const addMutation = useMutation({
    mutationFn: (userId: string) => api.post('/team/members', { userId }),
    onSuccess: () => {
      setSelectedUserId(undefined);
      void qc.invalidateQueries({ queryKey: ['team-members'] });
      void qc.invalidateQueries({ queryKey: ['team-available'] });
      void message.success('Member added');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to add member';
      void message.error(msg);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => api.delete(`/team/members/${memberId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['team-members'] });
      void qc.invalidateQueries({ queryKey: ['team-available'] });
      void message.success('Member removed');
    },
    onError: () => void message.error('Failed to remove member'),
  });

  const columns = [
    {
      title: 'Member',
      key: 'member',
      render: (_: unknown, row: TeamMember) => (
        <Space>
          <Avatar size={32} icon={<UserOutlined />} style={{ backgroundColor: '#6366f1' }} />
          <div>
            <Text strong style={{ display: 'block' }}>{row.member.name}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{row.member.email}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Role',
      key: 'role',
      render: (_: unknown, row: TeamMember) => (
        <Tag color={row.member.role === 'admin' ? 'red' : row.member.role === 'editor' ? 'blue' : 'default'}>
          {row.member.role}
        </Tag>
      ),
    },
    {
      title: 'Added',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => new Date(v).toLocaleDateString(),
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_: unknown, row: TeamMember) => (
        <Popconfirm
          title="Remove this member from your team?"
          onConfirm={() => removeMutation.mutate(row.memberId)}
          okText="Remove"
          okButtonProps={{ danger: true }}
        >
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            loading={removeMutation.isPending}
          />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <Text style={{ fontSize: 20, fontWeight: 600, display: 'block' }}>My Team</Text>
        <Text type="secondary">
          Manage your personal team. Dashboards shared with your team (visibility: Team) are visible to all members listed here.
        </Text>
      </div>

      <Card
        style={{ marginBottom: 16 }}
        styles={{ body: { padding: '16px 20px' } }}
      >
        <Space style={{ width: '100%' }}>
          <Select
            placeholder="Search and select a user to add..."
            showSearch
            allowClear
            style={{ width: 380 }}
            value={selectedUserId}
            onChange={setSelectedUserId}
            loading={availableFetching}
            filterOption={(input, option) =>
              String(option?.children ?? '').toLowerCase().includes(input.toLowerCase())
            }
            notFoundContent={availableFetching ? 'Loading...' : 'No users available'}
          >
            {available.map((u) => (
              <Option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </Option>
            ))}
          </Select>
          <Button
            type="primary"
            icon={<UserAddOutlined />}
            disabled={!selectedUserId}
            loading={addMutation.isPending}
            onClick={() => selectedUserId && addMutation.mutate(selectedUserId)}
          >
            Add to team
          </Button>
        </Space>
      </Card>

      <Card>
        <Table<TeamMember>
          dataSource={members}
          columns={columns}
          rowKey="memberId"
          loading={isLoading}
          pagination={false}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No team members yet. Add users above to share your team-visibility dashboards with them."
              />
            ),
          }}
        />
      </Card>
    </div>
  );
}
