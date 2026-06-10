import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, Alert, Divider } from 'antd';
import { UserOutlined, LockOutlined, BarChartOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { useAuthStore } from '../stores/auth.store';

const { Title, Text } = Typography;

interface LoginForm {
  email: string;
  password: string;
}

function useKeycloakUrl() {
  return useQuery<string | null>({
    queryKey: ['keycloak-url'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/auth/keycloak/url');
        const payload = data.data ?? data;
        return payload.url as string;
      } catch {
        return null;
      }
    },
    staleTime: Infinity,
    retry: false,
  });
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const { data: keycloakUrl } = useKeycloakUrl();

  const handleSubmit = async (values: LoginForm) => {
    setError(null);
    try {
      await login(values.email, values.password);
      navigate('/dashboards', { replace: true });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(msg ?? 'Login failed. Check your credentials.');
    }
  };

  const handleKeycloakLogin = () => {
    if (keycloakUrl) window.location.href = keycloakUrl;
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
      <div style={{ width: '100%', maxWidth: 400 }}>
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
          <Title level={4} style={{ marginBottom: 24, color: '#e2e8f0' }}>
            Sign in to your account
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

          {keycloakUrl && (
            <>
              <Button
                block
                size="large"
                icon={<SafetyCertificateOutlined />}
                onClick={handleKeycloakLogin}
                style={{
                  height: 44,
                  marginBottom: 8,
                  background: '#1f4091',
                  borderColor: '#3b5bcc',
                  color: '#fff',
                }}
              >
                Sign in with Keycloak (SSO)
              </Button>
              <Divider style={{ borderColor: '#2d2e4a', color: '#94a3b8', margin: '16px 0' }}>
                <Text style={{ color: '#94a3b8', fontSize: 12 }}>or use email</Text>
              </Divider>
            </>
          )}

          <Form layout="vertical" onFinish={handleSubmit} size="large">
            <Form.Item
              name="email"
              rules={[
                { required: true, message: 'Email is required' },
                { type: 'email', message: 'Enter a valid email' },
              ]}
            >
              <Input prefix={<UserOutlined />} placeholder="Email address" autoComplete="email" />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: 'Password is required' }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="Password"
                autoComplete="current-password"
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={isLoading}
                block
                style={{ height: 44 }}
              >
                Sign in
              </Button>
            </Form.Item>
          </Form>

          <Divider style={{ borderColor: '#2d2e4a', color: '#94a3b8' }}>
            <Text style={{ color: '#94a3b8', fontSize: 12 }}>New to prismalytics?</Text>
          </Divider>

          <Link to="/register">
            <Button block style={{ borderColor: '#2d2e4a', color: '#94a3b8' }}>
              Create an account
            </Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}
