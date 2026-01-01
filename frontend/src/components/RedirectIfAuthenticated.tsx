import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSubscriptionStatus } from '../utils/subscriptionHelpers';

/**
 * Componente para redirecionar usuários já autenticados
 * Usado em rotas públicas como /login e /register
 *
 * Lógica:
 * - Se não autenticado → renderiza children (permite acesso)
 * - Se autenticado com subscription válida → redireciona para /dashboard
 * - Se autenticado sem subscription → redireciona para /plans?reason=subscription_required
 */

interface RedirectIfAuthenticatedProps {
  children: React.ReactNode;
}

export const RedirectIfAuthenticated: React.FC<RedirectIfAuthenticatedProps> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
        }}
      >
        <p>Carregando...</p>
      </div>
    );
  }

  // Não autenticado → permite acesso (renderiza página de login/register)
  if (!user) {
    return <>{children}</>;
  }

  // Autenticado → verificar role e subscription

  // ADMINS sempre vão para área administrativa (independente de subscription)
  if (user.role === 'ADMIN') {
    return <Navigate to="/admin/stats" replace />;
  }

  // USERs → verificar subscription
  const subscriptionStatus = getSubscriptionStatus(user);

  if (subscriptionStatus.hasValidSubscription) {
    // Tem subscription válida → vai para dashboard
    return <Navigate to="/dashboard" replace />;
  } else {
    // Não tem subscription válida → vai para plans
    const reason = subscriptionStatus.reason || 'subscription_required';
    return <Navigate to={`/plans?reason=${reason}`} replace />;
  }
};
