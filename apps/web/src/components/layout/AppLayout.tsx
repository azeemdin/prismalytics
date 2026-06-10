import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Layout, Menu, Typography, Avatar, Space, Badge, Tooltip, Dropdown,
  AutoComplete, Input, Drawer, Button, Spin, App, Popconfirm, Divider, Empty, Tag, Select,
} from 'antd';
import {
  DashboardOutlined,
  CodeOutlined,
  DatabaseOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BellOutlined,
  RobotOutlined,
  UserOutlined,
  LogoutOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  AuditOutlined,
  KeyOutlined,
  SearchOutlined,
  SendOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SunOutlined,
  MoonOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/auth.store';
import { useThemeStore } from '../../stores/theme.store';
import api from '../../services/api';
import type { Datasource } from '../../types';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;
const { Option } = Select;

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface SearchOption {
  label: React.ReactNode;
  value: string;
  type: 'query' | 'dashboard';
  id: string;
}

interface PendingNotification {
  id: string;
  name: string;
  detectedValue?: number;
  threshold: number;
  condition: string;
  channels: { type: string; target: string }[];
  createdAt: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// â”€â”€â”€ Menu items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type MenuItemDef =
  | { key: string; icon?: React.ReactNode; label: string; roles: string[]; type?: never; children?: MenuItemDef[] }
  | { type: 'divider'; roles: string[]; key?: never; icon?: never; label?: never; children?: never };

const ALL_MENU_ITEMS: MenuItemDef[] = [
  { key: '/dashboards', icon: <DashboardOutlined />, label: 'Dashboards', roles: ['admin', 'editor', 'viewer'] },
  { key: '/chart-library', icon: <PictureOutlined />, label: 'Chart Library', roles: ['admin', 'editor'] },
  { key: '/queries', icon: <CodeOutlined />, label: 'SQL Editor', roles: ['admin', 'editor'] },
  { key: '/datasources', icon: <DatabaseOutlined />, label: 'Data Sources', roles: ['admin', 'editor'] },
  { key: '/scheduler', icon: <ClockCircleOutlined />, label: 'Scheduler', roles: ['admin', 'editor'] },
  { key: '/alerts', icon: <BellOutlined />, label: 'Alerts', roles: ['admin', 'editor'] },
  { key: '/my-team', icon: <TeamOutlined />, label: 'My Team', roles: ['admin', 'editor'] },
  { key: '/audit', icon: <AuditOutlined />, label: 'Audit Log', roles: ['admin'] },
  { type: 'divider', roles: ['admin'] },
  { key: '/api-keys', icon: <KeyOutlined />, label: 'API Keys', roles: ['admin'] },
  { key: '/settings', icon: <SettingOutlined />, label: 'Settings', roles: ['admin'] },
];

function filterMenuItems(items: MenuItemDef[], role: string): MenuItemDef[] {
  return items
    .filter((item) => item.roles.includes(role))
    .map((item) => {
      if ('children' in item && item.children) {
        const filtered = filterMenuItems(item.children, role);
        return { ...item, children: filtered };
      }
      return item;
    });
}

const CONDITION_LABEL: Record<string, string> = { gt: '>', lt: '<', eq: '=', gte: '>=', lte: '<=' };

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'admin';
  const isViewer = user?.role === 'viewer';
  const aiEnabled = !isViewer && (isAdmin || user?.aiEnabled !== false);
  const { mode: themeMode, toggle: toggleTheme, setAccentColor } = useThemeStore();

  // â”€â”€â”€ Tenant branding â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const { data: tenant } = useQuery<{ name: string; branding?: { logoUrl?: string; logoText?: string; faviconUrl?: string; primaryColor?: string } }>({
    queryKey: ['tenant-current'],
    queryFn: async () => {
      const { data } = await api.get('/tenants/current');
      return data.data ?? data;
    },
    staleTime: 5 * 60_000,
  });

  const logoUrl = tenant?.branding?.logoUrl;
  const logoText = tenant?.branding?.logoText;
  const faviconUrl = tenant?.branding?.faviconUrl;
  const tenantName = logoText || tenant?.name || 'prismalytics';

  // Apply tenant accent color to ConfigProvider + CSS variables
  useEffect(() => {
    setAccentColor(tenant?.branding?.primaryColor);
  }, [tenant?.branding?.primaryColor, setAccentColor]);

  // Update document favicon dynamically when branding changes
  useEffect(() => {
    if (!faviconUrl) return;
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = faviconUrl;
  }, [faviconUrl]);

  // Update document title with tenant name
  useEffect(() => {
    document.title = tenantName === 'prismalytics' ? 'prismalytics' : `${tenantName} prismalytics`;
  }, [tenantName]);

  const sidebarLogo = useMemo(() => {
    if (logoUrl) {
      const imgEl = collapsed
        ? <img src={logoUrl} alt={tenantName} style={{ height: 32, width: 32, objectFit: 'contain', flexShrink: 0 }} />
        : <img src={logoUrl} alt={tenantName} style={{ height: 36, maxWidth: logoText ? 120 : 180, objectFit: 'contain', flexShrink: 0 }} />;

      if (!collapsed && logoText) {
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
            {imgEl}
            <Text
              strong
              style={{ fontSize: 16, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              className="gradient-text"
            >
              {logoText}
            </Text>
          </div>
        );
      }
      return imgEl;
    }
    return (
      <>
        <RobotOutlined style={{ fontSize: 24, color: '#6366f1', minWidth: 24 }} />
        {!collapsed && (
          <Text strong style={{ marginLeft: 12, fontSize: 18, letterSpacing: '-0.02em' }} className="gradient-text">
            {tenantName}
          </Text>
        )}
      </>
    );
  }, [logoUrl, logoText, tenantName, collapsed]);

  // â”€â”€â”€ Search â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [searchOptions, setSearchOptions] = useState<SearchOption[]>([]);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((value: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!value || value.trim().length < 2) { setSearchOptions([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/search?q=${encodeURIComponent(value)}`);
        const payload = data.data ?? data;
        const opts: SearchOption[] = [];
        for (const q of (payload.queries ?? []) as { id: string; name: string }[]) {
          opts.push({ label: <span><CodeOutlined style={{ marginRight: 6, color: '#6366f1' }} />{q.name}</span>, value: q.name, type: 'query', id: q.id });
        }
        for (const d of (payload.dashboards ?? []) as { id: string; name: string }[]) {
          opts.push({ label: <span><DashboardOutlined style={{ marginRight: 6, color: '#10b981' }} />{d.name}</span>, value: d.name, type: 'dashboard', id: d.id });
        }
        setSearchOptions(opts);
      } catch { /* silent */ }
    }, 300);
  }, []);

  const handleSelect = useCallback((_value: string, option: SearchOption) => {
    setSearchOptions([]);
    if (option.type === 'dashboard') navigate(`/dashboards/${option.id}`);
    else navigate('/queries', { state: { selectedQueryId: option.id } });
  }, [navigate]);

  // â”€â”€â”€ Notification bell â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [bellOpen, setBellOpen] = useState(false);

  const { data: pendingNotifs = [] } = useQuery<PendingNotification[]>({
    queryKey: ['pending-notifications'],
    queryFn: async () => {
      const { data } = await api.get('/alerts/notifications/pending?limit=10');
      const payload = data.data ?? data;
      return Array.isArray(payload.notifications) ? payload.notifications : (Array.isArray(payload) ? payload : []);
    },
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const sendNotifMutation = useMutation({
    mutationFn: (id: string) => api.post(`/alerts/notifications/${id}/send`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pending-notifications'] });
      void message.success('Notification sent');
    },
    onError: () => void message.error('Failed to send notification'),
  });

  const dismissNotifMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/alerts/notifications/${id}/dismiss`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pending-notifications'] });
    },
    onError: () => void message.error('Failed to dismiss notification'),
  });

  // â”€â”€â”€ AI Chat drawer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatDatasourceId, setChatDatasourceId] = useState<string | undefined>();
  const [chatSchemaFilter, setChatSchemaFilter] = useState<string | undefined>();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: datasources = [] } = useQuery<Datasource[]>({
    queryKey: ['datasources-list'],
    queryFn: async () => {
      const { data } = await api.get('/datasources');
      const payload = data.data ?? data;
      return Array.isArray(payload) ? payload : (payload.datasources ?? []);
    },
    enabled: chatOpen,
  });

  // Fetch schema for the selected datasource to extract schema/database names
  const { data: dsSchemaInfo, isFetching: schemaFetching } = useQuery<{ tables: { schema?: string; name: string }[] }>({
    queryKey: ['chat-ds-schema', chatDatasourceId],
    queryFn: async () => {
      const { data } = await api.get(`/datasources/${chatDatasourceId}/schema`);
      return data.data ?? data;
    },
    enabled: !!chatDatasourceId && chatOpen,
    staleTime: 5 * 60_000,
  });

  // Unique schema names from the fetched schema
  const availableSchemas = dsSchemaInfo
    ? [...new Set(dsSchemaInfo.tables.map((t) => t.schema ?? 'public').filter(Boolean))].sort()
    : [];

  // Reset schema filter when datasource changes
  const handleDatasourceChange = useCallback((val: string | undefined) => {
    setChatDatasourceId(val);
    setChatSchemaFilter(undefined);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  const sendChatMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    const userMsg: ChatMessage = { role: 'user', content: text };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);
    try {
      const { data } = await api.post('/ai/chat', {
        messages: [...chatMessages, userMsg].map((m) => ({ role: m.role, content: m.content })),
        datasourceId: chatDatasourceId,
        schemaFilter: chatSchemaFilter,
      });
      const payload = data.data ?? data;
      setChatMessages((prev) => [...prev, { role: 'assistant', content: (payload.reply as string) ?? '' }]);
    } catch (err) {
      void message.error((err as Error).message ?? 'AI request failed');
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, chatMessages, chatDatasourceId, chatSchemaFilter, message]);

  // â”€â”€â”€ User menu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const menuItems = filterMenuItems(ALL_MENU_ITEMS, user?.role ?? '');

  const userMenuItems = [
    { key: 'profile', icon: <UserOutlined />, label: user?.name ?? 'Profile' },
    { key: 'team', icon: <TeamOutlined />, label: 'My Team', onClick: () => navigate('/my-team') },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Sign out',
      danger: true,
      onClick: async () => {
        const keycloakLogoutUrl = await logout();
        if (keycloakLogoutUrl) {
          window.location.href = keycloakLogoutUrl;
        } else {
          navigate('/login');
        }
      },
    },
  ];

  // â”€â”€â”€ Notification dropdown content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const notifDropdown = {
    open: bellOpen,
    onOpenChange: (open: boolean) => setBellOpen(open),
    trigger: ['click'] as ['click'],
    dropdownRender: () => (
      <div
        style={{
          width: 360,
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text strong>Pending Notifications</Text>
          <Button type="link" size="small" onClick={() => { setBellOpen(false); navigate('/alerts'); }}>
            See all alerts
          </Button>
        </div>
        {pendingNotifs.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <Empty description="No pending notifications" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {pendingNotifs.map((n, i) => (
              <div key={n.id}>
                {i > 0 && <Divider style={{ margin: 0 }} />}
                <div style={{ padding: '10px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text strong style={{ fontSize: 13 }}>{n.name}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </div>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                    Value {n.detectedValue !== undefined ? n.detectedValue : '?'} {CONDITION_LABEL[n.condition] ?? n.condition} {n.threshold}
                    {' '}
                    {n.channels.map((c) => <Tag key={c.target} style={{ fontSize: 11 }}>{c.type}</Tag>)}
                  </Text>
                  <Space size={6}>
                    <Popconfirm
                      title="Send this notification now?"
                      onConfirm={() => sendNotifMutation.mutate(n.id)}
                      okText="Send"
                    >
                      <Button
                        size="small"
                        type="primary"
                        icon={<CheckCircleOutlined />}
                        loading={sendNotifMutation.isPending}
                      >
                        Send
                      </Button>
                    </Popconfirm>
                    <Button
                      size="small"
                      icon={<CloseCircleOutlined />}
                      onClick={() => dismissNotifMutation.mutate(n.id)}
                      loading={dismissNotifMutation.isPending}
                    >
                      Dismiss
                    </Button>
                  </Space>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    ),
  };

  return (
    <Layout style={{ height: '100vh' }}>
      {/* â”€â”€â”€ Sidebar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        width={240}
        collapsedWidth={64}
        style={{ borderRight: '1px solid var(--color-border)', overflow: 'auto' }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '0' : '0 20px',
            borderBottom: '1px solid var(--color-border)',
            cursor: 'pointer',
            transition: 'all 200ms ease',
          }}
          onClick={() => navigate('/dashboards')}
        >
          {sidebarLogo}
        </div>

        <Menu
          theme={themeMode === 'dark' ? 'dark' : 'light'}
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0, marginTop: 8 }}
        />
      </Sider>

      <Layout>
        {/* â”€â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <Header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            borderBottom: '1px solid var(--color-border)',
            height: 64,
          }}
        >
          <Space>
            <div
              onClick={() => setCollapsed(!collapsed)}
              style={{ cursor: 'pointer', fontSize: 18, color: 'var(--color-text-secondary)' }}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </div>
            <AutoComplete<string, SearchOption>
              options={searchOptions}
              onSearch={handleSearch}
              onSelect={handleSelect}
              style={{ width: 280 }}
              allowClear
            >
              <Input
                prefix={<SearchOutlined style={{ color: 'var(--color-text-secondary)' }} />}
                placeholder="Search dashboards & queries..."
                style={{ width: 280 }}
              />
            </AutoComplete>
          </Space>

          <Space size="middle">
            <Tooltip title={themeMode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
              {themeMode === 'dark'
                ? <SunOutlined onClick={toggleTheme} style={{ fontSize: 18, color: 'var(--color-text-secondary)', cursor: 'pointer' }} />
                : <MoonOutlined onClick={toggleTheme} style={{ fontSize: 18, color: 'var(--color-text-secondary)', cursor: 'pointer' }} />
              }
            </Tooltip>

            {aiEnabled && (
              <Tooltip title="AI Assistant">
                <RobotOutlined
                  onClick={() => setChatOpen(true)}
                  style={{ fontSize: 18, color: chatOpen ? '#6366f1' : 'var(--color-text-secondary)', cursor: 'pointer', transition: 'color 200ms' }}
                />
              </Tooltip>
            )}

            {isAdmin ? (
              <Dropdown {...notifDropdown} placement="bottomRight">
                <Badge count={pendingNotifs.length} size="small" offset={[2, -2]}>
                  <BellOutlined style={{ fontSize: 18, color: 'var(--color-text-secondary)', cursor: 'pointer' }} />
                </Badge>
              </Dropdown>
            ) : (
              <BellOutlined style={{ fontSize: 18, color: 'var(--color-text-secondary)' }} />
            )}

            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Avatar size={32} icon={<UserOutlined />} style={{ backgroundColor: '#6366f1', cursor: 'pointer' }} />
            </Dropdown>
          </Space>
        </Header>

        {/* â”€â”€â”€ Content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <Content style={{ padding: 24, overflow: 'auto', background: 'var(--color-bg-primary)' }}>
          <div className="fade-in">
            <Outlet />
          </div>
        </Content>
      </Layout>

      {/* â”€â”€â”€ AI Chat Drawer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Drawer
        title={
          <Space>
            <RobotOutlined style={{ color: '#6366f1' }} />
            AI Assistant
          </Space>
        }
        placement="right"
        width={400}
        open={aiEnabled && chatOpen}
        onClose={() => setChatOpen(false)}
        styles={{ body: { display: 'flex', flexDirection: 'column', padding: 0, height: '100%' } }}
        footer={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Select
              placeholder="1. Select datasource (optional)"
              allowClear
              size="small"
              style={{ width: '100%' }}
              value={chatDatasourceId}
              onChange={(v) => handleDatasourceChange(v)}
            >
              {datasources.map((ds) => (
                <Option key={ds.id} value={ds.id}>{ds.name} ({ds.type})</Option>
              ))}
            </Select>
            {chatDatasourceId && (
              <Select
                placeholder={schemaFetching ? 'Loading schemas...' : '2. Select schema/database (recommended)'}
                allowClear
                size="small"
                style={{ width: '100%' }}
                value={chatSchemaFilter}
                onChange={(v) => setChatSchemaFilter(v)}
                loading={schemaFetching}
                disabled={schemaFetching || availableSchemas.length === 0}
                notFoundContent={schemaFetching ? <Spin size="small" /> : 'No schemas found'}
              >
                {availableSchemas.map((s) => (
                  <Option key={s} value={s}>{s}</Option>
                ))}
              </Select>
            )}
            {chatDatasourceId && chatSchemaFilter && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                Schema context will be sent with every message
              </Text>
            )}
            {chatDatasourceId && !chatSchemaFilter && !schemaFetching && availableSchemas.length > 1 && (
              <Text type="warning" style={{ fontSize: 11 }}>
                Select a schema for more accurate answers (full schema is large)
              </Text>
            )}
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder="Ask anything about your data..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onPressEnter={() => void sendChatMessage()}
                disabled={chatLoading}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() => void sendChatMessage()}
                loading={chatLoading}
                disabled={!chatInput.trim()}
              />
            </Space.Compact>
          </div>
        }
      >
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {chatMessages.length === 0 && (
            <div style={{ textAlign: 'center', marginTop: 40, color: 'var(--color-text-secondary)' }}>
              <RobotOutlined style={{ fontSize: 32, marginBottom: 8, color: '#6366f1' }} />
              <div>Ask questions about your data, get SQL help, or explore insights.</div>
            </div>
          )}
          {chatMessages.map((msg, i) => (
            <div
              key={i}
              style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                background: msg.role === 'user' ? '#6366f1' : 'var(--color-bg-elevated)',
                color: msg.role === 'user' ? '#fff' : 'inherit',
                border: msg.role === 'assistant' ? '1px solid var(--color-border)' : 'none',
                borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                padding: '8px 12px',
                fontSize: 13,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {msg.content}
            </div>
          ))}
          {chatLoading && (
            <div style={{ alignSelf: 'flex-start' }}>
              <Spin size="small" />
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </Drawer>
    </Layout>
  );
}
