import { useState } from 'react';
import {
  Typography,
  Card,
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  Popconfirm,
  App,
  Tooltip,
  Badge,
} from 'antd';
import {
  EditOutlined,
  StopOutlined,
  CheckCircleOutlined,
  KeyOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useAuthStore } from '../stores/auth.store';
import type { User } from '../types';

const { Title, Text } = Typography;
const { Option } = Select;

type UserRole = 'admin' | 'editor' | 'viewer';

interface UserListItem extends User {
  isActive: boolean;
  role: UserRole;
  createdAt: string;
}

interface UsersResponse {
  users: UserListItem[];
  total: number;
  page: number;
  limit: number;
}

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'red',
  editor: 'blue',
  viewer: 'default',
};

function useUsers(page: number, limit: number) {
  return useQuery<UsersResponse>({
    queryKey: ['users', page, limit],
    queryFn: async () => {
      const { data } = await api.get(`/users?page=${page}&limit=${limit}`);
      return data.data ?? data;
    },
  });
}

export default function UsersPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === 'admin';

  const [page, setPage] = useState(1);
  const [editUser, setEditUser] = useState<UserListItem | null>(null);
  const [passwordUser, setPasswordUser] = useState<UserListItem | null>(null);
  const [editForm] = Form.useForm();
  const [passwordForm] = Form.useForm();

  const { data, isLoading } = useUsers(page, 20);
  const users = data?.users ?? [];
  const total = data?.total ?? 0;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...values }: { id: string; name?: string; role?: UserRole }) =>
      api.patch(`/users/${id}`, values),
    onSuccess: () => {
      message.success('User updated');
      setEditUser(null);
      invalidate();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? (err as Error).message;
      message.error(msg);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => { message.success('User deactivated'); invalidate(); },
    onError: () => message.error('Failed to deactivate user'),
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/reactivate`),
    onSuccess: () => { message.success('User reactivated'); invalidate(); },
    onError: () => message.error('Failed to reactivate user'),
  });

  const passwordMutation = useMutation({
    mutationFn: ({ id, currentPassword, newPassword }: { id: string; currentPassword: string; newPassword: string }) =>
      api.patch(`/users/${id}/password`, { currentPassword, newPassword }),
    onSuccess: () => {
      message.success('Password changed');
      setPasswordUser(null);
      passwordForm.resetFields();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? (err as Error).message;
      message.error(msg);
    },
  });

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: UserListItem) => (
        <Space>
          <Text strong>{name}</Text>
          {record.id === currentUser?.id && (
            <Tag color="purple" style={{ fontSize: 10 }}>you</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      render: (email: string) => <Text type="secondary">{email}</Text>,
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role: UserRole) => (
        <Tag color={ROLE_COLORS[role]}>{role.toUpperCase()}</Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (isActive: boolean) =>
        isActive
          ? <Badge status="success" text="Active" />
          : <Badge status="default" text="Inactive" />,
    },
    {
      title: 'Joined',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (d: string) => new Date(d).toLocaleDateString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: UserListItem) => {
        const isSelf = record.id === currentUser?.id;
        return (
          <Space size={4}>
            {(isAdmin || isSelf) && (
              <Tooltip title="Edit">
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setEditUser(record);
                    editForm.setFieldsValue({ name: record.name, role: record.role });
                  }}
                />
              </Tooltip>
            )}
            <Tooltip title="Change password">
              <Button
                size="small"
                icon={<KeyOutlined />}
                onClick={() => {
                  setPasswordUser(record);
                  passwordForm.resetFields();
                }}
                disabled={!isAdmin && !isSelf}
              />
            </Tooltip>
            {isAdmin && !isSelf && (
              record.isActive ? (
                <Popconfirm
                  title="Remove this team member?"
                  description="They will lose access immediately. You can restore them later."
                  onConfirm={() => deactivateMutation.mutate(record.id)}
                  okText="Remove"
                  okButtonProps={{ danger: true }}
                >
                  <Tooltip title="Remove from team">
                    <Button size="small" icon={<StopOutlined />} danger />
                  </Tooltip>
                </Popconfirm>
              ) : (
                <Tooltip title="Restore to team">
                  <Button
                    size="small"
                    icon={<CheckCircleOutlined />}
                    style={{ color: '#22c55e', borderColor: '#22c55e' }}
                    onClick={() => reactivateMutation.mutate(record.id)}
                  />
                </Tooltip>
              )
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Space>
          <TeamOutlined style={{ fontSize: 24, color: '#6366f1' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Team Members</Title>
            <Text type="secondary">{total} user{total !== 1 ? 's' : ''} in your workspace</Text>
          </div>
        </Space>
      </div>

      <Card bodyStyle={{ padding: 0 }}>
        <Table
          dataSource={users}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{
            current: page,
            total,
            pageSize: 20,
            onChange: setPage,
            showTotal: (t) => `${t} users`,
          }}
          rowClassName={(record) => !record.isActive ? 'ant-table-row-disabled' : ''}
        />
      </Card>

      {/* Edit user modal */}
      <Modal
        title="Edit User"
        open={!!editUser}
        onCancel={() => setEditUser(null)}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={(v) => updateMutation.mutate({ id: editUser!.id, ...v })}
          style={{ marginTop: 16 }}
        >
          <Form.Item name="name" label="Full name" rules={[{ required: true, min: 2 }]}>
            <Input />
          </Form.Item>
          {isAdmin && editUser?.id !== currentUser?.id && (
            <Form.Item name="role" label="Role" rules={[{ required: true }]}>
              <Select>
                <Option value="admin">Admin</Option>
                <Option value="editor">Editor</Option>
                <Option value="viewer">Viewer</Option>
              </Select>
            </Form.Item>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setEditUser(null)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={updateMutation.isPending}>Save</Button>
          </div>
        </Form>
      </Modal>

      {/* Change password modal */}
      <Modal
        title="Change Password"
        open={!!passwordUser}
        onCancel={() => { setPasswordUser(null); passwordForm.resetFields(); }}
        footer={null}
        destroyOnHidden
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          Changing password for <Text strong>{passwordUser?.name}</Text>
        </Text>
        <Form
          form={passwordForm}
          layout="vertical"
          onFinish={(v) => passwordMutation.mutate({ id: passwordUser!.id, ...v })}
        >
          <Form.Item
            name="currentPassword"
            label="Current password"
            rules={[{ required: true }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="New password"
            rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="Confirm new password"
            dependencies={['newPassword']}
            rules={[
              { required: true },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                  return Promise.reject(new Error('Passwords do not match'));
                },
              }),
            ]}
          >
            <Input.Password />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => { setPasswordUser(null); passwordForm.resetFields(); }}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={passwordMutation.isPending}>Change Password</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
