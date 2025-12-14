# 🧪 Testes E2E do RadarOne

Guia completo para rodar e configurar testes E2E com Playwright.

---

## 📋 Pré-requisitos

1. **Backend rodando** em `http://localhost:3000` (ou configurar `VITE_API_BASE_URL`)
2. **Banco de dados** de desenvolvimento/teste configurado
3. **Frontend** rodará automaticamente via Playwright (`npm run dev`)
4. **Usuário de teste** criado no banco (veja seção de Setup)

---

## 🚀 Rodar Testes

### Todos os testes

```bash
cd frontend
npx playwright test
```

### Apenas testes de trial

```bash
npx playwright test trial-flow.spec.ts
```

### Com UI interativa (modo debug)

```bash
npx playwright test --ui
```

### Ver relatório após os testes

```bash
npx playwright show-report
```

---

## 🛠️ Setup - Usuário de Teste

### 1. Criar usuário de teste no banco

Execute o SQL em `backend/tests/helpers/trial-helpers.sql`:

```sql
-- Script #1 e #7 (criar usuário + assinatura)
```

**Credenciais padrão:**
- Email: `e2e-test@radarone.com`
- Senha: `Test123456!` (ajustar hash no SQL se necessário)

### 2. Configurar cenários de teste

Os testes de trial requerem manipulação manual do banco antes de rodar.

**Opção A: Via SQL direto**

```bash
# Conectar ao banco
psql -U postgres -d radarone_dev

# Executar scripts específicos (veja trial-helpers.sql)
\i backend/tests/helpers/trial-helpers.sql
```

**Opção B: Via script Node.js** (TODO - criar helper)

---

## 🧪 Cenários de Teste Disponíveis

### 1. Banner de trial expirando (2-3 dias)

**Setup:**
```sql
UPDATE subscriptions
SET trial_ends_at = NOW() + INTERVAL '2 days'
WHERE user_id = (SELECT id FROM users WHERE email = 'e2e-test@radarone.com');
```

**Teste:** `trial-flow.spec.ts` → "deve mostrar banner de trial expirando"

**Resultado esperado:**
- ✅ Banner amarelo aparece em `/monitors`
- ✅ Texto: "Seu trial expira em 2 dias"
- ✅ Botão "Ver planos" redireciona para `/plans`

---

### 2. Trial expirado (403 TRIAL_EXPIRED)

**Setup:**
```sql
UPDATE subscriptions
SET trial_ends_at = NOW() - INTERVAL '1 day', status = 'TRIAL'
WHERE user_id = (SELECT id FROM users WHERE email = 'e2e-test@radarone.com');
```

**Teste:** `trial-flow.spec.ts` → "deve redirecionar para /plans quando trial expirar"

**Resultado esperado:**
- ✅ Ao acessar `/monitors`, redireciona para `/plans?reason=trial_expired`
- ✅ Banner de "período grátis expirado" aparece
- ✅ Interceptor de API detectou 403 + TRIAL_EXPIRED

---

### 3. Banner NÃO aparece (assinatura ativa)

**Setup:**
```sql
UPDATE subscriptions
SET status = 'ACTIVE', is_trial = false
WHERE user_id = (SELECT id FROM users WHERE email = 'e2e-test@radarone.com');
```

**Teste:** `trial-flow.spec.ts` → "não deve mostrar banner de trial se não está em trial"

**Resultado esperado:**
- ✅ Banner NÃO aparece
- ✅ Usuário acessa `/monitors` normalmente

---

### 4. Cadastro duplicado

**Teste:** `trial-flow.spec.ts` → "deve mostrar mensagem clara ao cadastrar com email existente"

**Resultado esperado:**
- ✅ Backend retorna 409
- ✅ Mensagem: "Você já tem cadastro. Faça login para entrar."
- ✅ Link "Ir para login" funciona

---

### 5. Login redirect automático

**Teste:** `trial-flow.spec.ts` → "deve redirecionar automaticamente para /monitors após login"

**Resultado esperado:**
- ✅ Após login, redireciona para `/monitors` ou `/dashboard`
- ✅ Não fica preso na tela de login

---

## 📊 Estrutura de Testes

```
tests/
├── e2e/
│   ├── helpers.ts              # Helpers compartilhados (login, logout, etc)
│   ├── trial-flow.spec.ts      # ✨ Testes de trial (NOVO)
│   ├── login.spec.ts
│   ├── create-monitor.spec.ts
│   └── ...
└── README.md                    # Este arquivo
```

---

## 🐛 Troubleshooting

### Teste falha com "Token inválido"

- Verifique se backend está rodando
- Confirme que o usuário de teste existe no banco
- Verifique senha hash no banco (deve corresponder a `Test123456!`)

### Banner não aparece no teste

- Confirme que `trialEndsAt` está entre 1-7 dias no futuro
- Verifique se `status = 'TRIAL'` e `is_trial = true`
- Use o SQL de verificação (#6) em `trial-helpers.sql`

### Redirect para /plans não funciona

- Confirme que `trial_ends_at < NOW()` (expirado)
- Verifique se middleware `checkTrialExpired` está ativo nas rotas do backend
- Teste manualmente acessando `/monitors` via Postman/curl com token expirado

---

## 📝 Notas Importantes

1. **Não rodar testes em produção** - Usar apenas em dev/test
2. **Limpar estado entre testes** - Helpers já fazem `clearStorage()` automaticamente
3. **Paralelização** - Por padrão, testes rodam em paralelo. Use `.serial` se precisar de ordem
4. **Screenshots/Videos** - Salvos automaticamente em `test-results/` em caso de falha

---

## 🎯 Próximos Passos (TODO)

- [ ] Criar script Node.js para setup automático de cenários
- [ ] Adicionar testes de email (mock Resend)
- [ ] Testes de job `checkTrialExpiring` (isolado)
- [ ] CI/CD integration (GitHub Actions)

---

## 📚 Recursos

- [Playwright Docs](https://playwright.dev/docs/intro)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Debugging](https://playwright.dev/docs/debug)
