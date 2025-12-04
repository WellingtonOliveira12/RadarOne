import axios from 'axios';

/**
 * Cliente HTTP para comunicação com a API
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para adicionar token JWT em todas as requisições
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para tratar erros de resposta
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expirado ou inválido
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ============================================
// AUTENTICAÇÃO
// ============================================

export const authService = {
  register: async (data: {
    email: string;
    password: string;
    name: string;
    phone?: string;
  }) => {
    const response = await api.post('/api/auth/register', data);
    return response.data;
  },

  login: async (email: string, password: string) => {
    const response = await api.post('/api/auth/login', { email, password });
    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
    }
    return response.data;
  },

  logout: () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  },

  getMe: async () => {
    const response = await api.get('/api/auth/me');
    return response.data;
  },
};

// ============================================
// PLANOS (TODO)
// ============================================

export const planService = {
  getAll: async () => {
    const response = await api.get('/api/plans');
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/api/plans/${id}`);
    return response.data;
  },
};

// ============================================
// MONITORES (TODO)
// ============================================

export const monitorService = {
  getAll: async () => {
    const response = await api.get('/api/monitors');
    return response.data;
  },

  create: async (data: any) => {
    const response = await api.post('/api/monitors', data);
    return response.data;
  },

  update: async (id: string, data: any) => {
    const response = await api.put(`/api/monitors/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/api/monitors/${id}`);
    return response.data;
  },
};

// ============================================
// ASSINATURAS (TODO)
// ============================================

export const subscriptionService = {
  getAll: async () => {
    const response = await api.get('/api/subscriptions');
    return response.data;
  },

  create: async (data: any) => {
    const response = await api.post('/api/subscriptions', data);
    return response.data;
  },
};

// ============================================
// CUPONS (TODO)
// ============================================

export const couponService = {
  validate: async (code: string) => {
    const response = await api.post('/api/coupons/validate', { code });
    return response.data;
  },
};
