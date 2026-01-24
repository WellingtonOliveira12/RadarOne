import { api } from './api';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN' | 'ADMIN_SUPER' | 'ADMIN_SUPPORT' | 'ADMIN_FINANCE' | 'ADMIN_READ';
}

// Constantes para estados de autenticação (deve corresponder ao backend)
export const AuthStep = {
  NONE: 'NONE',
  TWO_FACTOR_REQUIRED: 'TWO_FACTOR_REQUIRED',
  AUTHENTICATED: 'AUTHENTICATED'
} as const;

export type AuthStep = typeof AuthStep[keyof typeof AuthStep];

// Resposta quando login é bem sucedido (sem 2FA ou 2FA desabilitado)
export interface LoginSuccessResponse {
  authStep: typeof AuthStep.AUTHENTICATED;
  message: string;
  token: string;
  user: User;
}

// Resposta quando 2FA é necessário
export interface LoginTwoFactorRequiredResponse {
  authStep: typeof AuthStep.TWO_FACTOR_REQUIRED;
  requiresTwoFactor: true;
  tempToken: string;
  userId: string;
  message: string;
}

// União dos tipos de resposta
export type LoginResponse = LoginSuccessResponse | LoginTwoFactorRequiredResponse;

// Type guard para verificar se precisa de 2FA
export function isTwoFactorRequired(response: LoginResponse): response is LoginTwoFactorRequiredResponse {
  return response.authStep === AuthStep.TWO_FACTOR_REQUIRED;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  // Usar requestWithRetry para lidar com cold start do Render
  // 3 tentativas com backoff: 1.5s, 3s, 6s entre cada
  const data = await api.requestWithRetry<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });

  return data;
}

export interface RegisterData {
  name: string;
  email: string;
  cpf: string;
  phone?: string;
  password: string;
  notificationPreference?: 'TELEGRAM' | 'EMAIL';
  telegramUsername?: string;
}

export async function register(data: RegisterData) {
  return api.post('/api/auth/register', data);
}

export interface ResetPasswordData {
  token: string;
  password: string;
}

export async function resetPassword(data: ResetPasswordData) {
  return api.post('/api/auth/reset-password', data);
}

export async function forgotPassword(email: string) {
  return api.post('/api/auth/forgot-password', { email });
}
