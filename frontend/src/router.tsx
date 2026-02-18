import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import { Center, Spinner, Text, VStack } from '@chakra-ui/react';
import { AuthProvider } from './context/AuthContext';
import { RequireSubscriptionRoute } from './components/RequireSubscriptionRoute';
import { RedirectIfAuthenticated } from './components/RedirectIfAuthenticated';
import { AdminProtectedRoute } from './components/AdminProtectedRoute';
import { initAnalytics, trackPageView } from './lib/analytics';

// Páginas públicas
import { LandingPage } from './pages/LandingPage';
import { PlansPage } from './pages/PlansPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { TwoFactorVerifyPage } from './pages/TwoFactorVerifyPage';

// Páginas protegidas
import { DashboardPage } from './pages/DashboardPage';
import { MonitorsPage } from './pages/MonitorsPage';
import { NotificationSettingsPage } from './pages/NotificationSettingsPage';
import { NotificationHistoryPage } from './pages/NotificationHistoryPage';
import { SubscriptionSettingsPage } from './pages/SubscriptionSettingsPage';
import { TelegramConnectionPage } from './pages/TelegramConnectionPage';
import ConnectionsPage from './pages/ConnectionsPage';

// Páginas de ajuda (públicas)
import { ManualPage } from './pages/ManualPage';
import { FAQPage } from './pages/FAQPage';
import { ContactPage } from './pages/ContactPage';

// Páginas admin - LAZY LOADED (Code Splitting)
const AdminJobsPage = lazy(() => import('./pages/AdminJobsPage').then(m => ({ default: m.AdminJobsPage })));
const AdminStatsPage = lazy(() => import('./pages/AdminStatsPage').then(m => ({ default: m.AdminStatsPage })));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage').then(m => ({ default: m.AdminUsersPage })));
const AdminSubscriptionsPage = lazy(() => import('./pages/AdminSubscriptionsPage').then(m => ({ default: m.AdminSubscriptionsPage })));
const AdminAuditLogsPage = lazy(() => import('./pages/AdminAuditLogsPage').then(m => ({ default: m.AdminAuditLogsPage })));
const AdminSettingsPage = lazy(() => import('./pages/AdminSettingsPage').then(m => ({ default: m.AdminSettingsPage })));
const AdminMonitorsPage = lazy(() => import('./pages/AdminMonitorsPage').then(m => ({ default: m.AdminMonitorsPage })));
const AdminWebhooksPage = lazy(() => import('./pages/AdminWebhooksPage').then(m => ({ default: m.AdminWebhooksPage })));
const AdminCouponsPage = lazy(() => import('./pages/AdminCouponsPage').then(m => ({ default: m.AdminCouponsPage })));
const AdminAlertsPage = lazy(() => import('./pages/AdminAlertsPage').then(m => ({ default: m.AdminAlertsPage })));
const AdminSiteHealthPage = lazy(() => import('./pages/AdminSiteHealthPage').then(m => ({ default: m.AdminSiteHealthPage })));
const Security2FAPage = lazy(() => import('./pages/Security2FAPage').then(m => ({ default: m.Security2FAPage })));

// Páginas de teste/debug
import { HealthCheckPage } from './pages/HealthCheckPage';

// Componente de loading para lazy loaded pages
function PageLoader() {
  return (
    <Center h="100vh" bg="gray.50">
      <VStack spacing={4}>
        <Spinner size="xl" color="blue.500" thickness="4px" />
        <Text color="gray.600">Carregando...</Text>
      </VStack>
    </Center>
  );
}

// Componente para rastrear pageviews automaticamente
function PageViewTracker() {
  const location = useLocation();

  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location]);

  return null;
}

export function AppRouter() {
  // Inicializa analytics uma única vez
  useEffect(() => {
    initAnalytics();
  }, []);

  return (
    <BrowserRouter>
      <PageViewTracker />
      <AuthProvider>
        <Routes>
          {/* Rotas públicas */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/plans" element={<PlansPage />} />
          <Route
            path="/login"
            element={
              <RedirectIfAuthenticated>
                <LoginPage />
              </RedirectIfAuthenticated>
            }
          />
          <Route
            path="/register"
            element={
              <RedirectIfAuthenticated>
                <RegisterPage />
              </RedirectIfAuthenticated>
            }
          />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/2fa/verify" element={<TwoFactorVerifyPage />} />
          <Route path="/health" element={<HealthCheckPage />} />

          {/* Páginas de ajuda (públicas) */}
          <Route path="/manual" element={<ManualPage />} />
          <Route path="/faq" element={<FAQPage />} />
          <Route path="/contact" element={<ContactPage />} />

          {/* Rotas protegidas (requerem autenticação + subscription válida) */}
          <Route
            path="/dashboard"
            element={
              <RequireSubscriptionRoute>
                <DashboardPage />
              </RequireSubscriptionRoute>
            }
          />
          <Route
            path="/monitors"
            element={
              <RequireSubscriptionRoute>
                <MonitorsPage />
              </RequireSubscriptionRoute>
            }
          />
          <Route
            path="/settings/notifications"
            element={
              <RequireSubscriptionRoute>
                <NotificationSettingsPage />
              </RequireSubscriptionRoute>
            }
          />
          <Route
            path="/notifications"
            element={
              <RequireSubscriptionRoute>
                <NotificationHistoryPage />
              </RequireSubscriptionRoute>
            }
          />
          <Route
            path="/settings/subscription"
            element={
              <RequireSubscriptionRoute>
                <SubscriptionSettingsPage />
              </RequireSubscriptionRoute>
            }
          />
          <Route
            path="/telegram/connect"
            element={
              <RequireSubscriptionRoute>
                <TelegramConnectionPage />
              </RequireSubscriptionRoute>
            }
          />
          <Route
            path="/settings/connections"
            element={
              <RequireSubscriptionRoute>
                <ConnectionsPage />
              </RequireSubscriptionRoute>
            }
          />

          {/* Rotas admin - Com Code Splitting (Lazy Loading) */}
          <Route
            path="/admin/stats"
            element={
              <AdminProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <AdminStatsPage />
                </Suspense>
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <AdminProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <AdminUsersPage />
                </Suspense>
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/admin/subscriptions"
            element={
              <AdminProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <AdminSubscriptionsPage />
                </Suspense>
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/admin/jobs"
            element={
              <AdminProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <AdminJobsPage />
                </Suspense>
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/admin/audit-logs"
            element={
              <AdminProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <AdminAuditLogsPage />
                </Suspense>
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <AdminProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <AdminSettingsPage />
                </Suspense>
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/admin/monitors"
            element={
              <AdminProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <AdminMonitorsPage />
                </Suspense>
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/admin/webhooks"
            element={
              <AdminProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <AdminWebhooksPage />
                </Suspense>
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/admin/coupons"
            element={
              <AdminProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <AdminCouponsPage />
                </Suspense>
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/admin/alerts"
            element={
              <AdminProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <AdminAlertsPage />
                </Suspense>
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/admin/site-health"
            element={
              <AdminProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <AdminSiteHealthPage />
                </Suspense>
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/admin/security"
            element={
              <AdminProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <Security2FAPage />
                </Suspense>
              </AdminProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
