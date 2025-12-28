import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Ambiente de execução
    environment: 'node',

    // Arquivo de setup executado antes dos testes
    setupFiles: ['./src/__tests__/setup.ts'],

    // Diretórios e padrões de arquivos de teste
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts', 'src/**/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'build'],

    // Configurações de timeout (aumentado para testes de integração)
    testTimeout: 30000,
    hookTimeout: 30000,

    // Cobertura de código
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/server.ts',
        'node_modules/**',
      ],
    },

    // Configurações globais de teste
    globals: true,

    // Mock automático
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
