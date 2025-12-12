import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Ambiente de execução
    environment: 'node',

    // Diretórios e padrões de arquivos de teste
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    exclude: ['node_modules', 'dist', 'build'],

    // Configurações de timeout
    testTimeout: 10000,
    hookTimeout: 10000,

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
