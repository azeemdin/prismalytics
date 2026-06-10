import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Spin, Typography, Alert } from 'antd';
import { useState } from 'react';
import { useAuthStore } from '../stores/auth.store';

const { Text } = Typography;

export default function KeycloakCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const exchangeKeycloak = useAuthStore((s) => s.exchangeKeycloak);
  const [error, setError] = useState<string | null>(null);
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError(`Keycloak error: ${searchParams.get('error_description') ?? errorParam}`);
      return;
    }

    if (!code || !state) {
      setError('Missing authorization code or state parameter.');
      return;
    }

    exchangeKeycloak(code, state)
      .then(() => navigate('/dashboards', { replace: true }))
      .catch((err: unknown) => {
        const msg =
          (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
            ?.error?.message ?? 'Authentication failed. Please try again.';
        setError(msg);
      });
  }, [searchParams, navigate, exchangeKeycloak]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        background: '#111827',
      }}
    >
      {error ? (
        <div style={{ maxWidth: 400, width: '100%', padding: '0 24px' }}>
          <Alert
            type="error"
            message="Sign-in failed"
            description={error}
            showIcon
            action={
              <Text
                style={{ color: '#6366f1', cursor: 'pointer' }}
                onClick={() => navigate('/login', { replace: true })}
              >
                Back to login
              </Text>
            }
          />
        </div>
      ) : (
        <>
          <Spin size="large" />
          <Text style={{ color: '#94a3b8' }}>Completing sign-in...</Text>
        </>
      )}
    </div>
  );
}
