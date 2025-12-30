import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
        project: './tsconfig.json'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      // Desabilitar regras muito restritivas para não quebrar build existente
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-namespace': 'off',

      // REGRA CRÍTICA: Bloquear imports diretos do logger
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/logger', '../logger', '../../logger', '../../../logger', '*/logger'],
              message: '❌ Não importe o logger diretamente. Use os helpers de logging em utils/loggerHelpers.ts.'
            }
          ]
        }
      ]
    }
  },
  {
    // Exceção: loggerHelpers.ts pode importar o logger
    files: ['src/utils/loggerHelpers.ts'],
    rules: {
      'no-restricted-imports': 'off'
    }
  }
];
