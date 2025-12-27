# Guia Rápido: Testes no RadarOne

## 🎯 Convenção de Nomenclatura

| Framework | Localização | Extensão | Exemplo |
|-----------|-------------|----------|---------|
| **Playwright (E2E)** | `frontend/tests/e2e/` | `.spec.ts` | `login.spec.ts` |
| **Vitest (Backend)** | `backend/tests/` | `.test.ts` | `checkSubscriptionExpired.test.ts` |
| **Vitest (Frontend)** | `frontend/src/` | `.test.tsx` | `Button.test.tsx` |

---

## 🚀 Comandos de Teste

### Testes E2E (Playwright)

```bash
# Navegar para frontend
cd frontend

# Listar todos os testes
npx playwright test --list

# Rodar todos os testes E2E
npm run test:e2e

# Rodar apenas chromium
npm run test:e2e:chromium

# Modo headed (ver navegador)
npm run test:e2e:headed

# Modo UI interativo
npm run test:e2e:ui

# Ver relatório HTML
npm run test:e2e:report
```

### Testes Backend (Vitest)

```bash
# Navegar para backend
cd backend

# Rodar todos os testes
npm test

# Modo watch (re-executa ao salvar)
npm run test:watch

# Com interface visual
npm run test:ui
```

---

## 📁 Onde Adicionar Novos Testes

### ✅ Teste E2E (fluxo de usuário na UI)

**Localização:** `frontend/tests/e2e/nome-do-teste.spec.ts`

**Template:**
```typescript
import { test, expect } from '@playwright/test';

test.describe('Meu Fluxo', () => {
  test('deve fazer algo na UI', async ({ page }) => {
    await page.goto('/');
    // ... seu teste aqui
  });
});
```

### ✅ Teste Backend (job, serviço, controller)

**Localização:** `backend/tests/[categoria]/nome-do-teste.test.ts`

**Template:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Meu Job/Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve executar corretamente', async () => {
    // ... seu teste aqui
  });
});
```

---

## 🔍 Isolamento Garantido

### Playwright NÃO executa:
- ❌ `**/*.test.ts` (arquivos Vitest)
- ❌ `backend/**` (qualquer coisa do backend)
- ❌ `node_modules/**`

### Vitest Backend NÃO executa:
- ❌ `frontend/**` (qualquer coisa do frontend)
- ❌ Arquivos fora de `backend/tests/`

---

## 🐛 Debug

### Playwright Debug

```bash
# Debug com DevTools aberto
PWDEBUG=1 npm run test:e2e

# Rodar apenas um teste específico
npx playwright test login.spec.ts

# Rodar com trace
npx playwright test --trace on
```

### Vitest Debug

```bash
# Rodar apenas um arquivo
npm test checkSubscriptionExpired.test.ts

# Com output detalhado
npm test -- --reporter=verbose
```

---

## 📊 Coverage

### Backend Coverage

```bash
cd backend
npm run test:ui  # Inclui coverage na interface
```

---

## ⚙️ Configurações

| Arquivo | Função |
|---------|--------|
| `frontend/playwright.config.ts` | Config Playwright (E2E) |
| `backend/vitest.config.ts` | Config Vitest (Backend) |
| `frontend/vitest.config.ts` | Config Vitest (Frontend - unit) |
| `.github/workflows/e2e.yml` | CI E2E (Playwright) |
| `.github/workflows/backend-tests.yml` | CI Backend (Vitest) |

---

## ✅ Checklist ao Criar Novo Teste

- [ ] E2E? → `frontend/tests/e2e/*.spec.ts`
- [ ] Backend? → `backend/tests/**/*.test.ts`
- [ ] Usa `import from '@playwright/test'` (E2E)?
- [ ] Usa `import from 'vitest'` (Backend)?
- [ ] Nome descritivo do arquivo?
- [ ] Testes passam localmente?
- [ ] Adicionou ao describe/test apropriado?

---

## 🚨 Erros Comuns e Soluções

### "Vitest cannot be imported in a CommonJS module"

**Causa:** Playwright tentando executar arquivo .test.ts

**Solução:**
- ✅ Use `.spec.ts` para E2E
- ✅ Use `.test.ts` para Backend
- ✅ Nunca importe Vitest em arquivos E2E

### "Cannot find module '@playwright/test'"

**Causa:** Tentando usar Playwright no backend

**Solução:**
- ✅ Playwright só funciona em `frontend/tests/e2e/`
- ✅ Use Vitest para testes de backend

---

## 📚 Recursos

- [Playwright Docs](https://playwright.dev)
- [Vitest Docs](https://vitest.dev)
- [Relatório Completo](./E2E_VITEST_ISOLATION_REPORT.md)
