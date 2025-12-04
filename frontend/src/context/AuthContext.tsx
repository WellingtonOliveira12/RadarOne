import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/api';

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
    phone?: string;
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
      const token = localStorage.getItem('token');
      if (token) {
        const response = await authService.getMe();
        setUser(response.user);
      }
    } catch (error) {
      console.error('Erro ao carregar usuário:', error);
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await authService.login(email, password);
    setUser(response.user);
  };

  const logout = () => {
    setUser(null);
    authService.logout();
  };

  const register = async (data: {
    email: string;
    password: string;
    name: string;
    phone?: string;
  }) => {
    await authService.register(data);
    // Após registrar, fazer login automaticamente
    await login(data.email, data.password);
  };

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
