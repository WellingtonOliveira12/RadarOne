import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { login as authLogin, register as authRegister, isTwoFactorRequired, AuthStep } from '../services/auth';
import type { LoginTwoFactorRequiredResponse } from '../services/auth';
import { getToken, setToken, clearAuth } from '../lib/auth';
import { logout as globalLogout } from '../lib/logout';
import { useSessionTimeout } from '../hooks/useSessionTimeout';

/**
 * Contexto de Autenticação
 * Gerencia estado do usuário logado
 *
 * AUTH_STEP States:
 * - NONE: Não autenticado
 * - TWO_FACTOR_REQUIRED: Senha validada, aguardando 2FA
 * - AUTHENTICATED: Totalmente autenticado
 */

interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: 'USER' | 'ADMIN' | 'ADMIN_SUPER' | 'ADMIN_SUPPORT' | 'ADMIN_FINANCE' | 'ADMIN_READ';
  subscriptions?: any[];
}

// Erro especial quando 2FA é necessário
export class TwoFactorRequiredError extends Error {
  public readonly tempToken: string;
  public readonly userId: string;

  constructor(data: LoginTwoFactorRequiredResponse) {
    super('Two-factor authentication required');
    this.name = 'TwoFactorRequiredError';
    this.tempToken = data.tempToken;
    this.userId = data.userId;
  }
}

interface AuthContextData {
  user: User | null;
  loading: boolean;
  authStep: AuthStep;
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
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authStep, setAuthStep] = useState<AuthStep>(AuthStep.NONE);

  // Carrega dados do usuário ao montar o componente
  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const token = getToken();
      if (token) {
        // Usar endpoint /auth/status para obter estado completo
        const response = await fetch(
          `${import.meta.env.VITE_API_BASE_URL || 'https://radarone.onrender.com'}/api/auth/status`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }
        );

        if (response.ok) {
          const statusData = await response.json();

          if (statusData.isAuthenticated && statusData.user) {
            setUser(statusData.user);
            setAuthStep(AuthStep.AUTHENTICATED);
          } else if (statusData.authStep === AuthStep.TWO_FACTOR_REQUIRED) {
            // Token é temporário, 2FA pendente
            console.log('[AuthContext] 2FA pendente, limpando token temporário');
            clearAuth();
            setUser(null);
            setAuthStep(AuthStep.NONE);
          } else {
            // Token inválido ou expirado
            console.log('[AuthContext] Token inválido, limpando autenticação');
            clearAuth();
            setUser(null);
            setAuthStep(AuthStep.NONE);
          }
        } else {
          // Token inválido, limpar auth e garantir que user seja null
          console.log('[AuthContext] Token inválido, limpando autenticação');
          clearAuth();
          setUser(null);
          setAuthStep(AuthStep.NONE);
        }
      } else {
        setAuthStep(AuthStep.NONE);
      }
    } catch (error) {
      console.error('[AuthContext] Erro ao carregar usuário:', error);
      clearAuth();
      setUser(null);
      setAuthStep(AuthStep.NONE);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await authLogin(email, password);

    // Verificar se 2FA é necessário
    if (isTwoFactorRequired(response)) {
      // Lançar erro especial para que a LoginPage possa capturar e redirecionar
      throw new TwoFactorRequiredError(response);
    }

    // Login completo (sem 2FA ou 2FA já verificado)
    setToken(response.token);
    setUser(response.user);
    setAuthStep(AuthStep.AUTHENTICATED);
  };

  const logout = useCallback((reason?: string) => {
    // Limpa estado local antes do redirect
    setUser(null);
    setAuthStep(AuthStep.NONE);

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

  const refetchUser = async () => {
    await loadUser();
  };

  return (
    <AuthContext.Provider value={{ user, loading, authStep, login, logout, register, refetchUser }}>
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
