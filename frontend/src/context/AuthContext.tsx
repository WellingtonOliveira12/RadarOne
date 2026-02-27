import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { login as authLogin, register as authRegister, isTwoFactorRequired, AuthStep } from '../services/auth';
import type { LoginTwoFactorRequiredResponse } from '../services/auth';
import { getToken, setToken, clearAuth } from '../lib/auth';
import { logout as globalLogout, isLoggingOut, clearLogoutFlag } from '../lib/logout';
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
      // Se logout está em andamento, não tentar refresh (evita race condition)
      if (isLoggingOut()) {
        clearLogoutFlag();
        clearAuth();
        setUser(null);
        setAuthStep(AuthStep.NONE);
        return;
      }

      let token = getToken();

      // Se não tem token em memória, tentar refresh via httpOnly cookie
      if (!token) {
        try {
          const baseUrl = import.meta.env.VITE_API_BASE_URL || 'https://radarone.onrender.com';
          const refreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });
          if (refreshRes.ok) {
            const data = await refreshRes.json();
            if (data.token) {
              setToken(data.token);
              token = data.token;
            }
          }
        } catch {
          // Refresh falhou — continuar sem token
        }
      }

      if (token) {
        const baseUrl = import.meta.env.VITE_API_BASE_URL || 'https://radarone.onrender.com';
        const statusUrl = `${baseUrl}/api/auth/status`;

        // Retry com backoff para lidar com cold start do Render
        // 3 tentativas: 15s, 20s, 25s timeout (total máx ~60s)
        const maxAttempts = 3;
        const timeouts = [15000, 20000, 25000];
        const retryDelays = [2000, 4000]; // delay entre tentativas

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeouts[attempt]);

          try {
            const response = await fetch(statusUrl, {
              headers: { 'Authorization': `Bearer ${token}` },
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            // Verificar se resposta é HTML (indica problema de configuração)
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('text/html')) {
              console.warn('[AuthContext] Backend retornou HTML em vez de JSON');
              clearAuth();
              setUser(null);
              setAuthStep(AuthStep.NONE);
              return;
            }

            if (response.ok) {
              const statusData = await response.json();

              if (statusData.isAuthenticated && statusData.user) {
                // Log de diagnóstico: verificar dados de subscription recebidos
                const subs = statusData.user.subscriptions;
                if (subs && subs.length > 0) {
                  const s = subs[0];
                  console.log(`[AuthContext] Subscription: status=${s.status}, trialEndsAt=${s.trialEndsAt}, plan=${s.plan?.slug}`);
                } else {
                  console.log('[AuthContext] Nenhuma subscription recebida');
                }
                setUser(statusData.user);
                setAuthStep(AuthStep.AUTHENTICATED);
              } else if (statusData.authStep === AuthStep.TWO_FACTOR_REQUIRED) {
                console.log('[AuthContext] 2FA pendente, limpando token temporário');
                clearAuth();
                setUser(null);
                setAuthStep(AuthStep.NONE);
              } else {
                console.log('[AuthContext] Token inválido, limpando autenticação');
                clearAuth();
                setUser(null);
                setAuthStep(AuthStep.NONE);
              }
            } else if (response.status === 401) {
              // Token realmente inválido/expirado — limpar auth
              console.log('[AuthContext] Token expirado (401), limpando autenticação');
              clearAuth();
              setUser(null);
              setAuthStep(AuthStep.NONE);
            } else {
              // 5xx ou outro erro do servidor — NÃO limpar auth, manter token
              // O usuário pode ter sessão válida, o servidor que falhou
              console.warn(`[AuthContext] Servidor retornou ${response.status}, mantendo sessão`);
              // Não limpa auth — preserva token para próxima tentativa do usuário
            }
            return; // Request completou (sucesso ou erro HTTP), sair do loop
          } catch (fetchError: any) {
            clearTimeout(timeoutId);
            const isRetryable = fetchError.name === 'AbortError' || fetchError.name === 'TypeError';

            if (isRetryable && attempt < maxAttempts - 1) {
              console.warn(`[AuthContext] Tentativa ${attempt + 1}/${maxAttempts} falhou (${fetchError.name}), retentando em ${retryDelays[attempt]}ms...`);
              await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
              continue;
            }

            // Esgotou tentativas — NÃO limpar auth em erro de rede/timeout
            // O token pode ser válido, o servidor é que está indisponível
            console.warn(`[AuthContext] Servidor indisponível após ${maxAttempts} tentativas, mantendo sessão local`);
            // Mantém user=null temporariamente
            // Na próxima navegação ou refresh, tentará novamente
            return;
          }
        }
      } else {
        setAuthStep(AuthStep.NONE);
      }
    } catch (error) {
      console.error('[AuthContext] Erro inesperado ao carregar usuário:', error);
      // Erro inesperado — NÃO limpar auth por segurança
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
    // Log de diagnóstico: verificar dados de subscription no login
    const subs = (response.user as any)?.subscriptions;
    if (subs && subs.length > 0) {
      const s = subs[0];
      console.log(`[AuthContext:login] Subscription: status=${s.status}, trialEndsAt=${s.trialEndsAt}, plan=${s.plan?.slug}`);
    } else {
      console.log('[AuthContext:login] Nenhuma subscription no response do login');
    }
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
