import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Spin } from 'antd';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/common/ProtectedRoute';
import ErrorBoundary from './components/common/ErrorBoundary';
import { useAuthStore } from './stores/auth.store';

// Auth pages (not lazy — they're lightweight and need fast first paint)
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import KeycloakCallbackPage from './pages/KeycloakCallbackPage';

// Lazy-loaded app pages
const DashboardsPage = lazy(() => import('./pages/DashboardsPage'));
const DashboardBuilderPage = lazy(() => import('./pages/DashboardBuilderPage'));
const QueriesPage = lazy(() => import('./pages/QueriesPage'));
const DatasourcesPage = lazy(() => import('./pages/DatasourcesPage'));
const SchedulerPage = lazy(() => import('./pages/SchedulerPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const AuditPage = lazy(() => import('./pages/AuditPage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const ApiKeysPage = lazy(() => import('./pages/ApiKeysPage'));
const PublicDashboardPage = lazy(() => import('./pages/PublicDashboardPage'));
const MyTeamPage = lazy(() => import('./pages/MyTeamPage'));
const ChartLibraryPage = lazy(() => import('./pages/ChartLibraryPage'));

const PageLoader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
    <Spin size="large" />
  </div>
);

// Redirects viewers (and unauthenticated users) away from admin/editor-only routes
function EditorRoute({ children }: { children: React.ReactNode }) {
  const role = useAuthStore((s) => s.user?.role);
  if (role === 'viewer') return <Navigate to="/dashboards" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const role = useAuthStore((s) => s.user?.role);
  if (role !== 'admin') return <Navigate to="/dashboards" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/auth/callback" element={<KeycloakCallbackPage />} />
      <Route
        path="/public/dashboards/:token"
        element={
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <PublicDashboardPage />
            </Suspense>
          </ErrorBoundary>
        }
      />

      {/* Protected app routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboards" replace />} />
        <Route
          path="dashboards"
          element={
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <DashboardsPage />
              </Suspense>
            </ErrorBoundary>
          }
        />
        <Route
          path="dashboards/:id"
          element={
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <DashboardBuilderPage />
              </Suspense>
            </ErrorBoundary>
          }
        />
        <Route
          path="queries"
          element={
            <EditorRoute>
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <QueriesPage />
                </Suspense>
              </ErrorBoundary>
            </EditorRoute>
          }
        />
        <Route
          path="datasources"
          element={
            <EditorRoute>
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <DatasourcesPage />
                </Suspense>
              </ErrorBoundary>
            </EditorRoute>
          }
        />
        <Route
          path="scheduler"
          element={
            <EditorRoute>
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <SchedulerPage />
                </Suspense>
              </ErrorBoundary>
            </EditorRoute>
          }
        />
        <Route
          path="settings"
          element={
            <AdminRoute>
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <SettingsPage />
                </Suspense>
              </ErrorBoundary>
            </AdminRoute>
          }
        />
        <Route
          path="users"
          element={
            <AdminRoute>
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <UsersPage />
                </Suspense>
              </ErrorBoundary>
            </AdminRoute>
          }
        />
        <Route
          path="audit"
          element={
            <AdminRoute>
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <AuditPage />
                </Suspense>
              </ErrorBoundary>
            </AdminRoute>
          }
        />
        <Route
          path="alerts"
          element={
            <EditorRoute>
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <AlertsPage />
                </Suspense>
              </ErrorBoundary>
            </EditorRoute>
          }
        />
        <Route
          path="api-keys"
          element={
            <AdminRoute>
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <ApiKeysPage />
                </Suspense>
              </ErrorBoundary>
            </AdminRoute>
          }
        />
        <Route
          path="my-team"
          element={
            <EditorRoute>
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <MyTeamPage />
                </Suspense>
              </ErrorBoundary>
            </EditorRoute>
          }
        />
        <Route
          path="chart-library"
          element={
            <EditorRoute>
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <ChartLibraryPage />
                </Suspense>
              </ErrorBoundary>
            </EditorRoute>
          }
        />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/dashboards" replace />} />
    </Routes>
  );
}

export default App;
