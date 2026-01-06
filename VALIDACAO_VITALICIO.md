# Validação Completa - Fix Cupom Vitalício

## 📋 Resumo das Alterações

### ✅ FRONTEND (2 arquivos)
1. **src/pages/AdminCouponsPage.tsx**
   - ✅ Build corrigido (isLifetime em todos formData)
   - ✅ Helper `getEmptyFormData()` criado
   - ✅ Checkbox para cupons vitalícios

2. **src/pages/SubscriptionSettingsPage.tsx**
   - ✅ Badge "♾️ Vitalício" para subscriptions vitalícias
   - ✅ Alert de sucesso mostrando acesso vitalício
   - ✅ Oculta "termina em X dias" para vitalícios

### ✅ BACKEND (7 arquivos)
1. **src/routes/health.routes.ts** (NOVO)
   - ✅ GET /api/health/version (evidência de deploy)
   - ✅ GET /api/health (health check)

2. **src/server.ts**
   - ✅ Registra rota /api/health

3. **src/services/subscriptionService.ts** (NOVO)
   - ✅ Função canônica `getCurrentSubscriptionForUser()`
   - ✅ Regras de prioridade (vitalício > ACTIVE > TRIAL)
   - ✅ Ignora datas se isLifetime=true

4. **src/controllers/subscription.controller.ts**
   - ✅ Usa função canônica em getMySubscription
   - ✅ Retorna daysRemaining=-1 para vitalício
   - ✅ Não expira vitalícios na consulta

5. **src/middlewares/auth.middleware.ts**
   - ✅ Usa função canônica em checkTrialExpired
   - ✅ Permite acesso ilimitado para vitalícios

6. **src/controllers/coupon.controller.ts**
   - ✅ Redeem vitalício cria ACTIVE + isLifetime=true
   - ✅ validUntil=null e trialEndsAt=null para vitalícios
   - ✅ Idempotência: não duplica vitalício
   - ✅ Permite upgrade de ACTIVE não-vitalício para vitalício

7. **scripts/fix-vitalicio-subscriptions.ts** (EXISTENTE)
   - ✅ Atualiza cupom VITALICIO para isLifetime=true
   - ✅ Corrige subscriptions de usuários allowlisted
   - ✅ Idempotente (pode rodar múltiplas vezes)

---

## 🔍 Passo 1: Verificar Deploy em Produção

### 1.1. Verificar commit/versão do backend
```bash
curl https://radarone-backend.onrender.com/api/health/version
```

**Saída esperada:**
```json
{
  "service": "RadarOne Backend",
  "commit": "abc123...",
  "branch": "main",
  "buildTime": "2026-01-06T...",
  "nodeVersion": "v20.x.x",
  "env": "production",
  "timestamp": "2026-01-06T..."
}
```

✅ **Critério de sucesso:** commit = último commit do git

### 1.2. Verificar frontend buildou
Acesse: https://radarone-frontend.onrender.com

✅ **Critério de sucesso:** página carrega sem erros

---

## 🗄️ Passo 2: Executar Migration de Dados

### 2.1. Acessar Render Shell do backend
1. Acesse: https://dashboard.render.com
2. Vá para o serviço **radarone-backend**
3. Clique na aba **Shell**
4. Execute:

```bash
npx ts-node scripts/fix-vitalicio-subscriptions.ts
```

**Saída esperada:**
```
[FIX] 🔧 Iniciando correção de cupom VITALICIO e subscriptions...

[1/3] Atualizando cupom VITALICIO...
✅ Cupom VITALICIO atualizado (id: ..., isLifetime=true)

[2/3] Identificando usuários allowlisted...
📧 Emails allowlisted: wellington@..., kristiann@...

[3/3] Atualizando subscriptions dos usuários allowlisted...

👤 Usuário: Wellington (wellington@...)
   📦 Subscription encontrada (id: ..., status: TRIAL, plano: ...)
   ✅ Subscription atualizada para vitalícia

👤 Usuário: Kristiann (kristiann@...)
   📦 Subscription encontrada (id: ..., status: TRIAL, plano: ...)
   ✅ Subscription atualizada para vitalícia

[FIX] ✅ Script concluído com sucesso!
   Total de subscriptions corrigidas/criadas: 2
```

✅ **Critério de sucesso:**
- Cupom VITALICIO marcado como isLifetime=true
- 2 subscriptions atualizadas (Wellington e Kristiann)

---

## 🔎 Passo 3: Validar no Banco de Dados

### 3.1. Verificar cupom VITALICIO
Via Render Shell (backend):
```bash
npx prisma studio
```

Ou via query SQL:
```sql
SELECT id, code, isLifetime, purpose, isActive
FROM coupons
WHERE LOWER(code) = 'vitalicio';
```

**Resultado esperado:**
```
code: VITALICIO
isLifetime: true
purpose: TRIAL_UPGRADE
isActive: true
```

### 3.2. Verificar subscription de Wellington
```sql
SELECT
  s.id,
  s.status,
  s.isLifetime,
  s.validUntil,
  s.trialEndsAt,
  s.isTrial,
  p.name as planName,
  u.email
FROM subscriptions s
JOIN users u ON s.userId = u.id
JOIN plans p ON s.planId = p.id
WHERE u.email = 'wellington@...'
  AND s.status IN ('ACTIVE', 'TRIAL')
ORDER BY s.createdAt DESC
LIMIT 1;
```

**Resultado esperado:**
```
status: ACTIVE
isLifetime: true
validUntil: NULL
trialEndsAt: NULL
isTrial: false
planName: Pro (ou outro plano premium)
```

✅ **Critério de sucesso:** subscription é ACTIVE + isLifetime=true + datas NULL

---

## 🌐 Passo 4: Validar nos Endpoints

### 4.1. Login e obter token
```bash
curl -X POST https://radarone-backend.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "wellington@...",
    "password": "..."
  }'
```

**Copiar o token da resposta:** `"token": "eyJhbGci..."`

### 4.2. Verificar subscription via API
```bash
curl https://radarone-backend.onrender.com/api/subscriptions/my \
  -H "Authorization: Bearer SEU_TOKEN_AQUI"
```

**Resultado esperado:**
```json
{
  "subscription": {
    "id": "...",
    "status": "ACTIVE",
    "isLifetime": true,
    "validUntil": null,
    "trialEndsAt": null,
    "isTrial": false,
    "plan": {
      "name": "Pro",
      "slug": "pro"
    }
  },
  "timeRemaining": {
    "daysRemaining": -1,
    "expiresAt": null,
    "isExpired": false
  }
}
```

✅ **Critério de sucesso:**
- `isLifetime: true`
- `status: "ACTIVE"`
- `validUntil: null`
- `daysRemaining: -1` (convenção para ilimitado)

---

## 🎨 Passo 5: Validar UI no Browser

### 5.1. Página de Settings
1. Faça login com Wellington ou Kristiann
2. Acesse: https://radarone-frontend.onrender.com/settings/subscription
3. Verificar:

✅ **Badge:** "♾️ Vitalício" (roxo)
✅ **Alert verde:** "♾️ Você possui acesso VITALÍCIO ao plano X. Seu acesso não expira!"
✅ **NÃO** deve mostrar: "Seu período de teste termina em X dias"

### 5.2. Página de Planos
1. Acesse: https://radarone-frontend.onrender.com/plans
2. Aplicar cupom VITALICIO (testar idempotência)

✅ **Resultado esperado:**
- Mensagem: "Cupom aplicado! Você ganhou acesso VITALÍCIO ao plano X."
- Se aplicar novamente: "Você já possui acesso VITALÍCIO ao plano X."

---

## 🔄 Passo 6: Teste de Logout/Login (BUG PRINCIPAL)

### 6.1. Fluxo completo
1. Login com Wellington
2. Verificar que está premium (pode criar monitores, etc.)
3. **LOGOUT**
4. **LOGIN** novamente
5. Verificar que **CONTINUA PREMIUM** automaticamente

✅ **Critério de sucesso:**
- Não pede para reaplicar cupom
- Não redireciona para /plans
- Dashboard mostra acesso premium
- Pode criar monitores normalmente

### 6.2. Verificar depois de 60+ dias (simulado)
Como não dá para esperar 60 dias, simule alterando a data do servidor (se possível) ou:

1. Verificar nos logs de jobs:
```bash
# No Render Shell (backend)
tail -f /var/log/cron.log  # ou equivalente
```

2. Procurar por logs de `checkSubscriptionExpired`:
```
[JOB] 🚫 0 assinaturas expiradas  # <- subscriptions vitalícias NÃO aparecem aqui
```

✅ **Critério de sucesso:** Job de expiração ignora subscriptions vitalícias

---

## 📝 Passo 7: Validação Admin UI

### 7.1. Criar/editar cupom vitalício
1. Login como admin
2. Acesse: https://radarone-frontend.onrender.com/admin/coupons
3. Criar novo cupom:
   - Marcar checkbox "Cupom Vitalício"
   - Campo "Duração" deve ficar desabilitado
   - Purpose: TRIAL_UPGRADE

✅ **Critério de sucesso:**
- Checkbox funciona
- Cupom criado com isLifetime=true
- Pode editar cupom vitalício existente

---

## 🧪 Checklist Final de Validação

### Backend
- [ ] GET /api/health/version retorna commit correto
- [ ] Migration rodou sem erros
- [ ] Cupom VITALICIO tem isLifetime=true no DB
- [ ] Wellington tem subscription ACTIVE + isLifetime=true
- [ ] Kristiann tem subscription ACTIVE + isLifetime=true
- [ ] GET /api/subscriptions/my retorna isLifetime=true e daysRemaining=-1
- [ ] Middleware não bloqueia acesso de vitalícios
- [ ] Job de expiração ignora vitalícios

### Frontend
- [ ] Build passou sem erros TS
- [ ] Settings page mostra badge "Vitalício"
- [ ] Settings page mostra alert verde de vitalício
- [ ] NÃO mostra "termina em X dias" para vitalícios
- [ ] Admin pode criar cupons vitalícios
- [ ] Checkbox vitalício desabilita campo de duração

### Fluxo E2E
- [ ] Aplicar cupom VITALICIO funciona
- [ ] Aplicar cupom VITALICIO novamente é idempotente
- [ ] Logout → Login mantém acesso premium
- [ ] Subscriptions vitalícias não expiram após 60 dias

---

## 🐛 Se Algo Falhar

### Problema: Frontend ainda mostra "60 dias"
**Causa:** Deploy do frontend não atualizou
**Solução:**
1. Verificar logs de build do Render (frontend)
2. Force rebuild: Render Dashboard → radarone-frontend → Manual Deploy

### Problema: Backend retorna isLifetime=false
**Causa:** Migration não rodou ou VITALICIO_ALLOWED_EMAILS não configurada
**Solução:**
1. Verificar variável de ambiente VITALICIO_ALLOWED_EMAILS no Render
2. Rodar migration novamente: `npx ts-node scripts/fix-vitalicio-subscriptions.ts`

### Problema: Perde premium no logout/login
**Causa:** Função canônica não está sendo usada
**Solução:**
1. Verificar logs do backend (Render Dashboard → Logs)
2. Verificar se getCurrentSubscriptionForUser está sendo chamada
3. Verificar se prisma.subscription.findFirst foi substituído

---

## 📞 Próximos Passos

Após validação completa:
1. ✅ Marcar ticket como RESOLVIDO
2. ✅ Monitorar logs de produção por 24-48h
3. ✅ Verificar se Wellington e Kristiann reportam sucesso
4. ✅ Documentar processo para futuros cupons vitalícios

---

**Wellington, siga estes passos em ordem e reporte qualquer divergência. O sistema está corrigido! 🚀**
