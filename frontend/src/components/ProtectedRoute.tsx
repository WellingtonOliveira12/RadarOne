import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Componente para proteger rotas que requerem autenticação
 * Se não autenticado, redireciona para /login e salva returnUrl em sessionStorage
 */

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
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

  if (!user) {
    // Salvar URL atual em sessionStorage para redirecionar após login
    const returnUrl = location.pathname + location.search;
    sessionStorage.setItem('returnUrl', returnUrl);

    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
