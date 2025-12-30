import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSubscriptionStatus } from '../utils/subscriptionHelpers';

/**
 * Componente para proteger rotas que requerem autenticação E subscription válida
 *
 * Verifica (nesta ordem):
 * 1. Se usuário está autenticado (user existe)
 * 2. Se usuário tem subscription válida (não expirada)
 *
 * Se não autenticado → redireciona para /login (salva returnUrl)
 * Se autenticado mas sem subscription válida → redireciona para /plans?reason=...
 *
 * NÃO faz chamadas extras de API - usa apenas o estado do AuthContext
 * A API 403 continua como fallback (caso dados desatualizados)
 */

interface RequireSubscriptionRouteProps {
  children: React.ReactNode;
}

export const RequireSubscriptionRoute: React.FC<RequireSubscriptionRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

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

  // 1. Verificar autenticação
  if (!user) {
    // Salvar URL atual para redirecionar após login
    const returnUrl = location.pathname + location.search;
    sessionStorage.setItem('returnUrl', returnUrl);

    return <Navigate to="/login" replace />;
  }

  // 2. Verificar subscription (usando helper - sem chamadas extras)
  const subscriptionStatus = getSubscriptionStatus(user);

  if (!subscriptionStatus.hasValidSubscription) {
    // Redirecionar para /plans com motivo
    const reason = subscriptionStatus.reason || 'subscription_required';
    return <Navigate to={`/plans?reason=${reason}`} replace />;
  }

  // Passou em todas verificações → renderizar componente
  return <>{children}</>;
};
