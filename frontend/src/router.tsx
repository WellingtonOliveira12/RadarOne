import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
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

// Páginas protegidas
import { DashboardPage } from './pages/DashboardPage';
import { MonitorsPage } from './pages/MonitorsPage';
import { NotificationSettingsPage } from './pages/NotificationSettingsPage';
import { NotificationHistoryPage } from './pages/NotificationHistoryPage';
import { SubscriptionSettingsPage } from './pages/SubscriptionSettingsPage';
import { TelegramConnectionPage } from './pages/TelegramConnectionPage';

// Páginas de ajuda (públicas)
import { ManualPage } from './pages/ManualPage';
import { FAQPage } from './pages/FAQPage';
import { ContactPage } from './pages/ContactPage';

// Páginas admin
import { AdminJobsPage } from './pages/AdminJobsPage';
import { AdminStatsPage } from './pages/AdminStatsPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AdminSubscriptionsPage } from './pages/AdminSubscriptionsPage';
import { AdminWebhooksPage } from './pages/AdminWebhooksPage';
import { AdminMonitorsPage } from './pages/AdminMonitorsPage';
import { AdminCouponsPage } from './pages/AdminCouponsPage';

// Páginas de teste/debug
import { HealthCheckPage } from './pages/HealthCheckPage';

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

          {/* Rotas admin */}
          <Route
            path="/admin/stats"
            element={
              <AdminProtectedRoute>
                <AdminStatsPage />
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <AdminProtectedRoute>
                <AdminUsersPage />
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/admin/subscriptions"
            element={
              <AdminProtectedRoute>
                <AdminSubscriptionsPage />
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/admin/jobs"
            element={
              <AdminProtectedRoute>
                <AdminJobsPage />
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/admin/webhooks"
            element={
              <AdminProtectedRoute>
                <AdminWebhooksPage />
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/admin/monitors"
            element={
              <AdminProtectedRoute>
                <AdminMonitorsPage />
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/admin/coupons"
            element={
              <AdminProtectedRoute>
                <AdminCouponsPage />
              </AdminProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
