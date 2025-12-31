import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { login as authLogin, register as authRegister } from '../services/auth';
import { getToken, setToken, clearAuth } from '../lib/auth';
import { logout as globalLogout } from '../lib/logout';
import { useSessionTimeout } from '../hooks/useSessionTimeout';

/**
 * Contexto de Autenticação
 * Gerencia estado do usuário logado
 */

interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: 'USER' | 'ADMIN';
  subscriptions?: any[];
}

interface AuthContextData {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  register: (data: {
    email: string;
    password: string;
    name: string;
    cpf: string;
    phone?: string;
    notificationPreference?: 'TELEGRAM' | 'EMAIL';
    telegramUsername?: string;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Carrega dados do usuário ao montar o componente
  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const token = getToken();
      if (token) {
        // Carregar dados do usuário do backend
        const response = await fetch(
          `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}/api/auth/me`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }
        );

        if (response.ok) {
          const userData = await response.json();
          setUser(userData.user);
        } else {
          // Token inválido, limpar
          clearAuth();
        }
      }
    } catch (error) {
      console.error('Erro ao carregar usuário:', error);
      clearAuth();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await authLogin(email, password);
    setToken(response.token);
    setUser(response.user);
  };

  const logout = useCallback((reason?: string) => {
    // Limpa estado local antes do redirect
    setUser(null);

    // Chama logout global (limpa auth + redireciona)
    globalLogout(reason);
  }, []);

  const register = async (data: {
    email: string;
    password: string;
    name: string;
    cpf: string;
    phone?: string;
    notificationPreference?: 'TELEGRAM' | 'EMAIL';
    telegramUsername?: string;
  }) => {
    await authRegister(data);
    // Após registrar, fazer login automaticamente
    await login(data.email, data.password);
  };

  // Timeout de inatividade (30 minutos padrão, configurável via env)
  const timeoutMinutes = Number(import.meta.env.VITE_SESSION_TIMEOUT_MINUTES) || 30;

  useSessionTimeout(() => {
    // Deslogar por inatividade
    logout('session_expired');
  }, timeoutMinutes);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};
