import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, Alert, Divider, Spin } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, BarChartOutlined } from '@ant-design/icons';
import { useAuthStore } from '../stores/auth.store';
import api from '../services/api';

const { Title, Text } = Typography;

interface RegisterForm {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register, isLoading } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [regEnabled, setRegEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    api.get('/auth/registration-enabled')
      .then(({ data }) => {
        const payload = data.data ?? data;
        setRegEnabled(payload.enabled !== false);
      })
      .catch(() => setRegEnabled(true)); // fail open
  }, []);

  const handleSubmit = async (values: RegisterForm) => {
    setError(null);
    try {
      await register(values.name, values.email, values.password);
      navigate('/dashboards', { replace: true });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg ?? 'Registration failed. Please try again.');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#111827',
        padding: '24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <BarChartOutlined style={{ fontSize: 40, color: '#6366f1' }} />
          <Title level={2} style={{ margin: '12px 0 4px', color: '#e2e8f0' }}>
            prismalytics
          </Title>
          <Text style={{ color: '#94a3b8' }}>Business Intelligence Platform</Text>
        </div>

        <Card
          style={{ background: '#1a1b2e', border: '1px solid #2d2e4a', borderRadius: 12 }}
          styles={{ body: { padding: 32 } }}
        >
          {regEnabled === null ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <Spin />
            </div>
          ) : !regEnabled ? (
            <>
              <Alert
                type="warning"
                showIcon
                message="Registration is disabled"
                description="New user registration has been disabled by an administrator. Please contact your administrator for access."
                style={{ marginBottom: 24 }}
              />
              <Link to="/login">
                <Button block style={{ borderColor: '#2d2e4a', color: '#94a3b8' }}>
                  Back to sign in
                </Button>
              </Link>
            </>
          ) : (
            <>
          <Title level={4} style={{ marginBottom: 24, color: '#e2e8f0' }}>
            Create your account
          </Title>

          {error && (
            <Alert
              message={error}
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              closable
              onClose={() => setError(null)}
            />
          )}

          <Form layout="vertical" onFinish={handleSubmit} size="large">
            <Form.Item
              name="name"
              rules={[
                { required: true, message: 'Full name is required' },
                { min: 2, message: 'Name must be at least 2 characters' },
              ]}
            >
              <Input prefix={<UserOutlined />} placeholder="Full name" />
            </Form.Item>

            <Form.Item
              name="email"
              rules={[
                { required: true, message: 'Email is required' },
                { type: 'email', message: 'Enter a valid email' },
              ]}
            >
              <Input prefix={<MailOutlined />} placeholder="Email address" autoComplete="email" />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                { required: true, message: 'Password is required' },
                { min: 8, message: 'Password must be at least 8 characters' },
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="Password (min 8 chars)" />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              dependencies={['password']}
              rules={[
                { required: true, message: 'Please confirm your password' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) return Promise.resolve();
                    return Promise.reject(new Error('Passwords do not match'));
                  },
                }),
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="Confirm password" />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={isLoading}
                block
                style={{ height: 44 }}
              >
                Create account
              </Button>
            </Form.Item>
          </Form>

          <Divider style={{ borderColor: '#2d2e4a' }}>
            <Text style={{ color: '#94a3b8', fontSize: 12 }}>Already have an account?</Text>
          </Divider>

          <Link to="/login">
            <Button block style={{ borderColor: '#2d2e4a', color: '#94a3b8' }}>
              Sign in
            </Button>
          </Link>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
