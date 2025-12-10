import { api } from './api';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN';
}

export interface LoginResponse {
  message: string;
  token: string;
  user: User;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const data = await api.post<LoginResponse>('/api/auth/login', {
    email,
    password,
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
