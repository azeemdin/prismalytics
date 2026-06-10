import '@ant-design/v5-patch-for-react-19';
import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, theme, App as AntApp } from 'antd';
import App from './App';
import { useThemeStore, DEFAULT_ACCENT } from './stores/theme.store';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

const DARK_TOKENS = {
  algorithm: theme.darkAlgorithm,
  token: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    colorPrimary: '#6366f1',
    colorSuccess: '#22c55e',
    colorWarning: '#f59e0b',
    colorError: '#ef4444',
    colorInfo: '#3b82f6',
    borderRadius: 8,
    colorBgContainer: '#1a1b2e',
    colorBgElevated: '#1e1f36',
    colorBgLayout: '#111827',
    colorBorder: '#2d2e4a',
    colorText: '#e2e8f0',
    colorTextSecondary: '#94a3b8',
    fontSize: 14,
  },
  components: {
    Layout: { siderBg: '#111827', headerBg: '#1a1b2e', bodyBg: '#111827' },
    Menu: { darkItemBg: '#111827', darkItemSelectedBg: '#6366f120', darkItemHoverBg: '#1e1f36' },
    Card: { colorBgContainer: '#1a1b2e' },
    Table: { colorBgContainer: '#1a1b2e', headerBg: '#1e1f36' },
  },
};

const LIGHT_TOKENS = {
  algorithm: theme.defaultAlgorithm,
  token: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    colorPrimary: '#6366f1',
    colorSuccess: '#22c55e',
    colorWarning: '#f59e0b',
    colorError: '#ef4444',
    colorInfo: '#3b82f6',
    borderRadius: 8,
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgLayout: '#f1f5f9',
    colorBorder: '#e2e8f0',
    colorText: '#1e293b',
    colorTextSecondary: '#64748b',
    fontSize: 14,
  },
  components: {
    Layout: { siderBg: '#ffffff', headerBg: '#ffffff', bodyBg: '#f1f5f9' },
    Menu: { itemBg: '#ffffff', itemSelectedBg: 'rgba(99,102,241,0.1)', itemSelectedColor: '#6366f1', itemHoverBg: '#f1f5f9' },
    Card: { colorBgContainer: '#ffffff' },
    Table: { colorBgContainer: '#ffffff', headerBg: '#f8fafc' },
  },
};

function ThemedApp() {
  const mode = useThemeStore((s) => s.mode);
  const accentColor = useThemeStore((s) => s.accentColor);

  useEffect(() => {
    document.body.setAttribute('data-theme', mode);
  }, [mode]);

  useEffect(() => {
    document.body.style.setProperty('--color-accent', accentColor);
    // Derive a lighter hover variant (10% lighter in hex is approximated here)
    document.body.style.setProperty('--color-accent-hover', accentColor);
  }, [accentColor]);

  const base = mode === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
  const tokens = accentColor === DEFAULT_ACCENT ? base : {
    ...base,
    token: { ...base.token, colorPrimary: accentColor },
  };

  return (
    <ConfigProvider theme={tokens}>
      <AntApp>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemedApp />
    </QueryClientProvider>
  </React.StrictMode>,
);
