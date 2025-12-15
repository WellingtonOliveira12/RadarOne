# Guia de Testes - RadarOne

Este guia documenta como usar os novos recursos de teste implementados no projeto RadarOne.

---

## 📋 Índice

1. [Scripts de Trial Scenarios](#scripts-de-trial-scenarios)
2. [Testes E2E Locais](#testes-e2e-locais)
3. [CI/CD no GitHub Actions](#cicd-no-github-actions)
4. [Mock de Email](#mock-de-email)
5. [Logs de TRIAL_EXPIRED](#logs-de-trial_expired)

---

## 🔧 Scripts de Trial Scenarios

### Comandos Rápidos

```bash
cd backend

# Ver status atual do usuário de teste
npm run trial:list

# Configurar trial expirado (para testar paywall)
npm run trial:expired

# Configurar trial expirando em 2 dias (para testar banner)
npm run trial:expiring

# Configurar trial ativo com 14 dias
npm run trial:active

# Configurar assinatura paga ativa
npm run trial:paid
```

### Uso Personalizado

```bash
# Trial expirando em 5 dias (ao invés de 2)
npx ts-node-dev scripts/setup-trial-scenario.ts --expiring=5

# Trial ativo com 30 dias
npx ts-node-dev scripts/setup-trial-scenario.ts --active=30
```

### Fluxo de Teste Completo

```bash
# 1. Ver status inicial
npm run trial:list

# 2. Configurar cenário desejado
npm run trial:expired

# 3. No navegador:
#    - Abrir http://localhost:5173/login
#    - Login: e2e-test@radarone.com / Test@123456
#    - Tentar acessar /monitors
#    - Validar redirecionamento para /plans

# 4. Limpar e testar outro cenário
npm run trial:expiring
# Repetir teste no navegador
```

---

## 🎭 Testes E2E Locais

### Pré-requisitos

```bash
# Backend rodando
cd backend
npm run dev

# Frontend rodando (em outro terminal)
cd frontend
npm run dev
```

### Rodar Todos os Testes

```bash
cd frontend
npm run test:e2e
```

### Rodar com Interface Visual

```bash
npm run test:e2e:ui
```

### Rodar Apenas Chrome

```bash
npm run test:e2e:chromium
```

### Modo Debug (headed)

```bash
npm run test:e2e:headed
```

### Ver Relatório de Testes

```bash
npm run test:e2e:report
```

### Estrutura de Testes

```
frontend/tests/e2e/
├── trial-flow.spec.ts       # Testes de trial (5 cenários)
├── login.spec.ts             # Testes de autenticação
├── create-monitor.spec.ts    # Testes de monitores
├── forgot-password.spec.ts   # Recuperação de senha
└── helpers.ts                # Helpers compartilhados
```

---

## 🚀 CI/CD no GitHub Actions

### Disparo Automático

Os testes E2E rodam automaticamente quando você:

```bash
# Push para main ou develop
git push origin main
git push origin develop

# Criar Pull Request para main ou develop
# (GitHub Actions roda automaticamente)
```

### Disparo Manual

1. Acessar GitHub → Actions → "E2E Tests (Playwright)"
2. Clicar em "Run workflow"
3. Selecionar branch
4. Clicar em "Run workflow" (botão verde)

### Visualizar Resultados

**Em caso de sucesso:**
- ✅ Checkmark verde no commit
- Jobs "test-e2e" e "test-e2e-mobile" passam

**Em caso de falha:**
- ❌ X vermelho no commit
- Artifacts disponíveis:
  - `playwright-report-{browser}`: Relatório HTML completo
  - `playwright-screenshots-{browser}`: Screenshots dos erros
  - `backend-logs-{browser}`: Logs do backend

**Baixar Artifacts:**
1. Acessar GitHub → Actions → Job falhado
2. Scroll down até "Artifacts"
3. Download dos arquivos necessários

### Browsers Testados

**Desktop:**
- ✅ Chromium
- ✅ Firefox
- ✅ WebKit (Safari)

**Mobile:**
- ✅ Mobile Chrome (Pixel 5)
- ✅ Mobile Safari (iPhone 14)

---

## 📧 Mock de Email

### Como Funciona

O emailService.ts detecta automaticamente o ambiente:

```typescript
// Com RESEND_API_KEY definida
RESEND_API_KEY=re_abc123... → Envia emails reais via Resend

// Sem RESEND_API_KEY (ou comentada no .env)
# RESEND_API_KEY=          → Mock automático (apenas loga)
```

### Testar Mock Localmente

```bash
# 1. Editar backend/.env
# Comentar ou remover RESEND_API_KEY
# RESEND_API_KEY=

# 2. Iniciar backend
cd backend
npm run dev

# 3. Registrar novo usuário (dispara email de boas-vindas)
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "novo@test.com",
    "name": "Novo Usuario",
    "cpf": "123.456.789-00",
    "phone": "(11) 98765-4321",
    "password": "Senha@123"
  }'

# 4. Verificar log no terminal do backend:
# [EMAIL DEV] Para: n***@test.com
# [EMAIL DEV] Assunto: Bem-vindo ao RadarOne! 🎉
```

### Mock no CI

No GitHub Actions, a variável `RESEND_API_KEY` **NÃO** é definida, portanto todos os emails são mockados automaticamente.

---

## 📊 Logs de TRIAL_EXPIRED

### Como Visualizar Logs

**Desenvolvimento:**

```bash
cd backend
npm run dev

# Logs aparecem no terminal com formatação colorida (pino-pretty)
```

**Exemplo de Log:**

```json
{
  "level": "warn",
  "time": "2025-12-14 12:00:00",
  "userId": "abc123...",
  "msg": "Trial expirado - acesso bloqueado",
  "eventType": "TRIAL_EXPIRED",
  "planName": "Basic",
  "planSlug": "basic",
  "trialEndedAt": "2025-12-12T12:00:00.000Z",
  "daysExpired": 2,
  "endpoint": "GET /api/monitors",
  "userAgent": "Mozilla/5.0...",
  "env": "development",
  "service": "radarone-backend"
}
```

### Testar Logging

```bash
# 1. Configurar trial expirado
cd backend
npm run trial:expired

# 2. Iniciar backend (em outro terminal)
npm run dev

# 3. Fazer login e pegar token
# Frontend: http://localhost:5173/login
# Login: e2e-test@radarone.com / Test@123456

# 4. Fazer request autenticado
TOKEN="seu_token_aqui"
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/monitors

# 5. Ver log no terminal do backend (linha amarela/warning)
```

### Campos do Log

| Campo | Descrição | Exemplo |
|-------|-----------|---------|
| `eventType` | Tipo do evento | `TRIAL_EXPIRED` |
| `userId` | ID do usuário | `abc123...` |
| `planName` | Nome do plano | `Basic` |
| `planSlug` | Slug do plano | `basic` |
| `trialEndedAt` | Data de expiração | `2025-12-12T12:00:00.000Z` |
| `daysExpired` | Dias desde expiração | `2` |
| `endpoint` | Endpoint bloqueado | `GET /api/monitors` |
| `userAgent` | Navegador do usuário | `Mozilla/5.0...` |

---

## 📝 Checklist de QA

### ✅ Cenário 1: Trial Expirado

- [ ] Configurar: `npm run trial:expired`
- [ ] Login no frontend
- [ ] Acessar `/monitors`
- [ ] **Esperado:**
  - [ ] Redirecionamento para `/plans?reason=trial_expired`
  - [ ] Toast aparece (canto superior direito)
  - [ ] Banner amarelo aparece na página
  - [ ] Reload: toast NÃO aparece novamente
  - [ ] Log de TRIAL_EXPIRED no backend

### ✅ Cenário 2: Trial Expirando (2 dias)

- [ ] Configurar: `npm run trial:expiring`
- [ ] Login no frontend
- [ ] Acessar `/monitors`
- [ ] **Esperado:**
  - [ ] Página carrega normalmente
  - [ ] Banner amarelo "Seu trial expira em 2 dias"
  - [ ] Botão "Ver planos" leva para `/plans`

### ✅ Cenário 3: Trial Ativo (14 dias)

- [ ] Configurar: `npm run trial:active`
- [ ] Login no frontend
- [ ] Acessar `/monitors`
- [ ] **Esperado:**
  - [ ] Página carrega normalmente
  - [ ] NENHUM banner de trial

### ✅ Cenário 4: Assinatura Paga

- [ ] Configurar: `npm run trial:paid`
- [ ] Login no frontend
- [ ] Acessar `/monitors`
- [ ] **Esperado:**
  - [ ] Página carrega normalmente
  - [ ] NENHUM banner de trial
  - [ ] Badge "PRO" ou "BASIC" no dashboard

### ✅ Cenário 5: Mock de Email

- [ ] Comentar `RESEND_API_KEY` no `.env`
- [ ] Iniciar backend: `npm run dev`
- [ ] Registrar novo usuário via API
- [ ] **Esperado:**
  - [ ] Log `[EMAIL DEV]` no terminal
  - [ ] Email NÃO enviado de verdade

### ✅ Cenário 6: CI/CD

- [ ] Criar branch: `git checkout -b test/ci`
- [ ] Commit: `git commit --allow-empty -m "test: CI"`
- [ ] Push: `git push origin test/ci`
- [ ] Abrir GitHub Actions
- [ ] **Esperado:**
  - [ ] Workflow "E2E Tests" inicia
  - [ ] Jobs "test-e2e" e "test-e2e-mobile" rodam
  - [ ] Testes passam em todos os browsers
  - [ ] Checkmark verde no commit

---

## 🐛 Troubleshooting

### Problema: "Backend não está respondendo no CI"

**Solução:**
```yaml
# Verificar se o healthcheck está passando
- name: Start backend server
  run: |
    npm run build
    nohup node dist/server.js > backend.log 2>&1 &
    sleep 5
    curl --retry 5 http://localhost:3000/health || (cat backend.log && exit 1)
```

### Problema: "Testes E2E timeout localmente"

**Solução:**
```bash
# 1. Verificar se backend está rodando
curl http://localhost:3000/health

# 2. Verificar se frontend está rodando
curl http://localhost:5173

# 3. Verificar variável de ambiente
# frontend/.env.local
VITE_API_BASE_URL=http://localhost:3000
```

### Problema: "Script de trial não encontra usuário"

**Solução:**
```bash
# Criar usuário de teste
npx ts-node-dev scripts/setup-trial-scenario.ts --create

# Verificar se foi criado
npm run trial:list
```

### Problema: "Toast não aparece"

**Solução:**
```bash
# Limpar sessionStorage
# No navegador: DevTools → Application → Session Storage → Clear

# Ou usar modo anônimo
# Cmd+Shift+N (Chrome) / Cmd+Shift+P (Firefox)
```

---

## 📚 Referências

- [Playwright Docs](https://playwright.dev/)
- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [Pino Logger](https://getpino.io/)
- [React Hot Toast](https://react-hot-toast.com/)

---

**Última atualização:** 14 de Dezembro de 2025
