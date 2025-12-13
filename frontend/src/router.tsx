import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
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
import { SubscriptionSettingsPage } from './pages/SubscriptionSettingsPage';

// Páginas admin
import { AdminJobsPage } from './pages/AdminJobsPage';

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
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/health" element={<HealthCheckPage />} />

          {/* Rotas protegidas */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/monitors"
            element={
              <ProtectedRoute>
                <MonitorsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/notifications"
            element={
              <ProtectedRoute>
                <NotificationSettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/subscription"
            element={
              <ProtectedRoute>
                <SubscriptionSettingsPage />
              </ProtectedRoute>
            }
          />

          {/* Rotas admin */}
          <Route
            path="/admin/jobs"
            element={
              <ProtectedRoute>
                <AdminJobsPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
