import { defineConfig, devices } from '@playwright/test';

/**
 * Configuração do Playwright para testes E2E do RadarOne
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',

  /* Configurações globais */
  timeout: 30 * 1000, // 30 segundos por teste
  expect: {
    timeout: 5000, // 5 segundos para assertions
  },

  /* Rodar testes em paralelo */
  fullyParallel: true,

  /* Falhar build se você deixar test.only() no código */
  forbidOnly: !!process.env.CI,

  /* Retry em CI */
  retries: process.env.CI ? 2 : 0,

  /* Workers em paralelo */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter */
  reporter: [
    ['html'],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],

  /* Configurações compartilhadas para todos os projetos */
  use: {
    /* URL base */
    baseURL: 'http://localhost:5173',

    /* Coletar trace on retry */
    trace: 'on-first-retry',

    /* Screenshots em falhas */
    screenshot: 'only-on-failure',

    /* Video em falhas */
    video: 'retain-on-failure',
  },

  /* Configurar projetos para múltiplos navegadores */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Testes mobile */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 14'] },
    },
  ],

  /* Rodar servidor de dev antes dos testes (apenas em local, não em CI) */
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
