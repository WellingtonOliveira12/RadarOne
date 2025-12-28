import { beforeAll, vi } from 'vitest';

/**
 * Setup global para testes
 * Configura mocks e variáveis de ambiente
 */

beforeAll(() => {
  // Mock do serviço de email para evitar chamadas reais durante testes
  vi.mock('../services/emailService', () => import('../__mocks__/emailService'));

  // Configurar variáveis de ambiente de teste
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://testuser:testpass@localhost:5432/radarone_test?schema=public';

  // Desabilitar logs desnecessários durante testes
  if (process.env.VITEST_QUIET !== 'false') {
    console.log = vi.fn();
    console.warn = vi.fn();
  }
});
